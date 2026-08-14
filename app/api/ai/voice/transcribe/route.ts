import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { transcribeAudio } from "@/lib/ai/voice";
import { bumpUsage } from "@/lib/ai/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesAiAssistant");
  if (!auth.ok) return auth.response;
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof Blob)) {
    return Response.json({ ok: false, error: "file is required" }, { status: 400 });
  }
  const buffer = await file.arrayBuffer();
  try {
    const text = await transcribeAudio(buffer, file.type || "audio/webm");
    await bumpUsage({ userId: auth.user.id, sttSeconds: Math.max(1, Math.round(buffer.byteLength / 16000)) });
    return Response.json({ ok: true, text });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Transcription failed." },
      { status: 500 },
    );
  }
}
