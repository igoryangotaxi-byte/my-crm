"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { LngLatBounds } from "maplibre-gl";
import type { DriverMapItem } from "@/types/crm";

type DriversMapProps = {
  drivers: DriverMapItem[];
  selectedDriverId: string | null;
  gpsLostDriverIds?: string[];
  onSelectDriver: (driverId: string) => void;
};

const DEFAULT_STYLE =
  process.env.NEXT_PUBLIC_MAPLIBRE_STYLE_URL?.trim() ||
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

function markerColor(status: DriverMapItem["status"]): string {
  if (status === "available") return "#22c55e";
  if (status === "active_trip") return "#f59e0b";
  if (status === "busy") return "#ef4444";
  return "#94a3b8";
}

function parseCoordinate(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function mapLeftPadding(): number {
  if (typeof window === "undefined") return 72;
  const w = window.innerWidth;
  if (w >= 1280) return 460;
  if (w >= 1024) return 390;
  if (w >= 768) return 320;
  return 72;
}

function spreadOverlappingPoint(lon: number, lat: number, index: number, total: number): { lon: number; lat: number } {
  if (total <= 1) return { lon, lat };
  const angle = (Math.PI * 2 * index) / total;
  const radius = 0.00012 + Math.min(0.0002, total * 0.00001);
  return {
    lon: lon + Math.cos(angle) * radius,
    lat: lat + Math.sin(angle) * radius,
  };
}

function applyMarkerElementStyle(
  el: HTMLDivElement,
  driver: DriverMapItem,
  selected: boolean,
  gpsLost: boolean,
): void {
  const color = markerColor(driver.status);
  const size = selected ? 22 : 18;
  const shadow = gpsLost ? "0 8px 20px rgba(2,6,23,0.50)" : "0 8px 18px rgba(2,6,23,0.42)";
  el.style.cssText = `width:${size}px;height:${size}px;border-radius:999px;background:${color};border:2px solid #ffffff;box-shadow:${shadow};cursor:pointer;`;
  if (gpsLost) {
    el.title = "GPS lost: showing last known location";
    el.style.opacity = "0.88";
  } else {
    el.removeAttribute("title");
    el.style.opacity = "1";
  }
}

function createMarkerElement(driver: DriverMapItem, selected: boolean, gpsLost: boolean): HTMLDivElement {
  const root = document.createElement("div");
  applyMarkerElementStyle(root, driver, selected, gpsLost);
  return root;
}

function popupStatusText(driver: DriverMapItem): string {
  return driver.status === "active_trip"
    ? "Active trip"
    : driver.status === "available"
      ? "Available"
      : driver.status === "busy"
        ? "Busy"
        : "No GPS";
}

function popupStatusColor(driver: DriverMapItem): string {
  if (driver.status === "available") return "#16a34a";
  if (driver.status === "active_trip") return "#d97706";
  if (driver.status === "busy") return "#dc2626";
  return "#64748b";
}

function createPopupHtml(driver: DriverMapItem): string {
  const status = popupStatusText(driver);
  const statusColor = popupStatusColor(driver);
  return `
    <div style="min-width:170px;max-width:230px;border-radius:22px;background:linear-gradient(180deg, rgba(246,248,252,0.98), rgba(236,240,246,0.96));padding:11px 13px;color:#0f172a;box-shadow:0 14px 32px rgba(15,23,42,0.20), 0 2px 6px rgba(15,23,42,0.08);">
      <div style="font-size:13px;font-weight:700;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${driver.name}</div>
      <div style="margin-top:4px;font-size:11px;font-weight:700;color:#334155;">
        ${driver.carNumber ?? "n/a"} · <span style="color:${statusColor};">${status}</span>
      </div>
    </div>
  `;
}

export function DriversMap({ drivers, selectedDriverId, gpsLostDriverIds = [], onSelectDriver }: DriversMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersByIdRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const markerIdsOnMapSigRef = useRef<string>("");
  const driversLatestRef = useRef<DriverMapItem[]>(drivers);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const [styleReadyTick, setStyleReadyTick] = useState(0);
  const styleUrl = useMemo(() => DEFAULT_STYLE, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const markersStoreRef = markersByIdRef;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl,
      center: [34.95, 29.56],
      zoom: 12,
      attributionControl: {},
    });
    map.on("load", () => {
      setStyleReadyTick((prev) => prev + 1);
      map.resize();
    });
    popupRef.current = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 16,
      className: "drivers-map-popup",
    });
    mapRef.current = map;
    return () => {
      const markersSnapshot = markersStoreRef.current;
      for (const m of markersSnapshot.values()) m.remove();
      markersSnapshot.clear();
      markerIdsOnMapSigRef.current = "";
      popupRef.current?.remove();
      popupRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [styleUrl]);

  useEffect(() => {
    const map = mapRef.current;
    const el = containerRef.current;
    if (!map || !el) return;
    const resize = () => map.resize();
    resize();
    const ro = new ResizeObserver(() => resize());
    ro.observe(el);
    window.addEventListener("resize", resize);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [styleReadyTick]);

  useEffect(() => {
    driversLatestRef.current = drivers;
    const map = mapRef.current;
    if (!map) return;
    const gpsLostSet = new Set(gpsLostDriverIds);
    const popup = popupRef.current;

    const gpsDrivers = drivers
      .map((driver) => {
        const lat = parseCoordinate(driver.lat);
        const lon = parseCoordinate(driver.lon);
        return lat != null && lon != null ? { driver, lat, lon } : null;
      })
      .filter((item): item is { driver: DriverMapItem; lat: number; lon: number } => item != null)
      /** Стабильный порядок: иначе при перерисовке (клик, выбор) меняется порядок в bucket → другой индекс в spread → «прыжки». */
      .sort((a, b) => a.driver.id.localeCompare(b.driver.id));

    const nextIds = new Set(gpsDrivers.map((g) => g.driver.id));
    for (const [id, marker] of markersByIdRef.current) {
      if (!nextIds.has(id)) {
        marker.remove();
        markersByIdRef.current.delete(id);
      }
    }

    const coordBuckets = new Map<string, Array<{ driver: DriverMapItem; lat: number; lon: number }>>();
    for (const item of gpsDrivers) {
      const key = `${item.lat.toFixed(6)}:${item.lon.toFixed(6)}`;
      const bucket = coordBuckets.get(key) ?? [];
      bucket.push(item);
      coordBuckets.set(key, bucket);
    }
    for (const bucket of coordBuckets.values()) {
      bucket.sort((a, b) => a.driver.id.localeCompare(b.driver.id));
    }

    const bounds = new LngLatBounds();
    for (const item of gpsDrivers) {
      const { driver, lat, lon } = item;
      const key = `${lat.toFixed(6)}:${lon.toFixed(6)}`;
      const bucket = coordBuckets.get(key) ?? [item];
      const indexInBucket = bucket.findIndex((candidate) => candidate.driver.id === driver.id);
      const spread = spreadOverlappingPoint(lon, lat, Math.max(indexInBucket, 0), bucket.length);
      const drawLon = spread.lon;
      const drawLat = spread.lat;
      const selected = selectedDriverId === driver.id;
      const gpsLost = gpsLostSet.has(driver.id);

      let marker = markersByIdRef.current.get(driver.id);
      if (!marker) {
        const el = createMarkerElement(driver, selected, gpsLost);
        marker = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([drawLon, drawLat]).addTo(map);
        el.addEventListener("mouseenter", () => {
          if (!popup) return;
          const d = driversLatestRef.current.find((x) => x.id === driver.id);
          if (!d) return;
          const ll = marker!.getLngLat();
          popup.setLngLat(ll).setHTML(createPopupHtml(d)).addTo(map);
        });
        el.addEventListener("mouseleave", () => {
          popup?.remove();
        });
        el.addEventListener("click", () => {
          popup?.remove();
          onSelectDriver(driver.id);
        });
        markersByIdRef.current.set(driver.id, marker);
      } else {
        marker.setLngLat([drawLon, drawLat]);
        applyMarkerElementStyle(marker.getElement() as HTMLDivElement, driver, selected, gpsLost);
      }
      bounds.extend([drawLon, drawLat]);
    }

    const idSig = [...nextIds].sort().join(",");
    const membershipChanged = idSig !== markerIdsOnMapSigRef.current;
    markerIdsOnMapSigRef.current = idSig;

    if (!bounds.isEmpty()) {
      if (membershipChanged) {
        map.fitBounds(bounds, {
          padding: { top: 72, bottom: 72, left: mapLeftPadding(), right: 72 },
          duration: 350,
          maxZoom: 14.8,
        });
      }
    } else {
      markerIdsOnMapSigRef.current = "";
      map.easeTo({ center: [34.95, 29.56], zoom: 11, duration: 250 });
    }
  }, [drivers, selectedDriverId, gpsLostDriverIds, onSelectDriver, styleReadyTick]);

  return <div ref={containerRef} className="h-full w-full" />;
}
