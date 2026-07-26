"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ExternalLink, MapPin, Sparkles } from "lucide-react";

type DiscoveryData = Record<string, unknown>;

export function SalesLeadDiscoverySection({ leadId }: { leadId: string }) {
  const t = useTranslations("salesOperation.leadDiscovery");
  const [data, setData] = useState<{
    discovery?: DiscoveryData;
    stickers?: Array<Record<string, unknown>>;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/sales-operation/lead-discovery/leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadId, action: "detail" }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          if (!cancelled) setData(null);
          return;
        }
        if (!cancelled) setData({ discovery: json.discovery, stickers: json.stickers });
      } catch {
        if (!cancelled) setData(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  if (!data?.discovery) return null;
  const d = data.discovery;
  const enrichment =
    d.enrichment && typeof d.enrichment === "object"
      ? (d.enrichment as Record<string, unknown>)
      : {};
  const explanation =
    typeof enrichment.explanation === "string" ? enrichment.explanation : null;

  return (
    <div className="space-y-4">
      <div className="so-card space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[var(--so-text)]">{t("detail.title")}</p>
            <p className="mt-0.5 text-xs text-[var(--so-muted)]">{t("detail.subtitle")}</p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--so-accent-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--so-accent)]">
            <Sparkles className="h-3 w-3" />
            {String(d.taxiPotentialScore)}
          </span>
        </div>

        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <Info label={t("detail.status")} value={String(d.qualificationStatus)} />
          <Info
            label={t("detail.size")}
            value={`${String(d.employeeSizeEstimate)} · ${String(d.employeeSizeConfidence)}`}
          />
          <Info label={t("detail.mode")} value={String(d.qualificationMode)} />
          <Info label={t("detail.source")} value={String(d.source)} />
          {d.city ? <Info label={t("col.city")} value={String(d.city)} /> : null}
          {d.googleCategory ? (
            <Info label={t("detail.category")} value={String(d.googleCategory)} />
          ) : null}
          {d.rating != null ? (
            <Info
              label={t("detail.rating")}
              value={`${String(d.rating)}${d.reviewsCount != null ? ` (${String(d.reviewsCount)})` : ""}`}
            />
          ) : null}
          {d.email ? <Info label={t("detail.email")} value={String(d.email)} /> : null}
          {d.phone ? <Info label={t("detail.phone")} value={String(d.phone)} /> : null}
        </div>

        {d.address ? (
          <p className="flex items-start gap-1.5 text-xs text-[var(--so-muted)]">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {String(d.address)}
          </p>
        ) : null}

        {d.website || d.sourceUrl ? (
          <div className="flex flex-wrap gap-3 text-xs">
            {d.website ? (
              <a
                href={String(d.website).startsWith("http") ? String(d.website) : `https://${d.website}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-[var(--so-accent)]"
              >
                {t("detail.website")} <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
            {d.sourceUrl ? (
              <a
                href={String(d.sourceUrl)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-[var(--so-muted)]"
              >
                Google Maps <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
          </div>
        ) : null}

        {explanation ? (
          <p className="rounded-[10px] bg-[var(--so-surface-2)] px-3 py-2 text-xs leading-relaxed text-[var(--so-text)]">
            {explanation}
          </p>
        ) : null}

        {d.emailPersonalisationLine ? (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--so-muted)]">
              {t("detail.personalisation")}
            </p>
            <p className="mt-1 text-sm text-[var(--so-text)]">{String(d.emailPersonalisationLine)}</p>
          </div>
        ) : null}

        {d.recommendedDepartment ? (
          <Info label={t("detail.department")} value={String(d.recommendedDepartment)} />
        ) : null}

        {Array.isArray(d.recommendedUseCases) && (d.recommendedUseCases as unknown[]).length ? (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--so-muted)]">
              {t("detail.useCases")}
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-[var(--so-text)]">
              {(d.recommendedUseCases as string[]).slice(0, 6).map((u) => (
                <li key={u}>{u}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {Array.isArray(d.confirmedSignals) && (d.confirmedSignals as unknown[]).length ? (
        <div className="so-card space-y-2 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--so-muted)]">
            {t("detail.confirmed")}
          </p>
          <ul className="space-y-1.5 text-xs">
            {(d.confirmedSignals as Array<{ signal: string; evidence: string }>).slice(0, 10).map((s) => (
              <li key={s.signal} className="rounded-md bg-emerald-50/80 px-2.5 py-1.5 text-emerald-900">
                <strong>{s.signal}</strong>
                {s.evidence ? <span className="text-emerald-800/80"> — {s.evidence}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {Array.isArray(d.inferredSignals) && (d.inferredSignals as unknown[]).length ? (
        <div className="so-card space-y-2 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
            {t("detail.inferred")}
          </p>
          <ul className="space-y-1.5 text-xs text-[var(--so-muted)]">
            {(d.inferredSignals as Array<{ signal: string; reasoning: string }>).slice(0, 8).map((s) => (
              <li key={s.signal} className="rounded-md bg-amber-50/70 px-2.5 py-1.5">
                <strong className="text-amber-900">{s.signal}</strong>
                {s.reasoning ? <span> — {s.reasoning}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {Array.isArray(d.missingInformation) && (d.missingInformation as unknown[]).length ? (
        <div className="so-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--so-muted)]">
            {t("detail.missing")}
          </p>
          <ul className="mt-1 list-disc pl-4 text-xs text-[var(--so-muted)]">
            {(d.missingInformation as string[]).slice(0, 8).map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {data.stickers?.length ? (
        <div className="flex flex-wrap gap-1.5">
          {data.stickers.map((s) => (
            <span
              key={String(s.sticker_key)}
              className="rounded-full border border-[var(--so-border)] bg-[var(--so-surface)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--so-muted)]"
              title={String(s.reason ?? "")}
            >
              {String(s.sticker_key).replace(/_/g, " ")}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--so-muted)]">{label}</p>
      <p className="mt-0.5 font-medium text-[var(--so-text)]">{value}</p>
    </div>
  );
}
