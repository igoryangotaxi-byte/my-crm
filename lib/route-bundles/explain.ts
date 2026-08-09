import { requestChatText } from "@/lib/llm";
import type { ScoredBundlePath } from "@/lib/route-bundles/types";

/** Deterministic fallback explainability (no LLM). */
export function buildDeterministicExplain(path: ScoredBundlePath): string {
  const idleMin = Math.round(path.emptyDriveSec / 60);
  const emptyKm = (path.emptyDriveM / 1000).toFixed(1);
  const bufferMin = Math.round(path.minBufferSec / 60);
  return `Recommended because this route chains ${path.orderIds.length} pre-orders with ${emptyKm} km empty driving, ~${idleMin} min empty time, and a ${bufferMin} min minimum buffer (${path.health.replace("_", " ")}).`;
}

export async function explainBundlePath(path: ScoredBundlePath): Promise<string> {
  const fallback = buildDeterministicExplain(path);
  if (!process.env.OPENAI_API_KEY?.trim()) return fallback;
  try {
    const text = await requestChatText({
      systemPrompt:
        "You help Ops staff understand pre-order route bundles. Write one short plain sentence. Never invent travel times — only use the numbers given. No markdown.",
      userPrompt: JSON.stringify({
        orders: path.orderIds.length,
        emptyKm: Number((path.emptyDriveM / 1000).toFixed(1)),
        emptyMin: Math.round(path.emptyDriveSec / 60),
        minBufferMin: Math.round(path.minBufferSec / 60),
        health: path.health,
        score: Math.round(path.score),
      }),
      maxTokens: 80,
      temperature: 0.2,
      timeoutMs: 8000,
    });
    const cleaned = text?.trim();
    return cleaned || fallback;
  } catch {
    return fallback;
  }
}
