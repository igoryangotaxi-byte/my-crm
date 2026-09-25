import { relabelGoogleVendorForDisplay } from "@/lib/public-error-message";
import {
  appendInterimDestination,
  destinationsToApiBody,
  isTerminalOrderStatus,
  patchInterimDestination,
  toYangoRoutePoint,
  type ChangeDestinationPointInput,
  type YangoRoutePoint,
} from "@/lib/yango-change-destinations";
import { changeYangoOrderDestinations, getYangoOrderRoute } from "@/lib/yango-api";
import { getClientScope, requireApprovedUser } from "@/lib/server-auth";
import { revalidateTag } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function normalizeString(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}

function parseOptionalNumber(input: unknown): number | null {
  if (typeof input === "number" && Number.isFinite(input)) return input;
  if (typeof input === "string" && input.trim()) {
    const n = Number(input);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function resolveScopeIds(
  authUser: Parameters<typeof getClientScope>[0],
  body: { tokenLabel?: unknown; clientId?: unknown } | null,
  searchParams?: URLSearchParams,
) {
  const scope = getClientScope(authUser);
  const tokenLabel =
    scope?.tokenLabel ||
    normalizeString(body?.tokenLabel) ||
    normalizeString(searchParams?.get("tokenLabel"));
  const clientId =
    scope?.apiClientId ||
    normalizeString(body?.clientId) ||
    normalizeString(searchParams?.get("clientId"));
  return { tokenLabel, clientId };
}

export async function GET(request: Request) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const { tokenLabel, clientId } = resolveScopeIds(auth.user, null, url.searchParams);
  const orderId = normalizeString(url.searchParams.get("orderId"));

  if (!tokenLabel || !clientId || !orderId) {
    return Response.json(
      { ok: false, error: "tokenLabel, clientId, and orderId are required." },
      { status: 400 },
    );
  }

  try {
    const route = await getYangoOrderRoute({ tokenLabel, clientId, orderId });
    return Response.json(
      {
        ok: true,
        route,
        canEdit: !isTerminalOrderStatus(route.status),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message.trim() : "Failed to load order route.";
    return Response.json(
      { ok: false, error: relabelGoogleVendorForDisplay(message || "Failed to load order route.") },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as
    | {
        tokenLabel?: unknown;
        clientId?: unknown;
        orderId?: unknown;
        action?: unknown;
        interimIndex?: unknown;
        address?: unknown;
        lat?: unknown;
        lon?: unknown;
        destinations?: unknown;
      }
    | null;

  const { tokenLabel, clientId } = resolveScopeIds(auth.user, body);
  const orderId = normalizeString(body?.orderId);

  if (!tokenLabel || !clientId || !orderId) {
    return Response.json(
      { ok: false, error: "tokenLabel, clientId, and orderId are required." },
      { status: 400 },
    );
  }

  try {
    let destinationsApi: Array<{ fullname: string; geopoint: [number, number] }>;
    const routeBefore = await getYangoOrderRoute({ tokenLabel, clientId, orderId });

    if (isTerminalOrderStatus(routeBefore.status)) {
      return Response.json(
        { ok: false, error: `Order status "${routeBefore.status}" does not allow route changes.` },
        { status: 400 },
      );
    }

    if (Array.isArray(body?.destinations) && body.destinations.length > 0) {
      const points: YangoRoutePoint[] = [];
      for (const item of body.destinations) {
        if (!item || typeof item !== "object") {
          return Response.json({ ok: false, error: "Invalid destinations entry." }, { status: 400 });
        }
        const row = item as Record<string, unknown>;
        const fullname = normalizeString(row.fullname ?? row.address);
        const lat = parseOptionalNumber(row.lat);
        const lon = parseOptionalNumber(row.lon);
        const gpLon = Array.isArray(row.geopoint) ? parseOptionalNumber(row.geopoint[0]) : lon;
        const gpLat = Array.isArray(row.geopoint) ? parseOptionalNumber(row.geopoint[1]) : lat;
        if (!fullname || gpLat == null || gpLon == null) {
          return Response.json(
            { ok: false, error: "Each destination needs fullname and geopoint/lat/lon." },
            { status: 400 },
          );
        }
        points.push(toYangoRoutePoint(fullname, gpLat, gpLon));
      }
      destinationsApi = destinationsToApiBody(points);
    } else if (normalizeString(body?.action) === "addInterim") {
      const address = normalizeString(body?.address);
      const lat = parseOptionalNumber(body?.lat);
      const lon = parseOptionalNumber(body?.lon);
      if (!address || lat == null || lon == null) {
        return Response.json(
          { ok: false, error: "addInterim requires address + lat + lon." },
          { status: 400 },
        );
      }
      const added = appendInterimDestination(routeBefore, { fullname: address, lat, lon });
      destinationsApi = destinationsToApiBody(added);
    } else {
      const interimIndexRaw = body?.interimIndex;
      const interimIndex =
        typeof interimIndexRaw === "number"
          ? interimIndexRaw
          : typeof interimIndexRaw === "string"
            ? Number(interimIndexRaw)
            : NaN;
      const address = normalizeString(body?.address);
      const lat = parseOptionalNumber(body?.lat);
      const lon = parseOptionalNumber(body?.lon);
      if (!Number.isInteger(interimIndex) || !address || lat == null || lon == null) {
        return Response.json(
          {
            ok: false,
            error:
              "Provide destinations[], action=addInterim, or interimIndex + address + lat + lon.",
          },
          { status: 400 },
        );
      }
      const replacement: ChangeDestinationPointInput = { fullname: address, lat, lon };
      const patched = patchInterimDestination(routeBefore, interimIndex, replacement);
      destinationsApi = destinationsToApiBody(patched);
    }

    const result = await changeYangoOrderDestinations({
      tokenLabel,
      clientId,
      orderId,
      destinations: destinationsApi,
    });

    revalidateTag("yango-preorders", "default");
    return Response.json(
      {
        ok: true,
        changedDestinations: result.changedDestinations,
        route: result.route,
        previousRoute: routeBefore,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message.trim() : "Failed to change destinations.";
    const status = message.includes("HTTP 400")
      ? 400
      : message.includes("HTTP 404")
        ? 404
        : message.includes("HTTP 409")
          ? 409
          : 500;
    return Response.json(
      {
        ok: false,
        error: relabelGoogleVendorForDisplay(message || "Failed to change destinations."),
      },
      { status },
    );
  }
}
