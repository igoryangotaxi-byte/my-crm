import { requireAdminUser } from "@/lib/server-auth";
import { relabelGoogleVendorForDisplay } from "@/lib/public-error-message";
import { validateYangoApiToken } from "@/lib/yango-token-onboarding";
import { findExistingYangoToken } from "@/lib/yango-token-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ValidateBody = {
  token?: unknown;
};

export async function POST(request: Request) {
  const auth = await requireAdminUser(request);
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as ValidateBody;
    const token = typeof body.token === "string" ? body.token : "";
    const result = await validateYangoApiToken(token);
    const existing = await findExistingYangoToken(token);
    return Response.json(
      { ok: true, result, existing },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message.trim() : "Failed to validate API token.";
    return Response.json(
      { ok: false, error: relabelGoogleVendorForDisplay(msg || "Failed to validate API token.") },
      { status: 400 },
    );
  }
}
