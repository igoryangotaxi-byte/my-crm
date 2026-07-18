"use client";

import { useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/ui/cn";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";

export type DataTableColumn<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
  sortable?: boolean;
  sortValue?: (row: T) => string | number;
  defaultHidden?: boolean;
  hideable?: boolean;
};

export type DataTableLabels = {
  search: string;
  columns: string;
  empty: string;
  emptyDescription?: string;
  page: string;
  of: string;
  prev: string;
  next: string;
  results: string;
};

const defaultLabels: DataTableLabels = {
  search: "Search…",
  columns: "Columns",
  empty: "No data",
  page: "Page",
  of: "of",
  prev: "Previous",
  next: "Next",
  results: "results",
};

type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowKey: (row: T, index: number) => string | number;
  getRowClassName?: (row: T, index: number) => string | undefined;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  loadingRows?: number;
  searchable?: boolean;
  getSearchText?: (row: T) => string;
  pageSize?: number;
  toolbar?: ReactNode;
  showColumnToggle?: boolean;
  labels?: Partial<DataTableLabels>;
  emptyIcon?: ReactNode;
  className?: string;
};

type SortState = { key: string; dir: "asc" | "desc" } | null;

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  getRowClassName,
  onRowClick,
  loading = false,
  loadingRows = 6,
  searchable = false,
  getSearchText,
  pageSize,
  toolbar,
  showColumnToggle = false,
  labels: labelsProp,
  emptyIcon,
  className,
}: DataTableProps<T>) {
  const labels = { ...defaultLabels, ...labelsProp };
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(0);
  const [hidden, setHidden] = useState<Set<string>>(
    () => new Set(columns.filter((c) => c.defaultHidden).map((c) => c.key)),
  );
  const bodyRef = useRef<HTMLTableSectionElement>(null);

  const visibleColumns = columns.filter((c) => !hidden.has(c.key));

  const filtered = useMemo(() => {
    if (!searchable || !query.trim() || !getSearchText) return rows;
    const q = query.trim().toLowerCase();
    return rows.filter((row) => getSearchText(row).toLowerCase().includes(q));
  }, [rows, query, searchable, getSearchText]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return filtered;
    const accessor = col.sortValue;
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = accessor(a);
      const vb = accessor(b);
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * factor;
      return String(va).localeCompare(String(vb)) * factor;
    });
  }, [filtered, sort, columns]);

  const pageCount = pageSize ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  const safePage = Math.min(page, pageCount - 1);
  const paged = pageSize ? sorted.slice(safePage * pageSize, safePage * pageSize + pageSize) : sorted;

  const toggleSort = (col: DataTableColumn<T>) => {
    if (!col.sortable || !col.sortValue) return;
    setSort((prev) => {
      if (!prev || prev.key !== col.key) return { key: col.key, dir: "asc" };
      if (prev.dir === "asc") return { key: col.key, dir: "desc" };
      return null;
    });
  };

  const onRowKeyDown = (event: React.KeyboardEvent, index: number, row: T) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const dir = event.key === "ArrowDown" ? 1 : -1;
      const target = bodyRef.current?.querySelectorAll<HTMLTableRowElement>("tr[data-row]")[
        index + dir
      ];
      target?.focus();
    } else if ((event.key === "Enter" || event.key === " ") && onRowClick) {
      event.preventDefault();
      onRowClick(row);
    }
  };

  const alignClass = (align?: string) =>
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";

  const hasToolbar = searchable || showColumnToggle || toolbar;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {hasToolbar ? (
        <div className="flex flex-wrap items-center gap-2">
          {searchable ? (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--so-muted-2)]" />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
                placeholder={labels.search}
                className="crm-input h-9 w-56 max-w-full pl-8 pr-3 text-sm"
              />
            </div>
          ) : null}
          {toolbar}
          <div className="ml-auto flex items-center gap-2">
            {showColumnToggle ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="so-focus-ring inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-[var(--so-border-strong)] bg-[var(--so-surface)] px-3 text-sm font-semibold text-[var(--so-text)] transition-colors hover:bg-[var(--so-surface-hover)]"
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                    {labels.columns}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel>{labels.columns}</DropdownMenuLabel>
                  {columns
                    .filter((c) => c.hideable !== false)
                    .map((c) => (
                      <label
                        key={c.key}
                        className="flex cursor-pointer select-none items-center gap-2 rounded-[8px] px-2.5 py-1.5 text-sm text-[var(--so-text)] hover:bg-[var(--so-surface-hover)]"
                      >
                        <input
                          type="checkbox"
                          checked={!hidden.has(c.key)}
                          onChange={() =>
                            setHidden((prev) => {
                              const next = new Set(prev);
                              if (next.has(c.key)) next.delete(c.key);
                              else next.add(c.key);
                              return next;
                            })
                          }
                        />
                        {c.header}
                      </label>
                    ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-[16px] border border-[var(--so-border)] bg-[var(--so-surface)] shadow-[var(--so-shadow-sm)]">
        <div className="max-h-[70vh] overflow-auto">
          <table className="min-w-full border-collapse text-left">
            <thead className="sticky top-0 z-[1] bg-[var(--so-surface-2)]">
              <tr className="border-b border-[var(--so-border)]">
                {visibleColumns.map((column) => {
                  const isSorted = sort?.key === column.key;
                  return (
                    <th
                      key={column.key}
                      scope="col"
                      aria-sort={
                        isSorted ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined
                      }
                      className={cn(
                        "whitespace-nowrap px-4 py-2.5 text-[0.6875rem] font-bold uppercase tracking-wide text-[var(--so-muted)]",
                        alignClass(column.align),
                      )}
                    >
                      {column.sortable && column.sortValue ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(column)}
                          className={cn(
                            "so-focus-ring inline-flex items-center gap-1 rounded transition-colors hover:text-[var(--so-text)]",
                            column.align === "right" && "flex-row-reverse",
                          )}
                        >
                          {column.header}
                          {isSorted ? (
                            sort!.dir === "asc" ? (
                              <ArrowUp className="h-3 w-3" />
                            ) : (
                              <ArrowDown className="h-3 w-3" />
                            )
                          ) : (
                            <ChevronsUpDown className="h-3 w-3 opacity-40" />
                          )}
                        </button>
                      ) : (
                        column.header
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody ref={bodyRef}>
              {loading ? (
                Array.from({ length: loadingRows }).map((_, r) => (
                  <tr key={r} className="border-b border-[var(--so-border)] last:border-0">
                    {visibleColumns.map((c) => (
                      <td key={c.key} className="px-4 py-3.5">
                        <Skeleton className="h-4" style={{ width: `${50 + ((r + c.key.length) % 40)}%` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : paged.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length}>
                    <EmptyState
                      icon={emptyIcon}
                      title={labels.empty}
                      description={labels.emptyDescription}
                    />
                  </td>
                </tr>
              ) : (
                paged.map((row, index) => (
                  <tr
                    key={getRowKey(row, index)}
                    data-row
                    tabIndex={onRowClick ? 0 : -1}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    onKeyDown={(e) => onRowKeyDown(e, index, row)}
                    className={cn(
                      "border-b border-[var(--so-border)] transition-colors last:border-0 focus:outline-none focus-visible:bg-[var(--so-accent-soft)]",
                      onRowClick && "cursor-pointer",
                      "hover:bg-[var(--so-surface-hover)]",
                      getRowClassName?.(row, index),
                    )}
                  >
                    {visibleColumns.map((column) => (
                      <td
                        key={column.key}
                        className={cn(
                          "px-4 py-3 text-sm text-[var(--so-text)]",
                          alignClass(column.align),
                          column.className,
                        )}
                      >
                        {column.render(row)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {pageSize && !loading && sorted.length > 0 ? (
        <div className="flex items-center justify-between gap-3 text-sm text-[var(--so-muted)]">
          <span>
            {sorted.length} {labels.results}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={safePage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="so-focus-ring inline-flex h-8 items-center gap-1 rounded-[8px] border border-[var(--so-border-strong)] bg-[var(--so-surface)] px-2.5 font-medium text-[var(--so-text)] transition-colors hover:bg-[var(--so-surface-hover)] disabled:pointer-events-none disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
              {labels.prev}
            </button>
            <span className="tabular-nums">
              {labels.page} {safePage + 1} {labels.of} {pageCount}
            </span>
            <button
              type="button"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              className="so-focus-ring inline-flex h-8 items-center gap-1 rounded-[8px] border border-[var(--so-border-strong)] bg-[var(--so-surface)] px-2.5 font-medium text-[var(--so-text)] transition-colors hover:bg-[var(--so-surface-hover)] disabled:pointer-events-none disabled:opacity-40"
            >
              {labels.next}
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
