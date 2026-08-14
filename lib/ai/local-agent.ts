import { toolDefsForOpenAi, resolveToolName } from "@/lib/ai/tool-defs";
import { executeAiTool } from "@/lib/ai/tool-gateway";
import { bumpUsage } from "@/lib/ai/repository";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import { isOpenClawConfigured, openClawChatCompletions } from "@/lib/ai/openclaw-client";
import type { AiSseEvent, AiTrustedContext, AiUiBlock, AiUserPreferences } from "@/lib/ai/types";

const MAX_ROUNDS = 8;

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: OpenAiToolCall[];
};

type OpenAiToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type AgentTurnResult = {
  text: string;
  uiBlocks: AiUiBlock[];
  inputTokens: number;
  outputTokens: number;
};

function toolStatusLine(name: string): string {
  if (name.startsWith("calendar.")) return "Checking your calendar…";
  if (name.startsWith("tasks.")) return "Looking at tasks…";
  if (name.startsWith("tracker.")) return "Working in the tracker…";
  if (name === "crm.update_lead_status") return "Updating the pipeline…";
  if (name.startsWith("crm.") || name.startsWith("people.")) return "Searching the CRM…";
  if (name.startsWith("analytics.")) return "Pulling analytics…";
  if (name.startsWith("mail.")) return "Looking at email…";
  if (name.startsWith("telegram.")) return "Talking to Telegram…";
  return "Working…";
}

export async function runLocalAgentTurn(input: {
  context: AiTrustedContext;
  prefs: AiUserPreferences;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  userMessage: string;
  conversationId?: string | null;
  emit?: (event: AiSseEvent) => void;
}): Promise<AgentTurnResult> {
  const useOpenClaw = isOpenClawConfigured();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!useOpenClaw && !apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }
  // Deliberately not OPENAI_MODEL: that one is tuned cheap for tariff analysis,
  // and a mini model plans tool calls badly.
  const model = process.env.AI_ASSISTANT_MODEL?.trim() || "gpt-4.1";
  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt({ context: input.context, prefs: input.prefs }) },
    ...input.history.slice(-20).map((msg) => ({ role: msg.role, content: msg.content })),
    { role: "user", content: input.userMessage },
  ];
  const uiBlocks: AiUiBlock[] = [];
  let lastToolMessage = "";
  let text = "";
  let inputTokens = 0;
  let outputTokens = 0;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const payloadBody = {
      model,
      temperature: 0.3,
      max_tokens: 1200,
      tools: toolDefsForOpenAi(),
      messages,
    };
    const response = useOpenClaw
      ? await openClawChatCompletions(payloadBody as Record<string, unknown>)
      : await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(payloadBody),
          cache: "no-store",
        });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText.slice(0, 500) || `OpenAI ${response.status}`);
    }
    const payload = (await response.json()) as {
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      choices?: Array<{
        message?: {
          content?: string | null;
          tool_calls?: OpenAiToolCall[];
        };
        finish_reason?: string;
      }>;
    };
    inputTokens += payload.usage?.prompt_tokens ?? 0;
    outputTokens += payload.usage?.completion_tokens ?? 0;
    const message = payload.choices?.[0]?.message;
    const toolCalls = message?.tool_calls ?? [];
    if (toolCalls.length > 0) {
      messages.push({
        role: "assistant",
        content: message?.content ?? "",
        tool_calls: toolCalls,
      });
      for (const call of toolCalls) {
        const toolName = resolveToolName(call.function.name);
        input.emit?.({ type: "status", text: toolStatusLine(toolName) });
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
        } catch {
          args = {};
        }
        const result = await executeAiTool({
          tool: toolName,
          args,
          context: input.context,
          prefs: input.prefs,
          conversationId: input.conversationId,
        });
        if (result.uiBlocks) {
          for (const block of result.uiBlocks) {
            uiBlocks.push(block);
            if (block.type === "confirmation") {
              input.emit?.({ type: "confirmation", card: block });
            } else {
              input.emit?.({ type: "card", card: block });
            }
          }
        }
        if (result.userMessage) lastToolMessage = result.userMessage;
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({
            ok: result.ok,
            status: result.status,
            error: result.error,
            data: result.data,
            userMessage: result.userMessage,
          }),
        });
      }
      continue;
    }
    text = (message?.content ?? "").trim();
    if (text) input.emit?.({ type: "delta", text });
    break;
  }

  // A silent turn (empty reply, or the round budget spent mid-plan) must still
  // report what the tools did instead of leaving the drawer blank.
  if (!text) {
    text = lastToolMessage || "I could not finish that in one turn. Tell me which part to continue.";
    input.emit?.({ type: "delta", text });
  }

  await bumpUsage({
    userId: input.context.userId,
    requests: 1,
    inputTokens,
    outputTokens,
    estimatedCostUsd: (inputTokens * 0.000002 + outputTokens * 0.000008) || 0,
  });

  return { text, uiBlocks, inputTokens, outputTokens };
}
