import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPendingSalesManagerApplyPlan } from "@/lib/sales-operation/b2b-client-registry";
import type { B2BClientRegistryEntry } from "@/lib/sales-operation/manager-types";

function entry(partial: Partial<B2BClientRegistryEntry> & Pick<B2BClientRegistryEntry, "corpClientId">): B2BClientRegistryEntry {
  return {
    clientName: partial.clientName ?? partial.corpClientId,
    accountManager: partial.accountManager ?? { userId: null, name: null },
    salesManager: partial.salesManager ?? { userId: null, name: null },
    ...partial,
  };
}

describe("pending sales manager apply plan", () => {
  it("upserts when corp client is missing from the map", () => {
    const plan = buildPendingSalesManagerApplyPlan({
      corpClientId: "ABC123",
      pending: { userId: "sm-1", name: "Igor Rebkovets" },
      existing: null,
      clientName: "Acme Ltd",
    });
    assert.equal(plan.action, "upsert");
    if (plan.action === "skip") return;
    assert.equal(plan.corpClientId, "abc123");
    assert.equal(plan.salesManagerUserId, "sm-1");
    assert.equal(plan.clientName, "Acme Ltd");
  });

  it("updates when map row exists without a sales manager", () => {
    const plan = buildPendingSalesManagerApplyPlan({
      corpClientId: "abc123",
      pending: { userId: "sm-1", name: "Igor Rebkovets" },
      existing: entry({
        corpClientId: "abc123",
        clientName: "Acme",
        salesManager: { userId: null, name: null },
      }),
    });
    assert.equal(plan.action, "update");
  });

  it("reuses the existing map corp client id casing", () => {
    const plan = buildPendingSalesManagerApplyPlan({
      corpClientId: "abc123",
      pending: { userId: "sm-1", name: "Igor Rebkovets" },
      existing: entry({
        corpClientId: "ABC123",
        clientName: "Acme",
        salesManager: { userId: null, name: null },
      }),
    });
    assert.equal(plan.action, "update");
    if (plan.action === "skip") return;
    assert.equal(plan.corpClientId, "ABC123");
  });

  it("does not overwrite an existing sales manager", () => {
    const plan = buildPendingSalesManagerApplyPlan({
      corpClientId: "abc123",
      pending: { userId: "sm-1", name: "Igor Rebkovets" },
      existing: entry({
        corpClientId: "abc123",
        salesManager: { userId: "other", name: "Other SM" },
      }),
    });
    assert.equal(plan.action, "skip");
  });

  it("skips without pending user or corp id", () => {
    assert.equal(
      buildPendingSalesManagerApplyPlan({
        corpClientId: "",
        pending: { userId: "sm-1", name: "Igor" },
        existing: null,
      }).action,
      "skip",
    );
    assert.equal(
      buildPendingSalesManagerApplyPlan({
        corpClientId: "abc123",
        pending: { userId: null, name: "Igor" },
        existing: null,
      }).action,
      "skip",
    );
  });
});
