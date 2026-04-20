import type { TokenDiagnostics } from "@/types/crm";

type TokenDiagnosticsPanelProps = {
  diagnostics: TokenDiagnostics[];
};

export function TokenDiagnosticsPanel({ diagnostics }: TokenDiagnosticsPanelProps) {
  return (
    <section className="glass-surface mb-4 rounded-3xl p-4">
      <div className="mb-3">
        <h3 className="text-base font-semibold text-slate-900">
          Token diagnostics ({diagnostics.length} clients)
        </h3>
        <p className="text-sm text-muted">Live auth/orders status from API tokens</p>
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        {diagnostics.map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-border bg-white px-3 py-2"
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
          </div>
        ))}
      </div>
    </section>
  );
}
