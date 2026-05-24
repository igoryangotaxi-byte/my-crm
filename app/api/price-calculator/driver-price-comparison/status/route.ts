import { isSupabaseConfigured } from "@/lib/supabase";
import { requireApprovedUser } from "@/lib/server-auth";
import {
  getCoverageStats,
  getLastTaxiOrdersSync,
} from "@/lib/driver-price-comparison/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  try {
    const [coverage, lastSyncAt] = await Promise.all([
      getCoverageStats(),
      getLastTaxiOrdersSync(),
    ]);
    return Response.json(
      { ok: true, coverage, lastSyncAt },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load data status.";
    const schemaMissing =
      /could not find the table|schema cache|relation .* does not exist/i.test(message);
    return Response.json(
      {
        ok: false,
        schemaMissing,
        error: schemaMissing
          ? "Database tables for driver price comparison are not created yet. Open scripts/sql/supabase_driver_price_comparison.sql, copy the SQL contents into Supabase SQL Editor, and run it."
          : message,
      },
      { status: schemaMissing ? 503 : 500 },
    );
  }
}
