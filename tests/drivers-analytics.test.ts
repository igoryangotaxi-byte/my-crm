import assert from "node:assert/strict";
import {
  buildDriverAnalyticsReport,
  buildDriverLicenseAnalyticsReport,
} from "../lib/drivers-pipeline/analytics";
import type { DriverLead } from "../lib/drivers-pipeline/types";

function lead(partial: Partial<DriverLead> & Pick<DriverLead, "id" | "status">): DriverLead {
  return {
    source: "manual",
    fullName: "Test",
    email: null,
    phone: null,
    rejectedSubstatus: null,
    campaignName: null,
    formId: null,
    customFields: {},
    assignedManagerUserId: null,
    assignedManagerName: null,
    generalNotes: null,
    statusEnteredAt: "2026-09-20T10:00:00.000Z",
    createdAt: "2026-09-18T10:00:00.000Z",
    updatedAt: "2026-09-20T10:00:00.000Z",
    createdByUserId: null,
    createdByName: null,
    ...partial,
  };
}

const sample = [
  lead({
    id: "1",
    status: "new",
    assignedManagerName: "Igor",
    assignedManagerUserId: "u1",
    customFields: { sheet_date: "20/09/2026 10:00", taxi_license_normalized: "yes" },
  }),
  lead({
    id: "2",
    status: "registered",
    assignedManagerName: "Igor",
    assignedManagerUserId: "u1",
    campaignName: "Meta",
    customFields: { sheet_date: "21/09/2026 10:00", taxi_license_normalized: "yes" },
  }),
  lead({
    id: "3",
    status: "rejected",
    rejectedSubstatus: "No license",
    customFields: { sheet_date: "22/09/2026 10:00", taxi_license_normalized: "no" },
  }),
  lead({
    id: "4",
    status: "rejected",
    rejectedSubstatus: "Not interested",
    customFields: { sheet_date: "22/09/2026 11:00", taxi_license_normalized: "yes" },
  }),
];

const report = buildDriverAnalyticsReport(sample);
assert.equal(report.excludedNoLicenseCount, 1);
assert.equal(report.kpis.total, 3);
assert.equal(report.kpis.rejected, 1);
assert.equal(report.kpis.conversionPct, 50);
assert.equal(report.byRejectReason.length, 1);
assert.equal(report.byRejectReason[0]?.label, "Not interested");
assert.ok(!report.byRejectReason.some((row) => row.label === "No license"));

const license = buildDriverLicenseAnalyticsReport(sample);
assert.equal(license.kpis.total, 4);
assert.equal(license.kpis.withLicense, 3);
assert.equal(license.kpis.withoutLicense, 1);

const filtered = buildDriverAnalyticsReport(sample, {
  from: "2026-09-21",
  to: "2026-09-22",
});
assert.equal(filtered.kpis.total, 2);
assert.equal(filtered.excludedNoLicenseCount, 1);

console.log("drivers-analytics.test.ts: ok");
