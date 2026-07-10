import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildOverviewB2BClients,
  buildSalesClientListRows,
  filterSalesClientListRows,
} from "@/lib/sales-operation/client-list";
import type { B2BClientRegistryEntry } from "@/lib/sales-operation/manager-types";
import type { SalesClient } from "@/lib/sales-operation/types";

function salesClient(partial: Partial<SalesClient> & Pick<SalesClient, "id" | "fullName">): SalesClient {
  return {
    leadId: "lead-1",
    email: null,
    phone: null,
    companyName: null,
    campaignId: null,
    campaignName: null,
    adId: null,
    adName: null,
    formId: null,
    customFields: {},
    corpClientId: null,
    corpClientName: null,
    accountManagerUserId: null,
    accountManagerName: null,
    salesManagerUserId: null,
    salesManagerName: null,
    pendingSalesManagerUserId: null,
    pendingSalesManagerName: null,
    signedAt: "2026-07-01T00:00:00.000Z",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...partial,
  };
}

function registryEntry(
  partial: Partial<B2BClientRegistryEntry> & Pick<B2BClientRegistryEntry, "corpClientId" | "clientName">,
): B2BClientRegistryEntry {
  return {
    accountManager: { userId: null, name: null },
    salesManager: { userId: null, name: null },
    ...partial,
  };
}

describe("sales client list", () => {
  it("builds rows from overview clients plus unlinked signed clients", () => {
    const overview = buildOverviewB2BClients(
      [
        { corpClientId: "corp-1", clientName: "From orders" },
        { corpClientId: "corp-1", clientName: "From orders" },
      ],
      { "corp-1": "Acme Corp DB" },
    );

    const rows = buildSalesClientListRows(
      [
        salesClient({
          id: "s1",
          fullName: "Pipeline Contact Name",
          corpClientId: "corp-1",
          companyName: "Acme",
        }),
        salesClient({ id: "s2", fullName: "Signed Only", companyName: "Solo Ltd" }),
      ],
      [
        registryEntry({
          corpClientId: "corp-1",
          clientName: "Acme Corp DB",
          accountManager: { userId: "u1", name: "Gal" },
        }),
        registryEntry({ corpClientId: "corp-ghost", clientName: "Ghost Client" }),
      ],
      overview,
    );

    assert.equal(overview.length, 1);
    assert.equal(rows.length, 2);
    assert.equal(
      rows.some((row) => row.corpClientId === "corp-ghost"),
      false,
    );

    const linked = rows.find((row) => row.corpClientId === "corp-1");
    assert.equal(linked?.source, "linked");
    assert.equal(linked?.name, "Acme Corp DB");
    assert.equal(linked?.accountManagerName, "Gal");

    const signed = rows.find((row) => row.salesClientId === "s2");
    assert.equal(signed?.source, "signed");
    assert.equal(signed?.name, "Signed Only");
  });

  it("can use the full B2B registry as overview for a fast clients list", () => {
    const registry = [
      registryEntry({ corpClientId: "corp-1", clientName: "Acme" }),
      registryEntry({ corpClientId: "corp-2", clientName: "Beta" }),
    ];
    const overview = registry.map((entry) => ({
      corpClientId: entry.corpClientId,
      clientName: entry.clientName,
    }));
    const rows = buildSalesClientListRows(
      [salesClient({ id: "s2", fullName: "Signed Only" })],
      registry,
      overview,
    );
    assert.equal(rows.length, 3);
    assert.equal(rows.filter((row) => row.source === "b2b").length, 2);
    assert.equal(rows.filter((row) => row.source === "signed").length, 1);
  });

  it("includes pipeline-linked clients even when corp is not in active overview", () => {
    const rows = buildSalesClientListRows(
      [
        salesClient({
          id: "s-linked-inactive",
          fullName: "Pipeline Linked",
          corpClientId: "corp-inactive",
          companyName: "Inactive Co",
        }),
      ],
      [registryEntry({ corpClientId: "corp-inactive", clientName: "Inactive Co DB" })],
      [], // active overview empty (0 trips since 2026)
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.source, "linked");
    assert.equal(rows[0]?.name, "Inactive Co DB");
    assert.equal(rows[0]?.corpClientId, "corp-inactive");
  });

  it("filters by name or corp client id", () => {
    const rows = buildSalesClientListRows(
      [salesClient({ id: "s2", fullName: "Signed Only" })],
      [registryEntry({ corpClientId: "abc123", clientName: "Yango Taxi" })],
      [
        { corpClientId: "abc123", clientName: "Yango Taxi" },
        { corpClientId: "zzz999", clientName: "Other" },
      ],
    );

    assert.equal(filterSalesClientListRows(rows, "yango").length, 1);
    assert.equal(filterSalesClientListRows(rows, "abc123").length, 1);
    assert.equal(filterSalesClientListRows(rows, "signed only").length, 1);
    assert.equal(filterSalesClientListRows(rows, "missing").length, 0);
  });
});
