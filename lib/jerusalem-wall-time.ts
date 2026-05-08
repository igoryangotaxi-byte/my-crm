/** Wall clock in Asia/Jerusalem (IANA) for a UTC instant. */
export type JerusalemWall = {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  s: number;
};

const JERUSALEM_FULL_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jerusalem",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function wallDateKey(w: JerusalemWall): string {
  return `${w.y}-${pad2(w.mo)}-${pad2(w.d)}`;
}

export function getJerusalemWallFromUtcMs(ms: number): JerusalemWall {
  const parts = JERUSALEM_FULL_FORMATTER.formatToParts(new Date(ms));
  const o: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") o[p.type] = p.value;
  }
  return {
    y: Number(o.year),
    mo: Number(o.month),
    d: Number(o.day),
    h: Number(o.hour),
    mi: Number(o.minute),
    s: Number(o.second),
  };
}

function cmpWall(a: JerusalemWall, b: JerusalemWall): number {
  return (
    a.y - b.y ||
    a.mo - b.mo ||
    a.d - b.d ||
    a.h - b.h ||
    a.mi - b.mi ||
    a.s - b.s
  );
}

/**
 * Converts a Jerusalem wall-clock instant to UTC epoch ms (binary search).
 * Use for CSV rows that store local Israel time without offset.
 */
export function jerusalemWallToUtcMs(w: JerusalemWall): number {
  let lo = Date.UTC(w.y, w.mo - 1, w.d - 1, 12, 0, 0);
  let hi = Date.UTC(w.y, w.mo - 1, w.d + 1, 12, 0, 0);
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const wm = getJerusalemWallFromUtcMs(mid);
    if (cmpWall(wm, w) < 0) lo = mid;
    else hi = mid;
  }
  return Math.round((lo + hi) / 2);
}

/** Parse `YYYY-MM-DD` to inclusive Jerusalem date range as UTC ms bounds [fromMs, toExclusiveMs). */
export function jerusalemDateRangeToUtcBounds(fromYmd: string, toYmdInclusive: string): { fromMs: number; toExclusiveMs: number } | null {
  const m1 = fromYmd.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const m2 = toYmdInclusive.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m1 || !m2) return null;
  const y1 = Number(m1[1]);
  const mo1 = Number(m1[2]);
  const d1 = Number(m1[3]);
  const y2 = Number(m2[1]);
  const mo2 = Number(m2[2]);
  const d2 = Number(m2[3]);
  if (![y1, mo1, d1, y2, mo2, d2].every((n) => Number.isFinite(n))) return null;
  if (wallDateKey({ y: y1, mo: mo1, d: d1, h: 0, mi: 0, s: 0 }) > wallDateKey({ y: y2, mo: mo2, d: d2, h: 0, mi: 0, s: 0 })) return null;
  const fromMs = jerusalemWallToUtcMs({ y: y1, mo: mo1, d: d1, h: 0, mi: 0, s: 0 });
  const next = new Date(y2, mo2 - 1, d2 + 1);
  const toExclusiveMs = jerusalemWallToUtcMs({
    y: next.getFullYear(),
    mo: next.getMonth() + 1,
    d: next.getDate(),
    h: 0,
    mi: 0,
    s: 0,
  });
  return { fromMs, toExclusiveMs };
}
