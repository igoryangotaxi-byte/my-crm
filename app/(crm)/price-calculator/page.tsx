"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  segmentedTabInactiveClass,
  segmentedTabSelectedClass,
  segmentedTabTrackClass,
} from "@/components/crm/segmented-tab-classes";
import { TranscriptsTab } from "@/components/price-calculator/TranscriptsTab";
import {
  calculateMoneTariff,
  calculateYangoDriversTariff,
  parseTimeToMinutes,
  weekdayOptions,
  type MoneBreakdown,
  type WeekdayKey,
  type YangoDriversBreakdown,
} from "@/lib/price-calculator-formulas";
import type { TariffHealthResult, TieredClientTariff } from "@/types/crm";

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatSignedMoney(value: number) {
  const formatted = formatMoney(Math.abs(value));
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `−${formatted}`;
  return formatted;
}

function formatSignedPct(value: number | null) {
  if (value === null) return "n/a";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function describeTieredTariff(tariff: TieredClientTariff) {
  const bandParts = tariff.bands.map((band) =>
    band.km == null
      ? `${band.ratePerKm.toFixed(2)}/km on remaining distance`
      : `${band.ratePerKm.toFixed(2)}/km for first ${band.km} km`,
  );
  return `Base ${tariff.basePrice.toFixed(2)}; ${bandParts.join("; ")}`;
}

type PriceCalculatorTab = "compare" | "health" | "transcripts";

function CompareDriverPriceTab() {
  const [tripKm, setTripKm] = useState("");
  const [tripMin, setTripMin] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState<WeekdayKey>("monday");
  const [tripTime, setTripTime] = useState("09:00");
  const [yangoDriversBreakdown, setYangoDriversBreakdown] =
    useState<YangoDriversBreakdown | null>(null);
  const [moneBreakdown, setMoneBreakdown] = useState<MoneBreakdown | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const km = Number(tripKm);
    const min = Number(tripMin);

    if (
      Number.isNaN(km) ||
      Number.isNaN(min) ||
      km < 0 ||
      min < 0 ||
      (km === 0 && min === 0)
    ) {
      setYangoDriversBreakdown(null);
      setMoneBreakdown(null);
      setError("Enter valid positive values for Trip Km and Trip Min");
      return;
    }

    const timeMinutes = parseTimeToMinutes(tripTime);
    if (timeMinutes === null) {
      setYangoDriversBreakdown(null);
      setMoneBreakdown(null);
      setError("Enter a valid trip time");
      return;
    }

    setYangoDriversBreakdown(calculateYangoDriversTariff(km, min, dayOfWeek, timeMinutes));
    setMoneBreakdown(calculateMoneTariff(km, min, dayOfWeek, timeMinutes));
  };

  const deltaAmount =
    moneBreakdown && yangoDriversBreakdown
      ? moneBreakdown.total - yangoDriversBreakdown.total
      : null;
  const deltaPercent =
    deltaAmount !== null && yangoDriversBreakdown && yangoDriversBreakdown.total > 0
      ? (deltaAmount / yangoDriversBreakdown.total) * 100
      : null;

  return (
    <>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-900">Trip Km</span>
          <input
            type="number"
            min="0"
            step="0.1"
            value={tripKm}
            onChange={(event) => setTripKm(event.target.value)}
            placeholder="e.g. 12.5"
            className="crm-input h-11 w-full px-3 text-sm"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-900">Trip Min</span>
          <input
            type="number"
            min="0"
            step="1"
            value={tripMin}
            onChange={(event) => setTripMin(event.target.value)}
            placeholder="e.g. 24"
            className="crm-input h-11 w-full px-3 text-sm"
          />
        </label>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-900">Day of Week</span>
            <select
              value={dayOfWeek}
              onChange={(event) => setDayOfWeek(event.target.value as WeekdayKey)}
              className="crm-input h-11 w-full px-3 text-sm"
            >
              {weekdayOptions.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-900">Trip Time</span>
            <input
              type="time"
              value={tripTime}
              onChange={(event) => setTripTime(event.target.value)}
              className="crm-input h-11 w-full px-3 text-sm"
            />
          </label>
        </div>

        {error ? (
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        ) : null}

        <button
          type="submit"
          className="crm-button-primary h-11 w-full rounded-xl text-sm font-semibold"
        >
          Submit
        </button>
      </form>

      {yangoDriversBreakdown && moneBreakdown ? (
        <div className="mt-5 space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <article className="crm-hover-lift rounded-2xl border border-white/70 bg-white/75 p-4">
              <p className="text-xs uppercase tracking-wide text-muted">Yango Drivers Tariff</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">
                {formatMoney(yangoDriversBreakdown.total)}
              </p>
            </article>
            <article className="crm-hover-lift rounded-2xl border border-white/70 bg-white/75 p-4">
              <p className="text-xs uppercase tracking-wide text-muted">
                taxitariff.co.il mone price
              </p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">
                {formatMoney(moneBreakdown.total)}
              </p>
              <p className="mt-1 text-xs text-muted">
                {weekdayOptions.find((item) => item.key === dayOfWeek)?.label} at {tripTime}
              </p>
            </article>
          </div>

          <div className="rounded-2xl border border-white/70 bg-white/75 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">Difference (mone vs Yango Drivers)</p>
            <p className="mt-1 text-xl font-semibold text-slate-900">
              {deltaAmount !== null ? formatMoney(deltaAmount) : "n/a"}
            </p>
            <p className="mt-1 text-xs text-muted">
              {deltaPercent === null
                ? "Cannot calculate percentage difference"
                : deltaPercent > 0
                  ? `mone price is ${Math.abs(deltaPercent).toFixed(2)}% higher than Yango Drivers Tariff`
                  : deltaPercent < 0
                    ? `mone price is ${Math.abs(deltaPercent).toFixed(2)}% lower than Yango Drivers Tariff`
                    : "mone price equals Yango Drivers Tariff"}
            </p>
          </div>

          <div className="rounded-2xl border border-white/70 bg-white/75">
            <div className="border-b border-white/70 px-4 py-3 text-sm font-semibold text-slate-800">
              Yango Drivers Tariff Breakdown
            </div>
            <div className="divide-y divide-white/70">
              <div className="flex items-center justify-between px-4 py-3 text-slate-800">
                <span className="font-semibold">{yangoDriversBreakdown.baseFee.toFixed(2)}</span>
                <span className="text-muted">Base fee</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3 text-slate-800">
                <span className="font-semibold">
                  {yangoDriversBreakdown.distanceFirst10Cost.toFixed(2)}
                </span>
                <span className="text-muted">
                  First 10 km ({yangoDriversBreakdown.kmFirst10.toFixed(2)} x{" "}
                  {yangoDriversBreakdown.rate1.toFixed(2)})
                </span>
              </div>
              <div className="flex items-center justify-between px-4 py-3 text-slate-800">
                <span className="font-semibold">
                  {yangoDriversBreakdown.distanceAfter10Cost.toFixed(2)}
                </span>
                <span className="text-muted">
                  After 10 km ({yangoDriversBreakdown.kmAfter10.toFixed(2)} x{" "}
                  {yangoDriversBreakdown.rate2.toFixed(2)})
                </span>
              </div>
              <div className="flex items-center justify-between px-4 py-3 text-slate-800">
                <span className="font-semibold">{yangoDriversBreakdown.timeCost.toFixed(2)}</span>
                <span className="text-muted">
                  Time ({yangoDriversBreakdown.mins.toFixed(2)} min x{" "}
                  {yangoDriversBreakdown.rate3.toFixed(2)})
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/70 bg-white/75">
            <div className="border-b border-white/70 px-4 py-3 text-sm font-semibold text-slate-800">
              taxitariff.co.il mone price Breakdown
            </div>
            <div className="divide-y divide-white/70">
              <div className="flex items-center justify-between px-4 py-3 text-slate-800">
                <span className="font-semibold">{moneBreakdown.baseFee.toFixed(2)}</span>
                <span className="text-muted">Base fee</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3 text-slate-800">
                <span className="font-semibold">{moneBreakdown.firstBlockCost.toFixed(2)}</span>
                <span className="text-muted">
                  (min(km,10)+min) block ({moneBreakdown.firstBlockUnits.toFixed(2)} x{" "}
                  {moneBreakdown.rateA.toFixed(2)})
                </span>
              </div>
              <div className="flex items-center justify-between px-4 py-3 text-slate-800">
                <span className="font-semibold">{moneBreakdown.secondBlockCost.toFixed(2)}</span>
                <span className="text-muted">
                  After 10 km ({moneBreakdown.kmAfter10.toFixed(2)} x{" "}
                  {moneBreakdown.rateB.toFixed(2)})
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function TariffHealthCheckTab() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TariffHealthResult | null>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload = query.trim();
    if (!payload) {
      setError("Введите запрос для расчета.");
      setResult(null);
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/tariff-health-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: payload }),
      });
      const data = (await response.json()) as TariffHealthResult & { error?: string };
      if (!response.ok || !data.ok) {
        setResult(null);
        setError(data.error ?? "Не удалось выполнить Tariff Health Check.");
        return;
      }
      setResult(data);
    } catch (requestError) {
      setResult(null);
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Ошибка сети при выполнении Tariff Health Check.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <form className="space-y-3" onSubmit={submit} aria-busy={loading}>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-900">Tariff Health Query</span>
          <textarea
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Example: What is the Decoupling Rate for March 2026 for client {corp_client_id}, and suggest a client tariff that helps increase decoupling to X%"
            className="crm-input min-h-24 w-full resize-y px-3 py-2 text-sm"
          />
        </label>
        {error ? (
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        ) : null}
        <button
          type="submit"
          disabled={loading}
          className="crm-button-primary h-11 w-full rounded-xl text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? "Running health check..." : "Run Tariff Health Check"}
        </button>
      </form>

      {loading ? (
        <div className="space-y-1" aria-live="polite">
          <div
            className="h-1 w-full overflow-hidden rounded-full bg-slate-200/80"
            role="progressbar"
            aria-label="Tariff health check in progress"
          >
            <div className="tariff-health-progress-strip h-full" />
          </div>
        </div>
      ) : null}

      {result ? (
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <article className="rounded-2xl border border-white/70 bg-white/75 p-4">
              <p className="text-xs uppercase tracking-wide text-muted">Decoupling Rate</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">
                {result.summary.decouplingRatePct === null
                  ? "n/a"
                  : `${result.summary.decouplingRatePct.toFixed(2)}%`}
              </p>
              <p className="mt-1 text-xs text-muted">{result.parsedIntent.period.label}</p>
            </article>
            <article className="rounded-2xl border border-white/70 bg-white/75 p-4">
              <p className="text-xs uppercase tracking-wide text-muted">Trips</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">
                {result.summary.trips.toLocaleString("en-US")}
              </p>
              <p className="mt-1 text-xs text-muted">
                Client: {result.resolvedClient.clientName ?? result.resolvedClient.corpClientIds[0]}
              </p>
              <p className="mt-2 text-xs text-muted">
                Distance: {result.summary.ordersWithKm.toLocaleString("en-US")} trips with km · avg{" "}
                {result.summary.avgKmPerTrip === null ? "n/a" : `${result.summary.avgKmPerTrip.toFixed(1)} km`}{" "}
                · p50/p75/p90{" "}
                {result.summary.kmP50 === null
                  ? "n/a"
                  : `${result.summary.kmP50.toFixed(1)} / ${result.summary.kmP75?.toFixed(1) ?? "n/a"} / ${result.summary.kmP90?.toFixed(1) ?? "n/a"} km`}
              </p>
            </article>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <article className="rounded-2xl border border-white/70 bg-white/75 p-4">
              <p className="text-xs uppercase tracking-wide text-muted">Client Spend</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">
                {formatMoney(result.summary.clientSpend)}
              </p>
            </article>
            <article className="rounded-2xl border border-white/70 bg-white/75 p-4">
              <p className="text-xs uppercase tracking-wide text-muted">Driver Cost</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">
                {formatMoney(result.summary.driverCost)}
              </p>
            </article>
            <article className="rounded-2xl border border-white/70 bg-white/75 p-4">
              <p className="text-xs uppercase tracking-wide text-muted">ABS Decoupling</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">
                {formatMoney(result.summary.decouplingAbs)}
              </p>
            </article>
          </div>

          {result.referenceFlatTariff ? (
            <div className="rounded-2xl border border-white/70 bg-white/75">
              <div className="border-b border-white/70 px-4 py-3 text-sm font-semibold text-slate-800">
                Reference flat tariff (comparison only)
              </div>
              <div className="space-y-2 p-4 text-sm text-slate-800">
                <p className="text-xs text-muted">{result.referenceFlatTariff.label}</p>
                <p>
                  Formula: base {result.referenceFlatTariff.basePrice.toFixed(2)} + km ×{" "}
                  {result.referenceFlatTariff.kmRate.toFixed(2)}
                </p>
                <p>
                  Simulated total / avg per trip: {formatMoney(result.referenceFlatTariff.simulatedTotal)} /{" "}
                  {formatMoney(result.referenceFlatTariff.simulatedAvgPerTrip)}
                </p>
                <p>
                  Delta vs actual (total): {formatSignedMoney(result.referenceFlatTariff.deltaVsActualTotal)} · avg
                  price vs actual: {formatSignedPct(result.referenceFlatTariff.deltaPctAvgVsActual)}
                </p>
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl border border-white/70 bg-white/75">
            <div className="border-b border-white/70 px-4 py-3 text-sm font-semibold text-slate-800">
              Tiered tariff suggestions
            </div>
            <div className="space-y-2 p-4">
              {result.suggestions.length === 0 ? (
                <p className="text-sm text-muted">Для текущего запроса нет доступных рекомендаций.</p>
              ) : null}
              {result.suggestions.map((suggestion) => (
                <article
                  key={suggestion.name}
                  className="rounded-xl border border-white/70 bg-white/70 p-3 text-sm text-slate-800"
                >
                  <p className="font-semibold">{suggestion.name}</p>
                  <p className="mt-1 text-xs text-muted">{suggestion.assumption}</p>
                  <p className="mt-2 font-medium text-slate-900">Tariff</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-700">
                    {describeTieredTariff(suggestion.tariff)}
                  </p>
                  <p className="mt-2 text-xs text-muted">
                    Target DR: {suggestion.targetDecouplingRatePct.toFixed(2)}%
                  </p>
                  <div className="mt-2 grid gap-1 text-xs text-slate-700 sm:grid-cols-2">
                    <p>Simulated total: {formatMoney(suggestion.metrics.simulatedTotal)}</p>
                    <p>Avg / trip (sim): {formatMoney(suggestion.metrics.simulatedAvgPerTrip)}</p>
                    <p>Δ total vs actual: {formatSignedMoney(suggestion.metrics.deltaVsActualTotal)}</p>
                    <p>Δ avg / trip: {formatSignedMoney(suggestion.metrics.deltaVsActualAvgPerTrip)}</p>
                    <p>Avg price vs actual: {formatSignedPct(suggestion.metrics.deltaPctAvgVsActual)}</p>
                    <p>
                      Portfolio DR (sim):{" "}
                      {suggestion.metrics.portfolioDecouplingRatePct === null
                        ? "n/a"
                        : `${suggestion.metrics.portfolioDecouplingRatePct.toFixed(2)}%`}
                    </p>
                    <p className="sm:col-span-2">
                      Incremental decoupling (sum):{" "}
                      {formatSignedMoney(suggestion.metrics.incrementalDecouplingAbsTotal)}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>

          {result.analystMarkdown ? (
            <div className="rounded-2xl border border-white/70 bg-white/75">
              <div className="border-b border-white/70 px-4 py-3 text-sm font-semibold text-slate-800">
                Analyst narrative
              </div>
              <div className="max-h-[480px] overflow-y-auto p-4 text-sm leading-relaxed text-slate-800">
                <pre className="whitespace-pre-wrap font-sans text-[13px]">{result.analystMarkdown}</pre>
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl border border-white/70 bg-white/75 px-4 py-3 text-xs text-muted">
            <p>Parsed metric: {result.parsedIntent.metric}</p>
            <p>
              Period: {result.parsedIntent.period.fromIso} - {result.parsedIntent.period.toIsoExclusive}
            </p>
            {result.warning ? <p className="mt-1 text-amber-700">{result.warning}</p> : null}
            {result.assumptions.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {result.assumptions.map((assumption) => (
                  <li key={assumption}>{assumption}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function PriceCalculatorPage() {
  const [activeTab, setActiveTab] = useState<PriceCalculatorTab>("compare");
  const { canAccessDashboardBlock } = useAuth();
  const tNav = useTranslations("nav");
  const tPage = useTranslations("priceCalculatorPage");
  const canAccessTariffHealthCheck = canAccessDashboardBlock("tariffHealthCheck");
  const effectiveActiveTab: PriceCalculatorTab =
    activeTab === "transcripts"
      ? "transcripts"
      : canAccessTariffHealthCheck && activeTab === "health"
        ? "health"
        : "compare";

  return (
    <section className="crm-page">
      <div className="glass-surface rounded-3xl p-4 lg:p-5">
        <h1 className="crm-title-xl">{tNav("priceCalculator")}</h1>
        <p className="crm-subtitle mt-2 max-w-2xl">{tPage("subtitle")}</p>
      </div>

      <div className={segmentedTabTrackClass}>
        <button
          type="button"
          role="tab"
          aria-selected={effectiveActiveTab === "compare"}
          onClick={() => setActiveTab("compare")}
          className={`flex-1 rounded-xl px-2 py-2.5 text-xs font-semibold sm:px-3 sm:text-sm ${
            effectiveActiveTab === "compare" ? segmentedTabSelectedClass : segmentedTabInactiveClass
          }`}
        >
          {tPage("tabCompare")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={effectiveActiveTab === "health"}
          disabled={!canAccessTariffHealthCheck}
          onClick={() => setActiveTab("health")}
          className={`flex-1 rounded-xl px-2 py-2.5 text-xs font-semibold sm:px-3 sm:text-sm ${
            effectiveActiveTab === "health"
              ? segmentedTabSelectedClass
              : segmentedTabInactiveClass
          } ${!canAccessTariffHealthCheck ? "cursor-not-allowed opacity-45 hover:!translate-none hover:!bg-transparent hover:!shadow-none" : ""}`}
        >
          {tPage("tabHealth")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={effectiveActiveTab === "transcripts"}
          onClick={() => setActiveTab("transcripts")}
          className={`flex-1 rounded-xl px-2 py-2.5 text-xs font-semibold sm:px-3 sm:text-sm ${
            effectiveActiveTab === "transcripts" ? segmentedTabSelectedClass : segmentedTabInactiveClass
          }`}
        >
          {tPage("tabTranscripts")}
        </button>
      </div>

      <div className="glass-surface space-y-5 rounded-3xl p-4 lg:p-5">
        <div
          className={`mx-auto ${effectiveActiveTab === "transcripts" ? "max-w-7xl" : "max-w-3xl"}`}
        >
          {effectiveActiveTab === "compare" ? (
            <CompareDriverPriceTab />
          ) : effectiveActiveTab === "health" ? (
            <TariffHealthCheckTab />
          ) : (
            <TranscriptsTab />
          )}

          {!canAccessTariffHealthCheck && effectiveActiveTab !== "transcripts" ? (
            <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
              {tPage("roleDisabledNote")}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
