"use client";

import { useTranslations } from "next-intl";

export type LinkPreviewPanelProps = {
  url: string | null;
  onClose: () => void;
};

export function LinkPreviewPanel({ url, onClose }: LinkPreviewPanelProps) {
  const t = useTranslations("mindMap");
  if (!url) return null;

  return (
    <div className="fixed right-4 top-[calc(5.25rem+0.5rem)] z-[60] flex w-[min(420px,42vw)] flex-col overflow-hidden rounded-2xl border border-white/15 bg-[color-mix(in_oklab,var(--glass-bg)_92%,transparent)] shadow-2xl backdrop-blur-xl md:top-[calc(5.5rem+0.5rem)]">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
        <span className="truncate text-xs font-medium text-muted">{url}</span>
        <div className="flex shrink-0 gap-1">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg px-2 py-1 text-xs font-medium text-primary underline-offset-2 hover:underline"
          >
            {t("openTab")}
          </a>
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-xs font-medium text-muted hover:bg-white/10"
            onClick={onClose}
          >
            {t("closePreview")}
          </button>
        </div>
      </div>
      <div className="relative h-[min(520px,58vh)] bg-black/30">
        <iframe
          title={t("previewTitle")}
          src={url}
          className="h-full w-full border-0"
          sandbox="allow-scripts allow-popups allow-forms allow-same-origin allow-downloads"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
      <p className="border-t border-white/10 px-3 py-2 text-[11px] leading-snug text-muted">
        {t("iframeHint")}
      </p>
    </div>
  );
}
