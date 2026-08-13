"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/ui/cn";

export function YangoCorpRegisterAccordion({
  leadId,
  defaultOpen = false,
}: {
  leadId: string;
  defaultOpen?: boolean;
}) {
  const t = useTranslations("salesOperation.stageGate");
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="overflow-hidden rounded-[12px] border border-[var(--so-border)]">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-[var(--so-surface-hover)]"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="text-sm font-semibold text-[var(--so-text)]">{t("yangoRegisterTitle")}</span>
        <ChevronDown
          className={cn("h-4 w-4 text-[var(--so-muted)] transition-transform", open && "rotate-180")}
        />
      </button>
      {open ? (
        <div className="space-y-2 border-t border-[var(--so-border)] p-3">
          <p className="text-xs text-[var(--so-muted)]">{t("yangoRegisterHint")}</p>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              leftIcon={<ExternalLink className="h-3.5 w-3.5" />}
              onClick={() =>
                window.open(
                  `/sales-operation/corp-register?leadId=${encodeURIComponent(leadId)}`,
                  "_blank",
                  "noopener,noreferrer",
                )
              }
            >
              {t("yangoRegisterOpenWindow")}
            </Button>
          </div>
          <iframe
            title={t("yangoRegisterTitle")}
            src={`/sales-operation/corp-register?leadId=${encodeURIComponent(leadId)}&embed=1`}
            className="block h-[380px] w-full rounded-[10px] border border-[var(--so-border)] bg-white"
          />
        </div>
      ) : null}
    </div>
  );
}
