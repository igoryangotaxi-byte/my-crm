export const CLIENT_HEALTH_STATUSES = [
  "new",
  "healthy",
  "watch",
  "at_risk",
  "dormant",
] as const;
export type ClientHealthStatus = (typeof CLIENT_HEALTH_STATUSES)[number];

export type ClientHealthReason =
  | "recentlySigned"
  | "noTrips"
  | "staleTrips"
  | "decliningRecency"
  | "highDecoupling"
  | "lowVolume"
  | "active";

export type ClientHealthInput = {
  /** Successful trips in the observation window. */
  trips: number;
  /** GMV (₪) in the window. */
  gmv: number;
  /** Decoupling rate as a percentage (0-100). */
  decouplingRate: number;
  /** ISO timestamp of the most recent trip, or null when there are none. */
  lastTripAt: string | null;
  /** ISO timestamp the client was signed, used to protect new accounts. */
  signedAt?: string | null;
  /** Injectable clock for deterministic tests. */
  now?: Date;
};

export type ClientHealthResult = {
  status: ClientHealthStatus;
  score: number;
  reasons: ClientHealthReason[];
  daysSinceLastTrip: number | null;
  daysSinceSigned: number | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(now: number, iso: string | null | undefined): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  return Math.max(0, Math.floor((now - then) / DAY_MS));
}

/**
 * Deterministic client health score derived from trip recency, volume and
 * decoupling quality. Pure — no I/O — so it can be unit tested and reused
 * across the client overview and the account-manager portfolio.
 */
export function computeClientHealth(input: ClientHealthInput): ClientHealthResult {
  const now = (input.now ?? new Date()).getTime();
  const daysSinceLastTrip = daysBetween(now, input.lastTripAt);
  const daysSinceSigned = daysBetween(now, input.signedAt);
  const reasons: ClientHealthReason[] = [];

  // No trips in the window at all.
  if (input.trips <= 0 || daysSinceLastTrip === null) {
    if (daysSinceSigned !== null && daysSinceSigned <= 30) {
      reasons.push("recentlySigned");
      return {
        status: "new",
        score: 70,
        reasons,
        daysSinceLastTrip,
        daysSinceSigned,
      };
    }
    reasons.push("noTrips");
    return {
      status: "dormant",
      score: 5,
      reasons,
      daysSinceLastTrip,
      daysSinceSigned,
    };
  }

  let score = 100;

  if (daysSinceLastTrip <= 7) {
    reasons.push("active");
  } else if (daysSinceLastTrip <= 14) {
    score -= 15;
    reasons.push("decliningRecency");
  } else if (daysSinceLastTrip <= 30) {
    score -= 35;
    reasons.push("decliningRecency");
  } else if (daysSinceLastTrip <= 60) {
    score -= 60;
    reasons.push("staleTrips");
  } else {
    score -= 85;
    reasons.push("staleTrips");
  }

  if (input.decouplingRate > 40) {
    score -= 20;
    reasons.push("highDecoupling");
  } else if (input.decouplingRate > 25) {
    score -= 10;
    reasons.push("highDecoupling");
  }

  if (input.trips < 5) {
    score -= 10;
    reasons.push("lowVolume");
  }

  score = Math.max(0, Math.min(100, score));

  let status: ClientHealthStatus;
  if (score >= 80) status = "healthy";
  else if (score >= 60) status = "watch";
  else if (score >= 35) status = "at_risk";
  else status = "dormant";

  return { status, score, reasons, daysSinceLastTrip, daysSinceSigned };
}
