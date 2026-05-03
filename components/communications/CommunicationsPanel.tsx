"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import type { YangoApiClientRef } from "@/types/crm";

type CommunicationsPanelMode = "main" | "client";

type CommunicationsPanelProps = {
  mode: CommunicationsPanelMode;
};

type RequestRidesClientsPayload = {
  ok?: boolean;
  clients?: YangoApiClientRef[];
  error?: string;
};

type SmsApiResponse = {
  ok?: boolean;
  sent?: number;
  skipped?: boolean;
  reason?: string;
  error?: string;
};

type CommunicationUser = {
  userId: string;
  phone: string | null;
  fullName: string | null;
  source: string;
};

type RequestRideSuggestPayload = {
  ok?: boolean;
  users?: CommunicationUser[];
  error?: string;
};

function hasValidPhone(phone: string | null | undefined) {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 9;
}

function IconSearch({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function IconChevronDown({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function CommunicationsPanel({ mode }: CommunicationsPanelProps) {
  const { currentUser } = useAuth();
  const [apiClients, setApiClients] = useState<YangoApiClientRef[]>([]);
  const [selectedClientRef, setSelectedClientRef] = useState<YangoApiClientRef | null>(null);
  const [selectedRecipients, setSelectedRecipients] = useState<CommunicationUser[]>([]);
  const [phoneQuery, setPhoneQuery] = useState("");
  const [showPhoneSuggestions, setShowPhoneSuggestions] = useState(false);
  const [phoneSuggestions, setPhoneSuggestions] = useState<CommunicationUser[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  useEffect(() => {
    if (mode === "client") {
      window.setTimeout(() => {
        setApiClients([]);
        setSelectedClientRef(null);
      }, 0);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [authResponse, clientsResponse] = await Promise.all([
          fetch("/api/auth", { cache: "no-store" }),
          fetch("/api/request-rides-clients", { cache: "no-store" }),
        ]);
        await authResponse.json().catch(() => null);
        const clientsPayload = (await clientsResponse.json().catch(() => null)) as RequestRidesClientsPayload | null;
        if (!authResponse.ok || !clientsResponse.ok || !clientsPayload?.ok) {
          throw new Error("Failed to load clients.");
        }
        if (cancelled) return;
        const clients = clientsPayload.clients ?? [];
        setApiClients(clients);
        setSelectedClientRef((prev) => prev ?? clients[0] ?? null);
      } catch {
        if (cancelled) return;
        setApiClients([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUser?.tenantId, mode]);

  useEffect(() => {
    const tokenLabel =
      mode === "main" ? (selectedClientRef?.tokenLabel ?? "") : (currentUser?.tokenLabel ?? "");
    const clientId =
      mode === "main" ? (selectedClientRef?.clientId ?? "") : (currentUser?.apiClientId ?? "");
    const query = phoneQuery.trim();
    if (!tokenLabel || !clientId || !query) {
      window.setTimeout(() => {
        setPhoneSuggestions([]);
        setSuggestionsLoading(false);
      }, 0);
      return;
    }
    let cancelled = false;
    window.setTimeout(() => {
      if (!cancelled) setSuggestionsLoading(true);
    }, 0);
    (async () => {
      try {
        const response = await fetch("/api/request-rides-user-suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tokenLabel, clientId, query }),
        });
        const payload = (await response.json().catch(() => null)) as RequestRideSuggestPayload | null;
        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.error ?? `HTTP ${response.status}`);
        }
        if (cancelled) return;
        const users = (payload.users ?? [])
          .filter((item) => hasValidPhone(item.phone))
          .sort((a, b) => (a.fullName ?? "").localeCompare(b.fullName ?? ""));
        setPhoneSuggestions(users);
      } catch (error) {
        if (cancelled) return;
        setPhoneSuggestions([]);
        setStatusError(error instanceof Error ? error.message : "Failed to load employees.");
      } finally {
        if (!cancelled) {
          setSuggestionsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, selectedClientRef?.clientId, selectedClientRef?.tokenLabel, currentUser?.apiClientId, currentUser?.tokenLabel, phoneQuery]);

  const selectedPhones = useMemo(() => {
    return selectedRecipients
      .map((item) => item.phone ?? "")
      .filter((phone) => hasValidPhone(phone));
  }, [selectedRecipients]);

  const hasTargetScope =
    mode === "main"
      ? Boolean(selectedClientRef?.tokenLabel && selectedClientRef?.clientId)
      : Boolean(currentUser?.tokenLabel && currentUser?.apiClientId);
  const canSend = hasTargetScope && selectedPhones.length > 0 && messageText.trim().length > 0 && !sending;

  const addRecipient = (user: CommunicationUser) => {
    if (!hasValidPhone(user.phone)) return;
    setSelectedRecipients((prev) => {
      if (prev.some((item) => item.userId === user.userId)) return prev;
      return [...prev, user];
    });
    setPhoneQuery(user.phone ?? "");
    setShowPhoneSuggestions(false);
  };

  const removeRecipient = (userId: string) => {
    setSelectedRecipients((prev) => prev.filter((item) => item.userId !== userId));
  };

  const sendSms = async () => {
    if (!canSend) return;
    setSending(true);
    setStatusMessage(null);
    setStatusError(null);
    try {
      const response = await fetch("/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phones: selectedPhones,
          text: messageText.trim(),
          kind: "communications",
        }),
      });
      const payload = (await response.json().catch(() => null)) as SmsApiResponse | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error ?? `HTTP ${response.status}`);
      }
      if (payload.skipped) {
        setStatusMessage(payload.reason ?? "SMS sending is currently disabled.");
        return;
      }
      setStatusMessage(`SMS sent to ${payload.sent ?? selectedPhones.length} recipients.`);
      setMessageText("");
      setSelectedRecipients([]);
      setPhoneQuery("");
      setPhoneSuggestions([]);
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : "Failed to send SMS.");
    } finally {
      setSending(false);
      setIsConfirmOpen(false);
    }
  };

  return (
    <section className="crm-page">
      <div className="glass-surface rounded-3xl p-4 lg:p-5">
        <h1 className="crm-title-xl">Communications</h1>
        <p className="crm-subtitle mt-2 max-w-2xl">
          {mode === "main"
            ? "Choose a client and send bulk communication to its registered employees."
            : "Send communication to employees registered in your cabinet."}
        </p>
      </div>

      <div className="glass-surface space-y-5 rounded-3xl p-4 lg:p-5">
        <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:gap-2">
            {mode === "main" ? (
              <label className="relative min-w-0 flex-1 lg:max-w-sm">
                <span className="crm-label mb-1 block">Client</span>
                <div className="relative">
                  <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <select
                    value={selectedClientRef ? `${selectedClientRef.tokenLabel}:${selectedClientRef.clientId}` : ""}
                    onChange={(event) => {
                      const [tokenLabel, clientId] = event.target.value.split(":");
                      const next =
                        apiClients.find(
                          (item) => item.tokenLabel === tokenLabel && item.clientId === clientId,
                        ) ?? null;
                      setSelectedClientRef(next);
                      setSelectedRecipients([]);
                      setPhoneQuery("");
                      setPhoneSuggestions([]);
                      setShowPhoneSuggestions(false);
                      setStatusError(null);
                    }}
                    className="crm-input h-9 w-full appearance-none rounded-lg border-slate-200 bg-white pl-9 pr-9 text-sm"
                  >
                    <option value="">Select a client</option>
                    {apiClients.map((client) => (
                      <option
                        key={`${client.tokenLabel}:${client.clientId}`}
                        value={`${client.tokenLabel}:${client.clientId}`}
                      >
                        {client.clientName} ({client.tokenLabel})
                      </option>
                    ))}
                  </select>
                  <IconChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </div>
              </label>
            ) : (
              <p className="text-sm text-slate-700 lg:flex lg:min-w-0 lg:flex-1 lg:items-center lg:self-center lg:pb-2">
                Client cabinet: <span className="font-semibold">{currentUser?.corpClientId ?? "n/a"}</span>
              </p>
            )}

            <label className="relative min-w-0 flex-1 lg:min-w-[280px]">
              <span className="crm-label mb-1 block">Find employee by phone</span>
              <div className="relative">
                <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={phoneQuery}
                  onChange={(event) => {
                    setPhoneQuery(event.target.value);
                    setShowPhoneSuggestions(true);
                    setStatusError(null);
                  }}
                  onFocus={() => setShowPhoneSuggestions(true)}
                  onBlur={() => {
                    window.setTimeout(() => setShowPhoneSuggestions(false), 120);
                  }}
                  disabled={!hasTargetScope}
                  className="crm-input h-9 w-full rounded-lg border-slate-200 bg-white pl-9 pr-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder={hasTargetScope ? "+972..." : "Select client first"}
                />
                {showPhoneSuggestions && hasTargetScope && phoneQuery.trim() ? (
                  <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                    {suggestionsLoading ? (
                      <p className="px-3 py-2 text-xs text-slate-500">Searching users...</p>
                    ) : phoneSuggestions.length > 0 ? (
                      phoneSuggestions.map((item) => (
                        <button
                          key={`${item.userId}:${item.phone ?? "none"}`}
                          type="button"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            addRecipient(item);
                          }}
                          className="block w-full border-b border-slate-100 px-3 py-2 text-left last:border-b-0 hover:bg-slate-50"
                        >
                          <p className="text-sm font-semibold text-slate-900">
                            {item.fullName || item.phone || "Employee"}
                          </p>
                          <p className="text-xs text-slate-500">{item.phone}</p>
                        </button>
                      ))
                    ) : (
                      <p className="px-3 py-2 text-xs text-slate-500">No matching users found.</p>
                    )}
                  </div>
                ) : null}
              </div>
            </label>
          </div>
        </div>

        <div className="make-glass-card-static rounded-2xl p-4">
          <div>
            <p className="crm-label mb-1">Selected recipients</p>
            {selectedRecipients.length === 0 ? (
              <p className="mt-1 text-xs text-slate-500">No recipients selected yet.</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedRecipients.map((item) => (
                  <span
                    key={`${item.userId}:${item.phone ?? "none"}`}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700"
                  >
                    {item.fullName || item.phone || "Employee"} · {item.phone}
                    <button
                      type="button"
                      onClick={() => removeRecipient(item.userId)}
                      className="rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 shadow-sm hover:bg-white"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3 make-glass-card-static rounded-2xl p-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="crm-button-primary inline-flex h-9 items-center rounded-lg px-3 text-sm font-semibold"
              onClick={() => setIsConfirmOpen(true)}
              disabled={!canSend}
            >
              {sending ? "Sending SMS..." : "Send SMS"}
            </button>
            <button
              type="button"
              disabled
              className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-400"
            >
              WhatsApp (soon)
            </button>
            <button
              type="button"
              disabled
              className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-400"
            >
              Telegram (soon)
            </button>
          </div>
          <textarea
            value={messageText}
            onChange={(event) => setMessageText(event.target.value)}
            className="crm-input min-h-28 w-full px-3 py-2 text-sm"
            placeholder="Type message text..."
          />
          <p className="crm-subtitle">
            Selected recipients: <span className="font-semibold tabular-nums text-slate-700">{selectedPhones.length}</span>.
            SMS is sent only to selected employees.
          </p>
          {statusMessage ? <p className="text-sm text-emerald-700">{statusMessage}</p> : null}
          {statusError ? <p className="text-sm text-rose-700">{statusError}</p> : null}
        </div>
      </div>
      {isConfirmOpen ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 px-4"
          onClick={() => setIsConfirmOpen(false)}
        >
          <div
            className="crm-modal-surface w-full max-w-xl rounded-2xl p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-900">Confirm SMS sending</h3>
            <div className="mt-3 space-y-1 make-glass-card-static rounded-xl p-3 text-sm text-slate-700">
              <p>
                <span className="font-semibold text-slate-900">Channel:</span> SMS
              </p>
              <p>
                <span className="font-semibold text-slate-900">Recipients:</span> {selectedPhones.length}
              </p>
              <p>
                <span className="font-semibold text-slate-900">Client:</span>{" "}
                {mode === "main"
                  ? `${selectedClientRef?.clientName ?? "n/a"} (${selectedClientRef?.tokenLabel ?? "n/a"})`
                  : currentUser?.corpClientId ?? "n/a"}
              </p>
              <p className="pt-1">
                <span className="font-semibold text-slate-900">Message:</span>
              </p>
              <p className="rounded-lg border border-white/50 bg-white/45 p-2 text-sm whitespace-pre-wrap backdrop-blur-sm">
                {messageText.trim()}
              </p>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsConfirmOpen(false)}
                className="rounded-xl border border-white/70 bg-white/70 px-3 py-2 text-sm font-semibold text-slate-700 backdrop-blur-sm transition hover:bg-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void sendSms()}
                disabled={sending}
                className="crm-button-primary rounded-xl px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sending ? "Sending..." : "Confirm send"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
