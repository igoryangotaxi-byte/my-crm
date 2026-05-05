import {
  canonicalCorpCostCenterSettingsUuid,
  createRequestRide,
  extractYangoTraceFromCompositeMessage,
  resolveUserCostCenterIdByPhone,
  resolveRequestRideUserIdByPhone,
} from "@/lib/yango-api";
import { loadAuthStore, saveAuthStore } from "@/lib/auth-store";
import {
  resolveCostCenterWithFullYangoDiscovery,
  resolveDefaultCostCenterIdForYangoClient,
} from "@/lib/tenant-yango-bootstrap";
import { searchAddressSuggestions } from "@/lib/geocoding";
import { saveRequestRideAddressSnapshot } from "@/lib/request-rides-address-store";
import { normalizeYangoClientIdKey } from "@/lib/request-rides-user-map";
import { getClientScope, requireApprovedUser } from "@/lib/server-auth";
import type { RequestRidePayload } from "@/types/crm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Set `REQUEST_RIDES_CC_DEBUG=1` to include `costCenter` resolution in JSON (default: omit). */
function includeRequestRidesCostCenterDebug(): boolean {
  const v = (process.env.REQUEST_RIDES_CC_DEBUG ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function normalizeString(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}

function toFiniteNumber(input: unknown): number | null {
  if (typeof input === "number" && Number.isFinite(input)) return input;
  if (typeof input === "string" && input.trim()) {
    const value = Number(input.trim());
    return Number.isFinite(value) ? value : null;
  }
  return null;
}

function normalizePhoneDigits(input: string): string {
  return input.replace(/\D/g, "");
}

type WaypointPayload = { address: string; lat?: number; lon?: number };

function detectAddressLanguage(input: string): "he" | "ru" | "en" {
  if (/[\u0590-\u05FF]/.test(input)) return "he";
  if (/[\u0400-\u04FF]/.test(input)) return "ru";
  return "en";
}

async function geocodeAddress(
  address: string,
  language: "he" | "ru" | "en",
): Promise<{ lat: number; lon: number } | null> {
  const rows = await searchAddressSuggestions({ query: address, language, limit: 1 });
  const first = rows[0];
  if (!first) return null;
  return { lat: first.lat, lon: first.lon };
}

export async function POST(request: Request) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;
  const scope = getClientScope(auth.user);
  const body = (await request.json().catch(() => null)) as Partial<RequestRidePayload> | null;
  const payload: RequestRidePayload = {
    tokenLabel: scope?.tokenLabel ?? normalizeString(body?.tokenLabel),
    clientId: scope?.apiClientId ?? normalizeString(body?.clientId),
    rideClass: normalizeString(body?.rideClass) || "comfortplus_b2b",
    userId: undefined,
    costCenterId: normalizeString(body?.costCenterId) || null,
    costCenterDisplayName: normalizeString(body?.costCenterDisplayName) || null,
    sourceAddress: normalizeString(body?.sourceAddress),
    destinationAddress: normalizeString(body?.destinationAddress),
    sourceLat: toFiniteNumber(body?.sourceLat) ?? undefined,
    sourceLon: toFiniteNumber(body?.sourceLon) ?? undefined,
    destinationLat: toFiniteNumber(body?.destinationLat) ?? undefined,
    destinationLon: toFiniteNumber(body?.destinationLon) ?? undefined,
    phoneNumber: normalizeString(body?.phoneNumber),
    comment: normalizeString(body?.comment) || null,
    scheduleAtIso: normalizeString(body?.scheduleAtIso) || null,
    waypoints: Array.isArray(body?.waypoints)
      ? body.waypoints.reduce<WaypointPayload[]>((acc, item) => {
          if (!item || typeof item !== "object") return acc;
          const row = item as { address?: unknown; lat?: unknown; lon?: unknown };
          const address = normalizeString(row.address);
          if (!address) return acc;
          acc.push({
            address,
            lat: toFiniteNumber(row.lat) ?? undefined,
            lon: toFiniteNumber(row.lon) ?? undefined,
          });
          return acc;
        }, [])
      : [],
  };
  const costCenterDebug: {
    selectedCostCenterId: string | null;
    source: string | null;
    candidates: Array<{ source: string; value: string | null }>;
  } = {
    selectedCostCenterId: payload.costCenterId ?? null,
    source: payload.costCenterId ? "request.body" : null,
    candidates: payload.costCenterId ? [{ source: "request.body", value: payload.costCenterId }] : [],
  };

  if (!payload.tokenLabel || !payload.clientId) {
    return Response.json(
      { ok: false, error: "tokenLabel and clientId are required." },
      { status: 400 },
    );
  }
  /** Trim only — Yango matches `X-YaTaxi-Selected-Corp-Client-Id` to token-allowed clients as an exact string; rewriting dashed↔undashed causes SELECTED_CLIENT_ACCESS_DENIED. */
  const clientIdRaw = payload.clientId.trim();
  if (!payload.sourceAddress || !payload.destinationAddress) {
    return Response.json(
      { ok: false, error: "sourceAddress and destinationAddress are required." },
      { status: 400 },
    );
  }
  if (!payload.phoneNumber) {
    return Response.json(
      { ok: false, error: "phoneNumber is required." },
      { status: 400 },
    );
  }
  let clientIdForYango = clientIdRaw;
  let resolvedUserId = await resolveRequestRideUserIdByPhone({
    tokenLabel: payload.tokenLabel,
    clientId: clientIdRaw,
    phoneNumber: payload.phoneNumber,
  });
  const clientIdCanonical = canonicalCorpCostCenterSettingsUuid(clientIdRaw);
  if (!resolvedUserId && clientIdCanonical && clientIdCanonical !== clientIdRaw) {
    const alt = await resolveRequestRideUserIdByPhone({
      tokenLabel: payload.tokenLabel,
      clientId: clientIdCanonical,
      phoneNumber: payload.phoneNumber,
    });
    if (alt) {
      resolvedUserId = alt;
      clientIdForYango = clientIdCanonical;
    }
  }
  if (!resolvedUserId) {
    return Response.json(
      {
        ok: false,
        error:
          "Phone is not mapped to user_id. Ensure employee exists in client cabinet and update phone->user_id mapping file.",
      },
      { status: 400 },
    );
  }
  payload.clientId = clientIdForYango;
  const clientIdKey = normalizeYangoClientIdKey(payload.clientId);
  payload.userId = resolvedUserId;
  const apiUserCostCenter = await resolveUserCostCenterIdByPhone({
    tokenLabel: payload.tokenLabel,
    clientId: payload.clientId,
    phoneNumber: payload.phoneNumber,
  }).catch(() => null);
  costCenterDebug.candidates.push({
    source: "api.user.by_phone",
    value: apiUserCostCenter?.trim() || null,
  });
  // Never overwrite an explicit cost center from the client (dropdown / manual). Directory rows can be stale
  // or carry display names; TEST CABINET often "works" because user CC matches — other tenants then get 406.
  if (!(payload.costCenterId ?? "").trim() && apiUserCostCenter?.trim()) {
    payload.costCenterId = apiUserCostCenter.trim();
    costCenterDebug.selectedCostCenterId = payload.costCenterId;
    costCenterDebug.source = "api.user.by_phone";
  }
  const apiSingleCostCenter = await resolveCostCenterWithFullYangoDiscovery({
    tokenLabel: payload.tokenLabel,
    apiClientId: payload.clientId,
  });
  costCenterDebug.candidates.push({
    source: "api.client.default_or_single",
    value: apiSingleCostCenter || null,
  });
  if (!payload.costCenterId && apiSingleCostCenter) {
    payload.costCenterId = apiSingleCostCenter;
    costCenterDebug.selectedCostCenterId = payload.costCenterId;
    costCenterDebug.source = "api.client.default_or_single";
  }
  if (!payload.costCenterId) {
    const store = await loadAuthStore();
    const phoneDigits = normalizePhoneDigits(payload.phoneNumber);
    const scopedTenant =
      scope?.tenantId != null
        ? (store.tenantAccounts ?? []).find((tenant) => tenant.id === scope.tenantId) ?? null
        : null;
    const tenantRow =
      (store.tenantAccounts ?? []).find(
        (tenant) =>
          tenant.tokenLabel === payload.tokenLabel &&
          normalizeYangoClientIdKey((tenant.apiClientId ?? "").trim()) === clientIdKey &&
          tenant.enabled !== false,
      ) ?? null;
    const candidateByScope = scope?.tenantId
      ? store.users.find(
          (user) =>
            user.accountType === "client" &&
            user.tenantId === scope.tenantId &&
            normalizePhoneDigits(user.phoneNumber ?? "") === phoneDigits,
        )
      : store.users.find(
          (user) =>
            user.accountType === "client" &&
            user.tokenLabel === payload.tokenLabel &&
            normalizeYangoClientIdKey((user.apiClientId ?? "").trim()) === clientIdKey &&
            normalizePhoneDigits(user.phoneNumber ?? "") === phoneDigits,
        );
    const anyClientUserWithCostCenter = scope?.tenantId
      ? store.users.find(
          (user) =>
            user.accountType === "client" &&
            user.tenantId === scope.tenantId &&
            Boolean((user.costCenterId ?? "").trim()),
        )
      : store.users.find(
          (user) =>
            user.accountType === "client" &&
            user.tokenLabel === payload.tokenLabel &&
            normalizeYangoClientIdKey((user.apiClientId ?? "").trim()) === clientIdKey &&
            Boolean((user.costCenterId ?? "").trim()),
        );
    let tenantDefault =
      (scopedTenant?.defaultCostCenterId ?? "").trim() ||
      (tenantRow?.defaultCostCenterId ?? "").trim() ||
      (tenantRow?.pinnedDefaultCostCenterId ?? "").trim();
    costCenterDebug.candidates.push({
      source: "tenant.default_cost_center",
      value: tenantDefault || null,
    });
    if (!tenantDefault) {
      tenantDefault = apiSingleCostCenter;
    }
    payload.costCenterId =
      (candidateByScope?.costCenterId ?? "").trim() ||
      (anyClientUserWithCostCenter?.costCenterId ?? "").trim() ||
      tenantDefault ||
      null;
    if (!payload.costCenterId) {
      const envOrPin = await resolveDefaultCostCenterIdForYangoClient({
        tokenLabel: payload.tokenLabel,
        apiClientId: payload.clientId,
        pinnedCostCenterId: tenantRow?.pinnedDefaultCostCenterId ?? null,
      });
      costCenterDebug.candidates.push({
        source: "env_pin_or_yango_resolve",
        value: envOrPin || null,
      });
      if (envOrPin) {
        payload.costCenterId = envOrPin;
        costCenterDebug.selectedCostCenterId = envOrPin;
        costCenterDebug.source = "env_pin_or_yango_resolve";
      }
    }
    if (
      payload.costCenterId &&
      tenantRow &&
      !(tenantRow.defaultCostCenterId ?? "").trim()
    ) {
      const tid = tenantRow.id;
      const cc = payload.costCenterId.trim();
      await saveAuthStore({
        ...store,
        tenantAccounts: (store.tenantAccounts ?? []).map((tenant) =>
          tenant.id === tid ? { ...tenant, defaultCostCenterId: cc } : tenant,
        ),
        users: store.users.map((user) =>
          user.accountType === "client" &&
          user.tenantId === tid &&
          (user.costCenterId == null || user.costCenterId.trim() === "")
            ? { ...user, costCenterId: cc }
            : user,
        ),
      });
    }
    costCenterDebug.candidates.push({
      source: "user.same_phone",
      value: (candidateByScope?.costCenterId ?? "").trim() || null,
    });
    costCenterDebug.candidates.push({
      source: "user.any_in_tenant",
      value: (anyClientUserWithCostCenter?.costCenterId ?? "").trim() || null,
    });
    if (payload.costCenterId && !costCenterDebug.source) {
      if ((candidateByScope?.costCenterId ?? "").trim()) {
        costCenterDebug.source = "user.same_phone";
      } else if ((anyClientUserWithCostCenter?.costCenterId ?? "").trim()) {
        costCenterDebug.source = "user.any_in_tenant";
      } else if (tenantDefault) {
        costCenterDebug.source = "tenant.default_cost_center";
      }
      costCenterDebug.selectedCostCenterId = payload.costCenterId;
    }
  }

  if (payload.sourceLat == null || payload.sourceLon == null) {
    const src = await geocodeAddress(payload.sourceAddress, detectAddressLanguage(payload.sourceAddress));
    if (src) {
      payload.sourceLat = src.lat;
      payload.sourceLon = src.lon;
    }
  }
  if (payload.destinationLat == null || payload.destinationLon == null) {
    const dst = await geocodeAddress(
      payload.destinationAddress,
      detectAddressLanguage(payload.destinationAddress),
    );
    if (dst) {
      payload.destinationLat = dst.lat;
      payload.destinationLon = dst.lon;
    }
  }
  if (
    payload.sourceLat == null ||
    payload.sourceLon == null ||
    payload.destinationLat == null ||
    payload.destinationLon == null
  ) {
    return Response.json(
      { ok: false, error: "Could not resolve route geopoints from addresses." },
      { status: 400 },
    );
  }
  if (payload.waypoints?.length) {
    for (const waypoint of payload.waypoints) {
      if (waypoint.lat == null || waypoint.lon == null) {
        const geo = await geocodeAddress(waypoint.address, detectAddressLanguage(waypoint.address));
        if (geo) {
          waypoint.lat = geo.lat;
          waypoint.lon = geo.lon;
        }
      }
      if (waypoint.lat == null || waypoint.lon == null) {
        return Response.json(
          { ok: false, error: `Could not resolve geopoint for stop: ${waypoint.address}` },
          { status: 400 },
        );
      }
    }
  }

  try {
    const result = await createRequestRide(payload);
    await saveRequestRideAddressSnapshot({
      tokenLabel: payload.tokenLabel,
      clientId: payload.clientId,
      orderId: result.orderId,
      sourceAddress: payload.sourceAddress,
      destinationAddress: payload.destinationAddress,
      waypointAddresses: (payload.waypoints ?? []).map((item) => item.address),
    }).catch(() => null);
    return Response.json(
      {
        ok: true,
        result,
        debug: {
          tenantId: scope?.tenantId ?? null,
          tokenLabel: payload.tokenLabel,
          clientId: payload.clientId,
          userId: payload.userId ?? null,
          ...(includeRequestRidesCostCenterDebug() ? { costCenter: costCenterDebug } : {}),
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create ride.";
    let userHint = "";
    if (message.includes("User not found")) {
      userHint =
        " User not found in selected client context. Verify phone->user_id mapping and client context.";
    }
    const yangoTrace = extractYangoTraceFromCompositeMessage(message);
    const traceInError =
      !message.includes("trace_id=") &&
      (yangoTrace.traceId || yangoTrace.requestId)
        ? ` [${[yangoTrace.traceId && `trace_id=${yangoTrace.traceId}`, yangoTrace.requestId && `request_id=${yangoTrace.requestId}`]
            .filter(Boolean)
            .join(", ")}]`
        : "";
    // Vercel Runtime / Functions log: open the failed request → Logs; "Messages" stays empty on edge-only view.
    console.error(
      JSON.stringify({
        event: "request_rides_create_failed",
        yangoTraceId: yangoTrace.traceId ?? null,
        yangoRequestId: yangoTrace.requestId ?? null,
        tokenLabel: payload.tokenLabel,
        clientId: payload.clientId,
        errorPreview: `${message}${userHint}`.slice(0, 1_200),
      }),
    );
    return Response.json(
      {
        ok: false,
        error: `${message}${userHint}${traceInError}`,
        yangoTraceId: yangoTrace.traceId ?? null,
        yangoRequestId: yangoTrace.requestId ?? null,
        debug: {
          tenantId: scope?.tenantId ?? null,
          tokenLabel: payload.tokenLabel,
          clientId: payload.clientId,
          userId: payload.userId ?? null,
          ...(includeRequestRidesCostCenterDebug() ? { costCenter: costCenterDebug } : {}),
        },
      },
      { status: 500 },
    );
  }
}
