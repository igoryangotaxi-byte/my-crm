import { relabelGoogleVendorForDisplay } from "@/lib/public-error-message";
import { requireAdminUser } from "@/lib/server-auth";
import { getRequestRideApiClients } from "@/lib/yango-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  corpClientId?: unknown;
};

export async function POST(request: Request) {
  const auth = await requireAdminUser(request);
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as Body;
    const corpClientId =
      typeof body.corpClientId === "string" ? body.corpClientId.trim() : "";
    if (!corpClientId) {
      return Response.json(
        { ok: false, error: "corp_client_id is required." },
        { status: 400 },
      );
    }

    const clients = await getRequestRideApiClients();
    const matches = clients.filter((row) => row.clientId === corpClientId);
    if (matches.length === 0) {
      return Response.json(
        { ok: false, error: "No configured token found for this corp_client_id." },
        { status: 404 },
      );
    }
    const uniqueTokenLabels = [...new Set(matches.map((item) => item.tokenLabel))];
    if (uniqueTokenLabels.length > 1) {
      return Response.json(
        {
          ok: false,
          error:
            "Multiple API tokens are mapped to this corp_client_id. Please validate by API token to choose the required one.",
        },
        { status: 409 },
      );
    }
    const found = matches[0];

    return Response.json(
      {
        ok: true,
        result: {
          tokenLabel: found.tokenLabel,
          clientId: found.clientId,
          clientName: found.clientName,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const msg =
      error instanceof Error
        ? error.message.trim()
        : "Failed to resolve token by corp_client_id.";
    return Response.json(
      {
        ok: false,
        error: relabelGoogleVendorForDisplay(
          msg || "Failed to resolve token by corp_client_id.",
        ),
      },
      { status: 400 },
    );
  }
}
