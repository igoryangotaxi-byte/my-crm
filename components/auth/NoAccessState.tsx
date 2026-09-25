"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Lock } from "lucide-react";
import { STAFF_MY_SPACE_PATH } from "@/lib/role-permissions";
import type { AppPageKey } from "@/types/auth";

/**
 * Minimal no-access placeholder (Design P0-6 full screen ships later).
 * Keep props small so this file is easy to replace.
 */
type NoAccessStateProps = {
  permission?: AppPageKey | null;
};

export function NoAccessState({ permission = null }: NoAccessStateProps) {
  const t = useTranslations("access.noAccess");

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--so-bg)] px-4 py-10">
      <div className="w-full max-w-md rounded-[16px] border border-[var(--so-border)] bg-[var(--so-surface)] p-8 shadow-[var(--so-shadow-md)] text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--so-surface-2)] text-[var(--so-muted)]">
          <Lock className="h-6 w-6" aria-hidden />
        </div>
        <h1 className="ycds-display text-[var(--so-text)]">{t("titleNoPages")}</h1>
        <p className="mt-2 text-sm text-[var(--so-muted)]">
          {permission ? t("descriptionForbidden") : t("descriptionNoPages")}
        </p>
        <Link
          href={STAFF_MY_SPACE_PATH}
          className="so-focus-ring mt-6 inline-flex h-11 items-center justify-center rounded-[8px] bg-[var(--primary)] px-5 text-sm font-semibold text-white"
        >
          {t("goToMySpace")}
        </Link>
      </div>
    </main>
  );
}
