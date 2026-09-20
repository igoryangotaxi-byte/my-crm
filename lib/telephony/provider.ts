import type {
  HangupParams,
  LiveCallSnapshot,
  OriginateCallParams,
  OriginateCallResult,
  ProviderCallHistoryItem,
  TransferParams,
} from "@/lib/telephony/types";

/**
 * Abstraction over PBX engines (Astradial first; 3CX can plug in later).
 * Appli business logic must not call Asterisk ARI/AMI directly.
 */
export type TelephonyProvider = {
  readonly name: "astradial" | "threecx";
  isConfigured(): boolean;
  originateCall(params: OriginateCallParams): Promise<OriginateCallResult>;
  hangupCall(params: HangupParams): Promise<{ ok: boolean; error?: string }>;
  transferCall(params: TransferParams): Promise<{ ok: boolean; error?: string }>;
  getActiveCalls(): Promise<LiveCallSnapshot[]>;
  getCallHistory(params?: {
    limit?: number;
    from?: string;
    to?: string;
  }): Promise<ProviderCallHistoryItem[]>;
  getRecording(providerCallId: string): Promise<{ ok: true; body: ArrayBuffer; contentType: string } | { ok: false; error: string }>;
  setAgentActive?(providerUserId: string, active: boolean): Promise<{ ok: boolean; error?: string }>;
};
