import { isSupabaseConfigured } from "@/lib/supabase";
import { isLeadDiscoveryEnabled } from "@/lib/sales-operation/lead-discovery/repository";
import { tickDiscoveryJobs } from "@/lib/sales-operation/lead-discovery/runner";
import { processDueSequenceSends } from "@/lib/sales-operation/lead-discovery/sequences";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const header = request.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;
  const url = new URL(request.url);
  return url.searchParams.get("secret") === secret;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!isLeadDiscoveryEnabled()) {
    return Response.json({ ok: true, skipped: true, reason: "disabled" });
  }
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }
  try {
    const campaigns = await tickDiscoveryJobs({ userId: null, name: "cron" });
    const sequences = await processDueSequenceSends({ userId: null, name: "cron" });
    return Response.json({ ok: true, campaigns, sequences });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Discovery tick failed." },
      { status: 500 },
    );
  }
}
