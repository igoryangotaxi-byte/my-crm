export function buildSalesOperationB2BClientTripsHref({
  corpClientId,
  clientName,
  from,
  to,
}: {
  corpClientId: string;
  clientName?: string;
  from: string;
  to: string;
}): string {
  const params = new URLSearchParams({
    corpClientId: (corpClientId ?? "").trim().toLowerCase(),
    from,
    to,
  });
  const name = clientName?.trim();
  if (name) params.set("clientName", name);
  return `/sales-operation/b2b-clients/trips?${params.toString()}`;
}
