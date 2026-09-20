export type TelephonyCallDirection = "inbound" | "outbound" | "internal" | "unknown";

export type TelephonyCallStatus =
  | "initiated"
  | "ringing"
  | "answered"
  | "hold"
  | "ended"
  | "failed"
  | "missed"
  | "unknown";

export type TelephonyCrmEntityType = "driver" | "lead" | "client" | "contact" | "unknown";

export type TelephonyAgentStatus = "available" | "busy" | "break" | "offline";

export type OriginateCallParams = {
  fromExtension: string;
  toPhone: string;
  callerId?: string | null;
  timeoutSec?: number;
  variables?: Record<string, string>;
};

export type OriginateCallResult = {
  ok: boolean;
  providerCallId?: string | null;
  channelId?: string | null;
  error?: string;
};

export type LiveCallSnapshot = {
  channelId: string;
  from: string | null;
  to: string | null;
  direction: TelephonyCallDirection;
  status: string;
  durationSec: number | null;
};

export type ProviderCallHistoryItem = {
  id: string;
  from: string | null;
  to: string | null;
  direction: TelephonyCallDirection;
  status: string;
  durationSec: number | null;
  startedAt: string | null;
  endedAt: string | null;
  recordingPath: string | null;
};

export type HangupParams = { channelId: string; reason?: string };
export type TransferParams = { channelId: string; destination: string; type?: "blind" | "attended" };
