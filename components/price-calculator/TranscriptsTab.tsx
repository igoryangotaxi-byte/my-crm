"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { describeTranscriptMotRules } from "@/lib/transcript-mot-tariff-description";
import type { TranscriptMotRules } from "@/lib/transcript-mot-tariff-rules";
import { parseTranscriptWorkbookBuffer } from "@/lib/xlsx-transcript-parser";
import type { PriceCalculatorTranscriptRowResult } from "@/types/crm";

const MAX_TRIPS_SUGGESTIONS = 300;

type DecouplingSuggestionApi = {
  label: string;
  rationale: string;
  rules: TranscriptMotRules;
  simulatedPortfolioDecouplingPct: number;
  simulatedSumClient: number;
  deltaVsCurrentPct: number;
};

const secondaryButtonClass =
  "inline-flex h-10 items-center justify-center rounded-xl border border-slate-300/90 bg-white/90 px-4 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-white";

const CHUNK_SIZE = 20;

function formatMoneyIls(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPct(value: number | null) {
  if (value === null) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

type TariffOption = { code: string; label: string; sortOrder: number };

export function TranscriptsTab() {
  const t = useTranslations("priceCalculatorPage");
  const locale = useLocale();
  const tariffDescLocale = locale === "he" ? "he" : "en";
  const fileRef = useRef<HTMLInputElement>(null);
  const [tariffs, setTariffs] = useState<TariffOption[]>([]);
  const [tariffCode, setTariffCode] = useState("");
  const [loadTariffsError, setLoadTariffsError] = useState<string | null>(null);
  const [parsedCount, setParsedCount] = useState(0);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [pendingRows, setPendingRows] = useState<
    { orderIndex: number; addressA: string; addressB: string; tripIso: string; tripDisplay: string }[]
  >([]);
  const [results, setResults] = useState<PriceCalculatorTranscriptRowResult[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);

  const [decouplingModalOpen, setDecouplingModalOpen] = useState(false);
  const [tariffDescriptionText, setTariffDescriptionText] = useState<string | null>(null);
  const [tariffDescriptionLoading, setTariffDescriptionLoading] = useState(false);
  const [targetPctInput, setTargetPctInput] = useState("");
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<DecouplingSuggestionApi[] | null>(null);
  const [suggestionsMeta, setSuggestionsMeta] = useState<{
    tripsUsed: number;
    tripsTruncated: boolean;
  } | null>(null);
  const [decouplingSource, setDecouplingSource] = useState<"openai" | "deterministic" | null>(null);
  const [deterministicNote, setDeterministicNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/price-calculator/transcript-tariffs", { cache: "no-store" });
        const data = (await response.json()) as {
          ok?: boolean;
          tariffs?: TariffOption[];
          error?: string;
        };
        if (cancelled) return;
        if (!response.ok || !data.ok || !data.tariffs?.length) {
          setLoadTariffsError(data.error ?? t("transcripts.loadTariffsFailed"));
          return;
        }
        setTariffs(data.tariffs);
        setTariffCode((current) => current || data.tariffs![0]!.code);
      } catch {
        if (!cancelled) setLoadTariffsError(t("transcripts.loadTariffsFailed"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const handleFile = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBatchError(null);
    setResults([]);
    setProgress(null);
    const buffer = await file.arrayBuffer();
    const { rows, errors } = parseTranscriptWorkbookBuffer(buffer);
    setParseErrors(errors);
    setParsedCount(rows.length);
    setPendingRows(
      rows.map((r) => ({
        orderIndex: r.rowNumber,
        addressA: r.addressA,
        addressB: r.addressB,
        tripIso: r.tripAt.toISOString(),
        tripDisplay: r.tripDisplay,
      })),
    );
  }, []);

  const runBatch = useCallback(async () => {
    if (!tariffCode || pendingRows.length === 0) {
      setBatchError(t("transcripts.selectTariffAndFile"));
      return;
    }
    setRunning(true);
    setBatchError(null);
    setResults([]);
    const all: PriceCalculatorTranscriptRowResult[] = [];
    const total = pendingRows.length;
    let done = 0;
    setProgress({ done: 0, total });
    try {
      for (let i = 0; i < pendingRows.length; i += CHUNK_SIZE) {
        const chunk = pendingRows.slice(i, i + CHUNK_SIZE);
        const response = await fetch("/api/price-calculator/transcript-rows", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tariffCode, rows: chunk }),
        });
        const data = (await response.json()) as {
          ok?: boolean;
          results?: PriceCalculatorTranscriptRowResult[];
          error?: string;
        };
        if (!response.ok || !data.ok) {
          if (response.status === 503) {
            setBatchError(t("transcripts.mapsKeyMissing"));
          } else {
            setBatchError(data.error ?? t("transcripts.batchFailed"));
          }
          break;
        }
        if (data.results) all.push(...data.results);
        done += chunk.length;
        setProgress({ done, total });
      }
      setResults(all);
    } catch {
      setBatchError(t("transcripts.networkError"));
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }, [pendingRows, tariffCode, t]);

  const transcriptTotals = useMemo(() => {
    let totalClient = 0;
    let totalDriver = 0;
    let okRows = 0;
    for (const r of results) {
      if (r.error) continue;
      if (r.clientPrice == null || r.driverPrice == null) continue;
      totalClient += r.clientPrice;
      totalDriver += r.driverPrice;
      okRows += 1;
    }
    const totalDecoupling = totalClient - totalDriver;
    const totalDecouplingPct =
      totalClient > 0 ? (totalDecoupling / totalClient) * 100 : null;
    return {
      totalClient,
      totalDriver,
      totalDecoupling,
      totalDecouplingPct,
      okRows,
    };
  }, [results]);

  useEffect(() => {
    if (!decouplingModalOpen) return;
    let cancelled = false;
    void (async () => {
      setTariffDescriptionLoading(true);
      try {
        const response = await fetch(
          `/api/price-calculator/transcript-tariffs?describe=1&locale=${tariffDescLocale}`,
          { cache: "no-store" },
        );
        const data = (await response.json()) as {
          ok?: boolean;
          tariffs?: Array<{ code: string; description?: string }>;
          error?: string;
        };
        if (cancelled) return;
        if (!response.ok || !data.ok || !data.tariffs) {
          setTariffDescriptionText(null);
          return;
        }
        const row = data.tariffs.find((x) => x.code === tariffCode);
        setTariffDescriptionText(typeof row?.description === "string" ? row.description : null);
      } catch {
        if (!cancelled) setTariffDescriptionText(null);
      } finally {
        if (!cancelled) setTariffDescriptionLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [decouplingModalOpen, tariffCode, tariffDescLocale]);

  const openDecouplingModal = useCallback(() => {
    setSuggestions(null);
    setSuggestionsMeta(null);
    setSuggestionsError(null);
    setDecouplingSource(null);
    setDeterministicNote(null);
    const pct = transcriptTotals.totalDecouplingPct;
    const base = pct ?? 10;
    const next = Math.min(100, Math.round((base + 5) * 10) / 10);
    setTargetPctInput(String(next));
    setDecouplingModalOpen(true);
  }, [transcriptTotals.totalDecouplingPct]);

  const closeDecouplingModal = useCallback(() => {
    setDecouplingModalOpen(false);
  }, []);

  const handleSuggestTariffs = useCallback(async () => {
    const trips = results
      .filter((r) => !r.error && r.km != null && r.driverPrice != null && r.tripIso)
      .map((r) => ({
        km: r.km as number,
        tripIso: r.tripIso,
        driverPrice: r.driverPrice as number,
      }));
    if (trips.length === 0) {
      setSuggestionsError(t("transcripts.decouplingModal.errorSuggest"));
      return;
    }
    const normalized = targetPctInput.trim().replace(",", ".");
    const targetDecouplingPct = Number(normalized);
    if (!Number.isFinite(targetDecouplingPct)) {
      setSuggestionsError(t("transcripts.decouplingModal.errorSuggest"));
      return;
    }

    setSuggestionsLoading(true);
    setSuggestionsError(null);
    try {
      const response = await fetch("/api/price-calculator/transcript-decoupling-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tariffCode,
          targetDecouplingPct,
          trips,
        }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        suggestions?: DecouplingSuggestionApi[];
        tripsUsed?: number;
        tripsTruncated?: boolean;
        currentPortfolioDecouplingPct?: number;
        source?: "openai" | "deterministic";
        deterministicNote?: string;
      };
      if (!response.ok || !data.ok || !data.suggestions) {
        setSuggestionsError(data.error ?? t("transcripts.decouplingModal.errorSuggest"));
        setSuggestions(null);
        setSuggestionsMeta(null);
        setDecouplingSource(null);
        setDeterministicNote(null);
        return;
      }
      setSuggestions(data.suggestions);
      setSuggestionsMeta({
        tripsUsed: data.tripsUsed ?? trips.length,
        tripsTruncated: Boolean(data.tripsTruncated),
      });
      setDecouplingSource(data.source === "openai" ? "openai" : "deterministic");
      setDeterministicNote(
        data.source === "deterministic" && typeof data.deterministicNote === "string"
          ? data.deterministicNote
          : null,
      );
    } catch {
      setSuggestionsError(t("transcripts.decouplingModal.errorSuggest"));
      setSuggestions(null);
      setSuggestionsMeta(null);
      setDecouplingSource(null);
      setDeterministicNote(null);
    } finally {
      setSuggestionsLoading(false);
    }
  }, [results, tariffCode, targetPctInput, t]);

  const exportXlsx = useCallback(async () => {
    if (results.length === 0) return;
    const XLSX = await import("xlsx");
    const header = [
      t("transcripts.colOrder"),
      t("transcripts.colTripTime"),
      t("transcripts.colPointA"),
      t("transcripts.colPointB"),
      t("transcripts.colKm"),
      t("transcripts.colMin"),
      t("transcripts.colClient"),
      t("transcripts.colDriver"),
      t("transcripts.colDecoupling"),
      t("transcripts.colDecouplingPct"),
      t("transcripts.colError"),
    ];
    const dataRows = results.map((r) => [
      r.orderIndex,
      r.tripDisplay ?? r.tripIso,
      r.pointA,
      r.pointB,
      r.km ?? "",
      r.min ?? "",
      r.clientPrice ?? "",
      r.driverPrice ?? "",
      r.decoupling ?? "",
      r.decouplingPct ?? "",
      r.error ?? "",
    ]);
    const sheet = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Transcripts");
    XLSX.writeFile(book, `transcripts-${tariffCode.replace(/[/\\]/g, "_")}.xlsx`);
  }, [results, tariffCode, t]);

  const totalsNegativeDecoupling = transcriptTotals.okRows > 0 && transcriptTotals.totalDecoupling < 0;
  const summaryGridClass = totalsNegativeDecoupling
    ? "grid gap-3 rounded-2xl border border-rose-400/75 bg-rose-50/95 p-3 md:grid-cols-2 xl:grid-cols-4"
    : "grid gap-3 md:grid-cols-2 xl:grid-cols-4";
  const summaryCardClass = totalsNegativeDecoupling
    ? "rounded-2xl border border-rose-200/90 bg-white/95 p-4 shadow-sm"
    : "rounded-2xl border border-white/70 bg-white/85 p-4";

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{t("transcripts.intro")}</p>
      <p className="text-xs text-muted">{t("transcripts.sameMapsKeyAsRequestRides")}</p>
      <p className="text-xs text-muted">{t("transcripts.addressLanguagesNote")}</p>
      <p className="text-xs text-muted">{t("transcripts.pastTripsRoutingNote")}</p>

      {loadTariffsError ? (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{loadTariffsError}</p>
      ) : null}

      {results.length > 0 && transcriptTotals.okRows > 0 ? (
        <div className={summaryGridClass}>
          <div className={summaryCardClass}>
            <p className="text-xs text-slate-500">{t("transcripts.totalClientPrice")}</p>
            <p className="mt-1 text-xl font-semibold text-slate-900">
              {formatMoneyIls(transcriptTotals.totalClient)}
            </p>
          </div>
          <div className={summaryCardClass}>
            <p className="text-xs text-slate-500">{t("transcripts.totalDriverPrice")}</p>
            <p className="mt-1 text-xl font-semibold text-slate-900">
              {formatMoneyIls(transcriptTotals.totalDriver)}
            </p>
          </div>
          <div className={summaryCardClass}>
            <p className="text-xs text-slate-500">{t("transcripts.totalDecoupling")}</p>
            <p
              className={`mt-1 text-xl font-semibold ${
                transcriptTotals.totalDecoupling < 0 ? "text-rose-800" : "text-slate-900"
              }`}
            >
              {formatMoneyIls(transcriptTotals.totalDecoupling)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => openDecouplingModal()}
            title={t("transcripts.decouplingModal.hintClickTotalPct")}
            className={`${summaryCardClass} w-full cursor-pointer text-left transition hover:border-sky-300/80 hover:bg-white`}
          >
            <p className="text-xs text-slate-500">{t("transcripts.totalDecouplingPct")}</p>
            <p
              className={`mt-1 text-xl font-semibold ${
                transcriptTotals.totalDecouplingPct != null && transcriptTotals.totalDecouplingPct < 0
                  ? "text-rose-800"
                  : "text-slate-900"
              }`}
            >
              {formatPct(transcriptTotals.totalDecouplingPct)}
            </p>
            <p className="mt-2 text-[11px] text-sky-700 underline decoration-sky-400/70 underline-offset-2">
              {t("transcripts.decouplingModal.hintClickTotalPct")}
            </p>
          </button>
        </div>
      ) : null}

      <label className="block">
        <span className="crm-label mb-1 block">{t("transcripts.tariffLabel")}</span>
        <select
          className="crm-input h-11 w-full max-w-xl px-3 text-sm"
          value={tariffCode}
          onChange={(e) => setTariffCode(e.target.value)}
          disabled={!tariffs.length}
        >
          {tariffs.map((opt) => (
            <option key={opt.code} value={opt.code}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => void handleFile(e)}
        />
        <button type="button" className={secondaryButtonClass} onClick={() => fileRef.current?.click()}>
          {t("transcripts.uploadXlsx")}
        </button>
        <button
          type="button"
          disabled={running || !pendingRows.length || !tariffCode}
          className="crm-button-primary h-10 rounded-xl px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => void runBatch()}
        >
          {running ? t("transcripts.running") : t("transcripts.run")}
        </button>
        {parsedCount > 0 ? (
          <span className="text-sm text-muted">
            {t("transcripts.rowsLoaded", { count: parsedCount })}
          </span>
        ) : null}
        {results.length > 0 ? (
          <button type="button" className={secondaryButtonClass} onClick={() => void exportXlsx()}>
            {t("transcripts.exportXlsx")}
          </button>
        ) : null}
      </div>

      {parseErrors.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-amber-800">
          {parseErrors.slice(0, 12).map((err, i) => (
            <li key={i}>{err}</li>
          ))}
          {parseErrors.length > 12 ? <li>…</li> : null}
        </ul>
      ) : null}

      {batchError ? (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{batchError}</p>
      ) : null}

      {progress && running ? (
        <p className="text-sm text-muted">
          {t("transcripts.progress", { done: progress.done, total: progress.total })}
        </p>
      ) : null}

      {results.length > 0 ? (
        <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm">
          <table className="min-w-[1040px] w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/90">
                <th className="px-3 py-2 font-semibold text-slate-800">{t("transcripts.colOrder")}</th>
                <th className="px-3 py-2 font-semibold text-slate-800">{t("transcripts.colTripTime")}</th>
                <th className="px-3 py-2 font-semibold text-slate-800">{t("transcripts.colPointA")}</th>
                <th className="px-3 py-2 font-semibold text-slate-800">{t("transcripts.colPointB")}</th>
                <th className="px-3 py-2 font-semibold text-slate-800">{t("transcripts.colKm")}</th>
                <th className="px-3 py-2 font-semibold text-slate-800">{t("transcripts.colMin")}</th>
                <th className="px-3 py-2 font-semibold text-slate-800">{t("transcripts.colClient")}</th>
                <th className="px-3 py-2 font-semibold text-slate-800">{t("transcripts.colDriver")}</th>
                <th className="px-3 py-2 font-semibold text-slate-800">{t("transcripts.colDecoupling")}</th>
                <th className="px-3 py-2 font-semibold text-slate-800">{t("transcripts.colDecouplingPct")}</th>
                <th className="px-3 py-2 font-semibold text-slate-800">{t("transcripts.colError")}</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, idx) => (
                <tr key={`${r.orderIndex}-${idx}`} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2 text-slate-800">{r.orderIndex}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-700">{r.tripDisplay ?? r.tripIso}</td>
                  <td className="max-w-[180px] truncate px-3 py-2 text-slate-700" title={r.pointA}>
                    {r.pointA}
                  </td>
                  <td className="max-w-[180px] truncate px-3 py-2 text-slate-700" title={r.pointB}>
                    {r.pointB}
                  </td>
                  <td className="px-3 py-2 text-slate-800">{r.km ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-800">{r.min ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-800">{formatMoneyIls(r.clientPrice)}</td>
                  <td className="px-3 py-2 text-slate-800">{formatMoneyIls(r.driverPrice)}</td>
                  <td className="px-3 py-2 text-slate-800">{formatMoneyIls(r.decoupling)}</td>
                  <td className="px-3 py-2 text-slate-800">{formatPct(r.decouplingPct)}</td>
                  <td className="max-w-[220px] truncate px-3 py-2 text-rose-700" title={r.error ?? ""}>
                    {r.error ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {results.some((r) => r.error) ? (
        <p className="text-xs text-muted">{t("transcripts.rowErrorsNote")}</p>
      ) : null}

      {decouplingModalOpen ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 px-4 py-6"
          onClick={() => closeDecouplingModal()}
        >
          <div
            className="crm-modal-surface max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl p-4 lg:p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-semibold text-slate-900">{t("transcripts.decouplingModal.title")}</h3>
              <button
                type="button"
                onClick={() => closeDecouplingModal()}
                className="shrink-0 rounded-xl border border-white/70 bg-white/70 px-3 py-1.5 text-sm font-semibold text-slate-700 backdrop-blur-sm transition hover:bg-white"
              >
                {t("transcripts.decouplingModal.close")}
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-slate-200/90 bg-white/90 p-3">
              <p className="crm-label text-xs">{t("transcripts.decouplingModal.currentTariff")}</p>
              <p className="mt-1 font-mono text-sm font-medium text-slate-800">{tariffCode}</p>
              <p className="mt-1 text-xs text-slate-600">
                {tariffs.find((x) => x.code === tariffCode)?.label ?? ""}
              </p>
              {tariffDescriptionLoading ? (
                <p className="mt-2 text-sm text-slate-600">{t("transcripts.decouplingModal.loadingTariffText")}</p>
              ) : tariffDescriptionText ? (
                <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-800">
                  {tariffDescriptionText}
                </pre>
              ) : (
                <p className="mt-2 text-sm text-slate-500">—</p>
              )}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200/90 bg-slate-50/90 p-3">
                <p className="text-xs text-slate-500">{t("transcripts.decouplingModal.currentPortfolioPct")}</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">
                  {formatPct(transcriptTotals.totalDecouplingPct)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200/90 bg-white/90 p-3">
                <label className="block">
                  <span className="crm-label mb-1 block text-xs">{t("transcripts.decouplingModal.targetPctLabel")}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={targetPctInput}
                    onChange={(e) => setTargetPctInput(e.target.value)}
                    className="crm-input h-10 w-full rounded-lg border-slate-200 px-3 text-sm"
                  />
                </label>
                <p className="mt-2 text-[11px] leading-snug text-slate-600">{t("transcripts.decouplingModal.targetPctHint")}</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={suggestionsLoading}
                onClick={() => void handleSuggestTariffs()}
                className="crm-button-primary h-10 rounded-xl px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              >
                {suggestionsLoading
                  ? t("transcripts.decouplingModal.loadingSuggestions")
                  : t("transcripts.decouplingModal.suggestButton")}
              </button>
            </div>

            {suggestionsMeta?.tripsTruncated ? (
              <p className="mt-3 text-xs text-amber-800">
                {t("transcripts.decouplingModal.tripsTruncated", {
                  max: MAX_TRIPS_SUGGESTIONS,
                  total: results.filter((r) => !r.error && r.km != null && r.driverPrice != null).length,
                })}
              </p>
            ) : null}

            {decouplingSource === "deterministic" ? (
              <div className="mt-3 rounded-xl border border-amber-200/90 bg-amber-50/95 px-3 py-2 text-sm text-amber-950">
                <p>{t("transcripts.decouplingModal.deterministicBanner")}</p>
                {deterministicNote ? (
                  <p className="mt-2 font-mono text-xs text-amber-900/90">{deterministicNote}</p>
                ) : null}
              </div>
            ) : null}

            {suggestionsError ? (
              <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{suggestionsError}</p>
            ) : null}

            {suggestions && suggestions.length > 0 ? (
              <div className="mt-5 space-y-4">
                {suggestions.map((s, idx) => (
                  <div
                    key={`${s.label}-${idx}`}
                    className="rounded-2xl border border-slate-200/90 bg-white/95 p-4 shadow-sm"
                  >
                    <p className="text-sm font-semibold text-slate-900">
                      {idx + 1}. {s.label}
                    </p>
                    <p className="mt-2 text-sm text-slate-700">{s.rationale}</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <div className="rounded-lg bg-slate-50 px-3 py-2">
                        <p className="text-[11px] text-slate-500">{t("transcripts.decouplingModal.simulatedPct")}</p>
                        <p className="text-base font-semibold text-slate-900">
                          {formatPct(s.simulatedPortfolioDecouplingPct)}
                        </p>
                      </div>
                      <div className="rounded-lg bg-slate-50 px-3 py-2">
                        <p className="text-[11px] text-slate-500">{t("transcripts.decouplingModal.deltaVsCurrent")}</p>
                        <p className="text-base font-semibold text-slate-900">
                          {formatPct(s.deltaVsCurrentPct)}
                        </p>
                      </div>
                    </div>
                    <details className="mt-3">
                      <summary className="cursor-pointer text-sm font-medium text-sky-800">
                        {t("transcripts.decouplingModal.rulesSummary")}
                      </summary>
                      <pre className="mt-2 whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-800">
                        {describeTranscriptMotRules(s.rules, tariffDescLocale)}
                      </pre>
                    </details>
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm font-medium text-slate-700">
                        {t("transcripts.decouplingModal.rulesJson")}
                      </summary>
                      <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-slate-900/95 p-3 font-mono text-[11px] text-emerald-100">
                        {JSON.stringify(s.rules, null, 2)}
                      </pre>
                    </details>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
