"use client";

import { useMemo, useState } from "react";

type DropRow = {
  id: string;
  address: string;
  parcelName: string;
  contactName: string;
  contactPhone: string;
  lat?: number;
  lon?: number;
};

type QuoteProduct = { id?: string; name?: string; availability?: string; price?: { formatted?: string }; quote_id?: string } & Record<
  string,
  unknown
>;

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

export function GettDeliveryFlow() {
  const [pickupName, setPickupName] = useState("");
  const [pickupPhone, setPickupPhone] = useState("");
  const [pickupAddress, setPickupAddress] = useState("");
  const [pickupLat, setPickupLat] = useState<number | undefined>();
  const [pickupLon, setPickupLon] = useState<number | undefined>();
  const [dropoffs, setDropoffs] = useState<DropRow[]>([
    { id: "d1", address: "", parcelName: "", contactName: "", contactPhone: "" },
  ]);
  const [scheduledAt, setScheduledAt] = useState("");
  const [products, setProducts] = useState<QuoteProduct[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [quoteId, setQuoteId] = useState("");
  const [orderId, setOrderId] = useState("");
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");

  const resolvedDrops = useMemo(
    () => dropoffs.filter((d) => d.address.trim() && typeof d.lat === "number" && typeof d.lon === "number"),
    [dropoffs],
  );

  async function geocodePickup() {
    if (!pickupAddress.trim()) return;
    setLoading("geo");
    setError("");
    try {
      const res = await fetch("/api/address-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: pickupAddress, language: "en" }),
      });
      const data = (await res.json()) as { ok?: boolean; suggestions?: Array<{ lat: number; lon: number; label?: string }> };
      if (!res.ok || !data.ok || !data.suggestions?.[0]) throw new Error("Address not found.");
      const s = data.suggestions[0]!;
      setPickupLat(s.lat);
      setPickupLon(s.lon);
      setPickupAddress(s.label ?? pickupAddress);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Geocode failed");
    } finally {
      setLoading("");
    }
  }

  async function geocodeDrop(id: string, address: string) {
    if (!address.trim()) return;
    setLoading("geo");
    setError("");
    try {
      const res = await fetch("/api/address-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: address, language: "en" }),
      });
      const data = (await res.json()) as { ok?: boolean; suggestions?: Array<{ lat: number; lon: number; label?: string }> };
      if (!res.ok || !data.ok || !data.suggestions?.[0]) throw new Error("Address not found.");
      const s = data.suggestions[0]!;
      setDropoffs((prev) =>
        prev.map((row) =>
          row.id === id ? { ...row, lat: s.lat, lon: s.lon, address: s.label ?? address } : row,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Geocode failed");
    } finally {
      setLoading("");
    }
  }

  async function requestQuote() {
    if (pickupLat == null || pickupLon == null || resolvedDrops.length < 1) {
      setError("Geocode pickup and every drop-off address.");
      return;
    }
    const last = resolvedDrops[resolvedDrops.length - 1]!;
    const waypoints = resolvedDrops.slice(0, -1).map((d) => ({ address: d.address, lat: d.lat, lng: d.lon }));
    setLoading("quote");
    setError("");
    try {
      const res = await fetch("/api/gett/request-rides/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "delivery",
          originAddress: pickupAddress,
          originLat: pickupLat,
          originLng: pickupLon,
          destinationAddress: last.address,
          destinationLat: last.lat,
          destinationLng: last.lon,
          waypoints,
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; result?: Record<string, unknown> };
      if (!res.ok || !data.ok || !data.result) throw new Error(data.error ?? "Quote failed.");
      const productsRaw = ((data.result.data as Record<string, unknown> | undefined)?.products ?? []) as QuoteProduct[];
      setProducts(productsRaw);
      const firstOk = productsRaw.find((p) => String(p.availability ?? "").toLowerCase() === "available");
      setSelectedProductId(String(firstOk?.id ?? productsRaw[0]?.id ?? ""));
      setQuoteId(extractQuoteId(data.result) || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Quote error");
    } finally {
      setLoading("");
    }
  }

  async function createOrder() {
    if (pickupLat == null || pickupLon == null || resolvedDrops.length < 1 || !selectedProductId || !quoteId) {
      setError("Complete quote and select a product.");
      return;
    }
    setLoading("create");
    setError("");
    const idempotencyKey =
      typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `del-${Date.now()}`;
    try {
      const res = await fetch("/api/gett/delivery/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: selectedProductId,
          quoteId,
          pickupContactName: pickupName,
          pickupContactPhone: pickupPhone,
          originLat: pickupLat,
          originLng: pickupLon,
          originAddress: pickupAddress,
          dropoffs: resolvedDrops.map((d) => ({
            address: d.address,
            lat: d.lat,
            lng: d.lon,
            parcelName: d.parcelName,
            contactName: d.contactName,
            contactPhone: d.contactPhone,
          })),
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
          idempotencyKey,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; result?: { order?: { id?: string } } };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Create failed.");
      const id = data.result?.order?.id ?? "";
      if (!id) throw new Error("Missing order id.");
      setOrderId(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create error");
    } finally {
      setLoading("");
    }
  }

  function addDrop() {
    if (dropoffs.length >= 6) return;
    setDropoffs((prev) => [...prev, { id: `d-${Date.now()}`, address: "", parcelName: "", contactName: "", contactPhone: "" }]);
  }

  function removeDrop(id: string) {
    setDropoffs((prev) => (prev.length <= 1 ? prev : prev.filter((d) => d.id !== id)));
  }

  function updateDrop(id: string, patch: Partial<DropRow>) {
    setDropoffs((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  return (
    <section className="crm-page">
      <div className="crm-surface rounded-3xl p-4">
        <h2 className="crm-section-title">Gett delivery</h2>
        <p className="crm-subtitle mt-1">
          Business API: one pickup (multiple parcels) and up to six drop-offs. Quote uses route pickup → intermediates →
          last drop.
        </p>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="crm-surface rounded-3xl p-4">
          <h3 className="crm-section-title">Pickup hub</h3>
          <div className="mt-2 grid gap-2">
            <input className="crm-input px-3 py-2 text-sm" placeholder="Contact name" value={pickupName} onChange={(e) => setPickupName(e.target.value)} />
            <input className="crm-input px-3 py-2 text-sm" placeholder="Contact phone" value={pickupPhone} onChange={(e) => setPickupPhone(e.target.value)} />
            <input className="crm-input px-3 py-2 text-sm" placeholder="Pickup address" value={pickupAddress} onChange={(e) => setPickupAddress(e.target.value)} />
            <button type="button" className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold" onClick={() => void geocodePickup()}>
              Geocode pickup
            </button>
            <p className="text-xs text-muted">
              {pickupLat != null && pickupLon != null ? `${pickupLat.toFixed(5)}, ${pickupLon.toFixed(5)}` : "Coordinates not set"}
            </p>
            <input className="crm-input px-3 py-2 text-sm" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          </div>
        </div>

        <div className="crm-surface rounded-3xl p-4">
          <h3 className="crm-section-title">Drop-offs (max 6)</h3>
          <div className="mt-2 space-y-3">
            {dropoffs.map((d, idx) => (
              <div key={d.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-600">Stop {idx + 1}</span>
                  {dropoffs.length > 1 ? (
                    <button type="button" className="text-xs text-rose-600" onClick={() => removeDrop(d.id)}>
                      Remove
                    </button>
                  ) : null}
                </div>
                <input
                  className="crm-input mb-1 w-full px-2 py-1.5 text-sm"
                  placeholder="Address"
                  value={d.address}
                  onChange={(e) => updateDrop(d.id, { address: e.target.value })}
                />
                <input
                  className="crm-input mb-1 w-full px-2 py-1.5 text-sm"
                  placeholder="Parcel name / id"
                  value={d.parcelName}
                  onChange={(e) => updateDrop(d.id, { parcelName: e.target.value })}
                />
                <input
                  className="crm-input mb-1 w-full px-2 py-1.5 text-sm"
                  placeholder="Recipient name"
                  value={d.contactName}
                  onChange={(e) => updateDrop(d.id, { contactName: e.target.value })}
                />
                <input
                  className="crm-input mb-1 w-full px-2 py-1.5 text-sm"
                  placeholder="Recipient phone"
                  value={d.contactPhone}
                  onChange={(e) => updateDrop(d.id, { contactPhone: e.target.value })}
                />
                <button type="button" className="text-xs font-semibold text-sky-700" onClick={() => void geocodeDrop(d.id, d.address)}>
                  Geocode
                </button>
                <p className="text-[11px] text-muted">
                  {typeof d.lat === "number" && typeof d.lon === "number" ? `${d.lat.toFixed(5)}, ${d.lon.toFixed(5)}` : "—"}
                </p>
              </div>
            ))}
            <button type="button" className="w-full rounded-xl border border-slate-300 py-2 text-sm font-semibold" onClick={addDrop} disabled={dropoffs.length >= 6}>
              + Add drop-off
            </button>
          </div>
        </div>
      </div>

      <div className="crm-surface mt-3 rounded-3xl p-4">
        <h3 className="crm-section-title">Quote & create</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className="crm-button-primary rounded-xl px-4 py-2 text-sm font-semibold" onClick={() => void requestQuote()} disabled={loading !== ""}>
            {loading === "quote" ? "Quoting…" : "Get delivery quote"}
          </button>
          <select className="crm-input max-w-md px-3 py-2 text-sm" value={selectedProductId} onChange={(e) => setSelectedProductId(e.target.value)}>
            <option value="">Product</option>
            {products.map((p) => (
              <option key={String(p.id)} value={String(p.id ?? "")}>
                {String(p.name)} · {String(p.price?.formatted ?? "")}
              </option>
            ))}
          </select>
          <input className="crm-input min-w-[12rem] px-3 py-2 text-sm" placeholder="Quote ID" value={quoteId} onChange={(e) => setQuoteId(e.target.value)} />
          <button type="button" className="crm-button-primary rounded-xl px-4 py-2 text-sm font-semibold" onClick={() => void createOrder()} disabled={loading !== ""}>
            {loading === "create" ? "Creating…" : "Create delivery order"}
          </button>
        </div>
        {orderId ? <p className="mt-2 text-sm text-slate-800">Order ID: {orderId}</p> : null}
        {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}
      </div>
    </section>
  );
}
