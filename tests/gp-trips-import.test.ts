import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { describe, it } from "node:test";
import { parseGpTripsCsvStream } from "../lib/gp-trips-import/index";
import { LEGACY_NO_HEADER_COLUMNS, mapCsvRecord } from "../lib/gp-trips-import/map-record";

describe("gp trips import", () => {
  it("maps legacy headerless row array", () => {
    const clientId = "a".repeat(32);
    const orderId = "b".repeat(32);
    const legacyRow = new Array(LEGACY_NO_HEADER_COLUMNS.length).fill("0");
    legacyRow[0] = "2026-01-15 10:00:00";
    legacyRow[1] = clientId;
    legacyRow[2] = orderId;
    legacyRow[3] = "100";
    legacyRow[4] = "80";
    legacyRow[5] = "20";
    legacyRow[6] = "true";
    legacyRow[7] = "false";
    legacyRow[11] = "econom";
    legacyRow[12] = "5.2";
    legacyRow[13] = "12";
    legacyRow[14] = "ILS";
    legacyRow[LEGACY_NO_HEADER_COLUMNS.length - 1] = "cancelled_by_user";
    const mapped = mapCsvRecord(legacyRow);
    assert.equal(mapped.order_id, orderId);
    assert.equal(mapped.corp_client_id, clientId);
    assert.equal(mapped.user_w_vat_cost, 100);
    assert.equal(mapped.driver_cost, 80);
    assert.equal(mapped.decoupling_driver_cost, 20);
    assert.equal(mapped.tariff_class_code, "econom");
  });

  it("deduplicates duplicate order_id rows in file", async () => {
    const clientId = "c".repeat(32);
    const orderId = "d".repeat(32);
    const legacyRow = (orderDate: string, clientPrice: string, driverPrice: string) => {
      const fields = new Array(LEGACY_NO_HEADER_COLUMNS.length).fill("0");
      fields[0] = orderDate;
      fields[1] = clientId;
      fields[2] = orderId;
      fields[3] = clientPrice;
      fields[4] = driverPrice;
      fields[5] = "";
      fields[LEGACY_NO_HEADER_COLUMNS.length - 1] = "none";
      return fields.join(",");
    };
    const csv = [
      legacyRow("2026-02-01 9:00:00", "50", "40"),
      legacyRow("2026-02-02 9:00:00", "60", "45"),
    ].join("\n");
    const stats = await parseGpTripsCsvStream(Readable.from(Buffer.from(csv, "utf8")));
    assert.equal(stats.totalRead, 2);
    assert.equal(stats.uniqueInFile, 1);
    assert.equal(stats.duplicatesInFile, 1);
    assert.equal(stats.dedupedRows[0]?.user_w_vat_cost, 60);
  });
});
