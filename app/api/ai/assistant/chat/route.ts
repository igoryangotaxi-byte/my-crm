import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { isSupabaseConfigured } from "@/lib/supabase";
import { buildTrustedAiContext, sessionKeyForUser } from "@/lib/ai/context";
import {
  appendMessage,
  createConversation,
  getAiPreferences,
  getConversation,
  listMessages,
} from "@/lib/ai/repository";
import { runAssistantTurn } from "@/lib/ai/run-turn";
import type { AiPageContext, AiSseEvent } from "@/lib/ai/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesAiAssistant");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as {
    message?: string;
    conversationId?: string;
    pageContext?: AiPageContext;
  } | null;
  const message = body?.message?.trim();
  if (!message) {
    return Response.json({ ok: false, error: "message is required" }, { status: 400 });
  }

  const context = await buildTrustedAiContext(auth.user, body?.pageContext ?? null);
  const prefs = await getAiPreferences(auth.user.id);
  let conversation = body?.conversationId
    ? await getConversation(body.conversationId, auth.user.id)
    : null;
  if (!conversation) {
    conversation = await createConversation({
      userId: auth.user.id,
      sessionKey: sessionKeyForUser(auth.user.id),
      title: message.slice(0, 80),
      pageContext: body?.pageContext ?? null,
    });
  }
  const history = (await listMessages(conversation.id, auth.user.id)).filter(
    (row) => row.role === "user" || row.role === "assistant",
  );
  await appendMessage({
    conversationId: conversation.id,
    userId: auth.user.id,
    role: "user",
    content: message,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: AiSseEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      try {
        const result = await runAssistantTurn({
          context,
          prefs,
          history: history.map((row) => ({
            role: row.role as "user" | "assistant",
            content: row.content,
          })),
          userMessage: message,
          conversationId: conversation.id,
          emit,
        });
        const saved = await appendMessage({
          conversationId: conversation.id,
          userId: auth.user.id,
          role: "assistant",
          content: result.text,
          uiBlocks: result.uiBlocks,
        });
        emit({ type: "done", conversationId: conversation.id, messageId: saved.id });
      } catch (error) {
        emit({
          type: "error",
          error: error instanceof Error ? error.message : "Assistant failed.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    },
  });
}
