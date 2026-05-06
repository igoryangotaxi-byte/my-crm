import { requireApprovedUser } from "@/lib/server-auth";
import { runDecouplingTariffSuggestions, type TripForDecouplingSimulation } from "@/lib/transcript-decoupling-suggestions";
import { findTranscriptMotTariff, loadTranscriptMotTariffs } from "@/lib/transcript-mot-tariffs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_TRIPS = 300;

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function parseTrip(raw: unknown): TripForDecouplingSimulation | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!isFiniteNumber(o.km) || o.km < 0) return null;
  if (!isFiniteNumber(o.driverPrice) || o.driverPrice < 0) return null;
  const tripIso = typeof o.tripIso === "string" ? o.tripIso.trim() : "";
  if (!tripIso) return null;
  const d = new Date(tripIso);
  if (Number.isNaN(d.getTime())) return null;
  return { km: o.km, tripIso: d.toISOString(), driverPrice: o.driverPrice };
}

export async function POST(request: Request) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;

  const payload = (await request.json().catch(() => null)) as {
    tariffCode?: unknown;
    targetDecouplingPct?: unknown;
    trips?: unknown;
  } | null;

  const tariffCode = typeof payload?.tariffCode === "string" ? payload.tariffCode.trim() : "";
  if (!tariffCode) {
    return Response.json({ ok: false, error: "tariffCode is required." }, { status: 400 });
  }

  const targetRaw = payload?.targetDecouplingPct;
  const targetDecouplingPct =
    typeof targetRaw === "number"
      ? targetRaw
      : typeof targetRaw === "string"
        ? Number(targetRaw)
        : NaN;
  if (!Number.isFinite(targetDecouplingPct) || targetDecouplingPct < -100 || targetDecouplingPct > 100) {
    return Response.json(
      { ok: false, error: "targetDecouplingPct must be a number between -100 and 100." },
      { status: 400 },
    );
  }

  if (!Array.isArray(payload?.trips) || payload.trips.length === 0) {
    return Response.json({ ok: false, error: "trips must be a non-empty array." }, { status: 400 });
  }

  const parsedTrips: TripForDecouplingSimulation[] = [];
  for (const row of payload.trips) {
    const t = parseTrip(row);
    if (!t) {
      return Response.json(
        { ok: false, error: "Each trip must include km (>=0), tripIso (ISO date), driverPrice (>=0)." },
        { status: 400 },
      );
    }
    parsedTrips.push(t);
  }

  const tripsTruncated = parsedTrips.length > MAX_TRIPS;
  const trips = tripsTruncated ? parsedTrips.slice(0, MAX_TRIPS) : parsedTrips;

  const catalog = await loadTranscriptMotTariffs();
  const tariff = findTranscriptMotTariff(catalog, tariffCode);
  if (!tariff) {
    return Response.json({ ok: false, error: `Unknown tariff code: ${tariffCode}` }, { status: 404 });
  }

  try {
    const result = await runDecouplingTariffSuggestions({
      tariffCode,
      currentRules: tariff.rules,
      trips,
      targetDecouplingPct,
    });

    return Response.json(
      {
        ok: true,
        tariffCode,
        tariffLabel: tariff.label,
        targetDecouplingPct,
        tripsUsed: trips.length,
        tripsTruncated,
        currentPortfolioDecouplingPct: result.currentPortfolioDecouplingPct,
        source: result.source,
        deterministicNote: result.deterministicNote,
        suggestions: result.suggestions.map((s) => ({
          label: s.label,
          rationale: s.rationale,
          rules: s.rules,
          simulatedPortfolioDecouplingPct: s.simulatedPortfolioDecouplingPct,
          simulatedSumClient: s.simulatedSumClient,
          deltaVsCurrentPct: s.deltaVsCurrentPct,
        })),
      },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tariff suggestions failed.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
