"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  RequestRideResult,
  RequestRideStatus,
  RequestRideUserSuggestion,
  YangoApiClientRef,
} from "@/types/crm";

type ClientsResponse = {
  ok: boolean;
  clients?: YangoApiClientRef[];
  error?: string;
};

type CreateResponse = {
  ok: boolean;
  result?: RequestRideResult;
  error?: string;
};

type StatusResponse = {
  ok: boolean;
  result?: RequestRideStatus;
  error?: string;
};

type UserLookupResponse = {
  ok: boolean;
  found?: boolean;
  userId?: string | null;
  error?: string;
};

type UserSuggestResponse = {
  ok: boolean;
  users?: RequestRideUserSuggestion[];
  error?: string;
};

type RequestedRideItem = {
  orderId: string;
  createdAtIso: string;
  scheduledAtIso: string | null;
  tokenLabel: string;
  clientId: string;
  sourceAddress: string;
  destinationAddress: string;
  riderPhone: string;
  rideClass: string;
  status: RequestRideStatus | null;
};

const STORAGE_KEY = "crm.requested-rides.v1";
const STOP_STATUSES = new Set(["completed", "cancelled"]);
const POLL_INTERVAL_MS = 6000;
const POLL_MAX_ATTEMPTS = 30;

function toLocalDateTimeInput(isoDate: string) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "";
  const tzOffsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - tzOffsetMs).toISOString().slice(0, 16);
}

function lifecycleLabel(value: string) {
  switch (value) {
    case "searching":
      return "Searching driver";
    case "driver_assigned":
      return "Driver assigned";
    case "pickup":
      return "Driver arrived";
    case "in_progress":
      return "Ride in progress";
    case "completed":
      return "Ride completed";
    case "cancelled":
      return "Ride cancelled";
    default:
      return "Unknown status";
  }
}

function isExpiredStatus(status: RequestRideStatus | null): boolean {
  if (!status) return false;
  return status.statusRaw.toLowerCase().includes("expire");
}

function isTerminalStatus(status: RequestRideStatus | null): boolean {
  if (!status) return false;
  return STOP_STATUSES.has(status.lifecycleStatus) || isExpiredStatus(status);
}

function getRideStatusLabel(status: RequestRideStatus | null): string {
  if (!status) return "Status pending";
  if (isExpiredStatus(status)) return "Ride expired";
  return lifecycleLabel(status.lifecycleStatus);
}

function MapPinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 21s7-5.7 7-11a7 7 0 10-14 0c0 5.3 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

function CarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 13l1.8-4.7A2 2 0 017.7 7h8.6a2 2 0 011.9 1.3L20 13" />
      <rect x="3" y="11" width="18" height="6" rx="2" />
      <circle cx="7.5" cy="17.5" r="1.2" />
      <circle cx="16.5" cy="17.5" r="1.2" />
    </svg>
  );
}

