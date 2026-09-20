type TelephonyLogFields = {
  event: string;
  callId?: string | null;
  providerCallId?: string | null;
  agentId?: string | null;
  crmEntity?: string | null;
  provider?: string | null;
  detail?: string | null;
};

/** Structured telephony logs — never pass secrets, SIP passwords, or auth headers. */
export function logTelephony(fields: TelephonyLogFields): void {
  const payload = {
    scope: "telephony",
    ts: new Date().toISOString(),
    ...fields,
  };
  console.info(JSON.stringify(payload));
}

export function logTelephonyError(fields: TelephonyLogFields & { error: string }): void {
  console.error(
    JSON.stringify({
      scope: "telephony",
      level: "error",
      ts: new Date().toISOString(),
      ...fields,
    }),
  );
}
