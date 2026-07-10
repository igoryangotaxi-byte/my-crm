import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { convertSignedLeadToClient } from "@/lib/sales-operation/convert-lead-to-client";
import type { SalesLead, SalesLeadNote } from "@/lib/sales-operation/types";

type QueryResult = { data: unknown; error: null | { message: string } };

function createMockSupabase() {
  const clients = new Map<string, Record<string, unknown>>();
  const clientNotes: Record<string, unknown>[] = [];
  let clientSeq = 1;

  const from = (table: string) => {
    const state: {
      table: string;
      filters: Array<(row: Record<string, unknown>) => boolean>;
      mode: "select" | "insert" | "update" | "upsert";
      payload?: Record<string, unknown> | Record<string, unknown>[];
      upsertOptions?: { onConflict?: string };
    } = {
      table,
      filters: [],
      mode: "select",
    };

    const api = {
      select: () => api,
      eq: (column: string, value: unknown) => {
        state.filters.push((row) => row[column] === value);
        return api;
      },
      maybeSingle: async (): Promise<QueryResult> => {
        if (state.table !== "sales_clients") return { data: null, error: null };
        const row = [...clients.values()].find((item) =>
          state.filters.every((filter) => filter(item)),
        );
        return { data: row ?? null, error: null };
      },
      single: async (): Promise<QueryResult> => {
        if (state.mode === "insert" && state.table === "sales_clients") {
          const payload = state.payload as Record<string, unknown>;
          const row = {
            id: `client-${clientSeq++}`,
            ...payload,
            created_at: payload.created_at ?? new Date().toISOString(),
          };
          clients.set(String(row.id), row);
          return { data: row, error: null };
        }
        if (state.mode === "update" && state.table === "sales_clients") {
          const existing = [...clients.values()].find((item) =>
            state.filters.every((filter) => filter(item)),
          );
          if (!existing) return { data: null, error: { message: "not found" } };
          const row = { ...existing, ...(state.payload as Record<string, unknown>) };
          clients.set(String(row.id), row);
          return { data: row, error: null };
        }
        return { data: null, error: { message: "unsupported" } };
      },
      insert: (payload: Record<string, unknown>) => {
        state.mode = "insert";
        state.payload = payload;
        return api;
      },
      update: (payload: Record<string, unknown>) => {
        state.mode = "update";
        state.payload = payload;
        return api;
      },
      upsert: (payload: Record<string, unknown>[], options?: { onConflict?: string }) => {
        state.mode = "upsert";
        state.payload = payload;
        state.upsertOptions = options;
        for (const row of payload) {
          const conflictKey = options?.onConflict;
          const existingIndex =
            conflictKey &&
            clientNotes.findIndex((note) => note[conflictKey] === row[conflictKey]);
          if (existingIndex !== undefined && existingIndex >= 0) {
            clientNotes[existingIndex] = { ...clientNotes[existingIndex], ...row };
          } else {
            clientNotes.push({ id: `note-${clientNotes.length + 1}`, ...row });
          }
        }
        return Promise.resolve({ data: payload, error: null });
      },
    };

    return api;
  };

  return {
    from,
    getClientNotes: () => clientNotes,
    getClients: () => [...clients.values()],
  };
}

describe("convert signed lead to client", () => {
  const lead: SalesLead = {
    id: "lead-1",
    status: "signed",
    source: "manual",
    fullName: "Ada Lovelace",
    email: "ada@example.com",
    phone: "+972500000000",
    companyName: "Analytical Engines",
    campaignId: "cmp-1",
    campaignName: "Meta Q2",
    adId: "ad-1",
    adName: "Fleet promo",
    formId: "form-1",
    customFields: { fleetSize: 12 },
    statusEnteredAt: "2026-05-01T10:00:00.000Z",
    createdAt: "2026-05-01T09:00:00.000Z",
    updatedAt: "2026-05-01T10:00:00.000Z",
    createdByUserId: "user-1",
    createdByName: "Admin",
  };

  const notes: SalesLeadNote[] = [
    {
      id: "note-1",
      leadId: lead.id,
      authorUserId: "user-1",
      authorName: "Admin",
      body: "Qualified lead",
      createdAt: "2026-05-01T09:30:00.000Z",
      updatedAt: "2026-05-01T09:30:00.000Z",
    },
  ];

  it("creates a client and copies lead notes", async () => {
    const mock = createMockSupabase();
    const client = await convertSignedLeadToClient(mock as never, lead, notes, {
      userId: "user-2",
      name: "Sales Rep",
    });

    assert.equal(client.leadId, lead.id);
    assert.equal(client.fullName, lead.fullName);
    assert.equal(client.email, lead.email);
    assert.equal(client.campaignName, lead.campaignName);
    assert.equal(client.pendingSalesManagerUserId, "user-2");
    assert.equal(client.pendingSalesManagerName, "Sales Rep");
    assert.equal(mock.getClients().length, 1);
    assert.equal(mock.getClientNotes().length, 1);
    assert.equal(mock.getClientNotes()[0]?.body, "Qualified lead");
    assert.equal(mock.getClientNotes()[0]?.source_lead_note_id, "note-1");
  });

  it("is idempotent by lead_id", async () => {
    const mock = createMockSupabase();
    const actor = { userId: "user-2", name: "Sales Rep" };
    const first = await convertSignedLeadToClient(mock as never, lead, notes, actor);
    const second = await convertSignedLeadToClient(mock as never, lead, notes, actor);

    assert.equal(first.id, second.id);
    assert.equal(mock.getClients().length, 1);
    assert.equal(mock.getClientNotes().length, 1);
  });
});
