import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  buildSalesAnalyticsReport,
  rowsToCsv,
  toCsvCell,
} from "../lib/sales-operation/analytics.ts";
import { defaultPipelineStages } from "../lib/sales-operation/display.ts";
import type { SalesLead, SalesLeadStatus, SalesSegment } from "../lib/sales-operation/types.ts";

const NOW = new Date("2026-07-17T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

function iso(daysAgo: number): string {
  return new Date(NOW.getTime() - daysAgo * DAY).toISOString();
}

function makeLead(overrides: Partial<SalesLead> & { status: SalesLeadStatus }): SalesLead {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    status: overrides.status,
    source: overrides.source ?? "manual",
    fullName: overrides.fullName ?? "Lead",
    email: null,
    phone: null,
    companyName: overrides.companyName ?? null,
    campaignId: null,
    campaignName: null,
    adId: null,
    adName: null,
    formId: null,
    customFields: {},
    assignedManagerUserId: null,
    assignedManagerName: null,
    legalName: null,
    companyRegNumber: null,
    website: null,
    segmentId: overrides.segmentId ?? null,
    subSegment: null,
    employeesCount: null,
    estimatedMonthlyPotential: overrides.estimatedMonthlyPotential ?? null,
    estimatedMonthlyTrips: null,
    expectedCloseDate: overrides.expectedCloseDate ?? null,
    probabilityOverride: null,
    clientAddress: null,
    generalNotes: null,
    isArchived: false,
    archivedAt: null,
    statusEnteredAt: overrides.statusEnteredAt ?? iso(0),
    createdAt: overrides.createdAt ?? iso(0),
    updatedAt: iso(0),
    createdByUserId: null,
    createdByName: null,
  };
}

const SEGMENTS: SalesSegment[] = [{ id: "seg1", name: "Retail", orderIndex: 0, isActive: true }];

function buildFixtureReport() {
  const leads: SalesLead[] = [
    makeLead({
      id: "l1",
      status: "new",
      source: "manual",
      estimatedMonthlyPotential: 1000,
      segmentId: "seg1",
      expectedCloseDate: "2026-08-15T12:00:00.000Z",
      createdAt: iso(0),
      statusEnteredAt: iso(0),
    }),
    makeLead({
      id: "l2",
      status: "in_progress",
      source: "meta",
      estimatedMonthlyPotential: 2000,
      expectedCloseDate: "2026-09-01T12:00:00.000Z",
      createdAt: iso(20),
      statusEnteredAt: iso(10),
    }),
    makeLead({
      id: "l3",
      status: "proposal_sent",
      source: "wordpress",
      estimatedMonthlyPotential: 5000,
      segmentId: "seg1",
      createdAt: iso(40),
      statusEnteredAt: iso(40),
    }),
    makeLead({
      id: "l4",
      status: "signed",
      source: "manual",
      estimatedMonthlyPotential: 3000,
      createdAt: iso(30),
      statusEnteredAt: iso(5),
    }),
    makeLead({
      id: "l5",
      status: "rejected",
      source: "meta",
      createdAt: iso(15),
      statusEnteredAt: iso(3),
    }),
  ];
  return buildSalesAnalyticsReport(leads, defaultPipelineStages(), SEGMENTS, NOW);
}

describe("buildSalesAnalyticsReport (Phase 8)", () => {
  it("builds a monotonic funnel with conversion rates", () => {
    const report = buildFixtureReport();
    const counts = report.funnel.map((step) => step.count);
    assert.deepEqual(counts, [4, 3, 2, 1, 1]);
    assert.equal(report.funnel[0]!.conversionFromPrev, null);
    assert.equal(report.funnel[1]!.conversionFromPrev, 75);
  });

  it("computes win/loss with average durations", () => {
    const { winLoss } = buildFixtureReport();
    assert.equal(winLoss.signed, 1);
    assert.equal(winLoss.rejected, 1);
    assert.equal(winLoss.open, 3);
    assert.equal(winLoss.winRate, 50);
    assert.equal(winLoss.avgDaysToWin, 25);
    assert.equal(winLoss.avgDaysToLoss, 12);
  });

  it("aggregates by source and segment", () => {
    const report = buildFixtureReport();
    const manual = report.bySource.find((row) => row.source === "manual");
    assert.equal(manual?.total, 2);
    assert.equal(manual?.signed, 1);
    assert.equal(manual?.conversionPct, 50);

    const retail = report.bySegment.find((row) => row.segmentId === "seg1");
    assert.equal(retail?.total, 2);
    assert.equal(retail?.potential, 6000);
    const unassigned = report.bySegment.find((row) => row.segmentId === null);
    assert.equal(unassigned?.total, 3);
  });

  it("forecasts weighted pipeline by expected close month", () => {
    const { forecast } = buildFixtureReport();
    assert.equal(forecast.totalOpen, 3);
    assert.equal(forecast.totalPotential, 8000);
    assert.equal(forecast.totalWeighted, 3200);
    // Unscheduled bucket is sorted last.
    assert.equal(forecast.byMonth[forecast.byMonth.length - 1]!.month, null);
    assert.equal(forecast.byMonth[0]!.month, "2026-08");
  });

  it("buckets aging and produces a daily snapshot", () => {
    const report = buildFixtureReport();
    const bucket = (key: string) => report.aging.find((b) => b.key === key)?.count;
    assert.equal(bucket("0-7"), 1);
    assert.equal(bucket("8-14"), 1);
    assert.equal(bucket("30+"), 1);
    assert.equal(report.daily.newLeads, 1);
    assert.equal(report.daily.movedForward, 1);
    assert.equal(report.daily.signed, 0);
  });
});

describe("CSV helpers (Phase 8)", () => {
  it("escapes cells that contain separators or quotes", () => {
    assert.equal(toCsvCell("plain"), "plain");
    assert.equal(toCsvCell("a,b"), '"a,b"');
    assert.equal(toCsvCell('quote"inside'), '"quote""inside"');
    assert.equal(toCsvCell(null), "");
  });

  it("joins rows with CRLF", () => {
    const csv = rowsToCsv([
      ["h1", "h2"],
      [1, "x,y"],
    ]);
    assert.equal(csv, 'h1,h2\r\n1,"x,y"');
  });
});

describe("analytics report i18n (Phase 8)", () => {
  it("ships report translations for both locales", () => {
    for (const locale of ["en", "he"]) {
      const messages = JSON.parse(
        readFileSync(join(process.cwd(), "messages", `${locale}.json`), "utf8"),
      ) as { salesOperation?: { report?: Record<string, unknown>; kpi?: Record<string, unknown> } };
      const so = messages.salesOperation;
      assert.ok(so?.report, `${locale}: missing salesOperation.report`);
      for (const key of ["funnelTitle", "agingTitle", "bySourceTitle", "forecastTitle", "exportCsv"]) {
        assert.ok(key in (so.report as Record<string, unknown>), `${locale}: report.${key}`);
      }
      assert.ok(so?.kpi && "signed" in so.kpi, `${locale}: kpi.signed`);
    }
  });
});
