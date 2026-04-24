type ChatJsonOptions = {
  systemPrompt: string;
  userPrompt: string;
  timeoutMs?: number;
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

export async function requestStructuredJson({
  systemPrompt,
  userPrompt,
  timeoutMs = 20000,
}: ChatJsonOptions) {
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
        temperature: 0,
        response_format: { type: "json_object" },
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
      throw new Error(`LLM request failed (${response.status}): ${errorText}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
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
      throw new Error(`LLM request failed (${response.status}): ${errorText}`);
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
