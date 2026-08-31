"use client";

import { useCallback, useEffect, useState } from "react";
import { isTerminalOrderStatus, type YangoOrderRouteSnapshot } from "@/lib/yango-change-destinations";
import type { PreOrder } from "@/types/crm";

type AddressSuggestion = {
  label?: string;
  displayName?: string;
  description?: string;
  id?: string;
  lat?: number;
  lon?: number;
};

function suggestionLabel(suggestion: AddressSuggestion): string {
  return (
    suggestion.displayName?.trim() ||
    suggestion.label?.trim() ||
    suggestion.description?.trim() ||
    ""
  );
}

export type OrderRouteEditorRef = {
  tokenLabel: string;
  clientId: string;
  orderId: string;
  driverAssigned?: boolean;
  orderStatus?: string | null;
  pointA?: string | null;
  pointB?: string | null;
};

type OrderRouteEditorProps = {
  order: OrderRouteEditorRef;
  onRouteUpdated?: (route: YangoOrderRouteSnapshot) => void;
  /** Compact styling for nested cards (Requested Rides). */
  compact?: boolean;
};

export function OrderRouteEditor({ order, onRouteUpdated, compact }: OrderRouteEditorProps) {
  const [route, setRoute] = useState<YangoOrderRouteSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [isAddingStop, setIsAddingStop] = useState(false);
  const [draftAddress, setDraftAddress] = useState("");
  const [draftLat, setDraftLat] = useState<number | null>(null);
  const [draftLon, setDraftLon] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);

  const loadRoute = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const params = new URLSearchParams({
        tokenLabel: order.tokenLabel,
        clientId: order.clientId,
        orderId: order.orderId,
      });
      const response = await fetch(`/api/yango-order-change-destinations?${params}`, {
        cache: "no-store",
      });
      const data = (await response.json()) as {
        ok?: boolean;
        route?: YangoOrderRouteSnapshot;
        error?: string;
      };
      if (!response.ok || !data.ok || !data.route) {
        throw new Error(data.error ?? "Failed to load route.");
      }
      setRoute(data.route);
    } catch (err) {
      setRoute(null);
      setError(err instanceof Error ? err.message : "Failed to load route.");
    } finally {
      setLoading(false);
    }
  }, [order.clientId, order.orderId, order.tokenLabel]);

  useEffect(() => {
    void loadRoute();
    setEditingIndex(null);
    setIsAddingStop(false);
    setDraftAddress("");
    setDraftLat(null);
    setDraftLon(null);
    setSuggestions([]);
  }, [loadRoute]);

  useEffect(() => {
    if (editingIndex == null && !isAddingStop) return;
    const q = draftAddress.trim();
    if (q.length < 3) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSuggestLoading(true);
      try {
        const response = await fetch("/api/address-suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q }),
        });
        const data = (await response.json()) as {
          ok?: boolean;
          suggestions?: AddressSuggestion[];
        };
        if (!cancelled) setSuggestions(data.suggestions ?? []);
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setSuggestLoading(false);
      }
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [draftAddress, editingIndex, isAddingStop]);

  const applySuggestion = (suggestion: AddressSuggestion) => {
    setDraftAddress(suggestionLabel(suggestion));
    setDraftLat(typeof suggestion.lat === "number" ? suggestion.lat : null);
    setDraftLon(typeof suggestion.lon === "number" ? suggestion.lon : null);
    setSuggestions([]);
  };

  const confirmIfDriver = (driverAssigned: boolean) => {
    if (!driverAssigned) return true;
    return window.confirm(
      "A driver is already assigned. Changing this stop will update the route for the driver. Fare and ETA may change. Continue?",
    );
  };

  const startEdit = (index: number) => {
    if (!route) return;
    const point = route.interimDestinations[index];
    if (!point) return;
    setIsAddingStop(false);
    setEditingIndex(index);
    setDraftAddress(point.fullname);
    setDraftLat(point.lat);
    setDraftLon(point.lon);
    setSuggestions([]);
    setError(null);
    setSuccess(null);
  };

  const startAdd = () => {
    setEditingIndex(null);
    setIsAddingStop(true);
    setDraftAddress("");
    setDraftLat(null);
    setDraftLon(null);
    setSuggestions([]);
    setError(null);
    setSuccess(null);
  };

  const cancelDraft = () => {
    setEditingIndex(null);
    setIsAddingStop(false);
    setSuggestions([]);
  };

  const saveInterim = async (index: number) => {
    if (!route) return;
    if (draftLat == null || draftLon == null) {
      setError("Pick an address suggestion so the stop has coordinates.");
      return;
    }
    const driverAssigned = route.driverAssigned || Boolean(order.driverAssigned);
    if (!confirmIfDriver(driverAssigned)) return;

    setSavingIndex(index);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/yango-order-change-destinations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenLabel: order.tokenLabel,
          clientId: order.clientId,
          orderId: order.orderId,
          interimIndex: index,
          address: draftAddress.trim(),
          lat: draftLat,
          lon: draftLon,
        }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        route?: YangoOrderRouteSnapshot;
        error?: string;
      };
      if (!response.ok || !data.ok || !data.route) {
        throw new Error(data.error ?? "Failed to change stop.");
      }
      setRoute(data.route);
      cancelDraft();
      setSuccess("Intermediate stop updated in Yango.");
      onRouteUpdated?.(data.route);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change stop.");
    } finally {
      setSavingIndex(null);
    }
  };

  const saveNewStop = async () => {
    if (!route) return;
    if (draftLat == null || draftLon == null) {
      setError("Pick an address suggestion so the stop has coordinates.");
      return;
    }
    const driverAssigned = route.driverAssigned || Boolean(order.driverAssigned);
    if (!confirmIfDriver(driverAssigned)) return;

    setAdding(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/yango-order-change-destinations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenLabel: order.tokenLabel,
          clientId: order.clientId,
          orderId: order.orderId,
          action: "addInterim",
          address: draftAddress.trim(),
          lat: draftLat,
          lon: draftLon,
        }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        route?: YangoOrderRouteSnapshot;
        error?: string;
      };
      if (!response.ok || !data.ok || !data.route) {
        throw new Error(data.error ?? "Failed to add stop.");
      }
      setRoute(data.route);
      cancelDraft();
      setSuccess("Intermediate stop added in Yango.");
      onRouteUpdated?.(data.route);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add stop.");
    } finally {
      setAdding(false);
    }
  };

  const shellClass = compact
    ? "mt-3 rounded-lg border border-slate-200 bg-slate-50/80 p-2.5 text-sm"
    : "mt-4 rounded-xl border border-slate-200 bg-white p-3 text-sm";

  if (loading && !route) {
    return <div className={shellClass + " text-muted"}>Loading route…</div>;
  }

  if (!route) {
    return error ? (
      <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-sm text-rose-800">
        {error}
      </div>
    ) : null;
  }

  const terminal = isTerminalOrderStatus(route.status ?? order.orderStatus);
  const canMutate = !terminal;

  const addressDraftField = (
    <div className="relative mt-1">
      <input
        type="text"
        value={draftAddress}
        onChange={(event) => {
          setDraftAddress(event.target.value);
          setDraftLat(null);
          setDraftLon(null);
        }}
        className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-slate-400"
        placeholder="Search address…"
        autoFocus
      />
      {suggestLoading ? <p className="mt-1 text-[11px] text-muted">Searching…</p> : null}
      {suggestions.length > 0 ? (
        <ul className="absolute z-10 mt-1 max-h-40 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-sm">
          {suggestions.map((suggestion) => {
            const label = suggestionLabel(suggestion);
            return (
              <li key={suggestion.id ?? label}>
                <button
                  type="button"
                  className="block w-full px-2 py-1.5 text-left text-xs hover:bg-slate-50"
                  onClick={() => applySuggestion(suggestion)}
                >
                  {label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      <p className="mt-1 text-[11px] text-muted">
        {draftLat != null && draftLon != null
          ? `Coords ${draftLat.toFixed(5)}, ${draftLon.toFixed(5)}`
          : "Select a suggestion to lock coordinates."}
      </p>
    </div>
  );

  return (
    <div className={shellClass}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Route</p>
        <button
          type="button"
          onClick={() => void loadRoute()}
          className="text-xs font-medium text-slate-600 hover:text-slate-900"
        >
          Refresh
        </button>
      </div>

      <ol className="mt-3 space-y-2">
        <li className="rounded-lg border border-slate-100 bg-white px-3 py-2">
          <p className="text-[10px] font-medium uppercase text-muted">Start</p>
          <p className="mt-0.5 font-medium text-slate-900">
            {route.source?.fullname ?? order.pointA ?? "—"}
          </p>
        </li>

        {route.interimDestinations.map((point, index) => {
          const isEditing = editingIndex === index;
          return (
            <li
              key={`interim-${index}-${point.fullname}`}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-medium uppercase text-muted">Stop {index + 1}</p>
                  {!isEditing ? (
                    <p className="mt-0.5 font-medium text-slate-900">{point.fullname}</p>
                  ) : (
                    addressDraftField
                  )}
                </div>
                {canMutate ? (
                  <div className="flex shrink-0 gap-1">
                    {!isEditing ? (
                      <button
                        type="button"
                        onClick={() => startEdit(index)}
                        className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Edit
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          disabled={savingIndex === index}
                          onClick={() => void saveInterim(index)}
                          className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800 disabled:opacity-60"
                        >
                          {savingIndex === index ? "Saving…" : "Save"}
                        </button>
                        <button
                          type="button"
                          disabled={savingIndex === index}
                          onClick={cancelDraft}
                          className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600"
                        >
                          Cancel
                        </button>
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}

        {isAddingStop ? (
          <li className="rounded-lg border border-sky-200 bg-sky-50/50 px-3 py-2">
            <p className="text-[10px] font-medium uppercase text-sky-800">New stop</p>
            {addressDraftField}
            <div className="mt-2 flex gap-1">
              <button
                type="button"
                disabled={adding}
                onClick={() => void saveNewStop()}
                className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800 disabled:opacity-60"
              >
                {adding ? "Adding…" : "Add stop"}
              </button>
              <button
                type="button"
                disabled={adding}
                onClick={cancelDraft}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600"
              >
                Cancel
              </button>
            </div>
          </li>
        ) : null}

        <li className="rounded-lg border border-slate-100 bg-white px-3 py-2">
          <p className="text-[10px] font-medium uppercase text-muted">Final</p>
          <p className="mt-0.5 font-medium text-slate-900">
            {route.destination?.fullname ?? order.pointB ?? "—"}
          </p>
        </li>
      </ol>

      {canMutate && !isAddingStop && editingIndex == null ? (
        <button
          type="button"
          onClick={startAdd}
          className="mt-3 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
        >
          {route.interimDestinations.length === 0
            ? "Add intermediate stop"
            : "Add another stop"}
        </button>
      ) : null}

      {terminal ? (
        <p className="mt-2 text-xs text-muted">Route cannot be edited for this order status.</p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-rose-700">{error}</p> : null}
      {success ? <p className="mt-2 text-xs text-emerald-700">{success}</p> : null}
    </div>
  );
}

/** Pre-Orders drawer wrapper — same editor. */
export function PreOrderRouteEditor({
  preOrder,
  onRouteUpdated,
}: {
  preOrder: PreOrder;
  onRouteUpdated?: (route: YangoOrderRouteSnapshot) => void;
}) {
  return (
    <OrderRouteEditor
      order={{
        tokenLabel: preOrder.tokenLabel,
        clientId: preOrder.clientId,
        orderId: preOrder.orderId,
        driverAssigned: preOrder.driverAssigned,
        orderStatus: preOrder.orderStatus,
        pointA: preOrder.pointA,
        pointB: preOrder.pointB,
      }}
      onRouteUpdated={onRouteUpdated}
    />
  );
}
