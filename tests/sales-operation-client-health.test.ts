import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { computeClientHealth } from "../lib/sales-operation/client-health.ts";
import { buildAmPortfolio } from "../lib/sales-operation/am-portfolio.ts";
import type { SalesClientListRow } from "../lib/sales-operation/client-list.ts";

const NOW = new Date("2026-07-17T12:00:00.000Z");

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

describe("computeClientHealth (Phase 7)", () => {
  it("marks a recently signed client with no trips as new", () => {
    const result = computeClientHealth({
      trips: 0,
      gmv: 0,
      decouplingRate: 0,
      lastTripAt: null,
      signedAt: daysAgo(10),
      now: NOW,
    });
    assert.equal(result.status, "new");
    assert.ok(result.reasons.includes("recentlySigned"));
  });

  it("marks an old client with no trips as dormant", () => {
    const result = computeClientHealth({
      trips: 0,
      gmv: 0,
      decouplingRate: 0,
      lastTripAt: null,
      signedAt: daysAgo(200),
      now: NOW,
    });
    assert.equal(result.status, "dormant");
    assert.ok(result.reasons.includes("noTrips"));
  });

  it("marks a busy recent client as healthy", () => {
    const result = computeClientHealth({
      trips: 40,
      gmv: 50000,
      decouplingRate: 8,
      lastTripAt: daysAgo(2),
      signedAt: daysAgo(120),
      now: NOW,
    });
    assert.equal(result.status, "healthy");
    assert.equal(result.score, 100);
    assert.equal(result.daysSinceLastTrip, 2);
  });

  it("flags stale trips as at risk", () => {
    const result = computeClientHealth({
      trips: 30,
      gmv: 40000,
      decouplingRate: 10,
      lastTripAt: daysAgo(45),
      now: NOW,
    });
    assert.equal(result.status, "at_risk");
    assert.ok(result.reasons.includes("staleTrips"));
  });

  it("penalises high decoupling and low volume", () => {
    const result = computeClientHealth({
      trips: 2,
      gmv: 1000,
      decouplingRate: 50,
      lastTripAt: daysAgo(3),
      now: NOW,
    });
    assert.ok(result.reasons.includes("highDecoupling"));
    assert.ok(result.reasons.includes("lowVolume"));
    assert.equal(result.score, 70);
    assert.equal(result.status, "watch");
  });
});

function makeRow(overrides: Partial<SalesClientListRow>): SalesClientListRow {
  return {
    key: overrides.key ?? "k",
    salesClientId: overrides.salesClientId ?? null,
    corpClientId: overrides.corpClientId ?? null,
    name: overrides.name ?? "Client",
    companyName: overrides.companyName ?? null,
    accountManagerUserId: overrides.accountManagerUserId ?? null,
    accountManagerName: overrides.accountManagerName ?? null,
    salesManagerName: overrides.salesManagerName ?? null,
    campaignName: overrides.campaignName ?? null,
    signedAt: overrides.signedAt ?? null,
    source: overrides.source ?? "linked",
  };
}

describe("buildAmPortfolio (Phase 7)", () => {
  it("groups clients by account manager with health counts, unassigned last", () => {
    const rows: SalesClientListRow[] = [
      makeRow({ key: "a", corpClientId: "c1", name: "Alpha", accountManagerUserId: "u1", accountManagerName: "Dana" }),
      makeRow({ key: "b", corpClientId: "c2", name: "Beta", accountManagerUserId: "u1", accountManagerName: "Dana" }),
      makeRow({ key: "c", corpClientId: "c3", name: "Gamma", accountManagerUserId: null }),
    ];
    const metrics = {
      c1: { trips: 40, gmv: 60000, decouplingRate: 8, lastTripAt: daysAgo(1) },
      c2: { trips: 10, gmv: 8000, decouplingRate: 10, lastTripAt: daysAgo(50) },
      c3: { trips: 0, gmv: 0, decouplingRate: 0, lastTripAt: null },
    };

    const groups = buildAmPortfolio(rows, metrics, NOW);
    assert.equal(groups.length, 2);

    const dana = groups[0]!;
    assert.equal(dana.accountManagerUserId, "u1");
    assert.equal(dana.clientCount, 2);
    assert.equal(dana.totalGmv, 68000);
    assert.equal(dana.healthCounts.healthy, 1);
    assert.ok(dana.atRiskCount >= 1);

    const unassigned = groups[1]!;
    assert.equal(unassigned.accountManagerUserId, null);
    assert.equal(unassigned.clientCount, 1);

    // Worst health sorts first within a group.
    assert.equal(dana.clients[0]!.name, "Beta");
  });
});

describe("client health + portfolio i18n (Phase 7)", () => {
  it("ships health + portfolio translations for both locales", () => {
    for (const locale of ["en", "he"]) {
      const messages = JSON.parse(
        readFileSync(join(process.cwd(), "messages", `${locale}.json`), "utf8"),
      ) as {
        salesOperation?: {
          health?: { status?: Record<string, unknown>; reason?: Record<string, unknown> };
          portfolio?: Record<string, unknown>;
          tab?: Record<string, unknown>;
          page?: { portfolio?: Record<string, unknown> };
        };
      };
      const so = messages.salesOperation;
      assert.ok(so?.health?.status, `${locale}: missing health.status`);
      for (const status of ["new", "healthy", "watch", "at_risk", "dormant"]) {
        assert.ok(status in (so.health!.status as Record<string, unknown>), `${locale}: health.status.${status}`);
      }
      assert.ok(so?.portfolio, `${locale}: missing portfolio`);
      assert.ok(so?.tab && "portfolio" in so.tab, `${locale}: missing tab.portfolio`);
      assert.ok(so?.page?.portfolio, `${locale}: missing page.portfolio`);
    }
  });
});
