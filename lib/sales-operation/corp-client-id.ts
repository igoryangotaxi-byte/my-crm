export function normalizeCorpClientId(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function corpClientIdsMatch(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const a = normalizeCorpClientId(left);
  const b = normalizeCorpClientId(right);
  return Boolean(a) && a === b;
}
