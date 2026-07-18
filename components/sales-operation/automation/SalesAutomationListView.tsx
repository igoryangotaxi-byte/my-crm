"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { Plus, Workflow } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCard } from "@/components/ui/Skeleton";
import type { SalesAutomationListItem } from "@/lib/sales-operation/automation/types";

export function SalesAutomationListView() {
  const t = useTranslations("salesOperation");
  const confirm = useConfirm();
  const router = useRouter();
  const [items, setItems] = useState<SalesAutomationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sales-operation/automations", { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        automations?: SalesAutomationListItem[];
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to load automations.");
      setItems(data.automations ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load automations.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const createWorkflow = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/sales-operation/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New workflow" }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        automation?: { id: string };
        error?: string;
      };
      if (!res.ok || !data.ok || !data.automation?.id) {
        throw new Error(data.error ?? t("automation.saveError"));
      }
      router.push(`/sales-operation/automation/${data.automation.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("automation.saveError"));
      setCreating(false);
    }
  };

  const toggleEnabled = async (item: SalesAutomationListItem) => {
    setError(null);
    try {
      const res = await fetch(`/api/sales-operation/automations/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !item.enabled }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? t("automation.saveError"));
      setItems((prev) =>
        prev.map((row) => (row.id === item.id ? { ...row, enabled: !item.enabled } : row)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t("automation.saveError"));
    }
  };

  const deleteWorkflow = async (item: SalesAutomationListItem) => {
    const ok = await confirm({
      title: t("automation.deleteConfirm"),
      confirmLabel: t("automation.delete"),
      destructive: true,
    });
    if (!ok) return;
    setError(null);
    try {
      const res = await fetch(`/api/sales-operation/automations/${item.id}`, { method: "DELETE" });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? t("automation.saveError"));
      setItems((prev) => prev.filter((row) => row.id !== item.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("automation.saveError"));
    }
  };

  return (
    <section className="crm-page space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="crm-subtitle">{t("page.automation.subtitle")}</p>
        <Button
          leftIcon={<Plus className="h-4 w-4" />}
          loading={creating}
          disabled={creating}
          onClick={() => void createWorkflow()}
        >
          {t("automation.create")}
        </Button>
      </div>

      {error ? (
        <p className="rounded-[12px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="so-card">
          <EmptyState
            icon={<Workflow className="h-5 w-5" />}
            title={t("automation.empty")}
            action={
              <Button
                variant="secondary"
                leftIcon={<Plus className="h-4 w-4" />}
                onClick={() => void createWorkflow()}
              >
                {t("automation.create")}
              </Button>
            }
          />
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="so-card so-card-hover flex flex-wrap items-center justify-between gap-3 px-5 py-4"
            >
              <div className="min-w-0">
                <Link
                  href={`/sales-operation/automation/${item.id}`}
                  className="truncate text-base font-semibold text-[var(--so-text)] transition-colors hover:text-[var(--so-accent-strong)]"
                >
                  {item.name}
                </Link>
                <p className="mt-0.5 text-xs text-[var(--so-muted)]">
                  {item.enabled ? t("automation.enabled") : t("automation.disabled")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void toggleEnabled(item)}
                  className={`so-focus-ring rounded-[10px] border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    item.enabled
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-[var(--so-border-strong)] bg-[var(--so-surface)] text-[var(--so-muted)]"
                  }`}
                >
                  {item.enabled ? t("automation.enabled") : t("automation.disabled")}
                </button>
                <Link
                  href={`/sales-operation/automation/${item.id}`}
                  className="so-focus-ring rounded-[10px] border border-[var(--so-border-strong)] bg-[var(--so-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--so-text)] transition-colors hover:bg-[var(--so-surface-hover)]"
                >
                  {t("automation.edit")}
                </Link>
                <button
                  type="button"
                  onClick={() => void deleteWorkflow(item)}
                  className="so-focus-ring rounded-[10px] border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100"
                >
                  {t("automation.delete")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
