import type { ReactNode } from "react";

export type TableColumn<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
};

type TableProps<T> = {
  columns: TableColumn<T>[];
  rows: T[];
  emptyText?: string;
};

export function Table<T>({ columns, rows, emptyText = "No data" }: TableProps<T>) {
  return (
    <div className="glass-surface overflow-hidden rounded-3xl">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left">
          <thead className="bg-white/65">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted"
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-white/55">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-8 text-center text-sm text-muted"
                >
                  {emptyText}
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={index} className="crm-hover-lift hover:bg-white/65">
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={`px-4 py-3.5 text-sm text-slate-700 ${column.className ?? ""}`}
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
  );
}
