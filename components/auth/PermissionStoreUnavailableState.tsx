"use client";

import { useTranslations } from "next-intl";

type Props = {
  onRetry: () => void;
  retryInFlight: boolean;
};

export function PermissionStoreUnavailableState({ onRetry, retryInFlight }: Props) {
  const t = useTranslations("auth.permissionStoreUnavailable");

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-6 py-16 text-center">
      <div
        className="mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-500"
        aria-hidden
      >
        <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M12 9v4m0 4h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z" strokeLinecap="round" />
        </svg>
      </div>
      <h1 className="text-xl font-semibold text-slate-800">{t("title")}</h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-600">{t("description")}</p>
      <button
        type="button"
        className="crm-surface mt-8 rounded-lg px-5 py-2.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-60"
        onClick={onRetry}
        disabled={retryInFlight}
      >
        {t("retry")}
      </button>
    </div>
  );
}

export function PermissionStorePollBanner() {
  const t = useTranslations("auth.permissionStoreUnavailable");

  return (
    <div
      role="status"
      className="border-b border-slate-200 bg-slate-100 px-4 py-2 text-center text-sm text-slate-700"
    >
      {t("pollBanner")}
    </div>
  );
}
