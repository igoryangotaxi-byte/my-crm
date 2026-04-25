export type B2BOrdersListCursors = Record<string, number>;

export function b2bDashboardOrderKey(row: { tokenLabel: string; orderId: string }): string {
  return `${row.tokenLabel}::${row.orderId}`;
}
