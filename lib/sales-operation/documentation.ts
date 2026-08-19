import { getSupabaseAdminClient } from "@/lib/supabase";
import type { JSONContent } from "@tiptap/core";
import {
  EMPTY_DOCUMENT_CONTENT,
  type DocumentationActor,
  type DocumentationDocument,
  type DocumentationListItem,
} from "@/lib/sales-operation/documentation-types";

export class DocumentationConflictError extends Error {
  constructor(public current: DocumentationDocument) {
    super("This document was updated elsewhere. Reload to keep editing.");
    this.name = "DocumentationConflictError";
  }
}

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function mapListItem(row: Record<string, unknown>): DocumentationListItem {
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    position: Number(row.position ?? 0),
    createdByUserId: readText(row.created_by_user_id),
    createdByName: readText(row.created_by_name),
    updatedByUserId: readText(row.updated_by_user_id),
    updatedByName: readText(row.updated_by_name),
    archivedAt: typeof row.archived_at === "string" ? row.archived_at : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

function mapDocument(row: Record<string, unknown>): DocumentationDocument {
  const content =
    row.content && typeof row.content === "object"
      ? (row.content as JSONContent)
      : EMPTY_DOCUMENT_CONTENT;
  return { ...mapListItem(row), content };
}

function timestampsMatch(left: string, right: string): boolean {
  if (left === right) return true;
  const a = Date.parse(left);
  const b = Date.parse(right);
  return Number.isFinite(a) && Number.isFinite(b) && a === b;
}

async function nextPosition(): Promise<number> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("documentation_documents")
    .select("position")
    .is("archived_at", null)
    .order("position", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const top = data?.[0] as { position?: number } | undefined;
  return (top?.position ?? 0) + 1;
}

export async function listDocumentationDocuments(): Promise<DocumentationListItem[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("documentation_documents")
    .select(
      "id, title, position, created_by_user_id, created_by_name, updated_by_user_id, updated_by_name, archived_at, created_at, updated_at",
    )
    .is("archived_at", null)
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapListItem(row as Record<string, unknown>));
}

export async function getDocumentationDocument(id: string): Promise<DocumentationDocument | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("documentation_documents")
    .select("*")
    .eq("id", id)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapDocument(data as Record<string, unknown>) : null;
}

export async function createDocumentationDocument(
  input: { title?: string; content?: JSONContent },
  actor: DocumentationActor,
): Promise<DocumentationDocument> {
  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();
  const position = await nextPosition();
  const title = input.title?.trim() || "Untitled";
  const { data, error } = await supabase
    .from("documentation_documents")
    .insert({
      title,
      position,
      content: input.content ?? EMPTY_DOCUMENT_CONTENT,
      created_by_user_id: actor.userId,
      created_by_name: actor.name,
      updated_by_user_id: actor.userId,
      updated_by_name: actor.name,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to create document.");
  return mapDocument(data as Record<string, unknown>);
}

export async function updateDocumentationDocument(
  id: string,
  patch: {
    title?: string;
    content?: JSONContent;
    position?: number;
    expectedUpdatedAt?: string;
  },
  actor: DocumentationActor,
): Promise<DocumentationDocument> {
  const existing = await getDocumentationDocument(id);
  if (!existing) throw new Error("Document not found.");
  if (patch.expectedUpdatedAt && !timestampsMatch(patch.expectedUpdatedAt, existing.updatedAt)) {
    throw new DocumentationConflictError(existing);
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by_user_id: actor.userId,
    updated_by_name: actor.name,
  };
  if (patch.title !== undefined) updates.title = patch.title.trim() || existing.title;
  if (patch.content !== undefined) updates.content = patch.content;
  if (patch.position !== undefined) updates.position = patch.position;

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("documentation_documents")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to update document.");
  return mapDocument(data as Record<string, unknown>);
}

export async function archiveDocumentationDocument(
  id: string,
  actor: DocumentationActor,
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("documentation_documents")
    .update({
      archived_at: now,
      updated_at: now,
      updated_by_user_id: actor.userId,
      updated_by_name: actor.name,
    })
    .eq("id", id)
    .is("archived_at", null);
  if (error) throw new Error(error.message);
}

export async function reorderDocumentationDocuments(
  orderedIds: string[],
  actor: DocumentationActor,
): Promise<DocumentationListItem[]> {
  const now = new Date().toISOString();
  const supabase = getSupabaseAdminClient();
  for (let index = 0; index < orderedIds.length; index++) {
    const { error } = await supabase
      .from("documentation_documents")
      .update({
        position: index + 1,
        updated_at: now,
        updated_by_user_id: actor.userId,
        updated_by_name: actor.name,
      })
      .eq("id", orderedIds[index]);
    if (error) throw new Error(error.message);
  }
  return listDocumentationDocuments();
}
