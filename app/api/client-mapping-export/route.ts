import { getSupabaseAdminClient, isSupabaseConfigured } from "@/lib/supabase";
import { requireAdminUser } from "@/lib/server-auth";

function escapeCsvValue(value: string | null | undefined) {
  const text = value ?? "";
  if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

export async function GET(request: Request) {
  const auth = await requireAdminUser(request);
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return new Response("Supabase is not configured.", { status: 500 });
  }

  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("gp_corp_client_map")
      .select("corp_client_id,client_name,source,updated_at")
      .order("client_name", { ascending: true });

    if (error) {
      return new Response(`Failed to load mapping table: ${error.message}`, { status: 500 });
    }

    const header = ["corp_client_id", "client_name", "source", "updated_at"];
    const bodyRows = (data ?? []).map((row) =>
      [
        escapeCsvValue(row.corp_client_id),
        escapeCsvValue(row.client_name),
        escapeCsvValue(row.source),
        escapeCsvValue(row.updated_at),
      ].join(","),
    );
    const csv = [header.join(","), ...bodyRows].join("\n");

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="gp_corp_client_map_export.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return new Response(
      error instanceof Error ? error.message : "Unexpected export error.",
      { status: 500 },
    );
  }
}
