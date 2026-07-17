"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { SalesEmailTemplatesSettings } from "@/components/sales-operation/settings/SalesEmailTemplatesSettings";
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
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      {loading ? <p className="text-sm text-muted">…</p> : null}

      <div className="make-glass-card-static rounded-3xl p-4">
        <h2 className="crm-section-title mb-1">{t("stagesTitle")}</h2>
        <p className="mb-3 text-sm text-slate-600">{t("stagesSubtitle")}</p>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-white/60">
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
            <tbody className="divide-y divide-border">
              {stages.map((stage) => (
                <tr key={stage.key}>
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
                  <td className="px-2 py-1.5 font-mono text-xs text-slate-500">{stage.key}</td>
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
                    <button
                      type="button"
                      disabled={savingKey === stage.key}
                      onClick={() => void saveStage(stage)}
                      className="crm-button-primary rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                    >
                      {savingKey === stage.key ? t("saving") : t("save")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">{t("migrationHint")}</p>
      </div>

      <div className="make-glass-card-static rounded-3xl p-4">
        <h2 className="crm-section-title mb-1">{t("segmentsTitle")}</h2>
        <p className="mb-3 text-sm text-slate-600">{t("segmentsSubtitle")}</p>
        <div className="mb-3 flex flex-wrap gap-2">
          <input
            value={newSegmentName}
            onChange={(event) => setNewSegmentName(event.target.value)}
            placeholder={t("segmentNamePlaceholder")}
            className="crm-input h-9 w-64 px-3 text-sm"
          />
          <button
            type="button"
            disabled={addingSegment || !newSegmentName.trim()}
            onClick={() => void addSegment()}
            className="crm-button-primary rounded-lg px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
          >
            {addingSegment ? t("saving") : t("addSegment")}
          </button>
        </div>
        {segments.length === 0 ? (
          <p className="text-sm text-muted">{t("noSegments")}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {segments.map((segment) => (
              <div
                key={segment.id}
                className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm ${
                  segment.isActive
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border-slate-200 bg-slate-50 text-slate-500"
                }`}
              >
                <span className="font-medium">{segment.name}</span>
                <button
                  type="button"
                  onClick={() => void toggleSegmentActive(segment)}
                  className="rounded-md border border-white/70 bg-white px-2 py-0.5 text-xs font-semibold text-slate-600"
                >
                  {segment.isActive ? t("deactivate") : t("activate")}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <SalesEmailTemplatesSettings />
    </section>
  );
}
