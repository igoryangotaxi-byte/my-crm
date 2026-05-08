"use client";

import { useTranslations } from "next-intl";

export function HeatMapLegend() {
  const t = useTranslations("heatMapPage");

  return (
    <div className="pointer-events-none absolute bottom-3 end-3 z-10 max-w-[min(100%,220px)] rounded-xl border border-white/80 bg-white/90 px-3 py-2 shadow-lg backdrop-blur-sm">
      <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-slate-600">{t("legendTitle")}</p>
      <div
        className="h-2.5 w-full rounded-full border border-slate-200/80"
        style={{
          background:
            "linear-gradient(90deg, rgba(254,242,242,0.95) 0%, rgba(252,165,165,0.95) 25%, rgba(248,113,113,0.95) 50%, rgba(239,68,68,0.95) 75%, rgba(127,29,29,0.98) 100%)",
        }}
        aria-hidden
      />
      <div className="mt-1 flex justify-between gap-2 text-[0.65rem] font-medium text-slate-600">
        <span>{t("legendLow")}</span>
        <span>{t("legendHigh")}</span>
      </div>
    </div>
  );
}