export default function RequestRidesPage() {
  const [clients, setClients] = useState<YangoApiClientRef[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [clientsError, setClientsError] = useState<string | null>(null);

  const [selectedClientKey, setSelectedClientKey] = useState("");
  const [sourceAddress, setSourceAddress] = useState("");
  const [destinationAddress, setDestinationAddress] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [rideClass, setRideClass] = useState("comfortplus_b2b");
  const [comment, setComment] = useState("");
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleAtInput, setScheduleAtInput] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [phoneChecking, setPhoneChecking] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [showPhoneSuggestions, setShowPhoneSuggestions] = useState(false);
  const [phoneSuggestions, setPhoneSuggestions] = useState<RequestRideUserSuggestion[]>([]);
  const [phoneLookupMessage, setPhoneLookupMessage] = useState<string | null>(null);
  const [phoneLookupOk, setPhoneLookupOk] = useState<boolean | null>(null);
  const [createResult, setCreateResult] = useState<RequestRideResult | null>(null);
  const [status, setStatus] = useState<RequestRideStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [requestedRides, setRequestedRides] = useState<RequestedRideItem[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as RequestedRideItem[];
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((item) => Boolean(item?.orderId && item?.tokenLabel && item?.clientId));
    } catch {
      return [];
    }
  });
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const [rideListError, setRideListError] = useState<string | null>(null);

  const pollAttemptRef = useRef(0);
  const pollTimerRef = useRef<number | null>(null);

  const selectedClient = useMemo(
    () => clients.find((c) => `${c.tokenLabel}:${c.clientId}` === selectedClientKey) ?? null,
    [clients, selectedClientKey],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setClientsLoading(true);
      setClientsError(null);
      try {
        const response = await fetch("/api/request-rides-clients", { cache: "no-store" });
        const data = (await response.json()) as ClientsResponse;
        if (!response.ok || !data.ok) {
          throw new Error(data.error ?? "Failed to load API clients.");
        }
        if (cancelled) return;
        setClients(data.clients ?? []);
      } catch (error) {
        if (!cancelled) {
          setClientsError(error instanceof Error ? error.message : "Failed to load API clients.");
        }
      } finally {
        if (!cancelled) setClientsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        window.clearTimeout(pollTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(requestedRides));
    } catch {
      // Ignore browser storage errors.
    }
  }, [requestedRides]);

  useEffect(() => {
    if (!selectedClient || !phoneNumber.trim()) return;
    const searchQuery = phoneNumber.trim();
    const timer = window.setTimeout(async () => {
      try {
        setSuggestionsLoading(true);
        const response = await fetch("/api/request-rides-user-suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tokenLabel: selectedClient.tokenLabel,
            clientId: selectedClient.clientId,
            query: searchQuery,
          }),
        });
        const data = (await response.json()) as UserSuggestResponse;
        if (!response.ok || !data.ok) {
          throw new Error(data.error ?? "Failed to load user suggestions.");
        }
        setPhoneSuggestions(data.users ?? []);
      } catch {
        setPhoneSuggestions([]);
      } finally {
        setSuggestionsLoading(false);
      }
    }, 220);

    return () => {
      window.clearTimeout(timer);
    };
  }, [phoneNumber, selectedClient]);

  const requestStatus = async (
    rideContext: Pick<RequestedRideItem, "orderId" | "tokenLabel" | "clientId">,
    opts?: { withRetry?: boolean },
  ) => {
    try {
      const response = await fetch("/api/request-rides-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenLabel: rideContext.tokenLabel,
          clientId: rideContext.clientId,
          orderId: rideContext.orderId,
        }),
      });
      const data = (await response.json()) as StatusResponse;
      if (!response.ok || !data.ok || !data.result) {
        throw new Error(data.error ?? "Failed to load status.");
      }
      setStatus(data.result);
      setRequestedRides((prev) =>
        prev.map((item) =>
          item.orderId === data.result?.orderId ? { ...item, status: data.result } : item,
        ),
      );
      setStatusError(null);
      if (isTerminalStatus(data.result)) {
        setPolling(false);
        return;
      }
      if (opts?.withRetry && pollAttemptRef.current < POLL_MAX_ATTEMPTS) {
        pollAttemptRef.current += 1;
        setPolling(true);
        pollTimerRef.current = window.setTimeout(() => {
          void requestStatus(rideContext, { withRetry: true });
        }, POLL_INTERVAL_MS);
      } else {
        setPolling(false);
      }
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : "Failed to load status.");
      setPolling(false);
    }
  };

  useEffect(() => {
    if (requestedRides.length === 0) return;
    const activeRides = requestedRides.filter((ride) => !isTerminalStatus(ride.status));
    if (activeRides.length === 0) return;

    let cancelled = false;
    const refreshStatuses = async () => {
      const updates = await Promise.all(
        activeRides.map(async (ride) => {
          try {
            const response = await fetch("/api/request-rides-status", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                tokenLabel: ride.tokenLabel,
                clientId: ride.clientId,
                orderId: ride.orderId,
              }),
            });
            const data = (await response.json()) as StatusResponse;
            if (!response.ok || !data.ok || !data.result) return null;
            return { orderId: ride.orderId, status: data.result };
          } catch {
            return null;
          }
        }),
      );

      if (cancelled) return;
      const byOrderId = new Map(
        updates
          .filter((item): item is { orderId: string; status: RequestRideStatus } => Boolean(item))
          .map((item) => [item.orderId, item.status]),
      );
      if (byOrderId.size === 0) return;
      setRequestedRides((prev) =>
        prev
          .map((ride) => {
            const nextStatus = byOrderId.get(ride.orderId);
            return nextStatus ? { ...ride, status: nextStatus } : ride;
          })
          .filter((ride) => !isTerminalStatus(ride.status)),
      );
    };

    void refreshStatuses();
    const interval = window.setInterval(() => {
      void refreshStatuses();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [requestedRides]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedClient) {
      setFormError("Select API client first.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    setStatusError(null);
    setCreateResult(null);
    setStatus(null);
    pollAttemptRef.current = 0;
    if (pollTimerRef.current) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    try {
      const scheduleAtIso =
        scheduleEnabled && scheduleAtInput
          ? new Date(scheduleAtInput).toISOString()
          : null;
      const response = await fetch("/api/request-rides-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenLabel: selectedClient.tokenLabel,
          clientId: selectedClient.clientId,
          rideClass,
          sourceAddress,
          destinationAddress,
          phoneNumber,
          comment,
          scheduleAtIso,
        }),
      });
      const data = (await response.json()) as CreateResponse;
      if (!response.ok || !data.ok || !data.result) {
        throw new Error(data.error ?? "Failed to create ride.");
      }
      const created = data.result;
      const createdRide: RequestedRideItem = {
        orderId: created.orderId,
        createdAtIso: new Date().toISOString(),
        scheduledAtIso: scheduleAtIso,
        tokenLabel: selectedClient.tokenLabel,
        clientId: selectedClient.clientId,
        sourceAddress: sourceAddress.trim(),
        destinationAddress: destinationAddress.trim(),
        riderPhone: phoneNumber.trim(),
        rideClass: rideClass.trim() || "comfortplus_b2b",
        status: null,
      };
      setRequestedRides((prev) => [createdRide, ...prev.filter((item) => item.orderId !== created.orderId)]);
      setCreateResult(created);
      await requestStatus(createdRide, { withRetry: true });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Failed to create ride.");
    } finally {
      setSubmitting(false);
    }
  };

  const checkPhoneRegistration = async () => {
    if (!selectedClient) {
      setPhoneLookupOk(false);
      setPhoneLookupMessage("Select API client first.");
      return;
    }
    if (!phoneNumber.trim()) {
      setPhoneLookupOk(false);
      setPhoneLookupMessage("Enter rider phone first.");
      return;
    }
    setPhoneChecking(true);
    setPhoneLookupMessage(null);
    setPhoneLookupOk(null);
    try {
      const response = await fetch("/api/request-rides-user-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenLabel: selectedClient.tokenLabel,
          clientId: selectedClient.clientId,
          phoneNumber,
        }),
      });
      const data = (await response.json()) as UserLookupResponse;
      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to lookup phone.");
      }
      if (data.found && data.userId) {
        setPhoneLookupOk(true);
        setPhoneLookupMessage(`Registered user found (user_id: ${data.userId}).`);
      } else {
        setPhoneLookupOk(false);
        setPhoneLookupMessage("Phone is not registered in selected client context.");
      }
    } catch (error) {
      setPhoneLookupOk(false);
      setPhoneLookupMessage(error instanceof Error ? error.message : "Failed to lookup phone.");
    } finally {
      setPhoneChecking(false);
    }
  };

  const removeRequestedRide = async (orderId: string) => {
    const ride = requestedRides.find((item) => item.orderId === orderId);
    if (!ride) return;
    if (
      !window.confirm(
        "Cancel this order in Yango? It will be removed from the corporate cabinet when the API accepts cancellation.",
      )
    ) {
      return;
    }
    setRideListError(null);
    setDeletingOrderId(orderId);
    try {
      const response = await fetch("/api/yango-order-cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenLabel: ride.tokenLabel,
          clientId: ride.clientId,
          orderId: ride.orderId,
        }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to cancel order in Yango.");
      }
      setRequestedRides((prev) => prev.filter((item) => item.orderId !== orderId));
      if (createResult?.orderId === orderId) {
        setCreateResult(null);
        setStatus(null);
        setStatusError(null);
        setPolling(false);
        if (pollTimerRef.current) {
          window.clearTimeout(pollTimerRef.current);
          pollTimerRef.current = null;
        }
      }
    } catch (error) {
      setRideListError(error instanceof Error ? error.message : "Failed to cancel order.");
    } finally {
      setDeletingOrderId(null);
    }
  };

  return (
    <section className="crm-page">
      <div className="glass-surface overflow-hidden rounded-3xl border border-white/70 bg-white/80">
        <div className="border-b border-white/70 px-5 py-3">
          <p className="text-sm font-semibold text-slate-900">Request Rides</p>
          <p className="text-xs text-muted">Select client and request taxi</p>
        </div>

        <div className="grid min-h-[640px] lg:grid-cols-[460px_1fr]">
          <form onSubmit={handleSubmit} className="space-y-3 border-r border-white/70 p-4">
              <label className="block">
                <span className="crm-label mb-1 block">Select the client</span>
                <select
                  value={selectedClientKey}
                  onChange={(event) => {
                    setSelectedClientKey(event.target.value);
                    setPhoneSuggestions([]);
                    setPhoneLookupOk(null);
                    setPhoneLookupMessage(null);
                  }}
                  className="crm-input h-11 w-full px-3 text-sm"
                  disabled={clientsLoading}
                >
                  {clientsLoading ? <option value="">Loading clients...</option> : null}
                  {!clientsLoading ? <option value="">Select Client</option> : null}
                  {!clientsLoading && clients.length === 0 ? <option>No clients available</option> : null}
                  {clients.map((client) => (
                    <option key={`${client.tokenLabel}:${client.clientId}`} value={`${client.tokenLabel}:${client.clientId}`}>
                      {client.clientName} ({client.tokenLabel})
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="crm-label mb-1 block">Rider phone</span>
                <div className="relative">
                  <input
                    value={phoneNumber}
                    onChange={(event) => {
                      setPhoneNumber(event.target.value);
                      if (!event.target.value.trim()) {
                        setPhoneSuggestions([]);
                      }
                      setShowPhoneSuggestions(true);
                      setPhoneLookupOk(null);
                      setPhoneLookupMessage(null);
                    }}
                    onFocus={() => setShowPhoneSuggestions(true)}
                    onBlur={() => {
                      window.setTimeout(() => setShowPhoneSuggestions(false), 120);
                    }}
                    className="crm-input h-11 w-full px-3 text-sm"
                    placeholder="+972..."
                    required
                  />
                  {showPhoneSuggestions && selectedClient && phoneNumber.trim() ? (
                    <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-2xl border border-white/70 bg-white/85 p-1 shadow-[0_20px_45px_rgba(15,23,42,0.15)] backdrop-blur">
                      {suggestionsLoading ? (
                        <p className="px-3 py-2 text-xs text-slate-500">Searching users...</p>
                      ) : phoneSuggestions.length > 0 ? (
                        phoneSuggestions.map((item) => (
                          <button
                            key={`${item.userId}:${item.phone ?? "none"}`}
                            type="button"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              if (item.phone) {
                                setPhoneNumber(item.phone);
                              }
                              setPhoneLookupOk(true);
                              setPhoneLookupMessage(`Selected ${item.userId}${item.phone ? ` (${item.phone})` : ""}.`);
                              setShowPhoneSuggestions(false);
                            }}
                            className="crm-hover-lift w-full rounded-xl px-3 py-2 text-left hover:bg-white/90"
                          >
                            <p className="text-sm font-semibold text-slate-800">
                              {item.fullName || "Employee"}
                            </p>
                            <p className="text-xs text-slate-600">
                              {item.phone ?? "Phone n/a"} • {item.userId} • {item.source}
                            </p>
                          </button>
                        ))
                      ) : (
                        <p className="px-3 py-2 text-xs text-slate-500">No matching users found.</p>
                      )}
                    </div>
                  ) : null}
                </div>
              </label>

              <label className="block">
                <span className="crm-label mb-1 block">Point A</span>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                    <MapPinIcon />
                  </span>
                  <input
                    value={sourceAddress}
                    onChange={(event) => setSourceAddress(event.target.value)}
                    className="crm-input h-11 w-full px-10 text-sm"
                    placeholder="Nahal Oz 19"
                    required
                  />
                </div>
              </label>

              <label className="block">
                <span className="crm-label mb-1 block">Point B</span>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                    <MapPinIcon />
                  </span>
                  <input
                    value={destinationAddress}
                    onChange={(event) => setDestinationAddress(event.target.value)}
                    className="crm-input h-11 w-full px-10 text-sm"
                    placeholder="Nahal Oz 22"
                    required
                  />
                </div>
              </label>

              <button
                type="button"
                className="crm-hover-lift w-full rounded-xl border border-white/70 bg-white/70 px-3 py-2 text-left text-sm text-slate-600"
              >
                + Add stop
              </button>

              <label className="block">
                <span className="crm-label mb-1 block">Tariff class</span>
                <input
                  value={rideClass}
                  onChange={(event) => setRideClass(event.target.value)}
                  className="crm-input h-11 w-full px-3 text-sm"
                  placeholder="comfortplus_b2b"
                />
              </label>

              <label className="block">
                <span className="crm-label mb-1 block">Driver instructions...</span>
                <textarea
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  className="crm-input min-h-20 w-full resize-y px-3 py-2 text-sm"
                  placeholder="Main cost center"
                />
              </label>

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={scheduleEnabled}
                  onChange={(event) => {
                    setScheduleEnabled(event.target.checked);
                    if (!event.target.checked) setScheduleAtInput("");
                    if (event.target.checked && !scheduleAtInput) {
                      setScheduleAtInput(
                        toLocalDateTimeInput(new Date(Date.now() + 15 * 60000).toISOString()),
                      );
                    }
                  }}
                  className="h-4 w-4 rounded border-border accent-accent"
                />
                Schedule ride
              </label>
              {scheduleEnabled ? (
                <label className="block">
                  <span className="crm-label mb-1 block">Schedule datetime</span>
                  <input
                    type="datetime-local"
                    value={scheduleAtInput}
                    onChange={(event) => setScheduleAtInput(event.target.value)}
                    className="crm-input h-11 w-full px-3 text-sm"
                  />
                </label>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void checkPhoneRegistration()}
                  disabled={phoneChecking || !selectedClient || !phoneNumber.trim()}
                  className="crm-hover-lift rounded-lg border border-white/70 bg-white/70 px-3 py-1.5 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-55"
                >
                  {phoneChecking ? "Checking phone..." : "Check phone registration"}
                </button>
                {phoneLookupMessage ? (
                  <p className={`text-sm ${phoneLookupOk ? "text-emerald-700" : "text-rose-700"}`}>
                    {phoneLookupMessage}
                  </p>
                ) : null}
              </div>

              {clientsError ? <p className="text-sm text-rose-700">{clientsError}</p> : null}
              {formError ? <p className="text-sm text-rose-700">{formError}</p> : null}
              {rideListError ? <p className="text-sm text-rose-700">{rideListError}</p> : null}
              <button
                type="submit"
                disabled={submitting || clientsLoading || !selectedClient}
                className="crm-button-primary h-11 w-full rounded-xl text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Requesting ride..." : "Request ride"}
              </button>
          </form>

          <div className="relative p-4">
            <div className="relative h-[390px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
                <iframe
                  src="https://www.openstreetmap.org/export/embed.html?bbox=34.7618%2C32.0753%2C34.8188%2C32.0953&layer=mapnik&marker=32.0853%2C34.7818"
                  className="h-full w-full border-0"
                  title="Route map"
                />
                <div className="absolute left-4 top-4 rounded-xl border border-white/80 bg-white/92 p-3 text-sm text-slate-700 shadow-sm">
                  <p className="font-semibold text-slate-900">Route preview</p>
                  <p className="mt-1">A: {sourceAddress || "Pickup point"}</p>
                  <p>B: {destinationAddress || "Dropoff point"}</p>
                </div>
                <div className="absolute bottom-5 right-5 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white">
                  Support
                </div>
              </div>

            <article className="mt-3 rounded-2xl border border-white/70 bg-white/75 p-4">
                <p className="crm-label">Requested rides</p>
                {requestedRides.length === 0 ? (
                  <p className="mt-2 text-sm text-muted">No rides requested yet.</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {requestedRides.map((ride) => (
                      <details
                        key={ride.orderId}
                        className="overflow-hidden rounded-2xl border border-white/80 bg-white/90 shadow-[0_12px_28px_rgba(15,23,42,0.08)]"
                      >
                        <summary className="cursor-pointer list-none p-3 text-sm text-slate-800">
                          <div className="flex items-start gap-2">
                            <span className="mt-0.5 rounded-lg bg-slate-100 p-1 text-slate-700">
                              <CarIcon />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-slate-900">Scheduled ride</p>
                              <p className="text-xs text-slate-600">
                                {new Date(ride.scheduledAtIso ?? ride.createdAtIso).toLocaleString()} local time
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                We&apos;ll start looking for a car in advance and notify you when it&apos;s ready
                              </p>
                            </div>
                            <span className="text-xs text-slate-500">
                              {getRideStatusLabel(ride.status)}
                            </span>
                          </div>
                          <div className="mt-2 flex items-center gap-2 border-t border-slate-100 pt-2 text-sm text-slate-700">
                            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-400 text-[10px]">
                              o
                            </span>
                            <span className="truncate">
                              {ride.sourceAddress} {"->"} {ride.destinationAddress}
                            </span>
                          </div>
                        </summary>
                        <div className="space-y-1 border-t border-slate-100 bg-white/80 px-3 py-2 text-sm text-slate-700">
                          <p>Order: {ride.orderId}</p>
                          <p>Phone: {ride.riderPhone}</p>
                          <p>Class: {ride.rideClass}</p>
                          <p>Client: {ride.tokenLabel}</p>
                          <p>Status raw: {ride.status?.statusRaw ?? "n/a"}</p>
                          <div className="pt-1">
                            <button
                              type="button"
                              disabled={deletingOrderId === ride.orderId}
                              onClick={() => void removeRequestedRide(ride.orderId)}
                              className="crm-hover-lift rounded-lg border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {deletingOrderId === ride.orderId ? "Cancelling…" : "Remove (cancel in Yango)"}
                            </button>
                          </div>
                        </div>
                      </details>
                    ))}
                  </div>
                )}
            </article>
          </div>
        </div>
      </div>
    </section>
  );
}
