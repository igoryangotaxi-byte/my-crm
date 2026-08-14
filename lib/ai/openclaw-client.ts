import { OPENCLAW_DENIED_TOOLS } from "@/lib/ai/risk-policy";

export function isOpenClawConfigured(): boolean {
  return Boolean(process.env.OPENCLAW_GATEWAY_URL?.trim() && process.env.OPENCLAW_GATEWAY_TOKEN?.trim());
}

export async function openClawHealth(): Promise<{ ok: boolean; message: string }> {
  const url = process.env.OPENCLAW_GATEWAY_URL?.trim();
  if (!url) return { ok: false, message: "OPENCLAW_GATEWAY_URL is not set." };
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/healthz`, {
      headers: gatewayHeaders(),
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, message: `OpenClaw health ${res.status}` };
    return { ok: true, message: "OpenClaw gateway reachable." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "OpenClaw unreachable." };
  }
}

function gatewayHeaders(): HeadersInit {
  const token = process.env.OPENCLAW_GATEWAY_TOKEN?.trim() ?? "";
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

/**
 * Optional LLM hop through OpenClaw's OpenAI-compatible endpoint.
 * Tools still execute in Appli. Host tools are never advertised.
 */
export async function openClawChatCompletions(body: Record<string, unknown>): Promise<Response> {
  const url = process.env.OPENCLAW_GATEWAY_URL?.trim();
  if (!url) throw new Error("OPENCLAW_GATEWAY_URL is not set.");
  return fetch(`${url.replace(/\/$/, "")}/v1/chat/completions`, {
    method: "POST",
    headers: gatewayHeaders(),
    body: JSON.stringify({
      ...body,
      tools_deny: OPENCLAW_DENIED_TOOLS,
    }),
    cache: "no-store",
  });
}
