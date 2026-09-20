import { requireTelephonyAccess } from "@/lib/telephony/access";
import { getTelephonyProvider } from "@/lib/telephony/get-provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** SSE stream of live telephony snapshots (poll fallback remains /api/telephony/live). */
export async function GET(request: Request) {
  const auth = await requireTelephonyAccess(request);
  if (!auth.ok) return auth.response;

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      send("ready", { ok: true, userId: auth.user.id });

      const tick = async () => {
        if (closed) return;
        const provider = getTelephonyProvider();
        if (!provider) {
          send("error", { code: "provider_unavailable" });
          return;
        }
        try {
          const live = await provider.getActiveCalls();
          send("live", { live, at: new Date().toISOString() });
        } catch (error) {
          send("error", {
            message: error instanceof Error ? error.message : "live failed",
          });
        }
      };

      void tick();
      const interval = setInterval(() => void tick(), 2000);

      const abort = () => {
        closed = true;
        clearInterval(interval);
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      };

      request.signal.addEventListener("abort", abort);
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
