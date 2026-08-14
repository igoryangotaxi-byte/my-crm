import type { AppPageKey } from "@/types/auth";
import type { AiRiskLevel } from "@/lib/ai/types";

export type AiToolSpec = {
  name: string;
  description: string;
  risk: AiRiskLevel;
  requiredPage: AppPageKey | AppPageKey[];
  parameters: Record<string, unknown>;
};

const DENIED_HOST_TOOLS = [
  "exec",
  "write",
  "edit",
  "apply_patch",
  "browser",
  "nodes",
  "process",
  "terminal",
  "code_execution",
  "gateway",
] as const;

export const OPENCLAW_DENIED_TOOLS: readonly string[] = DENIED_HOST_TOOLS;

export function isDeniedHostTool(name: string): boolean {
  const lower = name.trim().toLowerCase();
  return DENIED_HOST_TOOLS.some((tool) => lower === tool || lower.startsWith(`${tool}.`));
}

export function riskForTool(name: string): AiRiskLevel {
  const n = name.trim().toLowerCase();
  if (isDeniedHostTool(n)) return 3;
  if (
    n.includes("delete") ||
    n.includes("cancel") ||
    n.includes("bulk") ||
    n.includes("permission")
  ) {
    return 3;
  }
  if (
    n.includes("send") ||
    n.includes("invite") ||
    n.startsWith("mail.send") ||
    n.startsWith("telegram.send")
  ) {
    return 2;
  }
  if (
    n.includes("create") ||
    n.includes("update") ||
    n.includes("assign") ||
    n.includes("schedule") ||
    n.includes("comment")
  ) {
    return 1;
  }
  return 0;
}

export function requiresConfirmation(input: {
  risk: AiRiskLevel;
  autoLowRiskWrites: boolean;
  allowDirectSendEmail: boolean;
  allowDirectSendTelegram: boolean;
  tool: string;
  /** True when the message goes to the user's own linked Telegram chat. */
  toSelf?: boolean;
}): boolean {
  if (input.risk >= 3) return true;
  if (input.risk === 2) {
    // Messaging yourself is a note, not an external send — never gate it.
    if (input.tool.startsWith("telegram.") && input.toSelf) return false;
    if (input.tool.startsWith("mail.") && input.allowDirectSendEmail) return false;
    if (input.tool.startsWith("telegram.") && input.allowDirectSendTelegram) return false;
    return true;
  }
  if (input.risk === 1) return !input.autoLowRiskWrites;
  return false;
}

export function redactParams(params: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    const k = key.toLowerCase();
    if (k.includes("token") || k.includes("secret") || k.includes("password") || k.includes("refresh")) {
      redacted[key] = "[redacted]";
      continue;
    }
    if (typeof value === "string" && value.length > 500) {
      redacted[key] = `${value.slice(0, 500)}…`;
      continue;
    }
    redacted[key] = value;
  }
  return redacted;
}
