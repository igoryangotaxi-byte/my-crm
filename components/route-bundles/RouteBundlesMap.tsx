"use client";

import { useEffect, useRef } from "react";
import maplibregl, { LngLatBounds } from "maplibre-gl";
import { BUNDLE_LEG_COLORS, colorForSequence } from "@/lib/route-bundles/colors";
import type { RouteBundle, RouteBundleItem } from "@/lib/route-bundles/types";

export { BUNDLE_LEG_COLORS, colorForSequence };

const DEFAULT_STYLE =
  process.env.NEXT_PUBLIC_MAPLIBRE_STYLE_URL?.trim() ||
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

const PASSENGER_SOURCE = "rb-passenger";
const EMPTY_SOURCE = "rb-empty";
const PASSENGER_LAYER = "rb-passenger-line";
const EMPTY_LAYER = "rb-empty-line";

export function RouteBundlesMap({ bundle }: { bundle: RouteBundle | null }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const bundleRef = useRef(bundle);
  bundleRef.current = bundle;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: DEFAULT_STYLE,
      center: [34.78, 32.08],
      zoom: 11,
      attributionControl: {},
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    const resize = () => {
      try {
        map.resize();
      } catch {
        // map may already be removed
      }
    };

    map.on("load", () => {
      resize();
      paintBundle(map, markersRef, bundleRef.current);
    });

    const ro = new ResizeObserver(() => {
      resize();
    });
    ro.observe(containerRef.current);
    const t1 = window.setTimeout(resize, 50);
    const t2 = window.setTimeout(resize, 250);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      ro.disconnect();
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.resize();
    if (map.isStyleLoaded()) {
      paintBundle(map, markersRef, bundle);
    } else {
      map.once("load", () => {
        map.resize();
        paintBundle(map, markersRef, bundle);
      });
    }
  }, [bundle]);

  const legendItems = (bundle?.items ?? [])
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .slice(0, 6);

  return (
    <div className="relative h-full min-h-[280px] w-full bg-[#eef2f6]">
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />
      {!bundle ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-white/50 text-sm text-[var(--so-muted)]">
          Select a bundle to preview passenger routes and empty drives
        </div>
      ) : null}
      <div className="absolute bottom-3 left-3 z-10 max-w-[90%] rounded-lg border border-[var(--so-border)] bg-white/95 px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 shadow-sm">
        {legendItems.length ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {legendItems.map((item) => (
              <span key={item.orderId} className="inline-flex items-center gap-1">
                <span
                  className="inline-block h-0.5 w-4"
                  style={{ background: colorForSequence(item.sequence) }}
                />
                #{item.sequence}
              </span>
            ))}
            <span className="inline-flex items-center gap-1 text-slate-400">
              <span className="inline-block h-0.5 w-4 border-t-2 border-dashed border-slate-400" /> Empty
            </span>
          </div>
        ) : (
          <span>Passenger legs by order · dashed = empty drive</span>
        )}
      </div>
    </div>
  );
}

type LineFeature = {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: { type: "LineString"; coordinates: Array<[number, number]> };
};

function paintBundle(
  map: maplibregl.Map,
  markersRef: React.MutableRefObject<maplibregl.Marker[]>,
  bundle: RouteBundle | null,
) {
  markersRef.current.forEach((m) => m.remove());
  markersRef.current = [];

  const items = [...(bundle?.items ?? [])].sort((a, b) => a.sequence - b.sequence);
  const colorByOrder = new Map(items.map((i) => [i.orderId, colorForSequence(i.sequence)]));

  const passengerFeatures = buildPassengerFeatures(bundle, items, colorByOrder);
  const emptyFeatures = buildEmptyFeatures(bundle, items, colorByOrder);

  try {
    upsertColoredLineLayer(
      map,
      PASSENGER_SOURCE,
      PASSENGER_LAYER,
      { type: "FeatureCollection", features: passengerFeatures },
      false,
    );
    upsertColoredLineLayer(
      map,
      EMPTY_SOURCE,
      EMPTY_LAYER,
      { type: "FeatureCollection", features: emptyFeatures },
      true,
    );
  } catch {
    return;
  }

  const bounds = new LngLatBounds();
  let hasPoint = false;
  for (const item of items) {
    if (!Number.isFinite(item.pickupLat) || !Number.isFinite(item.pickupLon)) continue;
    const color = colorForSequence(item.sequence);

    const pickupEl = document.createElement("div");
    pickupEl.style.cssText = `width:26px;height:26px;border-radius:999px;background:${color};color:#fff;font:700 11px/26px system-ui;text-align:center;border:2px solid #fff;box-shadow:0 2px 8px rgba(15,23,42,.25)`;
    pickupEl.textContent = String(item.sequence);
    const pickup = new maplibregl.Marker({ element: pickupEl })
      .setLngLat([item.pickupLon, item.pickupLat])
      .setPopup(
        new maplibregl.Popup({ offset: 12, maxWidth: "320px" }).setHTML(
          popupHtml({
            kind: "Pickup",
            orderId: item.orderId,
            clientName: item.clientName,
            primaryAddress: item.pickupAddress,
            secondaryAddress: item.dropoffAddress,
            routeLabel: "To",
          }),
        ),
      )
      .addTo(map);
    markersRef.current.push(pickup);
    bounds.extend([item.pickupLon, item.pickupLat]);
    hasPoint = true;

    if (!Number.isFinite(item.dropoffLat) || !Number.isFinite(item.dropoffLon)) continue;
    const dropEl = document.createElement("div");
    dropEl.style.cssText = `width:18px;height:18px;border-radius:4px;background:${color};opacity:.85;border:2px solid #fff;box-shadow:0 2px 8px rgba(15,23,42,.2);filter:brightness(0.75)`;
    const drop = new maplibregl.Marker({ element: dropEl })
      .setLngLat([item.dropoffLon, item.dropoffLat])
      .setPopup(
        new maplibregl.Popup({ offset: 12, maxWidth: "320px" }).setHTML(
          popupHtml({
            kind: "Dropoff",
            orderId: item.orderId,
            clientName: item.clientName,
            primaryAddress: item.dropoffAddress,
            secondaryAddress: item.pickupAddress,
            routeLabel: "From",
          }),
        ),
      )
      .addTo(map);
    markersRef.current.push(drop);
    bounds.extend([item.dropoffLon, item.dropoffLat]);
  }

  if (hasPoint) {
    map.fitBounds(bounds, { padding: 56, maxZoom: 13, duration: 400 });
  }
}

