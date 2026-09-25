"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/auth/AuthProvider";
import { buildAccessRequestText } from "@/lib/copy-access-request";
import { classifyOpsApiPayload } from "@/lib/permission-store-errors";
import { permissionI18nKey } from "@/lib/permission-display";
import type { AppPageKey } from "@/types/auth";

export type OpsApiOutcomeKind = "forbidden" | "store_unavailable" | "unknown";

type OpsApiOutcomeBannerProps = {
  kind: OpsApiOutcomeKind;
  permission?: AppPageKey;
  onRetry?: () => void;
  ordersHref?: string;
};

export function OpsApiOutcomeBanner({
  kind,
  permission = "requestRides",
  onRetry,
  ordersHref = "/sales-operation/orders",
}: OpsApiOutcomeBannerProps) {
  const pathname = usePathname();
  const { currentUser } = useAuth();
  const tForbidden = useTranslations("access.forbiddenBanner");
  const tStoreUnavailable = useTranslations("access.storeUnavailableBanner");
  const tUnknown = useTranslations("access.unknownErrorBanner");
  const tPerm = useTranslations("permissions");
  const [copied, setCopied] = useState(false);
  const permissionLabel = tPerm(permissionI18nKey(permission));

  const copyRequest = useCallback(async () => {
    if (!currentUser) return;
    const text = buildAccessRequestText({
      email: currentUser.email,
      role: currentUser.role,
      pagePath: pathname,
      permissionKey: permission,
      permissionLabel,
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [currentUser, pathname, permission, permissionLabel]);

  if (kind === "store_unavailable") {
    return (
      <div
        role="alert"
        className="rounded-[12px] border border-[var(--so-border)] bg-[var(--so-surface-2)] px-4 py-3 text-sm text-[var(--so-text)]"
      >
        <p>{tStoreUnavailable("message")}</p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="so-focus-ring mt-3 inline-flex h-9 items-center rounded-[8px] border border-[var(--so-border-strong)] bg-white px-3 text-sm font-medium"
          >
            {tStoreUnavailable("retry")}
          </button>
        ) : null}
      </div>
    );
  }

  if (kind === "forbidden") {
    return (
      <div
        role="alert"
        className="rounded-[12px] border border-rose-200/90 bg-rose-50/90 px-4 py-3 text-sm text-rose-900"
      >
        <div className="flex gap-2">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-rose-700" aria-hidden />
          <p>{tForbidden("message")}</p>
        </div>
        <button
          type="button"
          onClick={() => void copyRequest()}
          className="so-focus-ring mt-3 inline-flex h-9 items-center rounded-[8px] border border-rose-200 bg-white/90 px-3 text-sm font-medium text-rose-800"
        >
          {copied ? "…" : tForbidden("copyAccessRequest")}
        </button>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="rounded-[12px] border border-[var(--so-border)] bg-[var(--so-surface-2)] px-4 py-3 text-sm text-[var(--so-text)]"
    >
      <p>{tUnknown("message")}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href={ordersHref}
          className="so-focus-ring inline-flex h-9 items-center rounded-[8px] border border-[var(--so-border-strong)] bg-white px-3 text-sm font-medium"
        >
          {tUnknown("openOrders")}
        </Link>
      </div>
    </div>
  );
}

/** Classify ops API error responses (403 permission / 503 store / unknown). */
export function classifyOpsApiResponse(
  status: number,
  body: unknown,
): OpsApiOutcomeKind | null {
  return classifyOpsApiPayload(status, body);
}
