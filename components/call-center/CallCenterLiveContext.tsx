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
import {
  type LivePollTier,
  useLinkedOperatorLivePoll,
} from "@/lib/client/use-linked-operator-live-poll";

export type CallCenterParticipant = {
  id: number;
  status: string;
  dn: string | null;
  partyCallerName: string | null;
  partyDn: string | null;
  partyCallerId: string | null;
  partyDid: string | null;
  deviceId: string | null;
  partyDnType: string | null;
  directControl: boolean;
  callId: number | null;
  legId: number | null;
};

export type CallCenterScreenPopRequest = {
  phone: string;
  name?: string | null;
};

type CallCenterLiveState = {
  linked: boolean;
  extension: string | null;
  operatorStatus: string;
  notificationsMuted: boolean;
  participants: CallCenterParticipant[];
  incoming: CallCenterParticipant | null;
  active: CallCenterParticipant | null;
  screenPopRequest: CallCenterScreenPopRequest | null;
  error: string | null;
  refresh: () => Promise<void | LivePollTier>;
  setOperatorStatus: (status: string) => Promise<void>;
  setNotificationsMuted: (muted: boolean) => Promise<void>;
  openScreenPop: (request: CallCenterScreenPopRequest) => void;
  closeScreenPop: () => void;
  runAction: (
    participantId: number,
    action: "answer" | "drop" | "divert" | "transferto",
    destination?: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  makecall: (phone: string) => Promise<{ ok: boolean; error?: string }>;
};

const CallCenterLiveContext = createContext<CallCenterLiveState | null>(null);

function isRinging(status: string): boolean {
  const s = status.toLowerCase();
  return s.includes("ring") || s === "dialing" || s === "trying";
}

function isConnected(status: string): boolean {
  const s = status.toLowerCase();
  return s.includes("connect") || s === "talking" || s === "established";
}

function pickIncoming(list: CallCenterParticipant[]): CallCenterParticipant | null {
  return list.find((p) => isRinging(p.status)) ?? null;
}

function pickActive(list: CallCenterParticipant[]): CallCenterParticipant | null {
  return list.find((p) => isConnected(p.status)) ?? pickIncoming(list);
}

export function CallCenterLiveProvider({ children }: { children: ReactNode }) {
  const [linked, setLinked] = useState(false);
  const [extension, setExtension] = useState<string | null>(null);
  const [operatorStatus, setOperatorStatusState] = useState("available");
  const [notificationsMuted, setNotificationsMutedState] = useState(false);
  const [participants, setParticipants] = useState<CallCenterParticipant[]>([]);
  const [screenPopRequest, setScreenPopRequest] = useState<CallCenterScreenPopRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pollTier, setPollTier] = useState<LivePollTier>("idle");

  const refresh = useCallback(async (): Promise<LivePollTier | void> => {
    try {
      const res = await fetch("/api/sales-operation/call-center/participants", {
        cache: "no-store",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        code?: string;
        error?: string;
        extension?: string;
        operatorStatus?: string;
        notificationsMuted?: boolean;
        participants?: CallCenterParticipant[];
      };
      if (res.status === 400 && json.code === "not_linked") {
        setLinked(false);
        setExtension(null);
        setParticipants([]);
        setError(null);
        setPollTier("idle");
        return "idle";
      }
      if (!res.ok || !json.ok) {
        if (res.status === 403 || res.status === 401) {
          setLinked(false);
          setPollTier("idle");
          return "idle";
        }
        setError(json.error ?? "Call Center poll failed");
        return;
      }
      setLinked(true);
      setExtension(json.extension ?? null);
      setOperatorStatusState(json.operatorStatus ?? "available");
      setNotificationsMutedState(Boolean(json.notificationsMuted));
      setParticipants(json.participants ?? []);
      setError(null);
      setPollTier("fast");
      return "fast";
    } catch {
      // Ignore transient network errors during poll.
    }
  }, []);

  useLinkedOperatorLivePoll(refresh, pollTier);

  const setOperatorStatus = useCallback(
    async (status: string) => {
      const res = await fetch("/api/sales-operation/call-center/operator-status", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operatorStatus: status }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Failed to update status");
      setOperatorStatusState(status);
      await refresh();
    },
    [refresh],
  );

  const setNotificationsMuted = useCallback(
    async (muted: boolean) => {
      const res = await fetch("/api/sales-operation/call-center/operator-status", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationsMuted: muted }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Failed to update mute");
      setNotificationsMutedState(muted);
    },
    [],
  );

  const runAction = useCallback(
    async (
      participantId: number,
      action: "answer" | "drop" | "divert" | "transferto",
      destination?: string,
    ) => {
      const res = await fetch("/api/sales-operation/call-center/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId, action, destination }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      await refresh();
      return { ok: Boolean(res.ok && json.ok), error: json.error };
    },
    [refresh],
  );

  const makecall = useCallback(
    async (phone: string) => {
      const res = await fetch("/api/sales-operation/call-center/makecall", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      await refresh();
      return { ok: Boolean(res.ok && json.ok), error: json.error };
    },
    [refresh],
  );

  const openScreenPop = useCallback((request: CallCenterScreenPopRequest) => {
    const phone = request.phone.trim();
    if (!phone) return;
    setScreenPopRequest({ phone, name: request.name ?? null });
  }, []);

  const closeScreenPop = useCallback(() => {
    setScreenPopRequest(null);
  }, []);

  const value = useMemo<CallCenterLiveState>(
    () => ({
      linked,
      extension,
      operatorStatus,
      notificationsMuted,
      participants,
      incoming: pickIncoming(participants),
      active: pickActive(participants),
      screenPopRequest,
      error,
      refresh,
      setOperatorStatus,
      setNotificationsMuted,
      openScreenPop,
      closeScreenPop,
      runAction,
      makecall,
    }),
    [
      linked,
      extension,
      operatorStatus,
      notificationsMuted,
      participants,
      screenPopRequest,
      error,
      refresh,
      setOperatorStatus,
      setNotificationsMuted,
      openScreenPop,
      closeScreenPop,
      runAction,
      makecall,
    ],
  );

  return (
    <CallCenterLiveContext.Provider value={value}>{children}</CallCenterLiveContext.Provider>
  );
}

export function useCallCenterLive(): CallCenterLiveState {
  const ctx = useContext(CallCenterLiveContext);
  if (!ctx) {
    throw new Error("useCallCenterLive must be used within CallCenterLiveProvider");
  }
  return ctx;
}

export function useCallCenterLiveOptional(): CallCenterLiveState | null {
  return useContext(CallCenterLiveContext);
}
