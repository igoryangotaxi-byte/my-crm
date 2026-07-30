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
    <div className="inline-flex items-center rounded-[10px] border border-[var(--so-border-strong)] p-0.5">
      <button
        type="button"
        onClick={() => {
          setMode("classic");
          if (inOffice) router.push(returnToClassicPath || "/sales-operation/pipeline");
        }}
        className={`inline-flex h-8 items-center gap-1 rounded-[8px] px-2.5 text-xs font-semibold transition-colors ${
          !inOffice && mode !== "office"
            ? "bg-[var(--so-accent-soft)] text-[var(--so-accent-strong)]"
            : "text-[var(--so-muted)] hover:text-[var(--so-text)]"
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
        className={`inline-flex h-8 items-center gap-1 rounded-[8px] px-2.5 text-xs font-semibold transition-colors ${
          inOffice
            ? "bg-[var(--so-accent-soft)] text-[var(--so-accent-strong)]"
            : "text-[var(--so-muted)] hover:text-[var(--so-text)]"
        }`}
        title={t("title")}
      >
        <Box className="h-3.5 w-3.5" />
        <span className="max-sm:hidden">{t("officeShort")}</span>
      </Link>
    </div>
  );
}
