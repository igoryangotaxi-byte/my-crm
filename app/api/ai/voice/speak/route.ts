import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { synthesizeSpeech } from "@/lib/ai/voice";
import { bumpUsage } from "@/lib/ai/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesAiAssistant");
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => null)) as { text?: string } | null;
  const text = body?.text?.trim();
  if (!text) return Response.json({ ok: false, error: "text is required" }, { status: 400 });
  try {
    const audio = await synthesizeSpeech(text);
    await bumpUsage({ userId: auth.user.id, ttsSeconds: Math.ceil(text.length / 15) });
    return new Response(audio, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "TTS failed." },
      { status: 500 },
    );
  }
}
