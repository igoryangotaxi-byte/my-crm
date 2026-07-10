"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import type { SalesAutomationListItem } from "@/lib/sales-operation/automation/types";

export function SalesAutomationListView() {
  const t = useTranslations("salesOperation");
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
    if (!window.confirm(t("automation.deleteConfirm"))) return;
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
        <button
          type="button"
          className="crm-button-primary rounded-xl px-4 py-2 text-sm font-semibold"
          onClick={() => void createWorkflow()}
          disabled={creating}
        >
          {creating ? t("saving") : t("automation.create")}
        </button>
      </div>

      {error ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="crm-surface rounded-3xl p-8 text-sm text-muted">{t("loading")}</div>
      ) : items.length === 0 ? (
        <article className="crm-surface rounded-3xl p-8 text-sm text-slate-600">
          {t("automation.empty")}
        </article>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="crm-surface crm-hover-lift flex flex-wrap items-center justify-between gap-3 rounded-3xl px-5 py-4"
            >
              <div className="min-w-0">
                <Link
                  href={`/sales-operation/automation/${item.id}`}
                  className="truncate text-base font-semibold text-slate-900 hover:text-red-700"
                >
                  {item.name}
                </Link>
                <p className="mt-0.5 text-xs text-muted">
                  {item.enabled ? t("automation.enabled") : t("automation.disabled")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void toggleEnabled(item)}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-semibold ${
                    item.enabled
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  {item.enabled ? t("automation.enabled") : t("automation.disabled")}
                </button>
                <Link
                  href={`/sales-operation/automation/${item.id}`}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800"
                >
                  Edit
                </Link>
                <button
                  type="button"
                  onClick={() => void deleteWorkflow(item)}
                  className="rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-800"
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
