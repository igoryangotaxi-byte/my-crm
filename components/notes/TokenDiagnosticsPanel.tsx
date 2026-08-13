import type { TokenDiagnostics } from "@/types/crm";

type TokenDiagnosticsPanelProps = {
  diagnostics: TokenDiagnostics[];
};

export function TokenDiagnosticsPanel({ diagnostics }: TokenDiagnosticsPanelProps) {
  const tokenCount = new Set(diagnostics.map((d) => d.tokenLabel)).size;
  const entryCount = diagnostics.length;
  const yangoClientRows = diagnostics.filter((d) => Boolean(d.clientId)).length;
  const allRowsAreClients = entryCount > 0 && yangoClientRows === entryCount;
  const titleDetail = allRowsAreClients
    ? `${tokenCount} token${tokenCount === 1 ? "" : "s"} · ${yangoClientRows} Yango client${yangoClientRows === 1 ? "" : "s"}`
    : `${tokenCount} token${tokenCount === 1 ? "" : "s"} · ${entryCount} row${entryCount === 1 ? "" : "s"}${
        yangoClientRows > 0 ? ` (${yangoClientRows} with client id)` : ""
      }`;

  return (
    <section className="so-card mb-4 rounded-[12px] p-4">
      <div className="mb-3">
        <h3 className="ycds-h2 text-[var(--so-text)]">Token diagnostics ({titleDetail})</h3>
        <p className="mt-1 text-sm text-[var(--so-muted)]">Live auth/orders status from API tokens</p>
        <a
          href="/api/client-mapping-export"
          className="so-focus-ring mt-2 inline-flex rounded-[8px] border border-[var(--so-border-strong)] bg-[var(--so-surface)] px-3 py-1.5 text-xs font-medium text-[var(--so-text)] transition hover:bg-[var(--so-surface-hover)]"
        >
          Export client mapping CSV
        </a>
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        {diagnostics.map((item) => (
          <div
            key={item.label}
            className="rounded-[12px] border border-[var(--so-border)] bg-[var(--so-surface)] px-3 py-2 shadow-[var(--so-shadow-xs)]"
          >
            <p className="text-sm font-medium text-[var(--so-text)]">{item.tokenLabel}</p>
            <p className="text-xs text-[var(--so-muted)]">{item.clientName ?? "No client name"}</p>
            <p className="ycds-mono text-xs text-[var(--so-muted-2)]">Client ID: {item.clientId ?? "n/a"}</p>
            <p className="mt-1 text-xs text-[var(--so-muted)]">
              Orders:{" "}
              <span
                className={
                  item.ordersStatus === "ok"
                    ? "font-medium text-[var(--success)]"
                    : item.ordersStatus === "feature_disabled"
                      ? "font-medium text-[var(--warning)]"
                      : "font-medium text-[var(--destructive)]"
                }
              >
                {item.ordersStatus}
              </span>
            </p>
            {item.message ? (
              <p className="mt-1 break-words rounded-md bg-[var(--so-surface-2)] px-2 py-1 text-[11px] leading-relaxed text-[var(--so-muted)]">
                {item.message}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
