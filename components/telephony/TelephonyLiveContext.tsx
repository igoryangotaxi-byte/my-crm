"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { TelephonyCallRow } from "@/lib/telephony/calls-repository";
import type { LiveCallSnapshot } from "@/lib/telephony/types";
import type { TelephonyEnrichmentMatch } from "@/lib/telephony/enrich";

type LivePayload = {
  ok?: boolean;
  linked?: boolean;
  extension?: string | null;
  status?: string;
  live?: LiveCallSnapshot[];
  ringing?: LiveCallSnapshot | null;
  active?: LiveCallSnapshot | null;
  recent?: TelephonyCallRow[];
  providerError?: string | null;
  error?: string;
};

type TelephonyLiveState = {
  enabled: boolean;
  linked: boolean;
  extension: string | null;
  agentStatus: string;
  ringing: LiveCallSnapshot | null;
  active: LiveCallSnapshot | null;
  recent: TelephonyCallRow[];
  enrichment: TelephonyEnrichmentMatch[];
  enrichmentMulti: boolean;
  providerError: string | null;
  refresh: () => Promise<void>;
  hangup: (callIdOrChannel: string) => Promise<{ ok: boolean; error?: string }>;
  dismissIncoming: () => void;
  dismissedRingKey: string | null;
};

const TelephonyLiveContext = createContext<TelephonyLiveState | null>(null);
const POLL_MS = 2000;

function isTelephonyUiEnabled(): boolean {
  const raw = process.env.NEXT_PUBLIC_TELEPHONY_ENABLED?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function TelephonyLiveProvider({ children }: { children: ReactNode }) {
  const enabled = isTelephonyUiEnabled();
  const [linked, setLinked] = useState(false);
  const [extension, setExtension] = useState<string | null>(null);
  const [agentStatus, setAgentStatus] = useState("offline");
  const [ringing, setRinging] = useState<LiveCallSnapshot | null>(null);
  const [active, setActive] = useState<LiveCallSnapshot | null>(null);
  const [recent, setRecent] = useState<TelephonyCallRow[]>([]);
  const [enrichment, setEnrichment] = useState<TelephonyEnrichmentMatch[]>([]);
  const [enrichmentMulti, setEnrichmentMulti] = useState(false);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [dismissedRingKey, setDismissedRingKey] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await fetch("/api/telephony/live", { cache: "no-store" });
      const json = (await res.json()) as LivePayload;
      if (!res.ok || !json.ok) {
        setProviderError(json.error ?? json.providerError ?? "Telephony poll failed");
        return;
      }
      setLinked(Boolean(json.linked));
      setExtension(json.extension ?? null);
      setAgentStatus(json.status ?? "offline");
      setRinging(json.ringing ?? null);
      setActive(json.active ?? null);
      setRecent(json.recent ?? []);
      setProviderError(json.providerError ?? null);

      const phone = json.ringing?.from || json.active?.from || null;
      if (phone) {
        const look = await fetch(`/api/telephony/lookup?phone=${encodeURIComponent(phone)}`, {
          cache: "no-store",
        });
        const lookJson = (await look.json()) as {
          ok?: boolean;
          matches?: TelephonyEnrichmentMatch[];
        };
        if (look.ok && lookJson.ok) {
          const matches = lookJson.matches ?? [];
          setEnrichment(matches);
          setEnrichmentMulti(matches.length > 1);
        }
      } else {
        setEnrichment([]);
        setEnrichmentMulti(false);
      }
    } catch {
      setProviderError("Telephony unavailable");
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const id = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(id);
  }, [enabled, refresh]);

  const hangup = useCallback(async (callIdOrChannel: string) => {
    const res = await fetch(`/api/telephony/calls/${encodeURIComponent(callIdOrChannel)}/hangup`, {
      method: "POST",
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    await refresh();
    return { ok: Boolean(res.ok && json.ok), error: json.error };
  }, [refresh]);

  const dismissIncoming = useCallback(() => {
    if (ringing?.channelId) setDismissedRingKey(ringing.channelId);
  }, [ringing]);

  const value = useMemo<TelephonyLiveState>(
    () => ({
      enabled,
      linked,
      extension,
      agentStatus,
      ringing,
      active,
      recent,
      enrichment,
      enrichmentMulti,
      providerError,
      refresh,
      hangup,
      dismissIncoming,
      dismissedRingKey,
    }),
    [
      enabled,
      linked,
      extension,
      agentStatus,
      ringing,
      active,
      recent,
      enrichment,
      enrichmentMulti,
      providerError,
      refresh,
      hangup,
      dismissIncoming,
      dismissedRingKey,
    ],
  );

  return <TelephonyLiveContext.Provider value={value}>{children}</TelephonyLiveContext.Provider>;
}

export function useTelephonyLiveOptional(): TelephonyLiveState | null {
  return useContext(TelephonyLiveContext);
}
