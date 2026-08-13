import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPendingSalesManagerApplyPlan,
  hydrateLeadFromB2BOverview,
} from "@/lib/sales-operation/b2b-client-registry";
import { corpClientIdsMatch, normalizeCorpClientId } from "@/lib/sales-operation/corp-client-id";
import type { B2BClientRegistryEntry } from "@/lib/sales-operation/manager-types";

function entry(
  partial: Partial<B2BClientRegistryEntry> & Pick<B2BClientRegistryEntry, "corpClientId">,
): B2BClientRegistryEntry {
  return {
    clientName: partial.clientName ?? partial.corpClientId,
    accountManager: partial.accountManager ?? { userId: null, name: null },
    salesManager: partial.salesManager ?? { userId: null, name: null },
    ...partial,
  };
}

describe("b2b overview corp client matching", () => {
  it("matches corp client ids case-insensitively", () => {
    assert.equal(corpClientIdsMatch("ABC123", "abc123"), true);
    assert.equal(corpClientIdsMatch(" abc123 ", "ABC123"), true);
    assert.equal(corpClientIdsMatch("abc123", "xyz"), false);
    assert.equal(corpClientIdsMatch("", "abc"), false);
  });

  it("hydrates new leads from B2B overview", () => {
    const overview = entry({
      corpClientId: "Acme-01",
      clientName: "Acme Ltd",
      salesManager: { userId: "sm-1", name: "Igor Rebkovets" },
      accountManager: { userId: "am-1", name: "AM" },
    });
    const hydrated = hydrateLeadFromB2BOverview(
      { fullName: "New lead", companyName: "", corpClientId: "acme-01" },
      overview,
    );
    assert.equal(hydrated.corpClientId, "Acme-01");
    assert.equal(hydrated.companyName, "Acme Ltd");
    assert.equal(hydrated.assignedManagerUserId, "sm-1");
    assert.equal(hydrated.assignedManagerName, "Igor Rebkovets");
  });

  it("does not overwrite an explicit sales manager on hydrate", () => {
    const overview = entry({
      corpClientId: "abc",
      clientName: "Acme",
      salesManager: { userId: "sm-1", name: "Overview SM" },
    });
    const hydrated = hydrateLeadFromB2BOverview(
      {
        companyName: "Custom Co",
        corpClientId: "ABC",
        assignedManagerUserId: "owner-1",
        assignedManagerName: "Owner",
      },
      overview,
    );
    assert.equal(hydrated.companyName, "Custom Co");
    assert.equal(hydrated.assignedManagerUserId, "owner-1");
    assert.equal(hydrated.assignedManagerName, "Owner");
    assert.equal(hydrated.corpClientId, "abc");
  });

  it("keeps the overview corp id when applying pending SM to an existing map row", () => {
    const plan = buildPendingSalesManagerApplyPlan({
      corpClientId: "abc123",
      pending: { userId: "sm-1", name: "Igor" },
      existing: entry({ corpClientId: "ABC123", clientName: "Acme" }),
    });
    assert.equal(plan.action, "update");
    if (plan.action === "skip") return;
    assert.equal(plan.corpClientId, "ABC123");
    assert.equal(normalizeCorpClientId(plan.corpClientId), "abc123");
  });
});
