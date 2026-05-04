"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { RequestRideStatus, YangoApiClientRef } from "@/types/crm";
import {
  DEFAULT_ORDER_SMS_TEMPLATES,
  ORDER_SMS_TEMPLATE_IDS,
  ORDER_SMS_TEMPLATE_META,
  type OrderSmsTemplateId,
  buildDriverOnWaySmsText,
  buildRequestedRideSmsText,
  legacyDriverOnWaySmsText,
} from "@/lib/order-sms-templates";
import type { OrderSmsTemplateHistoryEntry } from "@/lib/order-sms-template-store";
import { isLikelyPhone, normalizePhone } from "@/lib/phone-utils";

type TemplatesPayload = {
  ok?: boolean;
  defaults?: Record<OrderSmsTemplateId, string>;
  merged?: Record<OrderSmsTemplateId, string>;
  overrides?: Partial<Record<OrderSmsTemplateId, string>>;
  history?: OrderSmsTemplateHistoryEntry[];
  error?: string;
};

const SAMPLE_DRIVER_STATUS: RequestRideStatus = {
  orderId: "preview",
  tokenLabel: "",
  clientId: "",
  lifecycleStatus: "driver_assigned",
  statusRaw: "",
  statusText: "",
  fetchedAt: new Date().toISOString(),
  driverName: "Alex Driver",
  driverPhone: "+972501234567",
  driverFirstName: "Alex",
  driverLastName: "Driver",
  carModel: "Skoda Octavia",
  carPlate: "12-345-67",
  etaMinutes: 5,
  info: null,
  progress: null,
  report: null,
};

function samplePreorderIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 30, 0, 0);
  return d.toISOString();
}

function getRenderedTestMessage(
  id: OrderSmsTemplateId,
  drafts: Record<OrderSmsTemplateId, string>,
): string {
  if (id === "preorder_request") {
    return buildRequestedRideSmsText(drafts, samplePreorderIso(), new Date().toISOString(), {
      traceId: "sample_trace",
    });
  }
  if (id === "immediate_request") {
    return buildRequestedRideSmsText(drafts, null, new Date().toISOString(), {
      traceId: "sample_trace",
    });
  }
  const t = drafts.driver_on_way ?? DEFAULT_ORDER_SMS_TEMPLATES.driver_on_way;
  if (t.trim() === DEFAULT_ORDER_SMS_TEMPLATES.driver_on_way.trim()) {
    return legacyDriverOnWaySmsText(SAMPLE_DRIVER_STATUS);
  }
  return buildDriverOnWaySmsText(drafts, SAMPLE_DRIVER_STATUS);
}

type OrderUpdatesTabProps = {
  selectedClient: YangoApiClientRef | null;
};

