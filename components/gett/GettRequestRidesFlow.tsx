"use client";

import { useEffect, useMemo, useState } from "react";
import { RequestRidesMap, type RequestRidesMapPoint, type RouteTrafficFeatureCollection } from "@/components/request-rides/RequestRidesMap";
import {
  GettFirstOrderOnboarding,
  getGettFirstOrderDone,
  markGettFirstOrderDone,
} from "@/components/gett/GettFirstOrderOnboarding";

type RoutePoint = { id: string; role: "pickup" | "stop" | "destination"; address: string; lat?: number; lon?: number };
type SavedRecipient = { id: string; name: string; phone: string };
type QuoteProduct = { id?: string; name?: string; availability?: string; price?: { formatted?: string }; eta?: { formatted?: string } } & Record<string, unknown>;

function asNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function extractQuoteId(raw: unknown): string {
  const root = raw as Record<string, unknown> | null;
  if (!root) return "";
  const data = (root.data as Record<string, unknown> | undefined) ?? {};
  const top = String(data.estimation_id ?? data.quote_id ?? "").trim();
  if (top) return top;
  const products = Array.isArray(data.products) ? data.products : [];
  for (const item of products) {
    const row = item as Record<string, unknown>;
    const candidate = String(row.quote_id ?? row.estimation_id ?? row.quoteId ?? "").trim();
    if (candidate) return candidate;
  }
  return "";
}