function buildPassengerFeatures(
  bundle: RouteBundle | null,
  items: RouteBundleItem[],
  colorByOrder: Map<string, string>,
): LineFeature[] {
  const fromSnap = bundle?.latestSnapshot?.passengerGeojson?.features ?? [];
  if (fromSnap.length) {
    return fromSnap.map((f) => {
      const orderId = String(f.properties?.orderId ?? "");
      return {
        type: "Feature" as const,
        properties: {
          ...f.properties,
          color: colorByOrder.get(orderId) ?? BUNDLE_LEG_COLORS[0],
        },
        geometry: f.geometry,
      };
    });
  }

  return items
    .filter(
      (i) =>
        Number.isFinite(i.pickupLat) &&
        Number.isFinite(i.pickupLon) &&
        Number.isFinite(i.dropoffLat) &&
        Number.isFinite(i.dropoffLon),
    )
    .map((i) => ({
      type: "Feature" as const,
      properties: {
        kind: "passenger",
        orderId: i.orderId,
        color: colorForSequence(i.sequence),
      },
      geometry: {
        type: "LineString" as const,
        coordinates: [
          [i.pickupLon, i.pickupLat],
          [i.dropoffLon, i.dropoffLat],
        ] as Array<[number, number]>,
      },
    }));
}

function buildEmptyFeatures(
  bundle: RouteBundle | null,
  items: RouteBundleItem[],
  colorByOrder: Map<string, string>,
): LineFeature[] {
  const fromSnap = bundle?.latestSnapshot?.emptyDriveGeojson?.features ?? [];
  if (fromSnap.length) {
    return fromSnap.map((f) => {
      const fromOrderId = String(f.properties?.fromOrderId ?? "");
      return {
        type: "Feature" as const,
        properties: {
          ...f.properties,
          color: colorByOrder.get(fromOrderId) ?? "#94a3b8",
        },
        geometry: f.geometry,
      };
    });
  }

  const emptyFeatures: LineFeature[] = [];
  for (let idx = 0; idx < items.length - 1; idx += 1) {
    const a = items[idx];
    const b = items[idx + 1];
    if (
      !Number.isFinite(a.dropoffLat) ||
      !Number.isFinite(a.dropoffLon) ||
      !Number.isFinite(b.pickupLat) ||
      !Number.isFinite(b.pickupLon)
    ) {
      continue;
    }
    emptyFeatures.push({
      type: "Feature",
      properties: {
        kind: "empty",
        fromOrderId: a.orderId,
        toOrderId: b.orderId,
        color: colorForSequence(a.sequence),
      },
      geometry: {
        type: "LineString",
        coordinates: [
          [a.dropoffLon, a.dropoffLat],
          [b.pickupLon, b.pickupLat],
        ],
      },
    });
  }
  return emptyFeatures;
}

function upsertColoredLineLayer(
  map: maplibregl.Map,
  sourceId: string,
  layerId: string,
  data: { type: "FeatureCollection"; features: LineFeature[] },
  dashed: boolean,
) {
  if (map.getSource(sourceId)) {
    (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(data);
  } else {
    map.addSource(sourceId, { type: "geojson", data });
  }

  if (!map.getLayer(layerId)) {
    map.addLayer({
      id: layerId,
      type: "line",
      source: sourceId,
      paint: {
        "line-color": ["coalesce", ["get", "color"], "#0ea5e9"],
        "line-width": dashed ? 3 : 4,
        "line-opacity": dashed ? 0.75 : 0.92,
        ...(dashed ? { "line-dasharray": [1.5, 1.5] } : {}),
      },
    });
  } else {
    map.setPaintProperty(layerId, "line-color", ["coalesce", ["get", "color"], "#0ea5e9"]);
  }
}

function popupHtml(input: {
  kind: string;
  orderId: string;
  clientName: string;
  primaryAddress: string;
  secondaryAddress: string;
  routeLabel: string;
}) {
  const client = input.clientName?.trim() || "Unknown client";
  return `
    <div style="font:12px/1.35 system-ui,sans-serif;color:#0f172a">
      <div style="font-weight:700;margin-bottom:2px">${escapeHtml(input.kind)} #${escapeHtml(input.orderId)}</div>
      <div style="font-weight:600;margin-bottom:8px;color:#0f172a">${escapeHtml(client)}</div>
      <div style="color:#334155;margin-bottom:2px"><span style="color:#64748b;font-weight:600">Here:</span> ${escapeHtml(input.primaryAddress || "—")}</div>
      <div style="color:#64748b;font-size:11px"><span style="font-weight:600;color:#475569">${escapeHtml(input.routeLabel)}:</span> ${escapeHtml(input.secondaryAddress || "—")}</div>
    </div>
  `;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
