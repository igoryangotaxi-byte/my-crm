"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { SalesEmailTemplatesSettings } from "@/components/sales-operation/settings/SalesEmailTemplatesSettings";
import { SalesSignedHandoverSettings } from "@/components/sales-operation/settings/SalesSignedHandoverSettings";
import type { PipelineStage, SalesSegment } from "@/lib/sales-operation/types";

type StageDraft = PipelineStage;

export function SalesSettingsView() {
  const t = useTranslations("salesOperation.settings");
  const [stages, setStages] = useState<StageDraft[]>([]);
  const [segments, setSegments] = useState<SalesSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [newSegmentName, setNewSegmentName] = useState("");
  const [addingSegment, setAddingSegment] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [stagesRes, segmentsRes] = await Promise.all([
        fetch("/api/sales-operation/config/stages", { cache: "no-store" }),
        fetch("/api/sales-operation/config/segments", { cache: "no-store" }),
      ]);
      const stagesData = (await stagesRes.json()) as { ok?: boolean; stages?: PipelineStage[] };
      const segmentsData = (await segmentsRes.json()) as { ok?: boolean; segments?: SalesSegment[] };
      if (!stagesRes.ok || !stagesData.ok) throw new Error(t("loadError"));
      setStages(stagesData.stages ?? []);
      setSegments(segmentsData.ok ? segmentsData.segments ?? [] : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateStageField = (key: string, patch: Partial<StageDraft>) => {
    setStages((prev) => prev.map((stage) => (stage.key === key ? { ...stage, ...patch } : stage)));
  };

  const saveStage = async (stage: StageDraft) => {
    setSavingKey(stage.key);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/sales-operation/config/stages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(stage),
      });
      const data = (await res.json()) as { ok?: boolean; stage?: PipelineStage; error?: string };
      if (!res.ok || !data.ok || !data.stage) throw new Error(data.error ?? t("saveError"));
      updateStageField(stage.key, data.stage);
      setMessage(t("saved"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("saveError"));
    } finally {
      setSavingKey(null);
    }
  };

  const addSegment = async () => {
    if (!newSegmentName.trim()) return;
    setAddingSegment(true);
    setError(null);
    try {
      const res = await fetch("/api/sales-operation/config/segments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newSegmentName.trim() }),
      });
      const data = (await res.json()) as { ok?: boolean; segment?: SalesSegment; error?: string };
      if (!res.ok || !data.ok || !data.segment) throw new Error(data.error ?? t("saveError"));
      setSegments((prev) => [...prev, data.segment!]);
      setNewSegmentName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("saveError"));
    } finally {
      setAddingSegment(false);
    }
  };

  const toggleSegmentActive = async (segment: SalesSegment) => {
    setError(null);
    try {
      const res = await fetch("/api/sales-operation/config/segments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: segment.id, isActive: !segment.isActive }),
      });
      const data = (await res.json()) as { ok?: boolean; segment?: SalesSegment; error?: string };
      if (!res.ok || !data.ok || !data.segment) throw new Error(data.error ?? t("saveError"));
      setSegments((prev) => prev.map((item) => (item.id === segment.id ? data.segment! : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("saveError"));
    }
  };

  return (
    <section className="crm-page space-y-4">
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-600">{message}</p> : null}
      {loading ? <SkeletonCard /> : null}

      <div className="so-card">
        <h2 className="crm-section-title mb-1">{t("stagesTitle")}</h2>
        <p className="mb-3 text-sm text-[var(--so-muted)]">{t("stagesSubtitle")}</p>
        <div className="overflow-x-auto rounded-[12px] border border-[var(--so-border)]">
          <table className="min-w-full text-sm">
            <thead className="bg-[var(--so-surface-2)]">
              <tr>
                <th className="px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  {t("stageOrder")}
                </th>
                <th className="px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  {t("stageKey")}
                </th>
                <th className="px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  {t("stageLabel")}
                </th>
                <th className="px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  {t("stageProbability")}
                </th>
                <th className="px-2 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-muted">
                  {t("stageWon")}
                </th>
                <th className="px-2 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-muted">
                  {t("stageLost")}
                </th>
                <th className="px-2 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-muted">
                  {t("stageTerminal")}
                </th>
                <th className="px-2 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-muted">
                  {t("stageActive")}
                </th>
                <th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--so-border)]">
              {stages.map((stage) => (
                <tr key={stage.key} className="transition-colors hover:bg-[var(--so-surface-hover)]">
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      value={stage.orderIndex}
                      onChange={(event) =>
                        updateStageField(stage.key, { orderIndex: Number(event.target.value) })
                      }
                      className="crm-input h-8 w-16 px-2 text-sm"
                    />
                  </td>
                  <td className="px-2 py-1.5 font-mono text-xs text-[var(--so-muted)]">{stage.key}</td>
                  <td className="px-2 py-1.5">
                    <input
                      value={stage.label}
                      onChange={(event) => updateStageField(stage.key, { label: event.target.value })}
                      className="crm-input h-8 w-40 px-2 text-sm"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={stage.probability}
                      onChange={(event) =>
                        updateStageField(stage.key, { probability: Number(event.target.value) })
                      }
                      className="crm-input h-8 w-20 px-2 text-sm"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={stage.isWon}
                      onChange={(event) => updateStageField(stage.key, { isWon: event.target.checked })}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={stage.isLost}
                      onChange={(event) => updateStageField(stage.key, { isLost: event.target.checked })}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={stage.isTerminal}
                      onChange={(event) =>
                        updateStageField(stage.key, { isTerminal: event.target.checked })
                      }
                    />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={stage.isActive}
                      onChange={(event) =>
                        updateStageField(stage.key, { isActive: event.target.checked })
                      }
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <Button
                      size="sm"
                      loading={savingKey === stage.key}
                      disabled={savingKey === stage.key}
                      onClick={() => void saveStage(stage)}
                    >
                      {t("save")}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-[var(--so-muted)]">{t("migrationHint")}</p>
      </div>

      <div className="so-card">
        <h2 className="crm-section-title mb-1">{t("segmentsTitle")}</h2>
        <p className="mb-3 text-sm text-[var(--so-muted)]">{t("segmentsSubtitle")}</p>
        <div className="mb-3 flex flex-wrap gap-2">
          <input
            value={newSegmentName}
            onChange={(event) => setNewSegmentName(event.target.value)}
            placeholder={t("segmentNamePlaceholder")}
            className="crm-input h-9 w-64 px-3 text-sm"
          />
          <Button
            leftIcon={<Plus className="h-4 w-4" />}
            loading={addingSegment}
            disabled={addingSegment || !newSegmentName.trim()}
            onClick={() => void addSegment()}
          >
            {t("addSegment")}
          </Button>
        </div>
        {segments.length === 0 ? (
          <p className="text-sm text-[var(--so-muted)]">{t("noSegments")}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {segments.map((segment) => (
              <div
                key={segment.id}
                className={`flex items-center gap-2 rounded-[10px] border px-3 py-1.5 text-sm ${
                  segment.isActive
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-[var(--so-border-strong)] bg-[var(--so-surface-2)] text-[var(--so-muted)]"
                }`}
              >
                <span className="font-medium">{segment.name}</span>
                <button
                  type="button"
                  onClick={() => void toggleSegmentActive(segment)}
                  className="so-focus-ring rounded-[8px] border border-[var(--so-border-strong)] bg-[var(--so-surface)] px-2 py-0.5 text-xs font-semibold text-[var(--so-muted)] transition-colors hover:bg-[var(--so-surface-hover)]"
                >
                  {segment.isActive ? t("deactivate") : t("activate")}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <SalesSignedHandoverSettings />

      <SalesEmailTemplatesSettings />
    </section>
  );
}
