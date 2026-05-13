"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { LngLatBounds } from "maplibre-gl";

const DEFAULT_STYLE =
  process.env.NEXT_PUBLIC_MAPLIBRE_STYLE_URL?.trim() ||
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

const SOURCE_ID = "b2c-demand-heat-points";
const HEAT_LAYER_ID = "b2c-demand-heat-layer";
const CIRCLE_LAYER_ID = "b2c-demand-detail-circles";
const BRANCH_SOURCE_ID = "b2c-branches-points";
const BRANCH_LAYER_ID = "b2c-branches-layer";

export type DemandHeatMapPoint = { lat: number; lon: number };
export type BranchMapPoint = { name: string; address: string; lon: number; lat: number };

function mapLeftPadding(): number {
  if (typeof window === "undefined") return 72;
  const w = window.innerWidth;
  if (w >= 1280) return 460;
  if (w >= 1024) return 390;
  if (w >= 768) return 320;
  return 72;
}

function toFeatureCollection(points: DemandHeatMapPoint[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: points.map((p, i) => ({
      type: "Feature" as const,
      id: i,
      properties: {},
      geometry: { type: "Point" as const, coordinates: [p.lon, p.lat] },
    })),
  };
}

function toBranchFeatureCollection(points: BranchMapPoint[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: points.map((p, i) => ({
      type: "Feature" as const,
      id: `branch-${i}`,
      properties: { name: p.name, address: p.address },
      geometry: { type: "Point" as const, coordinates: [p.lon, p.lat] },
    })),
  };
}

export type DemandHeatMapProps = {
  points: DemandHeatMapPoint[];
  branches?: BranchMapPoint[];
  /** When this value changes (e.g. date range or explicit "fit map"), camera may refit to data. Slider-only changes should not change this key. */
  cameraFitKey: string;
  /** When true, empty data recenters the default view. Default false keeps the camera on scrubbing empty slots. */
  autoFitOnEmpty?: boolean;
};

export function DemandHeatMap({ points, branches = [], cameraFitKey, autoFitOnEmpty = false }: DemandHeatMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const branchPopupRef = useRef<maplibregl.Popup | null>(null);
  const cameraStateRef = useRef<{ fitKey: string; hadPoints: boolean }>({ fitKey: "", hadPoints: false });
  const [styleReadyTick, setStyleReadyTick] = useState(0);
  const styleUrl = useMemo(() => DEFAULT_STYLE, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl,
      center: [34.95, 31.5],
      zoom: 7.5,
      attributionControl: {},
    });
    map.on("load", () => {
      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: toFeatureCollection([]),
      });
      map.addLayer({
        id: HEAT_LAYER_ID,
        type: "heatmap",
        source: SOURCE_ID,
        maxzoom: 15,
        paint: {
          "heatmap-weight": 1,
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 5, 0.65, 8, 1, 11, 1.35, 14, 1.85],
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0,
            "rgba(254, 242, 242, 0)",
            0.12,
            "rgba(252, 165, 165, 0.5)",
            0.32,
            "rgba(248, 113, 113, 0.72)",
            0.52,
            "rgba(239, 68, 68, 0.86)",
            0.82,
            "rgba(185, 28, 28, 0.94)",
            1,
            "rgba(127, 29, 29, 1)",
          ],
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 5, 8, 8, 14, 11, 22, 14, 30],
          "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0.9, 11, 0.82, 13.5, 0.45, 15, 0],
        },
      });
      map.addLayer({
        id: CIRCLE_LAYER_ID,
        type: "circle",
        source: SOURCE_ID,
        minzoom: 13,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 13, 2.2, 16, 4.5],
          "circle-color": "rgba(239, 68, 68, 0.55)",
          "circle-stroke-width": 0.6,
          "circle-stroke-color": "rgba(255,255,255,0.85)",
          "circle-opacity": ["interpolate", ["linear"], ["zoom"], 12.5, 0, 13.5, 0.22, 15, 0.42, 17, 0.55],
        },
      });
      map.addSource(BRANCH_SOURCE_ID, {
        type: "geojson",
        data: toBranchFeatureCollection([]),
      });
      map.addLayer({
        id: BRANCH_LAYER_ID,
        type: "circle",
        source: BRANCH_SOURCE_ID,
        paint: {
          "circle-radius": 6,
          "circle-color": "rgba(15,23,42,0.95)",
          "circle-stroke-width": 2,
          "circle-stroke-color": "rgba(255,255,255,0.95)",
          "circle-opacity": 0.95,
        },
      });
      const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 10,
        className: "drivers-map-popup",
      });
      branchPopupRef.current = popup;
      map.on("mouseenter", BRANCH_LAYER_ID, (event) => {
        map.getCanvas().style.cursor = "pointer";
        const feature = event.features?.[0];
        if (!feature || feature.geometry.type !== "Point") return;
        const coords = feature.geometry.coordinates as [number, number];
        const props = (feature.properties ?? {}) as { name?: string; address?: string };
        const name = (props.name ?? "").toString().trim() || "Branch";
        const address = (props.address ?? "").toString().trim() || "Address not provided";
        popup
          .setLngLat(coords)
          .setHTML(
            `<div style="min-width:180px;max-width:260px;border-radius:18px;background:linear-gradient(180deg, rgba(246,248,252,0.98), rgba(236,240,246,0.96));padding:10px 12px;color:#0f172a;box-shadow:0 12px 28px rgba(15,23,42,0.20), 0 2px 6px rgba(15,23,42,0.08);">
              <div style="font-size:13px;font-weight:700;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${name}</div>
              <div style="margin-top:4px;font-size:11px;color:#334155;line-height:1.3;">${address}</div>
            </div>`,
          )
          .addTo(map);
      });
      map.on("mouseleave", BRANCH_LAYER_ID, () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
      });
      setStyleReadyTick((t) => t + 1);
      map.resize();
    });
    mapRef.current = map;
    return () => {
      branchPopupRef.current?.remove();
      branchPopupRef.current = null;
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
    const map = mapRef.current;
    if (!map || styleReadyTick === 0) return;
    const src = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData(toFeatureCollection(points));
  }, [points, styleReadyTick]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleReadyTick === 0) return;
    const src = map.getSource(BRANCH_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData(toBranchFeatureCollection(branches));
  }, [branches, styleReadyTick]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleReadyTick === 0) return;

    const prev = cameraStateRef.current;
    const hasPoints = points.length > 0;
    const keyChanged = cameraFitKey !== prev.fitKey;
    const becameNonEmpty = hasPoints && !prev.hadPoints && cameraFitKey === prev.fitKey;
    const shouldFit = keyChanged || becameNonEmpty;

    cameraStateRef.current = { fitKey: cameraFitKey, hadPoints: hasPoints };

    if (!shouldFit) return;

    const bounds = new LngLatBounds();
    for (const p of points) {
      bounds.extend([p.lon, p.lat]);
    }
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, {
        padding: { top: 72, bottom: 72, left: mapLeftPadding(), right: 72 },
        duration: 350,
        maxZoom: 13.5,
      });
    } else if (autoFitOnEmpty) {
      map.easeTo({ center: [34.95, 31.5], zoom: 7.5, duration: 250 });
    }
  }, [cameraFitKey, points, styleReadyTick, autoFitOnEmpty]);

  return (
    <div className="relative h-full w-full min-h-0">
      <div ref={containerRef} className="h-full w-full min-h-0" />
    </div>
  );
}
