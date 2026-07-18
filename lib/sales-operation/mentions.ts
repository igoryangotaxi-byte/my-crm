export type MentionUser = { id: string; name: string };

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Finds user ids mentioned via `@name` in a free-text body. Matches the full
 * name and the first name (case-insensitive), so both `@Alice` and
 * `@Alice Cohen` resolve. Pure and additive — used to notify collaborators.
 */
export function findMentionedUserIds(body: string, users: MentionUser[]): string[] {
  if (!body.includes("@")) return [];
  const matched = new Set<string>();
  for (const user of users) {
    const name = user.name?.trim();
    if (!name) continue;
    const candidates = new Set<string>();
    candidates.add(name);
    const firstName = name.split(/\s+/)[0];
    if (firstName) candidates.add(firstName);
    for (const candidate of candidates) {
      const pattern = new RegExp(`@${escapeRegExp(candidate)}\\b`, "i");
      if (pattern.test(body)) {
        matched.add(user.id);
        break;
      }
    }
  }
  return [...matched];
}
