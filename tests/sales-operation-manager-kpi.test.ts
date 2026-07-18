import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildManagerKpis,
  isSalesKpiMetric,
  SALES_KPI_METRICS,
  type BuildManagerKpisInput,
} from "../lib/sales-operation/manager-kpi.ts";
import { defaultPipelineStages } from "../lib/sales-operation/display.ts";
import type { SalesLead, SalesLeadStatus } from "../lib/sales-operation/types.ts";

const NOW = new Date("2026-07-17T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

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
    companyName: null,
    campaignId: null,
    campaignName: null,
    adId: null,
    adName: null,
    formId: null,
    customFields: {},
    assignedManagerUserId: overrides.assignedManagerUserId ?? null,
    assignedManagerName: overrides.assignedManagerName ?? null,
    legalName: null,
    companyRegNumber: null,
    website: null,
    segmentId: null,
    subSegment: null,
    employeesCount: null,
    estimatedMonthlyPotential: overrides.estimatedMonthlyPotential ?? null,
    estimatedMonthlyTrips: null,
    expectedCloseDate: null,
    probabilityOverride: overrides.probabilityOverride ?? null,
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

const PERIOD_START = new Date(NOW.getFullYear(), NOW.getMonth(), 1).toISOString();
const PERIOD_END = NOW.toISOString();

function baseInput(): BuildManagerKpisInput {
  return {
    leads: [],
    stages: defaultPipelineStages(),
    statusEvents: [],
    activities: [],
    completedTasks: [],
    gmvTripsByManager: {},
    managers: [
      { userId: "u1", name: "Alice" },
      { userId: "u2", name: "Bob" },
    ],
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
  };
}

describe("manager KPI metric keys", () => {
  it("recognizes valid metric keys and rejects others", () => {
    assert.equal(isSalesKpiMetric("signed_count"), true);
    assert.equal(isSalesKpiMetric("gmv"), true);
    assert.equal(isSalesKpiMetric("nope"), false);
    assert.equal(SALES_KPI_METRICS.length, 10);
  });
});

describe("buildManagerKpis — pipeline attribution", () => {
  it("attributes signed count, cycle time and conversion to the lead owner", () => {
    const input = baseInput();
    input.leads = [
      // Owner u1: created 10 days ago, signed 2 days ago (cycle 8 days).
      makeLead({
        id: "l1",
        status: "signed",
        assignedManagerUserId: "u1",
        createdAt: iso(10),
        statusEnteredAt: iso(2),
      }),
      // Owner u1: created in period, still open.
      makeLead({
        id: "l2",
        status: "in_progress",
        assignedManagerUserId: "u1",
        createdAt: iso(5),
        statusEnteredAt: iso(5),
      }),
      // Owner u2: rejected — not signed.
      makeLead({
        id: "l3",
        status: "rejected",
        assignedManagerUserId: "u2",
        createdAt: iso(6),
        statusEnteredAt: iso(1),
      }),
    ];

    const rows = buildManagerKpis(input);
    const u1 = rows.find((r) => r.managerUserId === "u1")!;
    const u2 = rows.find((r) => r.managerUserId === "u2")!;

    assert.equal(u1.actuals.signed_count, 1);
    assert.equal(u1.actuals.avg_cycle_days, 8);
    // 1 signed out of 2 created in period = 50%.
    assert.equal(u1.actuals.conversion_pct, 50);
    assert.equal(u1.actuals.leads_worked, 2);

    assert.equal(u2.actuals.signed_count, 0);
    assert.equal(u2.actuals.conversion_pct, 0);
  });

  it("computes weighted forecast from open leads only", () => {
    const input = baseInput();
    input.leads = [
      makeLead({
        id: "l1",
        status: "proposal_sent",
        assignedManagerUserId: "u1",
        estimatedMonthlyPotential: 1000,
        probabilityOverride: 60,
        createdAt: iso(3),
        statusEnteredAt: iso(3),
      }),
      // Signed lead should NOT count toward forecast.
      makeLead({
        id: "l2",
        status: "signed",
        assignedManagerUserId: "u1",
        estimatedMonthlyPotential: 5000,
        createdAt: iso(4),
        statusEnteredAt: iso(1),
      }),
    ];
    const rows = buildManagerKpis(input);
    const u1 = rows.find((r) => r.managerUserId === "u1")!;
    assert.equal(u1.actuals.weighted_forecast, 600);
  });
});

describe("buildManagerKpis — activity, tasks, response, gmv", () => {
  it("counts activities and completed tasks by actor within the period", () => {
    const input = baseInput();
    input.leads = [makeLead({ id: "l1", status: "new", assignedManagerUserId: "u1", createdAt: iso(3) })];
    input.activities = [
      { leadId: "l1", actorUserId: "u1", occurredAt: iso(2) },
      { leadId: "l1", actorUserId: "u1", occurredAt: iso(1) },
      // Out of period (a year ago) — ignored.
      { leadId: "l1", actorUserId: "u1", occurredAt: new Date("2025-01-01T00:00:00Z").toISOString() },
    ];
    input.completedTasks = [
      { leadId: "l1", completedByUserId: "u1", completedAt: iso(1), status: "done" },
      // Not done — ignored.
      { leadId: "l1", completedByUserId: "u1", completedAt: iso(1), status: "open" },
    ];
    const rows = buildManagerKpis(input);
    const u1 = rows.find((r) => r.managerUserId === "u1")!;
    assert.equal(u1.actuals.activities_logged, 2);
    assert.equal(u1.actuals.tasks_completed, 1);
  });

  it("computes average response hours from first move out of 'new'", () => {
    const input = baseInput();
    const created = new Date(NOW.getTime() - 2 * DAY);
    const responded = new Date(created.getTime() + 5 * HOUR);
    input.leads = [
      makeLead({
        id: "l1",
        status: "in_progress",
        assignedManagerUserId: "u1",
        createdAt: created.toISOString(),
        statusEnteredAt: responded.toISOString(),
      }),
    ];
    input.statusEvents = [
      {
        leadId: "l1",
        fromStatus: "new",
        toStatus: "in_progress",
        changedByUserId: "u1",
        createdAt: responded.toISOString(),
      },
    ];
    const rows = buildManagerKpis(input);
    const u1 = rows.find((r) => r.managerUserId === "u1")!;
    assert.equal(u1.actuals.avg_response_hours, 5);
    assert.equal(u1.actuals.leads_worked, 1);
  });

  it("passes through per-manager GMV and trips", () => {
    const input = baseInput();
    input.gmvTripsByManager = { u2: { gmv: 12345.6, trips: 42 } };
    const rows = buildManagerKpis(input);
    const u2 = rows.find((r) => r.managerUserId === "u2")!;
    assert.equal(u2.actuals.gmv, 12346);
    assert.equal(u2.actuals.trips, 42);
  });
});
