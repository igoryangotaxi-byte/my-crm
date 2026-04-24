import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/server-auth";
import { getB2BOrderDetails } from "@/lib/yango-api";

type RequestBody = {
  tokenLabel?: string;
  clientId?: string;
  orderId?: string;
};

export async function POST(request: Request) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;
  try {
    const body = (await request.json()) as RequestBody;

    if (!body.tokenLabel || !body.clientId || !body.orderId) {
      return NextResponse.json(
        { error: "tokenLabel, clientId, orderId are required" },
        { status: 400 },
      );
    }

    const details = await getB2BOrderDetails({
      tokenLabel: body.tokenLabel,
      clientId: body.clientId,
      orderId: body.orderId,
    });

    return NextResponse.json(details);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch order details",
      },
      { status: 500 },
    );
  }
}
