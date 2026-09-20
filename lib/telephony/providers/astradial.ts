import { getAstradialEnvConfig, isAstradialConfigured } from "@/lib/telephony/env";
import { logTelephonyError } from "@/lib/telephony/log";
import type { TelephonyProvider } from "@/lib/telephony/provider";
import type {
  HangupParams,
  LiveCallSnapshot,
  OriginateCallParams,
  OriginateCallResult,
  ProviderCallHistoryItem,
  TransferParams,
  TelephonyCallDirection,
} from "@/lib/telephony/types";

async function astradialFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const config = getAstradialEnvConfig();
  if (!config) throw new Error("Astradial is not configured.");
  const headers = new Headers(init?.headers);
  headers.set("X-API-Key", config.apiKey);
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${config.apiUrl}${path}`, { ...init, headers });
}

function mapDirection(value: unknown): TelephonyCallDirection {
  const v = typeof value === "string" ? value.toLowerCase() : "";
  if (v === "inbound" || v === "outbound" || v === "internal") return v;
  return "unknown";
}

export function createAstradialTelephonyProvider(): TelephonyProvider {
  return {
    name: "astradial",
    isConfigured: () => isAstradialConfigured(),

    async originateCall(params: OriginateCallParams): Promise<OriginateCallResult> {
      try {
        const res = await astradialFetch("/api/v1/calls/click-to-call", {
          method: "POST",
          body: JSON.stringify({
            from: params.fromExtension,
            to: params.toPhone,
            to_type: "external",
            caller_id: params.callerId ?? undefined,
            timeout: params.timeoutSec ?? 30,
            variables: params.variables ?? undefined,
          }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          status?: string;
          message?: string;
          call_id?: string;
          channel_id?: string;
          error?: string;
        };
        if (!res.ok || json.status === "error") {
          return {
            ok: false,
            error: json.message || json.error || `Astradial originate failed (HTTP ${res.status}).`,
          };
        }
        return {
          ok: true,
          providerCallId: json.call_id ?? null,
          channelId: json.channel_id ?? null,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Originate failed.";
        logTelephonyError({ event: "originate_failed", error: message, provider: "astradial" });
        return { ok: false, error: message };
      }
    },

    async hangupCall(params: HangupParams) {
      try {
        const res = await astradialFetch("/api/v1/calls/hangup-channel", {
          method: "POST",
          body: JSON.stringify({
            channel_id: params.channelId,
            reason: params.reason ?? "normal",
          }),
        });
        if (!res.ok) {
          const json = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
          return { ok: false, error: json.message || json.error || `Hangup failed (HTTP ${res.status}).` };
        }
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "Hangup failed." };
      }
    },

    async transferCall(params: TransferParams) {
      try {
        const res = await astradialFetch("/api/v1/calls/transfer", {
          method: "POST",
          body: JSON.stringify({
            call_id: params.channelId,
            destination: params.destination,
            type: params.type ?? "blind",
          }),
        });
        if (!res.ok) {
          const json = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
          return { ok: false, error: json.message || json.error || `Transfer failed (HTTP ${res.status}).` };
        }
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "Transfer failed." };
      }
    },

    async getActiveCalls(): Promise<LiveCallSnapshot[]> {
      const res = await astradialFetch("/api/v1/calls/live", { method: "GET" });
      if (!res.ok) return [];
      const json = (await res.json().catch(() => null)) as unknown;
      const list = Array.isArray(json) ? json : [];
      return list.map((row) => {
        const r = row as Record<string, unknown>;
        return {
          channelId: String(r.channel_id ?? r.channelId ?? ""),
          from: typeof r.from === "string" ? r.from : null,
          to: typeof r.to === "string" ? r.to : null,
          direction: mapDirection(r.direction),
          status: typeof r.status === "string" ? r.status : "unknown",
          durationSec: typeof r.duration === "number" ? r.duration : null,
        };
      }).filter((c) => c.channelId);
    },

    async getCallHistory(params) {
      const qs = new URLSearchParams();
      if (params?.limit) qs.set("limit", String(params.limit));
      if (params?.from) qs.set("from", params.from);
      if (params?.to) qs.set("to", params.to);
      const res = await astradialFetch(`/api/v1/calls?${qs.toString()}`, { method: "GET" });
      if (!res.ok) return [];
      const json = (await res.json().catch(() => null)) as { data?: unknown[] } | unknown[];
      const list = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
      return list.map((row) => {
        const r = row as Record<string, unknown>;
        return {
          id: String(r.id ?? ""),
          from: typeof r.from_number === "string" ? r.from_number : typeof r.from === "string" ? r.from : null,
          to: typeof r.to_number === "string" ? r.to_number : typeof r.to === "string" ? r.to : null,
          direction: mapDirection(r.direction),
          status: typeof r.status === "string" ? r.status : "unknown",
          durationSec: typeof r.duration === "number" ? r.duration : null,
          startedAt: typeof r.started_at === "string" ? r.started_at : null,
          endedAt: typeof r.ended_at === "string" ? r.ended_at : null,
          recordingPath: typeof r.recording_url === "string" ? r.recording_url : null,
        } satisfies ProviderCallHistoryItem;
      }).filter((c) => c.id);
    },

    async getRecording(providerCallId: string) {
      try {
        const res = await astradialFetch(`/api/v1/calls/${encodeURIComponent(providerCallId)}/recording`, {
          method: "GET",
        });
        if (!res.ok) {
          return { ok: false as const, error: `Recording unavailable (HTTP ${res.status}).` };
        }
        const body = await res.arrayBuffer();
        const contentType = res.headers.get("content-type") || "audio/wav";
        return { ok: true as const, body, contentType };
      } catch (error) {
        return {
          ok: false as const,
          error: error instanceof Error ? error.message : "Recording fetch failed.",
        };
      }
    },

    async setAgentActive(providerUserId: string, active: boolean) {
      try {
        const res = await astradialFetch(`/api/v1/users/${encodeURIComponent(providerUserId)}`, {
          method: "PUT",
          body: JSON.stringify({ status: active ? "active" : "inactive" }),
        });
        if (!res.ok) {
          const json = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
          return { ok: false, error: json.message || json.error || `User update failed (HTTP ${res.status}).` };
        }
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "User update failed." };
      }
    },
  };
}
