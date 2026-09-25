"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Lock } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { buildAccessRequestText } from "@/lib/copy-access-request";
import { permissionI18nKey } from "@/lib/permission-display";
import { STAFF_MY_SPACE_PATH } from "@/lib/role-permissions";
import type { AppPageKey } from "@/types/auth";

type NoAccessStateProps = {
  /** When the user has zero pages enabled, omit permission. */
  permission?: AppPageKey | null;
  sectionTitle?: string | null;
};

export function NoAccessState({ permission = null, sectionTitle = null }: NoAccessStateProps) {
  const pathname = usePathname();
  const { currentUser, language } = useAuth();
  const tAccess = useTranslations("access.noAccess");
  const tPerm = useTranslations("permissions");
  const [copied, setCopied] = useState(false);

  const permissionKey = permission ?? "salesOperation";
  const permSlug = permissionI18nKey(permissionKey);
  const permissionLabel = tPerm(permSlug);
  const displaySection =
    sectionTitle ??
    (permission ? permissionLabel : tAccess("titleNoPages"));

  const title = permission
    ? tAccess("titleSection", { section: displaySection })
    : tAccess("titleNoPages");

  const copyRequest = useCallback(async () => {
    if (!currentUser) return;
    const text = buildAccessRequestText({
      email: currentUser.email,
      role: currentUser.role,
      pagePath: pathname,
      permissionKey,
      permissionLabel,
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [currentUser, pathname, permissionKey, permissionLabel]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--so-bg)] px-4 py-10">
      <div className="w-full max-w-lg rounded-[16px] border border-[var(--so-border)] bg-[var(--so-surface)] p-8 shadow-[var(--so-shadow-md)]">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--so-surface-2)] text-[var(--so-muted)]">
          <Lock className="h-6 w-6" aria-hidden />
        </div>
        <h1 className="ycds-display text-[var(--so-text)]">{title}</h1>
        {permission ? (
          <p className="mt-2 text-sm text-[var(--so-muted)]">
            {tAccess("permissionMissing", {
              name: permissionLabel,
              key: permissionKey,
            })}
          </p>
        ) : (
          <p className="mt-2 text-sm text-[var(--so-muted)]">{tAccess("descriptionNoPages")}</p>
        )}

        <dl className="mt-6 space-y-2 rounded-[12px] border border-[var(--so-border)] bg-[var(--so-surface-2)] px-4 py-3 text-sm">
          <div className="flex flex-wrap gap-x-2">
            <dt className="font-medium text-[var(--so-muted)]">{tAccess("signedInAs")}</dt>
            <dd className="text-[var(--so-text)]">{currentUser?.email ?? "—"}</dd>
          </div>
          <div className="flex flex-wrap gap-x-2">
            <dt className="font-medium text-[var(--so-muted)]">{tAccess("permission")}</dt>
            <dd className="text-[var(--so-text)]">
              {permissionLabel} ({permissionKey})
            </dd>
          </div>
          <div className="flex flex-wrap gap-x-2">
            <dt className="font-medium text-[var(--so-muted)]">{tAccess("page")}</dt>
            <dd className="break-all text-[var(--so-text)]">{pathname}</dd>
          </div>
        </dl>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Link
            href={STAFF_MY_SPACE_PATH}
            className="so-focus-ring inline-flex h-11 flex-1 items-center justify-center rounded-[8px] bg-[var(--primary)] px-4 text-sm font-semibold text-white shadow-[var(--so-shadow-xs)] transition hover:opacity-95"
          >
            {tAccess("goToMySpace")}
          </Link>
          <button
            type="button"
            onClick={() => void copyRequest()}
            className="so-focus-ring inline-flex h-11 flex-1 items-center justify-center rounded-[8px] border border-[var(--so-border-strong)] bg-white px-4 text-sm font-medium text-[var(--so-text)] transition hover:bg-[var(--so-surface-hover)]"
          >
            {copied ? tAccess("copied") : tAccess("copyAccessRequest")}
          </button>
        </div>
        <p className="sr-only" lang={language}>
          {title}
        </p>
      </div>
    </main>
  );
}
