import type { TokenDiagnostics } from "@/types/crm";

type TokenDiagnosticsPanelProps = {
  diagnostics: TokenDiagnostics[];
};

export function TokenDiagnosticsPanel({ diagnostics }: TokenDiagnosticsPanelProps) {
  return (
    <section className="glass-surface mb-4 rounded-3xl p-4">
      <div className="mb-3">
        <h3 className="crm-section-title">
          Token diagnostics ({diagnostics.length} clients)
        </h3>
        <p className="crm-subtitle">Live auth/orders status from API tokens</p>
        <a
          href="/api/client-mapping-export"
          className="mt-2 inline-flex rounded-xl border border-border bg-white/85 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-white"
        >
          Export client mapping CSV
        </a>
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        {diagnostics.map((item) => (
          <div
            key={item.label}
            className="crm-hover-lift rounded-xl border border-white/70 bg-white/75 px-3 py-2"
          >
            <p className="text-sm font-semibold text-slate-900">{item.tokenLabel}</p>
            <p className="text-xs text-muted">{item.clientName ?? "No client name"}</p>
            <p className="text-xs text-slate-500">Client ID: {item.clientId ?? "n/a"}</p>
            <p className="mt-1 text-xs text-slate-600">
              Orders:{" "}
              <span
                className={
                  item.ordersStatus === "ok"
                    ? "font-semibold text-emerald-700"
                    : item.ordersStatus === "feature_disabled"
                      ? "font-semibold text-amber-700"
                      : "font-semibold text-rose-700"
                }
              >
                {item.ordersStatus}
              </span>
            </p>
            {item.message ? (
              <p className="mt-1 break-words rounded-md bg-slate-100 px-2 py-1 text-[11px] leading-relaxed text-slate-700">
                {item.message}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
