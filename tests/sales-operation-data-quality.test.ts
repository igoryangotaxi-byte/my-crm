import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { rankSearchResults, tokenize, type SearchIndexItem } from "../lib/sales-operation/search.ts";
import {
  findDuplicateLeads,
  normalizeCompany,
  normalizeEmail,
  normalizePhone,
} from "../lib/sales-operation/dedup.ts";
import { diffLeadFields, summarizeChanges } from "../lib/sales-operation/audit.ts";
import type { SalesLead, SalesLeadStatus } from "../lib/sales-operation/types.ts";

function makeLead(overrides: Partial<SalesLead> & { id: string }): SalesLead {
  return {
    id: overrides.id,
    status: (overrides.status ?? "new") as SalesLeadStatus,
    source: overrides.source ?? "manual",
    fullName: overrides.fullName ?? "Lead",
    email: overrides.email ?? null,
    phone: overrides.phone ?? null,
    companyName: overrides.companyName ?? null,
    campaignId: null,
    campaignName: null,
    adId: null,
    adName: null,
    formId: null,
    customFields: {},
    assignedManagerUserId: overrides.assignedManagerUserId ?? null,
    assignedManagerName: null,
    legalName: null,
    companyRegNumber: null,
    website: null,
    segmentId: null,
    subSegment: null,
    employeesCount: null,
    estimatedMonthlyPotential: overrides.estimatedMonthlyPotential ?? null,
    estimatedMonthlyTrips: null,
    expectedCloseDate: null,
    probabilityOverride: null,
    clientAddress: null,
    generalNotes: null,
    isArchived: overrides.isArchived ?? false,
    archivedAt: overrides.archivedAt ?? null,
    statusEnteredAt: "2026-07-01T00:00:00.000Z",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    createdByUserId: null,
    createdByName: null,
  };
}

describe("sales search — rankSearchResults", () => {
  const items: SearchIndexItem[] = [
    {
      entityType: "lead",
      id: "1",
      title: "Acme Corp",
      subtitle: "John Doe",
      href: "/x/1",
      haystack: "John Doe Acme Corp john@acme.com",
    },
    {
      entityType: "client",
      id: "2",
      title: "Beta LLC",
      subtitle: "Jane",
      href: "/x/2",
      haystack: "Jane Beta LLC jane@beta.io 0501234567",
    },
  ];

  it("returns empty for blank query", () => {
    assert.equal(rankSearchResults("", items).length, 0);
    assert.equal(rankSearchResults("   ", items).length, 0);
  });

  it("matches on title and ranks exact matches highest", () => {
    const results = rankSearchResults("acme", items);
    assert.equal(results.length, 1);
    assert.equal(results[0]!.id, "1");
  });

  it("matches on haystack fields (email/phone) not in title", () => {
    const byPhone = rankSearchResults("0501234567", items);
    assert.equal(byPhone[0]!.id, "2");
    const byEmail = rankSearchResults("jane@beta.io", items);
    assert.equal(byEmail[0]!.id, "2");
  });

  it("requires all tokens to be present", () => {
    assert.equal(rankSearchResults("acme beta", items).length, 0);
    assert.equal(rankSearchResults("john acme", items).length, 1);
  });

  it("respects the limit", () => {
    assert.equal(rankSearchResults("a", items, 1).length <= 1, true);
  });
});

describe("sales dedup — normalizers", () => {
  it("normalizes emails case-insensitively", () => {
    assert.equal(normalizeEmail("  John@Acme.COM "), "john@acme.com");
    assert.equal(normalizeEmail(null), "");
  });

  it("normalizes phones to the last 9 digits", () => {
    assert.equal(normalizePhone("+972 50-123-4567"), normalizePhone("0501234567"));
    assert.equal(normalizePhone("050-123-4567"), "501234567");
  });

  it("normalizes company names", () => {
    assert.equal(normalizeCompany("Acme, Corp."), "acme corp");
    assert.equal(normalizeCompany("  ACME   corp "), "acme corp");
  });
});

