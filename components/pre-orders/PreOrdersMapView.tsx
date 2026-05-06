"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { LngLatBounds } from "maplibre-gl";
import type { PreOrder } from "@/types/crm";
import { useTranslations } from "next-intl";

type PreOrdersMapViewProps = {
  preOrders: PreOrder[];
  onOpenFull: (preOrder: PreOrder) => void;
};

type FakeCar = {
  id: string;
  name: string;
  lon: number;
  lat: number;
  vx: number;
  vy: number;
  nearestKm: number;
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
};

type NearestOrderInfo = {
  preOrder: PreOrder;
  distanceKm: number;
};

type OrderMarkerEntry = {
  marker: maplibregl.Marker;
  el: HTMLDivElement;
  preOrder: PreOrder;
  lon: number;
  lat: number;
};

type CarMarkerEntry = {
  id: string;
  marker: maplibregl.Marker;
  el: HTMLDivElement;
  car: FakeCar;
};

const ORDER_RADIUS_SOURCE_ID = "preorders-radius-source";
const ORDER_RADIUS_FILL_LAYER_ID = "preorders-radius-fill-layer";
const ORDER_RADIUS_LINE_LAYER_ID = "preorders-radius-line-layer";

const DEFAULT_STYLE =
  process.env.NEXT_PUBLIC_MAPLIBRE_STYLE_URL?.trim() ||
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

const ISRAELI_DRIVER_NAMES = [
  "Noam Levi",
  "Eitan Cohen",
  "Yossi Mizrahi",
  "Ariel Ben-David",
  "Itay Ohana",
  "Lior Azulay",
  "Omer Shalev",
  "Nadav Biton",
  "Shai Malka",
  "Gilad Peretz",
];

const CITY_DRIVER_CLUSTERS = [
  { city: "Tel Aviv", lat: 32.0853, lon: 34.7818, count: 50, spreadLat: 0.03, spreadLon: 0.03 },
  { city: "Ramat Gan", lat: 32.0684, lon: 34.8248, count: 20, spreadLat: 0.02, spreadLon: 0.02 },
  { city: "Ashdod", lat: 31.8014, lon: 34.6435, count: 20, spreadLat: 0.024, spreadLon: 0.024 },
  { city: "Ashkelon", lat: 31.6688, lon: 34.5743, count: 10, spreadLat: 0.02, spreadLon: 0.02 },
] as const;

const GOLDEN_ANGLE_RAD = 2.399963229728653;
const CITY_LAND_BOUNDS: Record<
  (typeof CITY_DRIVER_CLUSTERS)[number]["city"],
  { minLon: number; maxLon: number; minLat: number; maxLat: number }
> = {
  "Tel Aviv": { minLon: 34.742, maxLon: 34.847, minLat: 32.03, maxLat: 32.125 },
  "Ramat Gan": { minLon: 34.79, maxLon: 34.86, minLat: 32.035, maxLat: 32.105 },
  Ashdod: { minLon: 34.61, maxLon: 34.705, minLat: 31.76, maxLat: 31.86 },
  Ashkelon: { minLon: 34.54, maxLon: 34.62, minLat: 31.62, maxLat: 31.72 },
};

