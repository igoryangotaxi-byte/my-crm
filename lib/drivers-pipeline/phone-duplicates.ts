import { israelPhoneKey } from "@/lib/call-center/phone";
import { getDriverReceivedAt } from "@/lib/drivers-pipeline/received-at";
import type { DriverLead, DriverLeadStatus } from "@/lib/drivers-pipeline/types";

export type DriverPhoneDuplicateTone = "registered" | "rejected" | "open";

export type DriverPhoneDuplicateHint = {
  tone: DriverPhoneDuplicateTone;
  /** Prior lead with the same phone (prefer registered → rejected → other among older). */
  match: DriverLead;
  matchCount: number;
};

function toneRank(status: DriverLeadStatus): number {
  if (status === "registered") return 3;
  if (status === "rejected") return 2;
  return 1;
}

function toneForStatus(status: DriverLeadStatus): DriverPhoneDuplicateTone {
  if (status === "registered") return "registered";
  if (status === "rejected") return "rejected";
  return "open";
}

function compareReceivedDesc(a: DriverLead, b: DriverLead): number {
  const diff = getDriverReceivedAt(b).getTime() - getDriverReceivedAt(a).getTime();
  if (diff !== 0) return diff;
  return b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);
}

/**
 * Only the latest lead (by received date) in a phone group is marked as duplicate.
 * Older same-phone leads stay unmarked. Color reflects the strongest prior match.
 */
export function buildDriverPhoneDuplicateHints(
  leads: DriverLead[],
): Map<string, DriverPhoneDuplicateHint> {
  const byPhone = new Map<string, DriverLead[]>();
  for (const lead of leads) {
    const key = israelPhoneKey(lead.phone);
    if (!key) continue;
    const list = byPhone.get(key);
    if (list) list.push(lead);
    else byPhone.set(key, [lead]);
  }

  const hints = new Map<string, DriverPhoneDuplicateHint>();
  for (const group of byPhone.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort(compareReceivedDesc);
    const latest = sorted[0]!;
    const priors = sorted.slice(1);
    const match = [...priors].sort(
      (a, b) =>
        toneRank(b.status) - toneRank(a.status) || compareReceivedDesc(a, b),
    )[0]!;
    hints.set(latest.id, {
      tone: toneForStatus(match.status),
      match,
      matchCount: priors.length,
    });
  }
  return hints;
}