export function OrderUpdatesTab({ selectedClient }: OrderUpdatesTabProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [defaults, setDefaults] = useState<Record<OrderSmsTemplateId, string> | null>(null);
  const [drafts, setDrafts] = useState<Record<OrderSmsTemplateId, string>>(() => ({
    ...DEFAULT_ORDER_SMS_TEMPLATES,
  }));
  const [history, setHistory] = useState<OrderSmsTemplateHistoryEntry[]>([]);
  const [testModalTemplateId, setTestModalTemplateId] = useState<OrderSmsTemplateId | null>(null);
  const [testPhone, setTestPhone] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!selectedClient?.tokenLabel || !selectedClient?.clientId) {
      setDefaults(null);
      setDrafts({ ...DEFAULT_ORDER_SMS_TEMPLATES });
      setHistory([]);
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const params = new URLSearchParams({
        tokenLabel: selectedClient.tokenLabel,
        clientId: selectedClient.clientId,
      });
      const response = await fetch(`/api/order-sms-templates?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as TemplatesPayload | null;
      if (!response.ok || !payload?.ok || !payload.merged || !payload.defaults) {
        throw new Error(payload?.error ?? `HTTP ${response.status}`);
      }
      setDefaults(payload.defaults);
      setDrafts({ ...payload.merged });
      setHistory(payload.history ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load templates.");
      setDefaults({ ...DEFAULT_ORDER_SMS_TEMPLATES });
      setDrafts({ ...DEFAULT_ORDER_SMS_TEMPLATES });
    } finally {
      setLoading(false);
    }
  }, [selectedClient?.tokenLabel, selectedClient?.clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const previewPreorder = useMemo(() => {
    return buildRequestedRideSmsText(drafts, samplePreorderIso(), new Date().toISOString(), {
      traceId: "sample_trace",
    });
  }, [drafts]);

  const previewImmediate = useMemo(() => {
    return buildRequestedRideSmsText(drafts, null, new Date().toISOString(), {
      traceId: "sample_trace",
    });
  }, [drafts]);

  const previewDriver = useMemo(() => {
    return buildDriverOnWaySmsText(drafts, SAMPLE_DRIVER_STATUS);
  }, [drafts]);

  const previewDriverPlain = useMemo(() => {
    const t = drafts.driver_on_way ?? DEFAULT_ORDER_SMS_TEMPLATES.driver_on_way;
    if (t.trim() === DEFAULT_ORDER_SMS_TEMPLATES.driver_on_way.trim()) {
      return legacyDriverOnWaySmsText(SAMPLE_DRIVER_STATUS);
    }
    return previewDriver;
  }, [drafts.driver_on_way, previewDriver]);

  const testModalMessage = useMemo(() => {
    if (!testModalTemplateId) return "";
    return getRenderedTestMessage(testModalTemplateId, drafts);
  }, [testModalTemplateId, drafts]);

  const sendTestSms = async () => {
    const phone = normalizePhone(testPhone);
    if (!phone || !isLikelyPhone(phone)) {
      setTestError("Enter a valid mobile number (e.g. +972501234567).");
      return;
    }
    const text = testModalMessage.trim();
    if (!text) {
      setTestError("Message text is empty.");
      return;
    }
    setTestSending(true);
    setTestError(null);
    try {
      const response = await fetch("/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phones: [phone],
          text,
          kind: "communications",
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        skipped?: boolean;
        reason?: string;
        error?: string;
        sent?: number;
      } | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error ?? `HTTP ${response.status}`);
      }
      if (payload.skipped) {
        setTestError(
          payload.reason ??
            "SMS outbound is disabled: set INFORU_SMS_ENABLED=true in env and redeploy/restart.",
        );
        return;
      }
      setTestModalTemplateId(null);
      setTestPhone("");
      setSuccess(`Test SMS sent (${payload.sent ?? 1} recipient).`);
    } catch (e) {
      setTestError(e instanceof Error ? e.message : "Failed to send test SMS.");
    } finally {
      setTestSending(false);
    }
  };

  const save = async () => {
    if (!selectedClient) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/order-sms-templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenLabel: selectedClient.tokenLabel,
          clientId: selectedClient.clientId,
          templates: {
            preorder_request: drafts.preorder_request,
            immediate_request: drafts.immediate_request,
            driver_on_way: drafts.driver_on_way,
          },
        }),
      });
      const payload = (await response.json().catch(() => null)) as TemplatesPayload | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error ?? `HTTP ${response.status}`);
      }
      if (payload.merged) {
        setDrafts({ ...payload.merged });
      }
      setHistory(payload.history ?? []);
      setSuccess("Templates saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const resetOne = (id: OrderSmsTemplateId) => {
    const d = defaults?.[id] ?? DEFAULT_ORDER_SMS_TEMPLATES[id];
    setDrafts((prev) => ({ ...prev, [id]: d }));
    setSuccess(null);
  };

  const resetAll = () => {
    const base = defaults ?? DEFAULT_ORDER_SMS_TEMPLATES;
    setDrafts({ ...base });
    setSuccess(null);
  };

  if (!selectedClient) {
    return (
      <p className="rounded-xl border border-dashed border-slate-200 bg-white/60 px-4 py-6 text-sm text-slate-600">
        Select Client above to edit order status SMS templates.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={resetAll}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Reset all to loaded defaults
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || loading}
            className="crm-button-primary rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {loading ? <p className="text-sm text-slate-500">Loading templates…</p> : null}
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

      <div className="space-y-6">
        {ORDER_SMS_TEMPLATE_IDS.map((id) => {
          const meta = ORDER_SMS_TEMPLATE_META[id];
          const preview =
            id === "preorder_request"
              ? previewPreorder
              : id === "immediate_request"
                ? previewImmediate
                : previewDriverPlain;
          return (
            <div key={id} className="make-glass-card-static space-y-3 rounded-2xl p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">{meta.label}</h3>
                  <p className="mt-0.5 text-xs text-slate-600">{meta.description}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setTestError(null);
                      setTestModalTemplateId(id);
                    }}
                    disabled={loading}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    Test
                  </button>
                  <button
                    type="button"
                    onClick={() => resetOne(id)}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Reset to default
                  </button>
                </div>
              </div>
              <p className="text-xs text-slate-500">
                Placeholders:{" "}
                <span className="font-mono text-slate-700">{meta.placeholders.join(", ")}</span>
              </p>
              <textarea
                value={drafts[id] ?? ""}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [id]: e.target.value }))}
                disabled={loading}
                className="crm-input min-h-24 w-full px-3 py-2 font-mono text-sm"
                spellCheck={false}
              />
              <div>
                <p className="crm-label mb-1">Preview (sample data)</p>
                <p className="rounded-lg border border-slate-100 bg-white/80 px-3 py-2 text-sm text-slate-800 whitespace-pre-wrap">
                  {preview}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="make-glass-card-static rounded-2xl p-4">
        <h3 className="text-sm font-semibold text-slate-900">Change history</h3>
        <p className="mt-1 text-xs text-slate-600">
          Last edits per save (stored text may be truncated in the list).
        </p>
        {history.length === 0 ? (
          <p className="mt-3 text-xs text-slate-500">No changes recorded yet.</p>
        ) : (
          <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto text-xs">
            {history.map((h) => (
              <li
                key={h.id}
                className="rounded-lg border border-slate-100 bg-white/70 px-3 py-2 text-slate-700"
              >
                <div className="flex flex-wrap gap-x-2 gap-y-0.5 font-semibold text-slate-900">
                  <span>{new Date(h.at).toLocaleString()}</span>
                  <span>·</span>
                  <span>{h.editorName}</span>
                  <span>·</span>
                  <span className="font-mono font-normal">{h.templateId}</span>
                </div>
                <p className="mt-1 text-slate-500">
                  <span className="font-medium text-slate-600">Before:</span>{" "}
                  <span className="break-words">{h.previousText || "(empty)"}</span>
                </p>
                <p className="mt-0.5 text-slate-500">
                  <span className="font-medium text-slate-600">After:</span>{" "}
                  <span className="break-words">{h.nextText || "(empty)"}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {testModalTemplateId ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 px-4"
          onClick={() => {
            setTestModalTemplateId(null);
            setTestError(null);
          }}
        >
          <div
            className="crm-modal-surface w-full max-w-xl rounded-2xl p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-900">Send test SMS</h3>
            <p className="mt-1 text-xs text-slate-600">
              Template:{" "}
              <span className="font-mono font-medium text-slate-800">{testModalTemplateId}</span>
            </p>
            <label className="mt-4 block">
              <span className="crm-label mb-1 block">Test phone number</span>
              <input
                type="tel"
                value={testPhone}
                onChange={(e) => {
                  setTestPhone(e.target.value);
                  setTestError(null);
                }}
                placeholder="+972501234567"
                className="crm-input h-10 w-full rounded-lg border-slate-200 px-3 text-sm"
                autoComplete="tel"
              />
            </label>
            <div className="mt-4">
              <p className="crm-label mb-1">Message (preview with sample data)</p>
              <p className="max-h-40 overflow-y-auto rounded-lg border border-white/50 bg-white/45 p-3 text-sm whitespace-pre-wrap text-slate-800 backdrop-blur-sm">
                {testModalMessage}
              </p>
            </div>
            {testError ? <p className="mt-3 text-sm text-rose-700">{testError}</p> : null}
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setTestModalTemplateId(null);
                  setTestError(null);
                }}
                className="rounded-xl border border-white/70 bg-white/70 px-3 py-2 text-sm font-semibold text-slate-700 backdrop-blur-sm transition hover:bg-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void sendTestSms()}
                disabled={testSending}
                className="crm-button-primary rounded-xl px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              >
                {testSending ? "Sending…" : "Send test SMS"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
