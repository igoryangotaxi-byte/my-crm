export async function transcribeAudio(buffer: ArrayBuffer, mimeType: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
  const ext = mimeType.includes("mp4") || mimeType.includes("m4a") ? "m4a" : mimeType.includes("wav") ? "wav" : "webm";
  const form = new FormData();
  form.set("model", "whisper-1");
  form.set("file", new Blob([buffer], { type: mimeType || "audio/webm" }), `speech.${ext}`);
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    throw new Error((await res.text()).slice(0, 400) || "Transcription failed.");
  }
  const data = (await res.json()) as { text?: string };
  return (data.text ?? "").trim();
}

export async function synthesizeSpeech(text: string): Promise<ArrayBuffer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_TTS_MODEL ?? "tts-1",
      voice: process.env.OPENAI_TTS_VOICE ?? "alloy",
      input: text.slice(0, 4000),
    }),
  });
  if (!res.ok) {
    throw new Error((await res.text()).slice(0, 400) || "TTS failed.");
  }
  return res.arrayBuffer();
}
