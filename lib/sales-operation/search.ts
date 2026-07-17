export const SEARCH_ENTITY_TYPES = ["lead", "client", "contact"] as const;
export type SearchEntityType = (typeof SEARCH_ENTITY_TYPES)[number];

export type SearchResult = {
  entityType: SearchEntityType;
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
  score: number;
};

/** A search result plus the concatenated text it is matched against. */
export type SearchIndexItem = Omit<SearchResult, "score"> & {
  /** Free-text corpus (name, company, email, phone, …) matched against the query. */
  haystack: string;
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function tokenize(query: string): string[] {
  return normalize(query)
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

/**
 * Pure, deterministic ranking of search items against a query. Returns matched
 * items sorted by relevance (title matches and full-phrase matches score higher),
 * capped to `limit`. Side-effect free and easy to unit-test.
 */
export function rankSearchResults(
  query: string,
  items: SearchIndexItem[],
  limit = 20,
): SearchResult[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const phrase = normalize(query);

  const scored: SearchResult[] = [];
  for (const item of items) {
    const haystack = normalize(item.haystack);
    const title = normalize(item.title);

    // Every token must appear somewhere for the item to be a candidate.
    if (!tokens.every((token) => haystack.includes(token))) continue;

    let score = 0;
    for (const token of tokens) {
      if (title.includes(token)) score += 3;
      if (haystack.includes(token)) score += 1;
    }
    if (phrase.length > 0 && title.includes(phrase)) score += 5;
    if (title === phrase) score += 10;

    scored.push({
      entityType: item.entityType,
      id: item.id,
      title: item.title,
      subtitle: item.subtitle,
      href: item.href,
      score,
    });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, Math.max(0, limit));
}