function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const la1 = toRad(aLat);
  const la2 = toRad(bLat);
  const x =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function formatTimeLeft(iso: string, nowMs: number): string {
  const due = new Date(iso).getTime();
  if (Number.isNaN(due)) return "n/a";
  const deltaMs = due - nowMs;
  const sign = deltaMs >= 0 ? "" : "-";
  const abs = Math.abs(deltaMs);
  const totalMin = Math.floor(abs / 60000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${sign}${days}d ${hours}h ${mins}m`;
  return `${sign}${hours}h ${mins}m`;
}

function buildOrderPopupHtml(preOrder: PreOrder, nowMs: number): string {
  const left = preOrder.scheduledAt ? formatTimeLeft(preOrder.scheduledAt, nowMs) : "n/a";
  return `
    <div style="min-width:210px;max-width:270px;border-radius:18px;background:linear-gradient(180deg, rgba(246,248,252,0.98), rgba(236,240,246,0.96));padding:11px 13px;color:#0f172a;box-shadow:0 14px 32px rgba(15,23,42,0.20), 0 2px 6px rgba(15,23,42,0.08);">
      <div style="font-size:13px;font-weight:700;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${preOrder.clientName}</div>
      <div style="margin-top:4px;font-size:11px;font-weight:700;color:#334155;">${preOrder.scheduledFor}</div>
      <div style="margin-top:6px;font-size:12px;font-weight:600;color:#0f172a;">Starts in: ${left}</div>
    </div>
  `;
}

function buildCarPopupHtml(car: FakeCar): string {
  return `
    <div style="min-width:170px;max-width:220px;border-radius:18px;background:linear-gradient(180deg, rgba(250,252,255,0.98), rgba(239,246,255,0.96));padding:10px 12px;color:#0f172a;box-shadow:0 14px 32px rgba(15,23,42,0.18), 0 2px 6px rgba(15,23,42,0.08);">
      <div style="font-size:13px;font-weight:700;">${car.name}</div>
      <div style="margin-top:4px;font-size:12px;font-weight:700;color:#0369a1;">Status: Active</div>
      <div style="margin-top:4px;font-size:12px;color:#1e293b;">Nearest order: ${car.nearestKm.toFixed(2)} km</div>
    </div>
  `;
}

function buildNearestPopupHtml(): string {
  return `
    <div style="min-width:88px;border-radius:999px;background:#16a34a;color:#fff;padding:5px 11px;font-size:12px;font-weight:800;box-shadow:0 8px 18px rgba(22,163,74,0.35);text-align:center;">
      Nearest
    </div>
  `;
}

function applyOrderMarkerStyle(root: HTMLDivElement, isNearest: boolean): void {
  const w = isNearest ? 36 : 28;
  const h = isNearest ? 44 : 34;
  const fill = isNearest ? "#16a34a" : "#0ea5e9";
  const stroke = "#ffffff";
  root.style.cssText =
    `width:${w}px;height:${h}px;max-width:${w}px;min-width:${w}px;overflow:visible;pointer-events:auto;display:block;box-sizing:border-box;cursor:pointer;`;
  root.innerHTML = `
    <svg width="${w}" height="${h}" viewBox="0 0 28 34" style="display:block" aria-hidden="true">
      <path d="M14 31c0 0 10-9 10-16a10 10 0 1 0-20 0c0 7 10 16 10 16z" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
      <circle cx="14" cy="13" r="4.3" fill="#ffffff" />
    </svg>
  `;
}

function createOrderMarkerElement(isNearest: boolean): HTMLDivElement {
  const root = document.createElement("div");
  applyOrderMarkerStyle(root, isNearest);
  return root;
}

function createCarElement(): HTMLDivElement {
  const root = document.createElement("div");
  root.style.cssText =
    "width:20px;height:20px;border-radius:50%;background:#f59e0b;border:2px solid #fff;box-shadow:0 6px 14px rgba(2,6,23,0.35);cursor:pointer;";
  return root;
}

function circlePolygonCoordinates(
  centerLon: number,
  centerLat: number,
  radiusKm: number,
  points = 48,
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const latRad = (centerLat * Math.PI) / 180;
  const degLat = radiusKm / 110.574;
  const degLon = radiusKm / (111.32 * Math.cos(latRad) || 1);
  for (let i = 0; i <= points; i++) {
    const t = (i / points) * Math.PI * 2;
    out.push([centerLon + Math.cos(t) * degLon, centerLat + Math.sin(t) * degLat]);
  }
  return out;
}

function expandBoundsByFactor(bounds: LngLatBounds, factor: number): LngLatBounds {
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  const lonPad = (ne.lng - sw.lng) * factor;
  const latPad = (ne.lat - sw.lat) * factor;
  return new LngLatBounds([sw.lng - lonPad, sw.lat - latPad], [ne.lng + lonPad, ne.lat + latPad]);
}

export function PreOrdersMapView({ preOrders, onOpenFull }: PreOrdersMapViewProps) {
  const t = useTranslations("preOrdersPage");

  const mappable = useMemo(
    () =>
      preOrders.filter(
        (p) =>
          typeof p.pointALat === "number" &&
          Number.isFinite(p.pointALat) &&
          typeof p.pointALon === "number" &&
          Number.isFinite(p.pointALon),
      ),
    [preOrders],
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const orderMarkersByIdRef = useRef<Map<string, OrderMarkerEntry>>(new Map());
  const carMarkersByIdRef = useRef<Map<string, CarMarkerEntry>>(new Map());
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const nearestPopupRef = useRef<maplibregl.Popup | null>(null);
  const nowMsRef = useRef<number>(0);
  const carsRef = useRef<FakeCar[]>([]);
  const animationTimerRef = useRef<number | null>(null);
  const [styleReadyTick, setStyleReadyTick] = useState(0);
  const [selectedCompact, setSelectedCompact] = useState<PreOrder | null>(null);
  const [nearestOrderId, setNearestOrderId] = useState<string | null>(null);
  const [focusedCarId, setFocusedCarId] = useState<string | null>(null);

  const findNearestOrder = useCallback(
    (lat: number, lon: number): NearestOrderInfo | null => {
      let nearest: PreOrder | null = null;
      let best = Number.POSITIVE_INFINITY;
      for (const p of mappable) {
        const d = haversineKm(lat, lon, p.pointALat as number, p.pointALon as number);
        if (d < best) {
          best = d;
          nearest = p;
        }
      }
      if (!nearest || !Number.isFinite(best)) return null;
      return { preOrder: nearest, distanceKm: best };
    },
    [mappable],
  );

  useEffect(() => {
    nowMsRef.current = Date.now();
    const id = window.setInterval(() => {
      nowMsRef.current = Date.now();
    }, 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: DEFAULT_STYLE,
      center: [34.78, 32.08],
      zoom: 9.5,
      attributionControl: {},
    });
    popupRef.current = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 14,
      className: "drivers-map-popup",
    });
    nearestPopupRef.current = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 18,
      className: "drivers-map-popup",
    });
    mapRef.current = map;
    const orderMarkersRefSnapshot = orderMarkersByIdRef;
    const carMarkersRefSnapshot = carMarkersByIdRef;
    map.on("load", () => {
      map.resize();
      setStyleReadyTick((prev) => prev + 1);
    });
    return () => {
      if (animationTimerRef.current != null) {
        window.clearInterval(animationTimerRef.current);
      }
      for (const entry of orderMarkersRefSnapshot.current.values()) entry.marker.remove();
      for (const entry of carMarkersRefSnapshot.current.values()) entry.marker.remove();
      orderMarkersRefSnapshot.current.clear();
      carMarkersRefSnapshot.current.clear();
      popupRef.current?.remove();
      nearestPopupRef.current?.remove();
      popupRef.current = null;
      nearestPopupRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onMapClick = () => {
      setFocusedCarId(null);
      setNearestOrderId(null);
      nearestPopupRef.current?.remove();
    };
    map.on("click", onMapClick);
    return () => {
      map.off("click", onMapClick);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    for (const entry of orderMarkersByIdRef.current.values()) entry.marker.remove();
    orderMarkersByIdRef.current.clear();
    popupRef.current?.remove();
    nearestPopupRef.current?.remove();

    const bounds = new LngLatBounds();
    const radiusOrders = nearestOrderId
      ? mappable.filter((preOrder) => preOrder.orderId === nearestOrderId)
      : mappable;
    const radiusFeatures = radiusOrders.map((preOrder) => ({
      type: "Feature" as const,
      geometry: {
        type: "Polygon" as const,
        coordinates: [
          circlePolygonCoordinates(
            preOrder.pointALon as number,
            preOrder.pointALat as number,
            2.5,
          ),
        ],
      },
      properties: { orderId: preOrder.orderId },
    }));

    const geojson = {
      type: "FeatureCollection" as const,
      features: radiusFeatures,
    };

    if (map.getSource(ORDER_RADIUS_SOURCE_ID)) {
      const src = map.getSource(ORDER_RADIUS_SOURCE_ID) as maplibregl.GeoJSONSource;
      src.setData(geojson);
    } else {
      map.addSource(ORDER_RADIUS_SOURCE_ID, { type: "geojson", data: geojson });
      map.addLayer({
        id: ORDER_RADIUS_FILL_LAYER_ID,
        type: "fill",
        source: ORDER_RADIUS_SOURCE_ID,
        paint: {
          "fill-color": "#0ea5e9",
          "fill-opacity": 0.08,
        },
      });
      map.addLayer({
        id: ORDER_RADIUS_LINE_LAYER_ID,
        type: "line",
        source: ORDER_RADIUS_SOURCE_ID,
        paint: {
          "line-color": "#0284c7",
          "line-width": 1.2,
          "line-opacity": 0.35,
        },
      });
    }

    for (const preOrder of mappable) {
      const lon = preOrder.pointALon as number;
      const lat = preOrder.pointALat as number;
      const el = createOrderMarkerElement(false);
      const marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([lon, lat])
        .addTo(map);
      orderMarkersByIdRef.current.set(preOrder.orderId, { marker, el, preOrder, lon, lat });
      bounds.extend([lon, lat]);

      el.addEventListener("mouseenter", () => {
        popupRef.current
          ?.setLngLat([lon, lat])
          .setHTML(buildOrderPopupHtml(preOrder, nowMsRef.current))
          .addTo(map);
      });
      el.addEventListener("mouseleave", () => popupRef.current?.remove());
      el.addEventListener("click", () => setSelectedCompact(preOrder));
    }

    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: { top: 70, right: 70, bottom: 70, left: 70 }, maxZoom: 13.5 });
    }
  }, [mappable, styleReadyTick, nearestOrderId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const [orderId, entry] of orderMarkersByIdRef.current.entries()) {
      applyOrderMarkerStyle(entry.el, orderId === nearestOrderId);
      // Force immediate stable re-projection after DOM size/style change.
      entry.marker.setLngLat([entry.lon, entry.lat]);
      const visible = !focusedCarId || orderId === nearestOrderId;
      entry.el.style.display = visible ? "block" : "none";
    }
    if (!nearestOrderId) {
      nearestPopupRef.current?.remove();
      return;
    }
    const entry = orderMarkersByIdRef.current.get(nearestOrderId);
    if (!entry) {
      nearestPopupRef.current?.remove();
      return;
    }
    nearestPopupRef.current
      ?.setLngLat([entry.lon, entry.lat])
      .setHTML(buildNearestPopupHtml())
      .addTo(map);
  }, [nearestOrderId, focusedCarId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const entry of carMarkersByIdRef.current.values()) entry.marker.remove();
    carMarkersByIdRef.current.clear();
    if (animationTimerRef.current != null) {
      window.clearInterval(animationTimerRef.current);
      animationTimerRef.current = null;
    }

    if (mappable.length === 0) return;

    const generatedCars: FakeCar[] = [];
    let idx = 0;
    for (const cluster of CITY_DRIVER_CLUSTERS) {
      for (let i = 0; i < cluster.count; i++) {
        const unitRadius = Math.sqrt((i + 0.5) / cluster.count);
        const angle = i * GOLDEN_ANGLE_RAD;
        const jitter = (((i * 29) % 17) - 8) / 100;
        const ellipseX = Math.cos(angle) * unitRadius;
        const ellipseY = Math.sin(angle) * unitRadius;
        const land = CITY_LAND_BOUNDS[cluster.city];
        const rawLon = cluster.lon + (ellipseX + jitter) * cluster.spreadLon * 0.95;
        const rawLat = cluster.lat + (ellipseY - jitter) * cluster.spreadLat * 0.95;
        const lon = Math.min(land.maxLon, Math.max(land.minLon, rawLon));
        const lat = Math.min(land.maxLat, Math.max(land.minLat, rawLat));
        generatedCars.push({
          id: `car-${cluster.city}-${i}`,
          name: ISRAELI_DRIVER_NAMES[idx % ISRAELI_DRIVER_NAMES.length]!,
          lon,
          lat,
          vx: (idx % 2 === 0 ? 1 : -1) * (0.00007 + (idx % 4) * 0.000015),
          vy: (idx % 3 === 0 ? 1 : -1) * (0.00005 + (idx % 5) * 0.00001),
          nearestKm: 0,
          minLon: land.minLon,
          maxLon: land.maxLon,
          minLat: land.minLat,
          maxLat: land.maxLat,
        });
        idx += 1;
      }
    }

    carsRef.current = generatedCars;

    const calcNearest = (car: FakeCar) => findNearestOrder(car.lat, car.lon)?.distanceKm ?? 0;

    for (const car of carsRef.current) {
      car.nearestKm = calcNearest(car);
      const el = createCarElement();
      const marker = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([car.lon, car.lat])
        .addTo(map);
      carMarkersByIdRef.current.set(car.id, { id: car.id, marker, el, car });
      el.addEventListener("mouseenter", () => {
        popupRef.current?.setLngLat([car.lon, car.lat]).setHTML(buildCarPopupHtml(car)).addTo(map);
      });
      el.addEventListener("mouseleave", () => popupRef.current?.remove());
      el.addEventListener("click", (event) => {
        event.stopPropagation();
        const nearest = findNearestOrder(car.lat, car.lon);
        if (!nearest) return;
        setFocusedCarId(car.id);
        setNearestOrderId(nearest.preOrder.orderId);
        const nearestLon = nearest.preOrder.pointALon as number;
        const nearestLat = nearest.preOrder.pointALat as number;
        const baseBounds = new LngLatBounds();
        baseBounds.extend([car.lon, car.lat]);
        baseBounds.extend([nearestLon, nearestLat]);
        const expanded = expandBoundsByFactor(baseBounds, 0.45);
        map.fitBounds(expanded, {
          padding: { top: 90, right: 110, bottom: 180, left: 240 },
          duration: 1000,
          maxZoom: 11.8,
        });
      });
    }

    animationTimerRef.current = window.setInterval(() => {
      carsRef.current.forEach((car, idx) => {
        car.lon += car.vx;
        car.lat += car.vy;
        if (car.lon < car.minLon || car.lon > car.maxLon) car.vx *= -1;
        if (car.lat < car.minLat || car.lat > car.maxLat) car.vy *= -1;
        car.nearestKm = calcNearest(car);
        carMarkersByIdRef.current.get(car.id)?.marker.setLngLat([car.lon, car.lat]);
      });
    }, 1300);
  }, [mappable, findNearestOrder]);

  useEffect(() => {
    for (const [id, entry] of carMarkersByIdRef.current.entries()) {
      const visible = !focusedCarId || id === focusedCarId;
      entry.el.style.display = visible ? "block" : "none";
    }
  }, [focusedCarId]);

  if (mappable.length === 0) {
    return (
      <div className="glass-surface mt-0.5 rounded-3xl px-4 py-10 text-center text-sm text-muted">
        {t("mapNoCoordinates")}
      </div>
    );
  }

  return (
    <section className="glass-surface mt-0 overflow-hidden rounded-3xl border border-white/60">
      <div className="border-b border-white/60 bg-white/75 px-4 py-2 text-xs text-slate-600">
        {t("mapLegend")}
      </div>
      <div ref={containerRef} className="h-[70vh] w-full" />

      {selectedCompact ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 px-4 py-8 backdrop-blur-sm"
          onClick={() => setSelectedCompact(null)}
        >
          <div
            className="crm-modal-surface w-full max-w-md rounded-3xl p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-900">{t("compactTitle")}</h3>
            <dl className="mt-3 space-y-2.5 text-sm">
              <div className="rounded-xl bg-white/75 px-3 py-2">
                <dt className="text-xs text-muted">{t("client")}</dt>
                <dd className="font-medium text-slate-900">{selectedCompact.clientName}</dd>
              </div>
              <div className="rounded-xl bg-white/75 px-3 py-2">
                <dt className="text-xs text-muted">{t("scheduled")}</dt>
                <dd className="font-medium text-slate-900">{selectedCompact.scheduledFor}</dd>
              </div>
              <div className="rounded-xl bg-white/75 px-3 py-2">
                <dt className="text-xs text-muted">{t("status")}</dt>
                <dd className="font-medium text-slate-900">{selectedCompact.orderStatus ?? "scheduling"}</dd>
              </div>
              <div className="rounded-xl bg-white/75 px-3 py-2">
                <dt className="text-xs text-muted">{t("route")}</dt>
                <dd className="font-medium text-slate-900">
                  {selectedCompact.pointA} {"->"} {selectedCompact.pointB}
                </dd>
              </div>
            </dl>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedCompact(null)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                {t("close")}
              </button>
              <button
                type="button"
                onClick={() => {
                  onOpenFull(selectedCompact);
                  setSelectedCompact(null);
                }}
                className="crm-button-primary rounded-xl px-3 py-2 text-sm font-semibold"
              >
                {t("openFull")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </section>
  );
}