export function GettRequestRidesFlow() {
  const [pickup, setPickup] = useState<RoutePoint>({ id: "pickup", role: "pickup", address: "" });
  const [destination, setDestination] = useState<RoutePoint>({ id: "destination", role: "destination", address: "" });
  const [stops, setStops] = useState<RoutePoint[]>([]);
  const [activeMapPointId, setActiveMapPointId] = useState<string>("pickup");
  const [scheduledAt, setScheduledAt] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [savedRecipients, setSavedRecipients] = useState<SavedRecipient[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [quoteId, setQuoteId] = useState("");
  const [products, setProducts] = useState<QuoteProduct[]>([]);
  const [orderId, setOrderId] = useState("");
  const [statusPayload, setStatusPayload] = useState("");
  const [routeCoordinates, setRouteCoordinates] = useState<Array<[number, number]>>([]);
  const [routeTrafficGeojson, setRouteTrafficGeojson] = useState<RouteTrafficFeatureCollection | null>(null);
  const [routeMeta, setRouteMeta] = useState<{ distance?: string; duration?: string }>({});
  const [loading, setLoading] = useState<"" | "route" | "quote" | "create" | "status" | "cancel" | "geo">("");
  const [error, setError] = useState("");
  const [showFirstOrderGuide, setShowFirstOrderGuide] = useState(false);

  useEffect(() => {
    setShowFirstOrderGuide(!getGettFirstOrderDone());
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("gett-recipients");
      if (!raw) return;
      const parsed = JSON.parse(raw) as SavedRecipient[];
      if (Array.isArray(parsed)) setSavedRecipients(parsed.slice(0, 20));
    } catch {
      // ignore
    }
  }, []);

  /** Business API returns a distinct quote_id per product; keep it in sync with the dropdown. */
  useEffect(() => {
    if (!selectedProductId || products.length === 0) return;
    const row = products.find((item) => String(item.id ?? "") === selectedProductId);
    if (!row) return;
    const perProduct = String(row.quote_id ?? row.quoteId ?? "").trim();
    if (perProduct) setQuoteId(perProduct);
  }, [selectedProductId, products]);

  const orderedPoints = useMemo(() => [pickup, ...stops, destination], [pickup, stops, destination]);
  const mapPoints = useMemo<RequestRidesMapPoint[]>(
    () =>
      orderedPoints
        .filter((point) => typeof point.lat === "number" && typeof point.lon === "number")
        .map((point) => ({
          id: point.id,
          role: point.role,
          label: point.address || (point.role === "pickup" ? "A" : point.role === "destination" ? "B" : "Stop"),
          lat: point.lat as number,
          lon: point.lon as number,
        })),
    [orderedPoints],
  );

  async function geocodeAddress(id: string, address: string) {
    if (!address.trim()) return;
    setLoading("geo");
    setError("");
    try {
      const res = await fetch("/api/address-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: address, language: "en" }),
      });
      const data = (await res.json()) as { ok?: boolean; suggestions?: Array<{ lat: number; lon: number; displayName?: string; label?: string }>; error?: string };
      if (!res.ok || !data.ok || !data.suggestions?.length) throw new Error(data.error ?? "Address not found.");
      const first = data.suggestions[0]!;
      updatePoint(id, {
        lat: first.lat,
        lon: first.lon,
        address: first.label ?? first.displayName ?? address,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Geocoding failed.");
    } finally {
      setLoading("");
    }
  }

  function updatePoint(id: string, patch: Partial<RoutePoint>) {
    if (id === "pickup") {
      setPickup((prev) => ({ ...prev, ...patch }));
      return;
    }
    if (id === "destination") {
      setDestination((prev) => ({ ...prev, ...patch }));
      return;
    }
    setStops((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  async function onMapClick(point: { lat: number; lon: number }) {
    updatePoint(activeMapPointId, { lat: point.lat, lon: point.lon });
    try {
      const response = await fetch("/api/address-reverse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: point.lat, lon: point.lon, language: "en" }),
      });
      const data = (await response.json()) as { ok?: boolean; suggestion?: { label?: string; displayName?: string } };
      if (response.ok && data.ok && data.suggestion) {
        updatePoint(activeMapPointId, { address: data.suggestion.label ?? data.suggestion.displayName ?? "" });
      }
    } catch {
      // non-blocking
    }
  }

  useEffect(() => {
    const withCoords = orderedPoints.filter((point) => typeof point.lat === "number" && typeof point.lon === "number");
    if (withCoords.length < 2) {
      setRouteCoordinates([]);
      setRouteTrafficGeojson(null);
      setRouteMeta({});
      return;
    }
    const timer = window.setTimeout(async () => {
      setLoading((prev) => (prev ? prev : "route"));
      try {
        const res = await fetch("/api/route-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            points: withCoords.map((point) => ({ lat: point.lat, lon: point.lon })),
          }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          route?: {
            geojson?: { coordinates?: Array<[number, number]> };
            trafficGeojson?: RouteTrafficFeatureCollection | null;
            distanceMeters?: number | null;
            durationSeconds?: number | null;
          };
        };
        if (res.ok && data.ok && data.route) {
          setRouteCoordinates(data.route.geojson?.coordinates ?? []);
          setRouteTrafficGeojson(data.route.trafficGeojson ?? null);
          setRouteMeta({
            distance:
              typeof data.route.distanceMeters === "number"
                ? `${(data.route.distanceMeters / 1000).toFixed(1)} km`
                : undefined,
            duration:
              typeof data.route.durationSeconds === "number"
                ? `${Math.round(data.route.durationSeconds / 60)} min`
                : undefined,
          });
        }
      } finally {
        setLoading((prev) => (prev === "route" ? "" : prev));
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [orderedPoints]);

  async function requestQuote() {
    setLoading("quote");
    setError("");
    try {
      const response = await fetch("/api/gett/request-rides/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originAddress: pickup.address,
          originLat: pickup.lat,
          originLng: pickup.lon,
          destinationAddress: destination.address,
          destinationLat: destination.lat,
          destinationLng: destination.lon,
          waypoints: stops.map((stop) => ({ address: stop.address, lat: stop.lat, lng: stop.lon })),
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string; result?: Record<string, unknown> };
      if (!response.ok || !data.ok || !data.result) throw new Error(data.error ?? "Failed to fetch quote.");
      const productsRaw = ((data.result.data as Record<string, unknown> | undefined)?.products ?? []) as QuoteProduct[];
      setProducts(productsRaw);
      const firstAvailable = productsRaw.find((item) => String(item.availability ?? "").toLowerCase() === "available");
      setSelectedProductId(String(firstAvailable?.id ?? productsRaw[0]?.id ?? ""));
      const extractedQuoteId = extractQuoteId(data.result);
      setQuoteId(extractedQuoteId || `quote-${Date.now()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Quote error.");
    } finally {
      setLoading("");
    }
  }

  async function createOrder() {
    setLoading("create");
    setError("");
    try {
      const response = await fetch("/api/gett/request-rides/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: selectedProductId,
          quoteId,
          userName: recipientName,
          userPhone: recipientPhone,
          originAddress: pickup.address,
          originLat: pickup.lat,
          originLng: pickup.lon,
          destinationAddress: destination.address,
          destinationLat: destination.lat,
          destinationLng: destination.lon,
          waypoints: stops.map((stop) => ({ address: stop.address, lat: stop.lat, lng: stop.lon })),
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string; result?: { order?: { id?: string } } };
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Failed to create Gett order.");
      const createdOrderId = data.result?.order?.id ?? "";
      if (!createdOrderId) throw new Error("Order created, but order ID is missing.");
      setOrderId(createdOrderId);
      markGettFirstOrderDone();
      setShowFirstOrderGuide(false);
      setStatusPayload("Order created. Click Refresh status.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create error.");
    } finally {
      setLoading("");
    }
  }

  async function refreshStatus() {
    if (!orderId) return;
    setLoading("status");
    setError("");
    try {
      const response = await fetch("/api/gett/request-rides/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string; result?: { order?: { status?: string; scheduled_at?: string } } };
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Failed to fetch status.");
      const status = data.result?.order?.status ?? "Unknown";
      const scheduled = data.result?.order?.scheduled_at ?? "n/a";
      setStatusPayload(`Status: ${status}. Scheduled: ${scheduled}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Status error.");
    } finally {
      setLoading("");
    }
  }

  async function cancelOrder() {
    if (!orderId) return;
    setLoading("cancel");
    setError("");
    try {
      const response = await fetch("/api/gett/orders/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Failed to cancel.");
      setStatusPayload("Order cancelled.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel error.");
    } finally {
      setLoading("");
    }
  }

  function addStop() {
    setStops((prev) => [...prev, { id: `stop-${Date.now()}-${prev.length}`, role: "stop", address: "" }]);
  }

  function saveRecipient() {
    if (!recipientName.trim() || !recipientPhone.trim()) return;
    const next: SavedRecipient[] = [
      { id: `${Date.now()}`, name: recipientName.trim(), phone: recipientPhone.trim() },
      ...savedRecipients.filter((item) => item.phone !== recipientPhone.trim()),
    ].slice(0, 20);
    setSavedRecipients(next);
    window.localStorage.setItem("gett-recipients", JSON.stringify(next));
  }

  return (
    <section className="crm-page">
      <div className="mt-3">
        <GettFirstOrderOnboarding visible={showFirstOrderGuide} />
      </div>

      <div className="grid min-h-[72vh] gap-3 xl:grid-cols-[420px_1fr]">
        <aside className="crm-surface rounded-3xl p-4">
          <h3 className="crm-section-title">Passenger</h3>
          <div className="mt-3 grid gap-2">
            <input className="crm-input px-3 py-2 text-sm" placeholder="Name" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} />
            <input className="crm-input px-3 py-2 text-sm" placeholder="Phone" value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)} />
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800" onClick={saveRecipient}>
                Save person
              </button>
              {savedRecipients.slice(0, 5).map((person) => (
                <button
                  key={person.id}
                  type="button"
                  className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700"
                  onClick={() => {
                    setRecipientName(person.name);
                    setRecipientPhone(person.phone);
                  }}
                >
                  {person.name}
                </button>
              ))}
            </div>
          </div>

          <h3 className="crm-section-title mt-5">Route</h3>
          <div className="mt-3 grid gap-2">
            {orderedPoints.map((point, idx) => (
              <div key={point.id} className="rounded-2xl border border-slate-200 bg-white p-2.5">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-700">
                    {point.role === "pickup" ? "Point A" : point.role === "destination" ? "Point B" : `Stop ${idx}`}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <button type="button" className={`rounded-lg border px-2 py-1 text-[11px] ${activeMapPointId === point.id ? "border-amber-300 bg-amber-50 text-amber-900" : "border-slate-200 bg-white text-slate-700"}`} onClick={() => setActiveMapPointId(point.id)}>
                      Set on map
                    </button>
                    <button type="button" className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700" onClick={() => void geocodeAddress(point.id, point.address)}>
                      Geocode
                    </button>
                    {point.role === "stop" ? (
                      <button
                        type="button"
                        className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] text-rose-700"
                        onClick={() => setStops((prev) => prev.filter((row) => row.id !== point.id))}
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                </div>
                <input
                  className="crm-input w-full px-3 py-2 text-sm"
                  placeholder={point.role === "pickup" ? "Pickup address" : point.role === "destination" ? "Destination address" : "Intermediate stop"}
                  value={point.address}
                  onChange={(e) => updatePoint(point.id, { address: e.target.value })}
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  {typeof point.lat === "number" && typeof point.lon === "number"
                    ? `${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}`
                    : "Coordinates not set yet"}
                </p>
              </div>
            ))}
            <button type="button" className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800" onClick={addStop}>
              + Add intermediate stop
            </button>
            <input className="crm-input px-3 py-2 text-sm" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          </div>

          <h3 className="crm-section-title mt-5">Quote & order</h3>
          <div className="mt-3 grid gap-2">
            <button type="button" className="crm-button-primary rounded-xl px-4 py-2 text-sm font-semibold" onClick={() => void requestQuote()} disabled={loading !== ""}>
              {loading === "quote" ? "Loading quote..." : "Get Quote"}
            </button>
            <input className="crm-input px-3 py-2 text-sm" placeholder="Quote ID" value={quoteId} onChange={(e) => setQuoteId(e.target.value)} />
            <select className="crm-input px-3 py-2 text-sm" value={selectedProductId} onChange={(e) => setSelectedProductId(e.target.value)}>
              <option value="">Select product</option>
              {products.map((item) => (
                <option key={String(item.id ?? Math.random())} value={String(item.id ?? "")}>
                  {item.name ?? "Unknown"} · {item.price?.formatted ?? "n/a"} · {item.availability ?? "n/a"}
                </option>
              ))}
            </select>
            <button type="button" className="crm-button-primary rounded-xl px-4 py-2 text-sm font-semibold" onClick={() => void createOrder()} disabled={loading !== ""}>
              {loading === "create" ? "Creating..." : "Create Order"}
            </button>
          </div>
        </aside>

        <section className="crm-surface overflow-hidden rounded-3xl p-2">
          <div className="h-[62vh] overflow-hidden rounded-2xl border border-slate-200">
            <RequestRidesMap
              points={mapPoints}
              routeCoordinates={routeCoordinates}
              routeTrafficGeojson={routeTrafficGeojson}
              onMapClick={(point) => void onMapClick(point)}
              onPointDrag={({ id, lat, lon }) => updatePoint(id, { lat, lon })}
              fitPadding={{ top: 64, right: 64, bottom: 64, left: 420 }}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 px-2 pb-1 text-sm text-slate-700">
            <span>Active point for map click: <strong>{activeMapPointId}</strong></span>
            {routeMeta.distance || routeMeta.duration ? (
              <span>
                · Route: {routeMeta.distance ?? "n/a"} · {routeMeta.duration ?? "n/a"}
              </span>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 px-2 pb-2">
            <input className="crm-input max-w-sm px-3 py-2 text-sm" placeholder="Order ID" value={orderId} onChange={(e) => setOrderId(e.target.value)} />
            <button type="button" className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800" onClick={() => void refreshStatus()} disabled={loading !== "" || !orderId}>
              {loading === "status" ? "Refreshing..." : "Refresh status"}
            </button>
            <button type="button" className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800" onClick={() => void cancelOrder()} disabled={loading !== "" || !orderId}>
              {loading === "cancel" ? "Cancelling..." : "Cancel order"}
            </button>
            {loading === "route" || loading === "geo" ? <span className="text-xs text-slate-500">Updating map...</span> : null}
          </div>
          {statusPayload ? <p className="px-2 text-sm text-slate-800">{statusPayload}</p> : null}
          {error ? <p className="px-2 text-sm text-rose-700">{error}</p> : null}
        </section>
      </div>
    </section>
  );
}
