import fs from "node:fs";
import path from "node:path";
import { getSupabaseAdminClient, isSupabaseConfigured } from "@/lib/supabase";
import type { PreOrderOperatorContact, PreOrderOperatorContactStatus } from "@/types/crm";

export type PreOrderOperatorMarkKey = {
  tokenLabel: string;
  clientId: string;
  orderId: string;
};

export type PreOrderOperatorMarkRecord = PreOrderOperatorContact & PreOrderOperatorMarkKey;

type FileStore = {
  entries: PreOrderOperatorMarkRecord[];
};

const STORE_PATH = path.join(process.cwd(), "data", "preorder-operator-marks.json");

const CONTACT_STATUSES = new Set<PreOrderOperatorContactStatus>([
  "none",
  "driver_confirmed",
  "no_answer",
  "issue",
]);

export function markKey(input: PreOrderOperatorMarkKey): string {
  return `${input.tokenLabel}::${input.clientId}::${input.orderId}`;
}

export function isPreOrderOperatorContactStatus(
  value: unknown,
): value is PreOrderOperatorContactStatus {
  return typeof value === "string" && CONTACT_STATUSES.has(value as PreOrderOperatorContactStatus);
}

function emptyContact(): PreOrderOperatorContact {
  return {
    status: "none",
    markedByUserId: null,
    markedByName: null,
    markedAt: null,
    note: null,
  };
}

function normalizeRecord(row: Partial<PreOrderOperatorMarkRecord>): PreOrderOperatorMarkRecord | null {
  const tokenLabel = typeof row.tokenLabel === "string" ? row.tokenLabel.trim() : "";
  const clientId = typeof row.clientId === "string" ? row.clientId.trim() : "";
  const orderId = typeof row.orderId === "string" ? row.orderId.trim() : "";
  if (!tokenLabel || !clientId || !orderId) return null;
  const status = isPreOrderOperatorContactStatus(row.status) ? row.status : "none";
  return {
    tokenLabel,
    clientId,
    orderId,
    status,
    markedByUserId: typeof row.markedByUserId === "string" ? row.markedByUserId : null,
    markedByName: typeof row.markedByName === "string" ? row.markedByName : null,
    markedAt: typeof row.markedAt === "string" ? row.markedAt : null,
    note: typeof row.note === "string" ? row.note : null,
  };
}

function readFileStore(): FileStore {
  try {
    if (!fs.existsSync(STORE_PATH)) return { entries: [] };
    const raw = JSON.parse(fs.readFileSync(STORE_PATH, "utf8")) as FileStore;
    const entries = Array.isArray(raw.entries)
      ? raw.entries.map((row) => normalizeRecord(row)).filter((row): row is PreOrderOperatorMarkRecord => Boolean(row))
      : [];
    return { entries };
  } catch {
    return { entries: [] };
  }
}

function writeFileStore(store: FileStore) {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

function fromSupabaseRow(row: Record<string, unknown>): PreOrderOperatorMarkRecord | null {
  return normalizeRecord({
    tokenLabel: typeof row.token_label === "string" ? row.token_label : "",
    clientId: typeof row.client_id === "string" ? row.client_id : "",
    orderId: typeof row.order_id === "string" ? row.order_id : "",
    status: row.contact_status as PreOrderOperatorContactStatus,
    markedByUserId: typeof row.marked_by_user_id === "string" ? row.marked_by_user_id : null,
    markedByName: typeof row.marked_by_name === "string" ? row.marked_by_name : null,
    markedAt: typeof row.marked_at === "string" ? row.marked_at : null,
    note: typeof row.note === "string" ? row.note : null,
  });
}

export async function listPreOrderOperatorMarks(): Promise<PreOrderOperatorMarkRecord[]> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseAdminClient();
      const { data, error } = await supabase.from("preorder_operator_marks").select("*");
      if (error) throw error;
      return (data ?? [])
        .map((row) => fromSupabaseRow(row as Record<string, unknown>))
        .filter((row): row is PreOrderOperatorMarkRecord => Boolean(row));
    } catch {
      // Fall through to file store for local/dev resilience.
    }
  }
  return readFileStore().entries;
}

export async function getPreOrderOperatorMarksMap(): Promise<Map<string, PreOrderOperatorContact>> {
  const rows = await listPreOrderOperatorMarks();
  const map = new Map<string, PreOrderOperatorContact>();
  for (const row of rows) {
    map.set(markKey(row), {
      status: row.status,
      markedByUserId: row.markedByUserId,
      markedByName: row.markedByName,
      markedAt: row.markedAt,
      note: row.note,
    });
  }
  return map;
}

export async function upsertPreOrderOperatorMark(input: {
  tokenLabel: string;
  clientId: string;
  orderId: string;
  status: PreOrderOperatorContactStatus;
  markedByUserId: string;
  markedByName: string;
  note?: string | null;
}): Promise<PreOrderOperatorMarkRecord> {
  const now = new Date().toISOString();
  const record: PreOrderOperatorMarkRecord = {
    tokenLabel: input.tokenLabel.trim(),
    clientId: input.clientId.trim(),
    orderId: input.orderId.trim(),
    status: input.status,
    markedByUserId: input.markedByUserId,
    markedByName: input.markedByName,
    markedAt: input.status === "none" ? null : now,
    note: input.note?.trim() || null,
  };

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseAdminClient();
      const { data, error } = await supabase
        .from("preorder_operator_marks")
        .upsert(
          {
            token_label: record.tokenLabel,
            client_id: record.clientId,
            order_id: record.orderId,
            contact_status: record.status,
            marked_by_user_id: record.markedByUserId,
            marked_by_name: record.markedByName,
            marked_at: record.markedAt,
            note: record.note,
            updated_at: now,
          },
          { onConflict: "token_label,client_id,order_id" },
        )
        .select("*")
        .single();
      if (error) throw error;
      const normalized = fromSupabaseRow((data ?? {}) as Record<string, unknown>);
      if (normalized) return normalized;
    } catch {
      // Fall through to file store.
    }
  }

  const store = readFileStore();
  const key = markKey(record);
  const next = store.entries.filter((row) => markKey(row) !== key);
  if (record.status !== "none") {
    next.push(record);
  }
  writeFileStore({ entries: next });
  return record.status === "none"
    ? {
        tokenLabel: record.tokenLabel,
        clientId: record.clientId,
        orderId: record.orderId,
        ...emptyContact(),
      }
    : record;
}

export function attachOperatorContacts<T extends PreOrderOperatorMarkKey>(
  rows: T[],
  marks: Map<string, PreOrderOperatorContact>,
): Array<T & { operatorContact: PreOrderOperatorContact | null }> {
  return rows.map((row) => ({
    ...row,
    operatorContact: marks.get(markKey(row)) ?? null,
  }));
}
