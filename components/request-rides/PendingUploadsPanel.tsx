"use client";

import type { CSSProperties } from "react";

export type PendingUploadAddress = {
  text: string;
  lat: number | null;
  lon: number | null;
  /** SMS recipient for this stop/destination. Empty/absent for pickup. */
  phone?: string;
  geocodeError?: string;
};

export type PendingUploadState =
  | "geocoding"
  | "ready"
  | "blocked"
  | "creating"
  | "created"
  | "failed";

export type PendingUploadOptimization = {
  savingsSeconds: number;
  originalDurationSeconds: number;
  optimizedDurationSeconds: number;
  savingsMeters?: number | null;
};

export type PendingUpload = {
  id: string;
  rowIndex: number;
  scheduleAtIso: string | null;
  phone: string;
  comment: string;
  addresses: PendingUploadAddress[];
  state: PendingUploadState;
  message?: string;
  errors: string[];
  createdOrderId?: string;
  optimization?: PendingUploadOptimization;
};

type PendingUploadsPanelProps = {
  items: PendingUpload[];
  isSubmitting: boolean;
  cardClassName?: string;
  selectedItemId?: string | null;
  onSelectItem?: (id: string) => void;
  onConfirmAll: () => void;
  onClearAll: () => void;
  onRemove: (id: string) => void;
};

const STATE_LABELS: Record<PendingUploadState, string> = {
  geocoding: "Geocoding…",
  ready: "Ready",
  blocked: "Blocked",
  creating: "Creating…",
  created: "Created",
  failed: "Failed",
};

const STATE_BADGE_CLASS: Record<PendingUploadState, string> = {
  geocoding: "bg-slate-100 text-slate-700",
  ready: "bg-emerald-50 text-emerald-700",
  blocked: "bg-amber-50 text-amber-700",
  creating: "bg-sky-50 text-sky-700",
  created: "bg-emerald-100 text-emerald-800",
  failed: "bg-rose-50 text-rose-700",
};

function formatScheduleLabel(iso: string | null): string {
  if (!iso) return "No datetime";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Invalid datetime";
  return `${date.toLocaleString()} local`;
}

function summarize(items: PendingUpload[]) {
  let parsed = 0;
  let ready = 0;
  let blocked = 0;
  let created = 0;
  let failed = 0;
  let optimized = 0;
  for (const item of items) {
    parsed += 1;
    if (item.state === "created") created += 1;
    else if (item.state === "failed") failed += 1;
    else if (item.state === "blocked") blocked += 1;
    else if (item.state === "ready" || item.state === "creating" || item.state === "geocoding") {
      if (item.state === "ready") ready += 1;
    }
    if (item.optimization && item.optimization.savingsSeconds > 0) optimized += 1;
  }
  return { parsed, ready, blocked, created, failed, optimized };
}

function formatSavingsLabel(seconds: number): string {
  const minutes = seconds / 60;
  if (minutes >= 1) return `${Math.round(minutes)}m`;
  return "<1m";
}

