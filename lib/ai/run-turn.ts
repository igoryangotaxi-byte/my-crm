import { runLocalAgentTurn, type AgentTurnResult } from "@/lib/ai/local-agent";
import { isOpenClawConfigured } from "@/lib/ai/openclaw-client";
import type { AiSseEvent, AiTrustedContext, AiUserPreferences } from "@/lib/ai/types";

export async function runAssistantTurn(input: {
  context: AiTrustedContext;
  prefs: AiUserPreferences;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  userMessage: string;
  conversationId?: string | null;
  emit?: (event: AiSseEvent) => void;
}): Promise<AgentTurnResult> {
  input.emit?.({
    type: "status",
    text: isOpenClawConfigured() ? "Thinking…" : "Thinking…",
  });
  return runLocalAgentTurn(input);
}
