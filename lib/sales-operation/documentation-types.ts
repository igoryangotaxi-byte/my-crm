import type { JSONContent } from "@tiptap/core";

export const EMPTY_DOCUMENT_CONTENT: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

export type DocumentationListItem = {
  id: string;
  title: string;
  position: number;
  createdByUserId: string | null;
  createdByName: string | null;
  updatedByUserId: string | null;
  updatedByName: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DocumentationDocument = DocumentationListItem & {
  content: JSONContent;
};

export type DocumentationActor = {
  userId: string;
  name: string;
};

export const DOCUMENTATION_MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const DOCUMENTATION_MAX_TABLE_ROWS = 500;
export const DOCUMENTATION_MAX_TABLE_COLS = 40;
