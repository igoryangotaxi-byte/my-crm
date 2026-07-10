import assert from "node:assert/strict";
import { describe, it } from "node:test";

function getScheduledDateKey(iso: string): string | null {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, "0");
  const d = String(parsed.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

describe("manager portfolio analytics helpers", () => {
  it("filters order rows by date range and corp client portfolio", () => {
    const portfolioIds = new Set(["client-a"]);
    const from = "2026-05-01";
    const to = "2026-05-31";
    const rows = [
      { corpClientId: "client-a", scheduledAt: "2026-05-10T10:00:00.000Z", clientPaid: 100 },
      { corpClientId: "client-b", scheduledAt: "2026-05-10T10:00:00.000Z", clientPaid: 50 },
      { corpClientId: "client-a", scheduledAt: "2026-06-01T10:00:00.000Z", clientPaid: 20 },
    ];

    const filtered = rows.filter((row) => {
      const corpId = row.corpClientId.toLowerCase();
      if (!portfolioIds.has(corpId)) return false;
      const dateKey = getScheduledDateKey(row.scheduledAt);
      return Boolean(dateKey && dateKey >= from && dateKey <= to);
    });

    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.clientPaid, 100);
  });
});
