import { getRecentUnmappedCorpClients } from "@/lib/supabase";
import { requireAdminUser } from "@/lib/server-auth";

function escapeCsv(value: string | number | null) {
  const text = value === null ? "" : String(value);
  if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

export async function GET(request: Request) {
  const auth = await requireAdminUser(request);
  if (!auth.ok) return auth.response;
  const rows = await getRecentUnmappedCorpClients({
    sampleSize: 20000,
    limit: 2000,
  });

  const header = ["corp_client_id", "last_seen_at", "orders_in_sample"];
  const csvRows = rows.map((row) =>
    [row.corpClientId, row.lastSeenAt, row.ordersInSample].map(escapeCsv).join(","),
  );
  const csv = [header.join(","), ...csvRows].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="unmapped_corp_clients.csv"',
      "Cache-Control": "no-store",
    },
  });
}
