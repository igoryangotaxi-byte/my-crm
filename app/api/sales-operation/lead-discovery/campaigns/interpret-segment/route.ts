import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import {
  isLeadDiscoveryEnabled,
  getDiscoverySettings,
  bumpGroqUsage,
} from "@/lib/sales-operation/lead-discovery/repository";
import {
  groqInterpretCampaignSegment,
  interpretCampaignSegmentHeuristic,
  isGroqConfigured,
  isGroqRateLimitError,
  friendlyGroqError,
} from "@/lib/sales-operation/lead-discovery/groq";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Create-time only: interpret a free-text segment into campaign Places filters via Groq.
 * Falls back to a local heuristic if Groq is rate-limited or unavailable.
 */
export async function POST(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesLeadDiscovery");
  if (!auth.ok) return auth.response;
  if (!isLeadDiscoveryEnabled() || !isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Unavailable." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { description?: string } | null;
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  if (description.length < 8) {
    return Response.json(
      { ok: false, error: "Describe the segment in at least a short sentence." },
      { status: 400 },
    );
  }

  const settings = await getDiscoverySettings();
  const canTryGroq =
    isGroqConfigured() &&
    settings.groqEnabled &&
    settings.groqRequestsUsedToday < settings.groqDailyRequestLimit;

  if (canTryGroq) {
    try {
      const result = await groqInterpretCampaignSegment(description, {
        model: settings.groqModel,
      });
      await bumpGroqUsage(true);
      return Response.json({
        ok: true,
        interpretation: result.interpretation,
        model: result.model,
        promptVersion: result.promptVersion,
        source: "groq",
      });
    } catch (error) {
      await bumpGroqUsage(false, error instanceof Error ? error.message : "interpret failed");
      if (!isGroqRateLimitError(error)) {
        // Non-rate-limit Groq errors: still try heuristic so create isn't blocked.
        const interpretation = interpretCampaignSegmentHeuristic(description);
        return Response.json({
          ok: true,
          interpretation,
          model: "heuristic",
          source: "heuristic",
          warning: friendlyGroqError(error),
        });
      }
      const interpretation = interpretCampaignSegmentHeuristic(description);
      return Response.json({
        ok: true,
        interpretation,
        model: "heuristic",
        source: "heuristic",
        warning: friendlyGroqError(error),
      });
    }
  }

  const interpretation = interpretCampaignSegmentHeuristic(description);
  return Response.json({
    ok: true,
    interpretation,
    model: "heuristic",
    source: "heuristic",
    warning: !isGroqConfigured()
      ? "Groq is not configured — used local segment parsing."
      : !settings.groqEnabled
        ? "Groq is disabled — used local segment parsing."
        : "Groq daily request budget reached — used local segment parsing.",
  });
}