export function PendingUploadsPanel({
  items,
  isSubmitting,
  cardClassName,
  selectedItemId,
  onSelectItem,
  onConfirmAll,
  onClearAll,
  onRemove,
}: PendingUploadsPanelProps) {
  if (items.length === 0) return null;
  const { parsed, ready, blocked, created, failed, optimized } = summarize(items);
  const canConfirm = !isSubmitting && items.some((item) => item.state === "ready");
  const baseCardClass =
    cardClassName ??
    "pointer-events-auto rounded-2xl border border-white/70 bg-white/78 p-4 shadow-[0_20px_44px_rgba(15,23,42,0.16)] backdrop-blur-md";

  return (
    <article className={baseCardClass}>
      <div className="flex items-center justify-between gap-2">
        <p className="crm-label">Pending uploads</p>
        <span className="text-xs text-slate-600">
          {parsed} parsed · {ready} ready · {blocked} blocked
          {created > 0 ? ` · ${created} created` : ""}
          {failed > 0 ? ` · ${failed} failed` : ""}
          {optimized > 0 ? ` · ${optimized} optimized` : ""}
        </span>
      </div>

      <div className="mt-2 max-h-[42dvh] space-y-2 overflow-y-auto pr-1">
        {items.map((item) => {
          const filledAddresses = item.addresses.filter((entry) => entry.text);
          const pickup = filledAddresses[0];
          const destination =
            filledAddresses.length > 1 ? filledAddresses[filledAddresses.length - 1] : null;
          const stops = filledAddresses.length > 2 ? filledAddresses.slice(1, -1) : [];
          const allErrors = [
            ...item.errors,
            ...item.addresses
              .map((addr, idx) =>
                addr.geocodeError
                  ? `Address ${idx + 1}${addr.text ? ` "${addr.text}"` : ""}: ${addr.geocodeError}`
                  : null,
              )
              .filter((entry): entry is string => Boolean(entry)),
          ];

          return (
            <details
              key={item.id}
              className={`overflow-hidden rounded-xl border shadow-sm ${
                selectedItemId === item.id
                  ? "border-sky-300 bg-sky-50/70 ring-1 ring-sky-200"
                  : "border-slate-100 bg-slate-50/90"
              }`}
            >
              <summary
                className="cursor-pointer list-none p-3 text-sm text-slate-800"
                onClick={() => onSelectItem?.(item.id)}
              >
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 rounded-lg bg-slate-100 p-1 text-[10px] font-semibold text-slate-700">
                    #{item.rowIndex}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900">
                      {formatScheduleLabel(item.scheduleAtIso)}
                    </p>
                    <p className="text-xs text-slate-600">
                      {item.phone || "No phone"}
                      {item.comment ? ` · ${item.comment}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATE_BADGE_CLASS[item.state]}`}
                    >
                      {STATE_LABELS[item.state]}
                    </span>
                    {item.optimization && item.optimization.savingsSeconds > 0 ? (
                      <span
                        className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700"
                        title="Route order auto-optimized for current traffic"
                      >
                        Optimized · saves {formatSavingsLabel(item.optimization.savingsSeconds)}
                        {item.optimization.savingsMeters != null && item.optimization.savingsMeters >= 50
                          ? ` · ${(item.optimization.savingsMeters / 1000).toFixed(1)} km less`
                          : ""}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-700">
                  <p className="truncate">
                    <span className="font-semibold">A:</span> {pickup?.text ?? "—"}
                  </p>
                  {stops.map((stop, idx) => (
                    <p
                      key={`${item.id}-stop-${idx}`}
                      className="truncate"
                      style={{ paddingInlineStart: 8 } as CSSProperties}
                    >
                      Stop {idx + 1}: {stop.text}
                      {stop.phone ? (
                        <span className="ml-2 text-slate-500">SMS: {stop.phone}</span>
                      ) : null}
                    </p>
                  ))}
                  <p className="truncate">
                    <span className="font-semibold">B:</span> {destination?.text ?? "—"}
                    {destination?.phone ? (
                      <span className="ml-2 text-slate-500">SMS: {destination.phone}</span>
                    ) : null}
                  </p>
                </div>
              </summary>

              <div className="space-y-1 border-t border-slate-100 bg-white/90 px-3 py-2 text-xs text-slate-700">
                {item.message ? (
                  <p
                    className={
                      item.state === "failed" || item.state === "blocked"
                        ? "text-rose-700"
                        : "text-slate-700"
                    }
                  >
                    {item.message}
                  </p>
                ) : null}
                {allErrors.length > 0 ? (
                  <ul className="list-inside list-disc text-rose-700">
                    {allErrors.map((message, idx) => (
                      <li key={`${item.id}-err-${idx}`}>{message}</li>
                    ))}
                  </ul>
                ) : null}
                {item.createdOrderId ? <p>Order: {item.createdOrderId}</p> : null}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => onRemove(item.id)}
                    disabled={item.state === "creating"}
                    className="crm-hover-lift rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Remove from queue
                  </button>
                </div>
              </div>
            </details>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onConfirmAll}
          disabled={!canConfirm}
          className="crm-button-primary h-10 rounded-2xl px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting
            ? "Creating rides…"
            : `Confirm and create ${ready} ride${ready === 1 ? "" : "s"}`}
        </button>
        <button
          type="button"
          onClick={onClearAll}
          disabled={isSubmitting}
          className="crm-hover-lift rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Clear all
        </button>
      </div>
    </article>
  );
}
