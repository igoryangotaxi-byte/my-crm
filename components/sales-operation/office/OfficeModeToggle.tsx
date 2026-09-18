"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Box, Columns3 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useOfficeMode } from "@/components/sales-operation/office/OfficeModeContext";

export function OfficeModeToggle() {
  const t = useTranslations("salesOperation.office");
  const pathname = usePathname();
  const router = useRouter();
  const { mode, setMode, setReturnToClassicPath, returnToClassicPath } = useOfficeMode();
  const inOffice = pathname.startsWith("/sales-operation/office");

  return (
    <div className="inline-flex items-center rounded-[8px] border border-[var(--so-border)] bg-[var(--so-surface-2)] p-0.5">
      <button
        type="button"
        onClick={() => {
          setMode("classic");
          if (inOffice) router.push(returnToClassicPath || "/sales-operation/pipeline");
        }}
        className={`so-focus-ring inline-flex h-8 items-center gap-1 rounded-[8px] border px-2.5 text-xs font-medium transition-colors ${
          !inOffice && mode !== "office"
            ? "border-[var(--so-accent)] bg-transparent text-[var(--so-accent-strong)]"
            : "border-transparent text-[var(--so-muted)] hover:bg-[var(--so-surface-hover)] hover:text-[var(--so-text)]"
        }`}
        title={t("classicMode")}
      >
        <Columns3 className="h-3.5 w-3.5" />
        <span className="max-sm:hidden">{t("classicShort")}</span>
      </button>
      <Link
        href="/sales-operation/office"
        onClick={() => {
          if (!pathname.startsWith("/sales-operation/office")) {
            setReturnToClassicPath(pathname);
          }
          setMode("office");
        }}
        className={`so-focus-ring inline-flex h-8 items-center gap-1 rounded-[8px] border px-2.5 text-xs font-medium transition-colors ${
          inOffice
            ? "border-[var(--so-accent)] bg-transparent text-[var(--so-accent-strong)]"
            : "border-transparent text-[var(--so-muted)] hover:bg-[var(--so-surface-hover)] hover:text-[var(--so-text)]"
        }`}
        title={t("title")}
      >
        <Box className="h-3.5 w-3.5" />
        <span className="max-sm:hidden">{t("officeShort")}</span>
      </Link>
    </div>
  );
}
