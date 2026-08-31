import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { isThreeCxConfigured } from "@/lib/call-center/env";
import { getCallCenterUserSettings } from "@/lib/call-center/repository";
import { findThreeCxUserByExtension } from "@/lib/call-center/xapi";
import { isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesCallCenter");
  if (!auth.ok) return auth.response;

  const configured = isThreeCxConfigured();
  const settings = isSupabaseConfigured()
    ? await getCallCenterUserSettings(auth.user.id)
    : null;

  let profileName: string | null = null;
  let queueStatus: string | null = null;
  if (configured && settings?.extension) {
    try {
      const user = await findThreeCxUserByExtension(settings.extension);
      profileName = user?.currentProfileName ?? null;
      queueStatus = user?.queueStatus ?? null;
    } catch {
      // Best-effort only.
    }
  }

  return Response.json({
    ok: true,
    companyConfigured: configured,
    supabaseConfigured: isSupabaseConfigured(),
    linked: Boolean(settings?.extension),
    extension: settings?.extension ?? null,
    preferredDeviceId: settings?.preferredDeviceId ?? null,
    operatorStatus: settings?.operatorStatus ?? "available",
    notificationsMuted: settings?.notificationsMuted ?? false,
    threeCxProfileName: profileName,
    threeCxQueueStatus: queueStatus,
    updatedAt: settings?.updatedAt ?? null,
  });
}
