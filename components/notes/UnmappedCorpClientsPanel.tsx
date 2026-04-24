import type { UnmappedCorpClientSummary } from "@/lib/supabase";

type UnmappedCorpClientsPanelProps = {
  rows: UnmappedCorpClientSummary[];
};

function formatDate(value: string | null) {
  if (!value) return "n/a";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function UnmappedCorpClientsPanel({ rows }: UnmappedCorpClientsPanelProps) {
  return (
    <section className="glass-surface mb-4 rounded-3xl p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="crm-section-title">Unmapped corp_client_id ({rows.length})</h3>
          <p className="crm-subtitle">
            Latest unmapped clients from recent orders sample. Use this to quickly extend mapping.
          </p>
        </div>
        <a
          href="/api/client-mapping-export-unmapped"
          className="inline-flex rounded-xl border border-border bg-white/85 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-white"
        >
          Export unmapped CSV
        </a>
      </div>

      <div className="overflow-auto rounded-2xl border border-border/70 bg-white/80">
        <table className="min-w-full text-xs">
          <thead className="bg-[#f6f6f8] text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left">corp_client_id</th>
              <th className="px-3 py-2 text-right">Orders in sample</th>
              <th className="px-3 py-2 text-right">Last seen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {rows.map((row) => (
              <tr key={row.corpClientId} className="hover:bg-white">
                <td className="px-3 py-2 font-mono text-[11px] text-slate-800">{row.corpClientId}</td>
                <td className="px-3 py-2 text-right text-slate-900">{row.ordersInSample}</td>
                <td className="px-3 py-2 text-right text-slate-700">{formatDate(row.lastSeenAt)}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-muted">
                  No unmapped corp_client_id in recent sample.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
