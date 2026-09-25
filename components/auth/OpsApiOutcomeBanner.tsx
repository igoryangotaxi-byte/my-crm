"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
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
  onTryAgain?: () => void;
  ordersHref?: string;
};

export function OpsApiOutcomeBanner({
  kind,
  permission = "requestRides",
  onTryAgain,
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
        <p className="font-semibold">{tStoreUnavailable("title")}</p>
        <p className="mt-1">{tStoreUnavailable("nothingSent")}</p>
        <p className="mt-1 text-[var(--so-text-muted)]">{tStoreUnavailable("temporaryFailure")}</p>
      </div>
    );
  }

  if (kind === "forbidden") {
    return (
      <div
        role="alert"
        className="rounded-[12px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
      >
        <p className="font-semibold">
          {tForbidden("rideNotCreated", { permission: permissionLabel })}
        </p>
        <p className="mt-1 text-rose-800">{tForbidden("nothingSentYango")}</p>
        <button
          type="button"
          onClick={() => void copyRequest()}
          className="so-focus-ring mt-2 text-sm font-semibold text-rose-700 underline-offset-2 hover:underline"
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
        {onTryAgain ? (
          <button
            type="button"
            onClick={onTryAgain}
            className="so-focus-ring inline-flex h-9 items-center rounded-[8px] border border-[var(--so-border-strong)] bg-white px-3 text-sm font-medium"
          >
            {tUnknown("tryAgain")}
          </button>
        ) : null}
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
