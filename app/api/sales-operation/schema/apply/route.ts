import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { requireAdminUser } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isLocalHost(host: string | null) {
  if (!host) return false;
  const normalized = host.trim().toLowerCase();
  return (
    normalized.startsWith("localhost:") ||
    normalized.startsWith("127.0.0.1:") ||
    normalized === "localhost" ||
    normalized === "127.0.0.1"
  );
}

function resolveDatabaseUrl() {
  const direct =
    process.env.SUPABASE_DB_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim();
  if (direct) return direct;

  const password = process.env.SUPABASE_DB_PASSWORD?.trim();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!password || !supabaseUrl) {
    throw new Error(
      "Set SUPABASE_DB_URL or SUPABASE_DB_PASSWORD + NEXT_PUBLIC_SUPABASE_URL in environment.",
    );
  }
  const match = supabaseUrl.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co\/?$/i);
  if (!match) {
    throw new Error("Could not parse project ref from NEXT_PUBLIC_SUPABASE_URL.");
  }
  const projectRef = match[1];
  return `postgresql://postgres:${encodeURIComponent(password)}@db.${projectRef}.supabase.co:5432/postgres`;
}

export async function POST(request: Request) {
  const auth = await requireAdminUser(request);
  if (!auth.ok) return auth.response;

  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!isLocalHost(host)) {
    return Response.json(
      { ok: false, error: "Schema apply is restricted to localhost." },
      { status: 403 },
    );
  }

  const sqlFiles = [
    "supabase_sales_operation.sql",
    "supabase_sales_operation_wordpress_source.sql",
    "supabase_sales_operation_proposal_sent_status.sql",
    "supabase_b2b_client_managers.sql",
    "supabase_auth_roles_account_sales_managers.sql",
  ];
  const client = new Client({
    connectionString: resolveDatabaseUrl(),
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    const applied: string[] = [];
    for (const file of sqlFiles) {
      const sqlPath = path.join(process.cwd(), "scripts/sql", file);
      if (!fs.existsSync(sqlPath)) continue;
      await client.query(fs.readFileSync(sqlPath, "utf8"));
      applied.push(file);
    }
    return Response.json({
      ok: true,
      message: `Applied: ${applied.join(", ")}`,
      applied,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to apply schema.",
      },
      { status: 500 },
    );
  } finally {
    await client.end().catch(() => null);
  }
}
