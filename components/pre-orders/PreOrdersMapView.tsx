"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { LngLatBounds } from "maplibre-gl";
import type { PreOrder } from "@/types/crm";
import { useTranslations } from "next-intl";

type PreOrdersMapViewProps = {
  preOrders: PreOrder[];
  onOpenFull: (preOrder: PreOrder) => void;
};

type OrderMarkerEntry = {
  marker: maplibregl.Marker;
  el: HTMLDivElement;
  preOrder: PreOrder;
  lon: number;
  lat: number;
};

const ORDER_RADIUS_SOURCE_ID = "preorders-radius-source";
const ORDER_RADIUS_FILL_LAYER_ID = "preorders-radius-fill-layer";
const ORDER_RADIUS_LINE_LAYER_ID = "preorders-radius-line-layer";

const DEFAULT_STYLE =
  process.env.NEXT_PUBLIC_MAPLIBRE_STYLE_URL?.trim() ||
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

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

function createOrderMarkerElement(): HTMLDivElement {
  const root = document.createElement("div");
  const w = 28;
  const h = 34;
  const fill = "#0ea5e9";
  const stroke = "#ffffff";
  root.style.cssText =
    `width:${w}px;height:${h}px;max-width:${w}px;min-width:${w}px;overflow:visible;pointer-events:auto;display:block;box-sizing:border-box;cursor:pointer;`;
  root.innerHTML = `
    <svg width="${w}" height="${h}" viewBox="0 0 28 34" style="display:block" aria-hidden="true">
      <path d="M14 31c0 0 10-9 10-16a10 10 0 1 0-20 0c0 7 10 16 10 16z" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
      <circle cx="14" cy="13" r="4.3" fill="#ffffff" />
    </svg>
  `;
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
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const nowMsRef = useRef<number>(0);
  const [styleReadyTick, setStyleReadyTick] = useState(0);
  const [selectedCompact, setSelectedCompact] = useState<PreOrder | null>(null);

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
    mapRef.current = map;
    const orderMarkersRefSnapshot = orderMarkersByIdRef;
    map.on("load", () => {
      map.resize();
      setStyleReadyTick((prev) => prev + 1);
    });
    return () => {
      for (const entry of orderMarkersRefSnapshot.current.values()) entry.marker.remove();
      orderMarkersRefSnapshot.current.clear();
      popupRef.current?.remove();
      popupRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    for (const entry of orderMarkersByIdRef.current.values()) entry.marker.remove();
    orderMarkersByIdRef.current.clear();
    popupRef.current?.remove();

    const bounds = new LngLatBounds();
    const radiusFeatures = mappable.map((preOrder) => ({
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
      const el = createOrderMarkerElement();
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
  }, [mappable, styleReadyTick]);

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
