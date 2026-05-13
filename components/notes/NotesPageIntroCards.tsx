"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

export function NotesPageIntroCards() {
  const t = useTranslations("notesPage");
  return (
    <div className="mb-8 grid gap-4 sm:grid-cols-2">
      <Link
        href="/notes/mind-map"
        className="group rounded-2xl border border-white/10 bg-white/5 p-5 shadow-sm transition hover:border-white/20 hover:bg-white/10"
      >
        <div className="text-sm font-semibold tracking-tight">{t("mindMapSection")}</div>
        <p className="mt-2 text-sm text-muted">{t("mindMapDesc")}</p>
        <span className="mt-3 inline-block text-sm font-medium text-primary group-hover:underline">
          {t("openMindMap")}
        </span>
      </Link>
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-sm">
        <div className="text-sm font-semibold tracking-tight">{t("opsSection")}</div>
        <p className="mt-2 text-sm text-muted">{t("opsDesc")}</p>
      </div>
    </div>
  );
}
