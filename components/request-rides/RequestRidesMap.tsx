"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { LngLatBounds } from "maplibre-gl";

type PointRole = "pickup" | "stop" | "destination";

export type RequestRidesMapPoint = {
  id: string;
  role: PointRole;
  label: string;
  lat: number;
  lon: number;
};

/** Matches `/api/route-preview` `trafficGeojson` when present. */
export type RouteTrafficFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: { congestion: "low" | "moderate" | "heavy" };
    geometry: { type: "LineString"; coordinates: Array<[number, number]> };
  }>;
};

export type RequestRidesMapFitPadding = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

type RequestRidesMapProps = {
  points: RequestRidesMapPoint[];
  routeCoordinates: Array<[number, number]>;
  /** When null, route line is derived from `routeCoordinates` as a single low segment. */
  routeTrafficGeojson: RouteTrafficFeatureCollection | null;
  onMapClick: (point: { lat: number; lon: number }) => void;
  /** Extra space so route and pins stay clear of a left UI overlay (MapLibre padding). */
  fitPadding?: RequestRidesMapFitPadding;
};

const DEFAULT_STYLE =
  process.env.NEXT_PUBLIC_MAPLIBRE_STYLE_URL?.trim() ||
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

function createRouteLineData(
  routeCoordinates: Array<[number, number]>,
  routeTrafficGeojson: RouteTrafficFeatureCollection | null,
): RouteTrafficFeatureCollection {
  if (routeTrafficGeojson?.features?.length) {
    return routeTrafficGeojson;
  }
  if (routeCoordinates.length >= 2) {
    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { congestion: "low" as const },
          geometry: { type: "LineString", coordinates: routeCoordinates },
        },
      ],
    };
  }
  return { type: "FeatureCollection", features: [] };
}

function isLineStringFeature(
  f: RouteTrafficFeatureCollection["features"][number],
): f is RouteTrafficFeatureCollection["features"][number] & {
  geometry: { type: "LineString"; coordinates: Array<[number, number]> };
} {
  return f.geometry.type === "LineString";
}

function createPinElement(point: RequestRidesMapPoint): HTMLDivElement {
  const root = document.createElement("div");
  root.style.cssText =
    "width:40px;height:48px;max-width:40px;min-width:40px;overflow:visible;pointer-events:none;display:block;box-sizing:border-box;";

  const fill =
    point.role === "pickup" ? "#15803d" : point.role === "destination" ? "#b91c1c" : "#ca8a04";
  const stroke = "#ffffff";
  const badge =
    point.role === "pickup" ? "A" : point.role === "destination" ? "B" : "";

  const badgeSvg =
    badge !== ""
      ? `<circle cx="20" cy="14" r="9" fill="${stroke}"/><text x="20" y="18" text-anchor="middle" font-size="11" font-weight="700" font-family="system-ui,sans-serif" fill="${fill}">${badge}</text>`
      : `<circle cx="20" cy="14" r="5" fill="${stroke}" stroke="${fill}" stroke-width="2"/>`;

  root.innerHTML = `
    <svg width="40" height="48" viewBox="0 0 40 48" style="display:block" aria-hidden="true">
      <path d="M20 44c0 0 14-12.5 14-22a14 14 0 1 0-28 0c0 9.5 14 22 14 22z" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
      ${badgeSvg}
    </svg>
  `;
  return root;
}

const DEFAULT_FIT_PADDING: RequestRidesMapFitPadding = { top: 56, right: 56, bottom: 56, left: 56 };

export function RequestRidesMap({
  points,
  routeCoordinates,
  routeTrafficGeojson,
  onMapClick,
  fitPadding = DEFAULT_FIT_PADDING,
}: RequestRidesMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRefs = useRef<maplibregl.Marker[]>([]);
  const [styleReadyTick, setStyleReadyTick] = useState(0);
  const clickRef = useRef(onMapClick);

  const styleUrl = useMemo(() => DEFAULT_STYLE, []);

  useEffect(() => {
    clickRef.current = onMapClick;
  }, [onMapClick]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl,
      center: [34.7818, 32.0853],
      zoom: 11,
      attributionControl: {},
    });
    mapRef.current = map;
    map.on("load", () => {
      setStyleReadyTick((prev) => prev + 1);
    });
    map.on("click", (event) => {
      clickRef.current({ lat: event.lngLat.lat, lon: event.lngLat.lng });
    });
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [styleUrl]);

  useEffect(() => {
    const map = mapRef.current;
    const el = containerRef.current;
    if (!map || !el) return;
    const resize = () => {
      map.resize();
    };
    resize();
    const ro = new ResizeObserver(() => {
      resize();
    });
    ro.observe(el);
    window.addEventListener("resize", resize);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [styleReadyTick]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const marker of markerRefs.current) marker.remove();
    markerRefs.current = [];
    for (const point of points) {
      const markerEl = createPinElement(point);
      const marker = new maplibregl.Marker({ element: markerEl, anchor: "bottom", offset: [0, 4] })
        .setLngLat([point.lon, point.lat])
        .addTo(map);
      markerRefs.current.push(marker);
    }
  }, [points]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!map.isStyleLoaded()) return;
    const sourceId = "route-preview";
    const layerId = "route-preview-line";
    const data = createRouteLineData(routeCoordinates, routeTrafficGeojson);

    if (map.getSource(sourceId)) {
      (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(data as never);
    } else {
      map.addSource(sourceId, { type: "geojson", data: data as never });
    }
    if (!map.getLayer(layerId)) {
      map.addLayer({
        id: layerId,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": [
            "match",
            ["get", "congestion"],
            "heavy",
            "#c5221f",
            "moderate",
            "#e37400",
            "#1a7f37",
          ],
          "line-width": 5,
          "line-opacity": 0.92,
        },
      });
    }
  }, [routeCoordinates, routeTrafficGeojson, styleReadyTick]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const bounds = new LngLatBounds();
    const fc = createRouteLineData(routeCoordinates, routeTrafficGeojson);
    for (const f of fc.features) {
      if (!isLineStringFeature(f)) continue;
      for (const c of f.geometry.coordinates) {
        bounds.extend(c);
      }
    }
    if (fc.features.length === 0) {
      for (const [lon, lat] of routeCoordinates) {
        bounds.extend([lon, lat]);
      }
    }
    if (routeCoordinates.length === 0 && fc.features.length === 0) {
      for (const point of points) {
        bounds.extend([point.lon, point.lat]);
      }
    }
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, {
        padding: fitPadding,
        maxZoom: 16,
        duration: 450,
      });
    }
  }, [points, routeCoordinates, routeTrafficGeojson, fitPadding]);

  return <div ref={containerRef} className="h-full w-full" />;
}
