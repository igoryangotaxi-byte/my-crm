type ChatJsonOptions = {
  systemPrompt: string;
  userPrompt: string;
  timeoutMs?: number;
  /** Defaults to OPENAI_TARIFF_ANALYSIS_MAX_TOKENS or 4096 (same scale as Tariff Health chat). */
  maxTokens?: number;
};

type ChatTextOptions = {
  systemPrompt: string;
  userPrompt: string;
  timeoutMs?: number;
  maxTokens?: number;
  temperature?: number;
};

function extractFirstJsonObject(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  const candidate = text.slice(start, end + 1);
  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    return null;
  }
}

/** Parses OpenAI Chat API error JSON (`error.code`, `error.message`). */
function parseOpenAiApiErrorPayload(errorText: string): { code?: string; message?: string } {
  try {
    const j = JSON.parse(errorText) as { error?: { message?: string; code?: string } };
    return {
      code: typeof j.error?.code === "string" ? j.error.code : undefined,
      message: typeof j.error?.message === "string" ? j.error.message : undefined,
    };
  } catch {
    return {};
  }
}

/**
 * OpenAI returns HTTP 429 for both rate limits and billing/quota blocks.
 * `insufficient_quota` means the **account/key cannot spend** (billing, credits,
 * wrong org/project), not "too many requests per minute".
 */
export function formatOpenAiChatHttpError(status: number, errorBodyText: string): string {
  const { code, message } = parseOpenAiApiErrorPayload(errorBodyText);

  if (status === 401) {
    return "OpenAI authentication failed: check OPENAI_API_KEY (wrong key, revoked, or wrong project).";
  }

  if (status === 429) {
    if (code === "insufficient_quota") {
      return (
        "OpenAI returned insufficient_quota (HTTP 429): billing or usage allowance for this API key — not the same as \"RPM exceeded\". " +
        "Check https://platform.openai.com/settings/org/billing , add payment method or credits, and confirm OPENAI_API_KEY is from that organization (deploy/local .env may use a different key)."
      );
    }
    if (code === "rate_limit_exceeded" || /rate limit/i.test(message ?? "")) {
      return (
        "OpenAI rate limit (HTTP 429): too many requests or tokens per minute for your tier. Retry later or request higher limits in OpenAI dashboard."
      );
    }
  }

  const snippet = errorBodyText.length > 800 ? `${errorBodyText.slice(0, 800)}…` : errorBodyText;
  return `LLM request failed (${status})${code ? ` [${code}]` : ""}: ${snippet}`;
}

export async function requestStructuredJson({
  systemPrompt,
  userPrompt,
  timeoutMs = 20000,
  maxTokens: maxTokensOption,
}: ChatJsonOptions) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
  const envMax = Number(process.env.OPENAI_TARIFF_ANALYSIS_MAX_TOKENS ?? "4096");
  const maxTokens =
    maxTokensOption ?? (Number.isFinite(envMax) && envMax > 0 ? envMax : 4096);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: maxTokens,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
        signal: controller.signal,
        cache: "no-store",
      });
    } catch (err) {
      const aborted =
        err instanceof Error &&
        (err.name === "AbortError" || /aborted|AbortError/i.test(err.message));
      if (aborted) {
        throw new Error(
          `OpenAI structured JSON request timed out after ${timeoutMs}ms. Increase OPENAI_TARIFF_ANALYSIS_TIMEOUT_MS (decoupling suggestions use it; default 90000ms).`,
        );
      }
      throw err;
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(formatOpenAiChatHttpError(response.status, errorText));
    }

    const payload = (await response.json()) as {
      choices?: Array<{
        message?: { content?: string | null };
        finish_reason?: string;
      }>;
    };
    const choice0 = payload.choices?.[0];
    if (choice0?.finish_reason === "length") {
      throw new Error(
        "OpenAI JSON output was truncated (token limit). Increase OPENAI_TARIFF_ANALYSIS_MAX_TOKENS for structured responses (e.g. 8192).",
      );
    }
    const content = choice0?.message?.content;
    if (!content || typeof content !== "string") {
      throw new Error("LLM response did not include content.");
    }

    const parsed = extractFirstJsonObject(content);
    if (!parsed) {
      throw new Error("LLM response is not a valid JSON object.");
    }
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

export async function requestChatText({
  systemPrompt,
  userPrompt,
  timeoutMs = Number(process.env.OPENAI_TARIFF_ANALYSIS_TIMEOUT_MS ?? "90000"),
  maxTokens = Number(process.env.OPENAI_TARIFF_ANALYSIS_MAX_TOKENS ?? "4096"),
  temperature = Number(process.env.OPENAI_TARIFF_ANALYSIS_TEMPERATURE ?? "0.35"),
}: ChatTextOptions): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: Number.isFinite(temperature) ? temperature : 0.35,
        max_tokens: Number.isFinite(maxTokens) ? maxTokens : 4096,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(formatOpenAiChatHttpError(response.status, errorText));
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") {
      throw new Error("LLM response did not include content.");
    }
    return content.trim();
  } finally {
    clearTimeout(timer);
  }
}
