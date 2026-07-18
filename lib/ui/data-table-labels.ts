import type { DataTableLabels } from "@/components/ui/DataTable";

/**
 * Build DataTable labels from a next-intl translator scoped to the
 * `salesOperation` namespace (expects a `table.*` group).
 */
export function dataTableLabels(
  t: (key: string) => string,
  overrides?: Partial<DataTableLabels>,
): Partial<DataTableLabels> {
  return {
    search: t("table.search"),
    columns: t("table.columns"),
    empty: t("table.empty"),
    page: t("table.page"),
    of: t("table.of"),
    prev: t("table.prev"),
    next: t("table.next"),
    results: t("table.results"),
    ...overrides,
  };
}