describe("sales dedup — findDuplicateLeads", () => {
  const existing: SalesLead[] = [
    makeLead({ id: "a", email: "john@acme.com", phone: "0501234567", companyName: "Acme Corp" }),
    makeLead({ id: "b", email: "jane@beta.io", companyName: "Beta LLC" }),
  ];

  it("returns nothing without any identifying field", () => {
    assert.deepEqual(findDuplicateLeads({}, existing), []);
  });

  it("finds matches by email, phone and company", () => {
    const byEmail = findDuplicateLeads({ email: "JOHN@acme.com" }, existing);
    assert.equal(byEmail.length, 1);
    assert.equal(byEmail[0]!.leadId, "a");
    assert.deepEqual(byEmail[0]!.matchedOn, ["email"]);

    const byPhone = findDuplicateLeads({ phone: "+972501234567" }, existing);
    assert.equal(byPhone[0]!.leadId, "a");

    const byCompany = findDuplicateLeads({ companyName: "beta llc" }, existing);
    assert.equal(byCompany[0]!.leadId, "b");
  });

  it("ranks stronger matches first and can exclude an id", () => {
    const matches = findDuplicateLeads(
      { email: "john@acme.com", companyName: "Beta LLC" },
      existing,
    );
    assert.equal(matches[0]!.leadId, "a");
    assert.equal(matches[0]!.matchedOn.includes("email"), true);

    const excluded = findDuplicateLeads({ email: "john@acme.com" }, existing, { excludeId: "a" });
    assert.equal(excluded.length, 0);
  });
});

describe("sales audit — diffLeadFields", () => {
  it("returns only changed fields with from/to and summary", () => {
    const before = makeLead({ id: "a", fullName: "Old", status: "new", email: null });
    const after = makeLead({ id: "a", fullName: "New", status: "in_progress", email: "x@y.z" });
    const changes = diffLeadFields(before, after);
    assert.equal(Object.keys(changes).length, 3);
    assert.deepEqual(changes.Name, { from: "Old", to: "New" });
    assert.deepEqual(changes.Status, { from: "new", to: "in_progress" });
    assert.deepEqual(changes.Email, { from: null, to: "x@y.z" });
    assert.equal(summarizeChanges(changes).includes("Name"), true);
  });

  it("treats empty string and undefined as null (no spurious diffs)", () => {
    const before = makeLead({ id: "a", companyName: null });
    const after = makeLead({ id: "a", companyName: "" });
    assert.deepEqual(diffLeadFields(before, after), {});
  });
});

describe("sales data-quality — migration & wiring", () => {
  const root = process.cwd();

  it("ships the audit + archive SQL migration", () => {
    const sql = readFileSync(join(root, "scripts/sql/supabase_sales_data_quality.sql"), "utf8");
    assert.match(sql, /create table if not exists public\.sales_audit_log/);
    assert.match(sql, /add column if not exists is_archived boolean/);
  });

  it("registers the migration in both appliers", () => {
    const applier = readFileSync(join(root, "scripts/apply-sales-operation-schema.js"), "utf8");
    assert.match(applier, /supabase_sales_data_quality\.sql/);
    const mgmt = readFileSync(join(root, ".tools/apply-mgmt.mjs"), "utf8");
    assert.match(mgmt, /supabase_sales_data_quality\.sql/);
  });
});

describe("sales data-quality — i18n", () => {
  const root = process.cwd();
  const en = JSON.parse(readFileSync(join(root, "messages/en.json"), "utf8")).salesOperation;
  const he = JSON.parse(readFileSync(join(root, "messages/he.json"), "utf8")).salesOperation;

  it("has search, dedup and archive keys in both locales", () => {
    for (const messages of [en, he]) {
      assert.ok(messages.search?.placeholder);
      assert.ok(messages.search?.entity?.lead);
      assert.ok(messages.dedup?.warning);
      assert.ok(messages.dedup?.field?.email);
      assert.ok(messages.archiveLead);
      assert.ok(messages.activity?.fieldChanged);
      assert.ok(messages.activity?.type?.field_changed);
    }
  });
});
