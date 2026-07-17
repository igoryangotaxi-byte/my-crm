import type { SalesFile } from "@/lib/sales-operation/types";
import { getSupabaseAdminClient } from "@/lib/supabase";

const BUCKET = "sales-attachments";
const SIGNED_URL_TTL_SECONDS = 60 * 30; // 30 minutes
export const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function mapFileRow(row: Record<string, unknown>): SalesFile {
  return {
    id: String(row.id),
    leadId: String(row.lead_id),
    storagePath: String(row.storage_path ?? ""),
    fileName: String(row.file_name ?? ""),
    mimeType: readText(row.mime_type),
    sizeBytes:
      row.size_bytes === null || row.size_bytes === undefined ? null : Number(row.size_bytes),
    uploadedByUserId: typeof row.uploaded_by_user_id === "string" ? row.uploaded_by_user_id : null,
    uploadedByName: readText(row.uploaded_by_name),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    downloadUrl: null,
  };
}

function sanitizeFileName(name: string): string {
  const trimmed = name.trim().replace(/[^\w.\-() ]+/g, "_");
  return trimmed.slice(0, 180) || "file";
}

export async function listSalesFiles(leadId: string): Promise<SalesFile[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("sales_files")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const files = (data ?? []).map((row) => mapFileRow(row as Record<string, unknown>));
  if (files.length === 0) return files;

  const paths = files.map((file) => file.storagePath);
  const { data: signed } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  const urlByPath = new Map<string, string>();
  for (const entry of signed ?? []) {
    if (entry.path && entry.signedUrl) urlByPath.set(entry.path, entry.signedUrl);
  }
  return files.map((file) => ({
    ...file,
    downloadUrl: urlByPath.get(file.storagePath) ?? null,
  }));
}

export async function uploadSalesFile(
  leadId: string,
  input: { fileName: string; mimeType: string | null; body: ArrayBuffer },
  actor: { userId: string | null; name: string },
): Promise<SalesFile> {
  const supabase = getSupabaseAdminClient();

  const { data: lead, error: leadError } = await supabase
    .from("sales_leads")
    .select("id")
    .eq("id", leadId)
    .maybeSingle();
  if (leadError) throw new Error(leadError.message);
  if (!lead) throw new Error("Lead not found.");

  const safeName = sanitizeFileName(input.fileName);
  const unique =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const storagePath = `${leadId}/${unique}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, input.body, {
      contentType: input.mimeType ?? "application/octet-stream",
      upsert: false,
    });
  if (uploadError) throw new Error(uploadError.message);

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("sales_files")
    .insert({
      lead_id: leadId,
      storage_path: storagePath,
      file_name: safeName,
      mime_type: input.mimeType,
      size_bytes: input.body.byteLength,
      uploaded_by_user_id: actor.userId,
      uploaded_by_name: actor.name,
      created_at: now,
    })
    .select("*")
    .single();
  if (error || !data) {
    // Roll back the uploaded object so we do not leak orphans.
    await supabase.storage.from(BUCKET).remove([storagePath]);
    throw new Error(error?.message ?? "Failed to save file metadata.");
  }
  return mapFileRow(data as Record<string, unknown>);
}

export async function deleteSalesFile(fileId: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { data: existing, error: existingError } = await supabase
    .from("sales_files")
    .select("storage_path")
    .eq("id", fileId)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (!existing) throw new Error("File not found.");

  const storagePath = String((existing as Record<string, unknown>).storage_path ?? "");
  if (storagePath) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
  }
  const { error } = await supabase.from("sales_files").delete().eq("id", fileId);
  if (error) throw new Error(error.message);
}
