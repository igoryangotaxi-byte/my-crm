import {
  createRequestRide,
  listYangoTokenHealth,
  loadAllYangoPreOrdersFresh,
  probeYangoTokenByLabel,
  resolveRequestRideUserIdByPhone,
} from "@/lib/yango-api";
import { searchAddressSuggestions } from "@/lib/geocoding";
import { getPreOrderUrgencyLabel, getPreOrderUrgencyLevel, minutesUntilScheduled } from "@/lib/preorders/urgency";
import { NOTES_ONBOARDING_HREF, YANGO_TOKEN_ONBOARDING_HREF } from "@/lib/yango-token-health";
import type { AiToolResult } from "@/lib/ai/types";
import type { ToolRun } from "@/lib/ai/tool-gateway/types";
import type { RequestRidePayload } from "@/types/crm";

export const REQUEST_RIDES_HREF = "/sales-operation/request-rides";

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function num(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function detectAddressLanguage(input: string): "he" | "ru" | "en" {
  if (/[\u0590-\u05FF]/.test(input)) return "he";
  if (/[\u0400-\u04FF]/.test(input)) return "ru";
  return "en";
}

async function geocodeAddress(address: string): Promise<{ lat: number; lon: number } | null> {
  const rows = await searchAddressSuggestions({
    query: address,
    language: detectAddressLanguage(address),
    limit: 1,
  });
  const first = rows[0];
  if (!first) return null;
  return { lat: first.lat, lon: first.lon };
}

function deadTokenResult(label: string, message: string | null): AiToolResult {
  return {
    ok: false,
    status: "denied",
    error: `Yango token “${label}” is dead or expired. Fail closed — no retry. ${message ?? "Reconnect in Notes."}`.trim(),
    uiBlocks: [
      {
        type: "connect",
        integration: "yango",
        text: "Connect a live Yango token in Notes / API Health Check.",
        href: YANGO_TOKEN_ONBOARDING_HREF,
      },
    ],
  };
}

export async function yangoTokensList(_run: ToolRun): Promise<AiToolResult> {
  const tokens = await listYangoTokenHealth();
  const publicTokens = tokens.map((row) => ({
    label: row.label,
    clientName: row.clientName,
    status: row.status,
    message: row.message,
  }));
  const live = publicTokens.filter((row) => row.status === "live").length;
  const dead = publicTokens.filter((row) => row.status === "dead").length;
  if (publicTokens.length === 0) {
    return {
      ok: true,
      data: {
        tokens: [],
        connectHref: YANGO_TOKEN_ONBOARDING_HREF,
        notesHref: NOTES_ONBOARDING_HREF,
      },
      userMessage: "No Yango tokens are configured. Connect one in Notes / API Health Check.",
      uiBlocks: [
        {
          type: "connect",
          integration: "yango",
          text: "No Yango tokens yet. Connect a cabinet in Notes.",
          href: YANGO_TOKEN_ONBOARDING_HREF,
        },
      ],
    };
  }
  return {
    ok: true,
    data: { tokens: publicTokens, live, dead, connectHref: YANGO_TOKEN_ONBOARDING_HREF },
    userMessage:
      dead > 0
        ? `${live} live Yango cabinet${live === 1 ? "" : "s"}, ${dead} dead. Dead tokens fail closed — reconnect in Notes.`
        : `${live} live Yango cabinet${live === 1 ? "" : "s"}.`,
  };
}

export async function yangoPreordersAtRisk(run: ToolRun): Promise<AiToolResult> {
  const tokenLabel = str(run.args.tokenLabel);
  if (tokenLabel) {
    const probe = await probeYangoTokenByLabel(tokenLabel);
    if (probe.status !== "live") {
      return deadTokenResult(probe.label || tokenLabel, probe.message);
    }
  }

  const clientId = str(run.args.clientId);
  const { preOrders, diagnostics } = await loadAllYangoPreOrdersFresh();
  const scoped = preOrders.filter((row) => {
    if (tokenLabel && row.tokenLabel !== tokenLabel) return false;
    if (clientId && row.clientId !== clientId) return false;
    return true;
  });
  const now = Date.now();
  const atRisk = scoped
    .filter((row) => {
      const level = getPreOrderUrgencyLevel(row, now);
      return level === "red" || level === "yellow";
    })
    .map((row) => {
      const level = getPreOrderUrgencyLevel(row, now);
      const minutes = minutesUntilScheduled(row.scheduledAt, now);
      return {
        orderId: row.orderId,
        tokenLabel: row.tokenLabel,
        clientName: row.clientName,
        scheduledAt: row.scheduledAt ?? row.scheduledFor,
        pointA: row.pointA,
        pointB: row.pointB,
        urgency: level,
        urgencyLabel: getPreOrderUrgencyLabel(level, minutes),
        driverAssigned: row.driverAssigned,
      };
    });

  const deadLabels = [
    ...new Set(
      diagnostics
        .filter((row) => row.authStatus === "error")
        .map((row) => row.tokenLabel)
        .filter(Boolean),
    ),
  ];

  return {
    ok: true,
    data: {
      count: atRisk.length,
      atRisk,
      deadTokens: deadLabels,
      href: "/sales-operation/pre-orders",
    },
    userMessage: atRisk.length
      ? `${atRisk.length} unassigned pre-order${atRisk.length === 1 ? "" : "s"} at risk (yellow/red). Completed rides are not included.`
      : "No unassigned pre-orders in the 10–30 minute risk window.",
  };
}

export async function yangoOrdersProposeCreate(run: ToolRun): Promise<AiToolResult> {
  const tokenLabel = str(run.args.tokenLabel);
  const clientId = str(run.args.clientId);
  const sourceAddress = str(run.args.sourceAddress);
  const destinationAddress = str(run.args.destinationAddress);
  const phoneNumber = str(run.args.phoneNumber);
  const href = REQUEST_RIDES_HREF;

  if (tokenLabel) {
    const probe = await probeYangoTokenByLabel(tokenLabel);
    if (probe.status !== "live") {
      return deadTokenResult(probe.label || tokenLabel, probe.message);
    }
  }

  const incomplete =
    !tokenLabel || !clientId || !sourceAddress || !destinationAddress || !phoneNumber;
  if (incomplete) {
    return {
      ok: true,
      data: { href, wrote: false },
      userMessage:
        "Open Request Rides to finish this booking. Appli will not write a Yango order without a live token, cabinet, phone, and both addresses.",
      uiBlocks: [
        {
          type: "propose",
          title: "Create ride in Request Rides",
          body: "Required ride fields are incomplete. Continue in the existing Request Rides screen — no blind write.",
          why: "v1 will not invent a Yango order from a partial prompt.",
          risk: 2,
          href,
        },
      ],
    };
  }

  let userId = str(run.args.userId) || undefined;
  if (!userId) {
    userId =
      (await resolveRequestRideUserIdByPhone({
        tokenLabel,
        clientId,
        phoneNumber,
      }).catch(() => null)) ?? undefined;
  }
  if (!userId) {
    return {
      ok: true,
      data: { href, wrote: false, reason: "unmapped_phone" },
      userMessage:
        "This rider phone is not mapped to a Yango user_id. Open Request Rides to pick or create the employee — no order was created.",
      uiBlocks: [
        {
          type: "propose",
          title: "Finish in Request Rides",
          body: `${sourceAddress} → ${destinationAddress}`,
          why: "Phone is not mapped to a Yango user. Confirm-gated write refused.",
          risk: 2,
          href,
        },
      ],
    };
  }

  let sourceLat = num(run.args.sourceLat);
  let sourceLon = num(run.args.sourceLon);
  let destinationLat = num(run.args.destinationLat);
  let destinationLon = num(run.args.destinationLon);
  if (sourceLat == null || sourceLon == null) {
    const geo = await geocodeAddress(sourceAddress);
    if (geo) {
      sourceLat = geo.lat;
      sourceLon = geo.lon;
    }
  }
  if (destinationLat == null || destinationLon == null) {
    const geo = await geocodeAddress(destinationAddress);
    if (geo) {
      destinationLat = geo.lat;
      destinationLon = geo.lon;
    }
  }
  if (sourceLat == null || sourceLon == null || destinationLat == null || destinationLon == null) {
    return {
      ok: true,
      data: { href, wrote: false, reason: "geocode_failed" },
      userMessage:
        "Could not resolve pickup/dropoff coordinates. Open Request Rides to complete the route — no order was created.",
      uiBlocks: [
        {
          type: "propose",
          title: "Finish in Request Rides",
          body: `${sourceAddress} → ${destinationAddress}`,
          why: "Geopoints are required for Yango /2.0/orders/create.",
          risk: 2,
          href,
        },
      ],
    };
  }

  const payload: RequestRidePayload = {
    tokenLabel,
    clientId,
    rideClass: str(run.args.rideClass) || "comfortplus_b2b",
    userId,
    sourceAddress,
    destinationAddress,
    sourceLat,
    sourceLon,
    destinationLat,
    destinationLon,
    phoneNumber,
    comment: str(run.args.comment) || null,
    scheduleAtIso: str(run.args.scheduleAtIso) || null,
  };

  const result = await createRequestRide(payload);
  return {
    ok: true,
    data: {
      orderId: result.orderId,
      status: result.status,
      etaMinutes: result.etaMinutes,
      wrote: true,
    },
    userMessage: `Ride created: ${result.orderId} (${result.status}).`,
  };
}
