"use client";

import { useState } from "react";
import { PageHeading } from "@/components/ui/PageHeading";

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 2,
  }).format(value);
}

type WeekdayKey =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

type PriceBreakdown = {
  boardingFee: number;
  distanceCost: number;
  timeCost: number;
  total: number;
};

const weekdayOptions: { key: WeekdayKey; label: string }[] = [
  { key: "monday", label: "Monday" },
  { key: "tuesday", label: "Tuesday" },
  { key: "wednesday", label: "Wednesday" },
  { key: "thursday", label: "Thursday" },
  { key: "friday", label: "Friday" },
  { key: "saturday", label: "Saturday" },
  { key: "sunday", label: "Sunday" },
];

// Keep this multiplier map for future tariff tuning by weekday.
const weekdayMultiplier: Record<WeekdayKey, number> = {
  monday: 1,
  tuesday: 1,
  wednesday: 1,
  thursday: 1.03,
  friday: 1.06,
  saturday: 1.08,
  sunday: 1.04,
};

export default function PriceCalculatorPage() {
  const [tripKm, setTripKm] = useState("");
  const [tripMin, setTripMin] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState<WeekdayKey>("monday");
  const [tripTime, setTripTime] = useState("09:00");
  const [motBreakdown, setMotBreakdown] = useState<PriceBreakdown | null>(null);
  const [yangoBreakdown, setYangoBreakdown] = useState<PriceBreakdown | null>(null);
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
      setMotBreakdown(null);
      setYangoBreakdown(null);
      setError("Enter valid positive values for Trip Km and Trip Min");
      return;
    }

    const multiplier = weekdayMultiplier[dayOfWeek];

    const motBoardingFee = 4.5 * multiplier;
    const motDistanceCost = km * 2.2 * multiplier;
    const motTimeCost = min * 0.5 * multiplier;

    const yangoBoardingFee = 3.8 * multiplier;
    const yangoDistanceCost = km * 1.9 * multiplier;
    const yangoTimeCost = min * 0.42 * multiplier;

    setMotBreakdown({
      boardingFee: motBoardingFee,
      distanceCost: motDistanceCost,
      timeCost: motTimeCost,
      total: motBoardingFee + motDistanceCost + motTimeCost,
    });

    setYangoBreakdown({
      boardingFee: yangoBoardingFee,
      distanceCost: yangoDistanceCost,
      timeCost: yangoTimeCost,
      total: yangoBoardingFee + yangoDistanceCost + yangoTimeCost,
    });
  };

  return (
    <section>
      <PageHeading
        title="Price Calculator"
        subtitle="Estimate Taximeter by MOT and Yango Tariff"
      />

      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="glass-surface w-full max-w-xl rounded-3xl p-6">
          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-900">
                Trip Km
              </span>
              <input
                type="number"
                min="0"
                step="0.1"
                value={tripKm}
                onChange={(event) => setTripKm(event.target.value)}
                placeholder="e.g. 12.5"
                className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm outline-none transition focus:border-accent"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-900">
                Trip Min
              </span>
              <input
                type="number"
                min="0"
                step="1"
                value={tripMin}
                onChange={(event) => setTripMin(event.target.value)}
                placeholder="e.g. 24"
                className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm outline-none transition focus:border-accent"
              />
            </label>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-900">
                  Day of Week
                </span>
                <select
                  value={dayOfWeek}
                  onChange={(event) => setDayOfWeek(event.target.value as WeekdayKey)}
                  className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm outline-none transition focus:border-accent"
                >
                  {weekdayOptions.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-900">
                  Trip Time
                </span>
                <input
                  type="time"
                  value={tripTime}
                  onChange={(event) => setTripTime(event.target.value)}
                  className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm outline-none transition focus:border-accent"
                />
              </label>
            </div>

            {error ? (
              <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              className="h-11 w-full rounded-xl bg-accent text-sm font-semibold text-white transition hover:opacity-95"
            >
              Submit
            </button>
          </form>

          {motBreakdown && yangoBreakdown ? (
            <div className="mt-5 space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <article className="rounded-2xl border border-border bg-white p-4">
                  <p className="text-xs uppercase tracking-wide text-muted">
                    Taximeter by MOT
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900">
                    {formatMoney(motBreakdown.total)}
                  </p>
                </article>
                <article className="rounded-2xl border border-border bg-white p-4">
                  <p className="text-xs uppercase tracking-wide text-muted">
                    Yango Tariff
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900">
                    {formatMoney(yangoBreakdown.total)}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {weekdayOptions.find((item) => item.key === dayOfWeek)?.label} at {tripTime}
                  </p>
                </article>
              </div>

              <div className="rounded-2xl border border-border bg-white">
                <div className="border-b border-border px-4 py-3 text-sm font-semibold text-slate-800">
                  Yango Tariff Breakdown
                </div>
                <div className="divide-y divide-border">
                  <div className="flex items-center justify-between px-4 py-3 text-slate-800">
                    <span className="font-semibold">
                      {yangoBreakdown.boardingFee.toFixed(2)}
                    </span>
                    <span className="text-muted">Boarding fee</span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3 text-slate-800">
                    <span className="font-semibold">
                      {yangoBreakdown.distanceCost.toFixed(2)}
                    </span>
                    <span className="text-muted">Distance cost</span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3 text-slate-800">
                    <span className="font-semibold">
                      {yangoBreakdown.timeCost.toFixed(2)}
                    </span>
                    <span className="text-muted">Time cost</span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-white">
                <div className="border-b border-border px-4 py-3 text-sm font-semibold text-slate-800">
                  Taximeter by MOT Breakdown
                </div>
                <div className="divide-y divide-border">
                  <div className="flex items-center justify-between px-4 py-3 text-slate-800">
                    <span className="font-semibold">
                      {motBreakdown.boardingFee.toFixed(2)}
                    </span>
                    <span className="text-muted">Boarding fee</span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3 text-slate-800">
                    <span className="font-semibold">
                      {motBreakdown.distanceCost.toFixed(2)}
                    </span>
                    <span className="text-muted">Distance cost</span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3 text-slate-800">
                    <span className="font-semibold">{motBreakdown.timeCost.toFixed(2)}</span>
                    <span className="text-muted">Time cost</span>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
