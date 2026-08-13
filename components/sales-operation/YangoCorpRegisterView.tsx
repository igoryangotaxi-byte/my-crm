"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { YANG_CORP_REGISTER_WIDGET_SRC } from "@/lib/sales-operation/yango-corp-register";

export function YangoCorpRegisterView() {
  const t = useTranslations("salesOperation.stageGate");
  const searchParams = useSearchParams();
  const embed = searchParams.get("embed") === "1";

  useEffect(() => {
    const scriptId = "yango-corp-offer-form-script";
    if (document.getElementById(scriptId)) return;
    const script = document.createElement("script");
    script.id = scriptId;
    script.src = YANG_CORP_REGISTER_WIDGET_SRC;
    script.crossOrigin = "anonymous";
    script.async = true;
    document.body.appendChild(script);
  }, []);

  return (
    <div className={embed ? "p-3" : "mx-auto max-w-3xl space-y-4 p-4"}>
      {!embed ? (
        <div>
          <h1 className="ycds-h1 text-[var(--so-text)]">{t("yangoRegisterTitle")}</h1>
          <p className="mt-1 text-sm text-[var(--so-muted)]">{t("yangoRegisterHint")}</p>
        </div>
      ) : null}
      <div id="yandex-corp-form" className="min-h-[360px] rounded-[12px] bg-white" />
    </div>
  );
}
