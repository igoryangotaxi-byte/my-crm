import fs from "node:fs";
import path from "node:path";

const PIPELINE_STATUS_KEY = "_pipelineStatus";

export function getPipelineStatusOverride(
  customFields: Record<string, unknown> | null | undefined,
): string | null {
  if (!customFields || typeof customFields !== "object") return null;
  const value = customFields[PIPELINE_STATUS_KEY];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function withPipelineStatusOverride(
  customFields: Record<string, unknown> | null | undefined,
  status: string | null,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(customFields ?? {}) };
  if (!status) {
    delete next[PIPELINE_STATUS_KEY];
    return next;
  }
  next[PIPELINE_STATUS_KEY] = status;
  return next;
}

export function isSalesLeadStatusCheckError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.toLowerCase();
  return (
    normalized.includes("sales_leads_status_check") ||
    (normalized.includes("check constraint") && normalized.includes("status")) ||
    normalized.includes("23514")
  );
}

export function isProposalSentUnsupportedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.toLowerCase();
  return (
    normalized.includes("sales_leads_status_check") ||
    (isSalesLeadStatusCheckError(error) &&
      (normalized.includes("proposal_sent") || normalized.includes("failing row")))
  );
}

/** Best-effort: apply proposal_sent check-constraint migration when DB URL is configured. */
export async function tryApplyProposalSentStatusMigration(): Promise<boolean> {
  const sqlPath = path.join(
    process.cwd(),
    "scripts/sql/supabase_sales_operation_proposal_sent_status.sql",
  );
  if (!fs.existsSync(sqlPath)) return false;

  const direct =
    process.env.SUPABASE_DB_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim();
  let connectionString = direct;
  if (!connectionString) {
    const password = process.env.SUPABASE_DB_PASSWORD?.trim();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const match = supabaseUrl?.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co\/?$/i);
    if (!password || !match) return false;
    connectionString = `postgresql://postgres:${encodeURIComponent(password)}@db.${match[1]}.supabase.co:5432/postgres`;
  }

  try {
    const { Client } = await import("pg");
    const client = new Client({
      connectionString,
      ssl: { rejectUnauthorized: false },
    });
    await client.connect();
    try {
      await client.query(fs.readFileSync(sqlPath, "utf8"));
      return true;
    } finally {
      await client.end().catch(() => null);
    }
  } catch {
    return false;
  }
}
