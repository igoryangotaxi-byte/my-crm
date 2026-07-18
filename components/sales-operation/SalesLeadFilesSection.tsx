"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { formatSalesDateTime } from "@/lib/sales-operation/display";
import type { SalesFile } from "@/lib/sales-operation/types";

function formatBytes(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function SalesLeadFilesSection({ leadId }: { leadId: string }) {
  const t = useTranslations("salesOperation");
  const confirm = useConfirm();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<SalesFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sales-operation/leads/${leadId}/files`, { cache: "no-store" });
      const data = (await res.json()) as { ok?: boolean; files?: SalesFile[]; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to load files.");
      setFiles(data.files ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load files.");
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    void load();
  }, [load]);

  const upload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(fileList)) {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch(`/api/sales-operation/leads/${leadId}/files`, {
          method: "POST",
          body: formData,
        });
        const data = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to upload file.");
      }
      if (inputRef.current) inputRef.current.value = "";
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload file.");
    } finally {
      setUploading(false);
    }
  };

  const remove = async (file: SalesFile) => {
    const ok = await confirm({
      title: t("file.deleteConfirm"),
      confirmLabel: t("file.delete"),
      destructive: true,
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/sales-operation/leads/${leadId}/files/${file.id}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to delete file.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete file.");
    }
  };

  return (
    <div className="so-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[var(--so-text)]">{t("file.title")}</p>
        {loading ? <span className="text-xs text-muted">{t("loading")}</span> : null}
      </div>

      <label className="mb-3 flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-[var(--so-border-strong)] bg-[var(--so-surface-2)] px-3 py-4 text-center text-xs font-medium text-[var(--so-muted)] transition-colors hover:bg-[var(--so-surface-hover)]">
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => void upload(event.target.files)}
          disabled={uploading}
        />
        {uploading ? t("file.uploading") : t("file.dropHint")}
      </label>

      <div className="space-y-2">
        {files.length === 0 && !loading ? (
          <p className="text-xs text-muted">{t("file.empty")}</p>
        ) : (
          files.map((file) => (
            <article
              key={file.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-[var(--so-border)] bg-[var(--so-surface-2)] px-3 py-2"
            >
              <div className="min-w-0">
                {file.downloadUrl ? (
                  <a
                    href={file.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate text-sm font-medium text-sky-700 hover:underline"
                  >
                    {file.fileName}
                  </a>
                ) : (
                  <span className="block truncate text-sm font-medium text-[var(--so-text)]">
                    {file.fileName}
                  </span>
                )}
                <p className="text-[11px] text-muted">
                  {formatBytes(file.sizeBytes)}
                  {file.sizeBytes ? " · " : ""}
                  {file.uploadedByName ?? "System"} · {formatSalesDateTime(file.createdAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void remove(file)}
                className="shrink-0 text-[11px] font-semibold text-rose-600 hover:underline"
              >
                {t("file.delete")}
              </button>
            </article>
          ))
        )}
      </div>

      {error ? <p className="mt-2 text-xs text-rose-700">{error}</p> : null}
    </div>
  );
}
