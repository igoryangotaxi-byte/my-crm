import { requireTelephonyPage } from "@/lib/telephony/access";
import {
  getTelephonyProviderName,
  isAstradialConfigured,
  isTelephonyEnabled,
} from "@/lib/telephony/env";
import { getTelephonyAgent } from "@/lib/telephony/agents-repository";
import { getTelephonyProvider } from "@/lib/telephony/get-provider";
import { isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireTelephonyPage(request);
  if (!auth.ok) return auth.response;

  const agent = isSupabaseConfigured() ? await getTelephonyAgent(auth.user.id) : null;
  const provider = getTelephonyProvider();
  let liveCount = 0;
  if (provider) {
    try {
      const live = await provider.getActiveCalls();
      liveCount = live.length;
    } catch {
      liveCount = 0;
    }
  }

  return Response.json({
    ok: true,
    telephonyEnabled: isTelephonyEnabled(),
    provider: getTelephonyProviderName(),
    astradialConfigured: isAstradialConfigured(),
    supabaseConfigured: isSupabaseConfigured(),
    linked: Boolean(agent?.extension),
    agent,
    liveCount,
  });
}
