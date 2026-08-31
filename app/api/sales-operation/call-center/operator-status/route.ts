import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { isThreeCxConfigured } from "@/lib/call-center/env";
import {
  isCallCenterOperatorStatus,
  patchCallCenterUserSettings,
  type CallCenterOperatorStatus,
} from "@/lib/call-center/repository";
import { findThreeCxUserByExtension, setThreeCxQueueStatus } from "@/lib/call-center/xapi";
import { isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesCallCenter");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as {
    operatorStatus?: unknown;
    notificationsMuted?: unknown;
  } | null;
  if (!body) {
    return Response.json({ ok: false, error: "Invalid body." }, { status: 400 });
  }

  const patch: {
    operatorStatus?: CallCenterOperatorStatus;
    notificationsMuted?: boolean;
    threeCxUserId?: string | null;
  } = {};

  if (body.operatorStatus !== undefined) {
    if (!isCallCenterOperatorStatus(body.operatorStatus)) {
      return Response.json({ ok: false, error: "Invalid operator status." }, { status: 400 });
    }
    patch.operatorStatus = body.operatorStatus;
  }
  if (body.notificationsMuted !== undefined) {
    if (typeof body.notificationsMuted !== "boolean") {
      return Response.json(
        { ok: false, error: "notificationsMuted must be boolean." },
        { status: 400 },
      );
    }
    patch.notificationsMuted = body.notificationsMuted;
  }
  if (patch.operatorStatus === undefined && patch.notificationsMuted === undefined) {
    return Response.json({ ok: false, error: "Nothing to update." }, { status: 400 });
  }

  try {
    let settings = await patchCallCenterUserSettings(auth.user.id, patch);
    let queueSync: { attempted: boolean; ok: boolean; error?: string } = {
      attempted: false,
      ok: false,
    };

    if (patch.operatorStatus && isThreeCxConfigured()) {
      queueSync.attempted = true;
      try {
        let userId = settings.threeCxUserId;
        if (!userId) {
          const found = await findThreeCxUserByExtension(settings.extension);
          if (found) {
            userId = found.id;
            settings = await patchCallCenterUserSettings(auth.user.id, {
              threeCxUserId: found.id,
            });
          }
        }
        if (userId) {
          const loggedIn = patch.operatorStatus === "available";
          const result = await setThreeCxQueueStatus(userId, loggedIn);
          queueSync = { attempted: true, ok: result.ok, error: result.error };
        } else {
          queueSync = {
            attempted: true,
            ok: false,
            error: "Could not resolve 3CX user for this extension.",
          };
        }
      } catch (error) {
        queueSync = {
          attempted: true,
          ok: false,
          error: error instanceof Error ? error.message : "Queue sync failed.",
        };
      }
    }

    return Response.json({ ok: true, settings, queueSync });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to update status.",
      },
      { status: 500 },
    );
  }
}
