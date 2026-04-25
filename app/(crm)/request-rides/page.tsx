"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  RequestRidesMap,
  type RequestRidesMapFitPadding,
  type RequestRidesMapPoint,
  type RouteTrafficFeatureCollection,
} from "@/components/request-rides/RequestRidesMap";
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

type AddressSuggestion = {
  label: string;
  displayName: string;
  lat: number;
  lon: number;
};

type AddressSuggestResponse = {
  ok: boolean;
  suggestions?: AddressSuggestion[];
  error?: string;
};

type AddressReverseResponse = {
  ok: boolean;
  suggestion?: AddressSuggestion;
  error?: string;
};

type RoutePreviewResponse = {
  ok: boolean;
  route?: {
    geojson?: { coordinates?: Array<[number, number]> };
    trafficGeojson?: RouteTrafficFeatureCollection | null;
    distanceMeters?: number | null;
    durationSeconds?: number | null;
  };
  error?: string;
};

type AddressField = {
  text: string;
  lat: number | null;
  lon: number | null;
};

type StopField = AddressField & { id: string };

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

function createEmptyAddressField(): AddressField {
  return { text: "", lat: null, lon: null };
}

function detectInputLanguage(value: string): "he" | "ru" | "en" {
  if (/[\u0590-\u05FF]/.test(value)) return "he";
  if (/[\u0400-\u04FF]/.test(value)) return "ru";
  return "en";
}

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
  const [pickup, setPickup] = useState<AddressField>(() => createEmptyAddressField());
  const [destination, setDestination] = useState<AddressField>(() => createEmptyAddressField());
  const [stops, setStops] = useState<StopField[]>([]);
  const [addressSuggestions, setAddressSuggestions] = useState<Record<string, AddressSuggestion[]>>({});
  const [addressSuggestLoading, setAddressSuggestLoading] = useState<Record<string, boolean>>({});
  const [activeAddressFieldId, setActiveAddressFieldId] = useState<string | null>(null);
  const [mapRouteCoordinates, setMapRouteCoordinates] = useState<Array<[number, number]>>([]);
  const [mapTrafficGeojson, setMapTrafficGeojson] = useState<RouteTrafficFeatureCollection | null>(null);
  const [routeDistanceKm, setRouteDistanceKm] = useState<number | null>(null);
  const [routeDurationMin, setRouteDurationMin] = useState<number | null>(null);
  const [mapClickPoint, setMapClickPoint] = useState<{ lat: number; lon: number } | null>(null);
  const [mapClickLabel, setMapClickLabel] = useState<string>("");
  const [mapClickLoading, setMapClickLoading] = useState(false);
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
  const [showClientDropdown, setShowClientDropdown] = useState(false);
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
  const [overlayWideLayout, setOverlayWideLayout] = useState(false);
  const [rightOverlayVisible, setRightOverlayVisible] = useState(false);

  useEffect(() => {
    const mqLg = window.matchMedia("(min-width: 1024px)");
    const mqXl = window.matchMedia("(min-width: 1280px)");
    const apply = () => {
      setOverlayWideLayout(mqLg.matches);
      setRightOverlayVisible(mqXl.matches);
    };
    apply();
    mqLg.addEventListener("change", apply);
    mqXl.addEventListener("change", apply);
    return () => {
      mqLg.removeEventListener("change", apply);
      mqXl.removeEventListener("change", apply);
    };
  }, []);

  const mapFitPadding = useMemo((): RequestRidesMapFitPadding => {
    if (overlayWideLayout) {
      return { top: 56, bottom: 56, left: 404, right: rightOverlayVisible ? 288 : 56 };
    }
    return { top: 88, bottom: 40, left: 20, right: 20 };
  }, [overlayWideLayout, rightOverlayVisible]);

  const pollAttemptRef = useRef(0);
  const pollTimerRef = useRef<number | null>(null);

  const selectedClient = useMemo(
    () => clients.find((c) => `${c.tokenLabel}:${c.clientId}` === selectedClientKey) ?? null,
    [clients, selectedClientKey],
  );

  const setAddressFieldById = (
    fieldId: string,
    updater: (prev: AddressField) => AddressField,
  ) => {
    if (fieldId === "pickup") {
      setPickup((prev) => updater(prev));
      return;
    }
    if (fieldId === "destination") {
      setDestination((prev) => updater(prev));
      return;
    }
    if (fieldId.startsWith("stop:")) {
      const id = fieldId.slice("stop:".length);
      setStops((prev) => prev.map((stop) => (stop.id === id ? { ...stop, ...updater(stop) } : stop)));
    }
  };

  const mapPoints = useMemo<RequestRidesMapPoint[]>(() => {
    const points: RequestRidesMapPoint[] = [];
    if (pickup.lat != null && pickup.lon != null) {
      points.push({
        id: "pickup",
        role: "pickup",
        label: pickup.text || "Pickup location",
        lat: pickup.lat,
        lon: pickup.lon,
      });
    }
    for (const stop of stops) {
      if (stop.lat == null || stop.lon == null) continue;
      points.push({
        id: `stop:${stop.id}`,
        role: "stop",
        label: stop.text || "Stop along the way",
        lat: stop.lat,
        lon: stop.lon,
      });
    }
    if (destination.lat != null && destination.lon != null) {
      points.push({
        id: "destination",
        role: "destination",
        label: destination.text || "Destination",
        lat: destination.lat,
        lon: destination.lon,
      });
    }
    return points;
  }, [destination.lat, destination.lon, destination.text, pickup.lat, pickup.lon, pickup.text, stops]);

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

  useEffect(() => {
    if (!activeAddressFieldId) return;
    const field =
      activeAddressFieldId === "pickup"
        ? pickup
        : activeAddressFieldId === "destination"
          ? destination
          : stops.find((item) => `stop:${item.id}` === activeAddressFieldId) ?? null;
    if (!field || !field.text.trim()) {
      const clearSuggestId = window.setTimeout(() => {
        setAddressSuggestions((prev) => ({ ...prev, [activeAddressFieldId]: [] }));
      }, 0);
      return () => window.clearTimeout(clearSuggestId);
    }

    let obsolete = false;
    const language = detectInputLanguage(field.text);
    const timer = window.setTimeout(async () => {
      setAddressSuggestLoading((prev) => ({ ...prev, [activeAddressFieldId]: true }));
      try {
        const response = await fetch("/api/address-suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: field.text, language }),
        });
        const data = (await response.json()) as AddressSuggestResponse;
        if (!response.ok || !data.ok) {
          throw new Error(data.error ?? "Failed to load address suggestions.");
        }
        if (obsolete) return;
        setAddressSuggestions((prev) => ({ ...prev, [activeAddressFieldId]: data.suggestions ?? [] }));
      } catch {
        if (!obsolete) {
          setAddressSuggestions((prev) => ({ ...prev, [activeAddressFieldId]: [] }));
        }
      } finally {
        if (!obsolete) {
          setAddressSuggestLoading((prev) => ({ ...prev, [activeAddressFieldId]: false }));
        }
      }
    }, 300);

    return () => {
      obsolete = true;
      window.clearTimeout(timer);
    };
  }, [activeAddressFieldId, destination, pickup, stops]);

  useEffect(() => {
    if (mapPoints.length < 2) {
      const clearId = window.setTimeout(() => {
        setMapRouteCoordinates([]);
        setMapTrafficGeojson(null);
        setRouteDistanceKm(null);
        setRouteDurationMin(null);
      }, 0);
      return () => window.clearTimeout(clearId);
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/route-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            points: mapPoints.map((point) => ({ lat: point.lat, lon: point.lon })),
          }),
        });
        const data = (await response.json()) as RoutePreviewResponse;
        if (!response.ok || !data.ok) {
          throw new Error(data.error ?? "Failed to load route preview.");
        }
        if (!cancelled) {
          setMapRouteCoordinates(data.route?.geojson?.coordinates ?? []);
          setMapTrafficGeojson(
            data.route?.trafficGeojson && data.route.trafficGeojson.features?.length
              ? data.route.trafficGeojson
              : null,
          );
          setRouteDistanceKm(
            typeof data.route?.distanceMeters === "number"
              ? Number((data.route.distanceMeters / 1000).toFixed(1))
              : null,
          );
          setRouteDurationMin(
            typeof data.route?.durationSeconds === "number"
              ? Math.max(1, Math.round(data.route.durationSeconds / 60))
              : null,
          );
        }
      } catch {
        if (!cancelled) {
          setMapRouteCoordinates([]);
          setMapTrafficGeojson(null);
          setRouteDistanceKm(null);
          setRouteDurationMin(null);
        }
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [mapPoints]);

  const handleMapClick = async (point: { lat: number; lon: number }) => {
    setMapClickPoint(point);
    setMapClickLoading(true);
    setMapClickLabel("");
    try {
      const language = detectInputLanguage(
        [pickup.text, destination.text, ...stops.map((stop) => stop.text)].join(" "),
      );
      const response = await fetch("/api/address-reverse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: point.lat, lon: point.lon, language }),
      });
      const data = (await response.json()) as AddressReverseResponse;
      if (!response.ok || !data.ok || !data.suggestion) {
        throw new Error(data.error ?? "Failed to decode map click address.");
      }
      setMapClickLabel(data.suggestion.label || data.suggestion.displayName);
    } catch {
      setMapClickLabel(`${point.lat.toFixed(6)}, ${point.lon.toFixed(6)}`);
    } finally {
      setMapClickLoading(false);
    }
  };

  const clearRouteSelection = () => {
    setPickup(createEmptyAddressField());
    setDestination(createEmptyAddressField());
    setStops([]);
    setMapClickPoint(null);
    setMapClickLabel("");
    setMapRouteCoordinates([]);
    setMapTrafficGeojson(null);
    setRouteDistanceKm(null);
    setRouteDurationMin(null);
    setAddressSuggestions({});
    setActiveAddressFieldId(null);
  };

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
    if (!pickup.text.trim() || !destination.text.trim()) {
      setFormError("Pickup location and Destination are required.");
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
          sourceAddress: pickup.text,
          destinationAddress: destination.text,
          sourceLat: pickup.lat ?? undefined,
          sourceLon: pickup.lon ?? undefined,
          destinationLat: destination.lat ?? undefined,
          destinationLon: destination.lon ?? undefined,
          waypoints: stops
            .map((stop) => ({
              address: stop.text.trim(),
              lat: stop.lat ?? undefined,
              lon: stop.lon ?? undefined,
            }))
            .filter((stop) => stop.address.length > 0),
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
        sourceAddress: pickup.text.trim(),
        destinationAddress: destination.text.trim(),
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

  const applySuggestionToField = (fieldId: string, suggestion: AddressSuggestion) => {
    setAddressFieldById(fieldId, () => ({
      text: suggestion.label || suggestion.displayName,
      lat: suggestion.lat,
      lon: suggestion.lon,
    }));
    setAddressSuggestions((prev) => ({ ...prev, [fieldId]: [] }));
    setActiveAddressFieldId(null);
  };

  /** When the field has text but no coordinates (user did not pick from the list), geocode on blur. */
  async function tryGeocodeFieldFromText(fieldId: string, textSnapshot: string) {
    const trimmed = textSnapshot.trim();
    if (trimmed.length < 4) return;
    try {
      const language = detectInputLanguage(trimmed);
      const response = await fetch("/api/address-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed, language }),
      });
      const data = (await response.json()) as AddressSuggestResponse;
      if (!response.ok || !data.ok) return;
      const first = data.suggestions?.[0];
      if (!first) return;
      setAddressFieldById(fieldId, (prev) => {
        if (prev.text.trim() !== trimmed) return prev;
        if (prev.lat != null && prev.lon != null) return prev;
        return {
          text: first.label || first.displayName || trimmed,
          lat: first.lat,
          lon: first.lon,
        };
      });
    } catch {
      /* ignore */
    }
  }

  const renderAddressInput = (params: {
    fieldId: string;
    label: string;
    value: AddressField;
    required?: boolean;
    onChange: (next: AddressField) => void;
  }) => {
    const options = addressSuggestions[params.fieldId] ?? [];
    const loading = Boolean(addressSuggestLoading[params.fieldId]);
    return (
      <label className="block">
        <span className="crm-label mb-1 block">{params.label}</span>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            <MapPinIcon />
          </span>
          <input
            value={params.value.text}
            onChange={(event) => {
              params.onChange({
                text: event.target.value,
                lat: null,
                lon: null,
              });
              setAddressSuggestions((prev) => ({ ...prev, [params.fieldId]: [] }));
              setActiveAddressFieldId(params.fieldId);
            }}
            onFocus={() => setActiveAddressFieldId(params.fieldId)}
            onBlur={() => {
              const snap = params.value.text;
              const fid = params.fieldId;
              window.setTimeout(() => {
                setActiveAddressFieldId((prev) => (prev === fid ? null : prev));
              }, 120);
              window.setTimeout(() => {
                void tryGeocodeFieldFromText(fid, snap);
              }, 400);
            }}
            className="crm-input h-11 w-full px-10 text-sm"
            required={params.required}
          />
          {activeAddressFieldId === params.fieldId && params.value.text.trim() ? (
            <div className={dropdownPanelClass}>
              {loading ? (
                <p className="px-3 py-2 text-xs text-slate-500">Searching streets...</p>
              ) : options.length > 0 ? (
                options.map((item) => (
                  <button
                    key={`${item.lat}:${item.lon}:${item.label}`}
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      applySuggestionToField(params.fieldId, item);
                    }}
                    className={dropdownOptionClass}
                  >
                    <p className="text-sm font-semibold text-slate-800">{item.label}</p>
                    <p className="text-xs text-slate-600">{item.displayName}</p>
                  </button>
                ))
              ) : (
                <p className="px-3 py-2 text-xs text-slate-500">No matching streets found.</p>
              )}
            </div>
          ) : null}
        </div>
      </label>
    );
  };

  const rideCard =
    "pointer-events-auto rounded-2xl border border-white/70 bg-white/78 p-4 shadow-[0_20px_44px_rgba(15,23,42,0.16)] backdrop-blur-md";
  const dropdownPanelClass =
    "absolute z-[90] mt-1 max-h-56 w-full overflow-auto rounded-2xl border border-white/70 bg-white/90 p-1 shadow-[0_20px_45px_rgba(15,23,42,0.18)] backdrop-blur-md";
  const dropdownOptionClass = "crm-hover-lift w-full rounded-xl px-3 py-2 text-left hover:bg-white/95";

  return (
    <section className="crm-page min-h-0">
      <div className="glass-surface flex w-full min-w-0 flex-col overflow-hidden rounded-3xl border border-white/70 bg-white/80">
        <div className="relative h-[calc(100dvh-6.5rem)] min-h-[620px] w-full overflow-hidden sm:h-[calc(100dvh-7rem)] lg:h-[calc(100dvh-8rem)]">
          <div className="absolute inset-0 z-0 bg-slate-100">
            <RequestRidesMap
              points={mapPoints}
              routeCoordinates={mapRouteCoordinates}
              routeTrafficGeojson={mapTrafficGeojson}
              fitPadding={mapFitPadding}
              onMapClick={(point) => void handleMapClick(point)}
            />
          </div>

          <div className="absolute inset-0 z-10 overflow-y-auto overflow-x-hidden p-4 pointer-events-none">
            <form
              onSubmit={handleSubmit}
              className="flex max-w-[24.5rem] flex-col gap-4 pb-6 pointer-events-none"
            >
              <div className={`${rideCard} relative z-40 space-y-3`}>
                <label className="block">
                  <span className="crm-label mb-1 block">Select the client</span>
                  <div className="relative">
                    <button
                      type="button"
                      disabled={clientsLoading}
                      onClick={() => setShowClientDropdown((prev) => !prev)}
                      onBlur={() => {
                        window.setTimeout(() => setShowClientDropdown(false), 120);
                      }}
                      className="crm-input flex h-11 w-full items-center justify-between px-3 text-left text-sm disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span className="truncate text-slate-900">
                        {clientsLoading
                          ? "Loading clients..."
                          : selectedClient
                            ? `${selectedClient.clientName} (${selectedClient.tokenLabel})`
                            : "Select Client"}
                      </span>
                      <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5 text-slate-700" stroke="currentColor" strokeWidth="1.7">
                        <path d="M5 7.5l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    {showClientDropdown ? (
                      <div className={dropdownPanelClass}>
                        {!clientsLoading && clients.length === 0 ? (
                          <p className="px-3 py-2 text-xs text-slate-500">No clients available</p>
                        ) : (
                          clients.map((client) => {
                            const key = `${client.tokenLabel}:${client.clientId}`;
                            const active = selectedClientKey === key;
                            return (
                              <button
                                key={key}
                                type="button"
                                onMouseDown={(event) => {
                                  event.preventDefault();
                                  setSelectedClientKey(key);
                                  setPhoneSuggestions([]);
                                  setPhoneLookupOk(null);
                                  setPhoneLookupMessage(null);
                                  setShowClientDropdown(false);
                                }}
                                className={`${dropdownOptionClass} ${active ? "bg-white" : ""}`}
                              >
                                <p className="text-sm font-semibold text-slate-800">
                                  {client.clientName} ({client.tokenLabel})
                                </p>
                              </button>
                            );
                          })
                        )}
                      </div>
                    ) : null}
                  </div>
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
                      <div className={dropdownPanelClass}>
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
                              className={dropdownOptionClass}
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
              </div>

              <div className={`${rideCard} relative z-30 space-y-3`}>
                {renderAddressInput({
                  fieldId: "pickup",
                  label: "Pickup location",
                  value: pickup,
                  required: true,
                  onChange: setPickup,
                })}
                {stops.map((stop) => (
                  <div key={stop.id} className="rounded-xl border border-slate-100 bg-slate-50/80 p-2">
                    {renderAddressInput({
                      fieldId: `stop:${stop.id}`,
                      label: "Stop along the way",
                      value: stop,
                      onChange: (next) =>
                        setStops((prev) => prev.map((item) => (item.id === stop.id ? { ...item, ...next } : item))),
                    })}
                    <div className="mt-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setStops((prev) => prev.filter((item) => item.id !== stop.id))}
                        className="crm-hover-lift rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700"
                      >
                        Remove stop
                      </button>
                    </div>
                  </div>
                ))}
                {renderAddressInput({
                  fieldId: "destination",
                  label: "Destination",
                  value: destination,
                  required: true,
                  onChange: setDestination,
                })}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setStops((prev) => [...prev, { id: globalThis.crypto.randomUUID(), ...createEmptyAddressField() }])
                    }
                    className="crm-hover-lift rounded-lg border border-border/80 bg-white px-3 py-2 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Add Stop
                  </button>
                  <button
                    type="button"
                    onClick={clearRouteSelection}
                    className="crm-hover-lift rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-left text-sm font-semibold text-slate-700 transition hover:bg-white"
                  >
                    Clear route
                  </button>
                </div>
              </div>

              {mapPoints.length >= 2 ? (
                <details className={`${rideCard} text-xs text-slate-800`}>
                  <summary className="cursor-pointer select-none text-sm font-semibold text-slate-800">
                    Route preview
                  </summary>
                  <div className="mt-2 space-y-0.5">
                    <p>
                      Est km: <span className="font-semibold text-slate-900">{routeDistanceKm ?? "n/a"}</span>
                    </p>
                    <p>
                      Est trip time:{" "}
                      <span className="font-semibold text-slate-900">
                        {routeDurationMin != null ? `${routeDurationMin} min` : "n/a"}
                      </span>
                    </p>
                    <p>
                      Source: <span className="font-semibold text-slate-900">OSRM</span>
                    </p>
                    <p className="text-[11px] text-slate-600">
                      Traffic:{" "}
                      {mapTrafficGeojson?.features?.length ? "Speed estimate (by segment)" : "n/a"}
                    </p>
                  </div>
                </details>
              ) : null}

              <div className={`${rideCard} space-y-3`}>
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
              </div>

              <div className={`${rideCard} space-y-2`}>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void checkPhoneRegistration()}
                    disabled={phoneChecking || !selectedClient || !phoneNumber.trim()}
                    className="crm-hover-lift rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-55"
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
              </div>

              <div className={rideCard}>
                <button
                  type="submit"
                  disabled={submitting || clientsLoading || !selectedClient}
                  className="crm-button-primary h-12 w-full rounded-2xl text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? "Requesting ride..." : "Request ride"}
                </button>
              </div>

              {mapClickPoint ? (
                <div className={`${rideCard} text-sm`}>
                  <p className="font-semibold text-slate-900">Map point selected</p>
                  <p className="text-slate-700">
                    {mapClickLoading ? "Resolving address..." : mapClickLabel || "Address not resolved"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setPickup({
                          text: mapClickLabel || `${mapClickPoint.lat.toFixed(6)}, ${mapClickPoint.lon.toFixed(6)}`,
                          lat: mapClickPoint.lat,
                          lon: mapClickPoint.lon,
                        })
                      }
                      className="crm-hover-lift rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700"
                    >
                      Set as Pickup location
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setDestination({
                          text: mapClickLabel || `${mapClickPoint.lat.toFixed(6)}, ${mapClickPoint.lon.toFixed(6)}`,
                          lat: mapClickPoint.lat,
                          lon: mapClickPoint.lon,
                        })
                      }
                      className="crm-hover-lift rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700"
                    >
                      Set as Destination
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setStops((prev) => [
                          ...prev,
                          {
                            id: globalThis.crypto.randomUUID(),
                            text:
                              mapClickLabel || `${mapClickPoint.lat.toFixed(6)}, ${mapClickPoint.lon.toFixed(6)}`,
                            lat: mapClickPoint.lat,
                            lon: mapClickPoint.lon,
                          },
                        ])
                      }
                      className="crm-hover-lift rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700"
                    >
                      Add as Stop along the way
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="space-y-3 xl:hidden">
                <article className={rideCard}>
                  <p className="crm-label">Requested rides</p>
                  {requestedRides.length === 0 ? (
                    <p className="mt-2 text-sm text-muted">No rides requested yet.</p>
                  ) : (
                    <div className="mt-2 max-h-[32dvh] space-y-2 overflow-y-auto pr-1">
                      {requestedRides.map((ride) => (
                        <details
                          key={ride.orderId}
                          className="overflow-hidden rounded-xl border border-slate-100 bg-slate-50/90 shadow-sm"
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
                          <div className="space-y-1 border-t border-slate-100 bg-white/90 px-3 py-2 text-sm text-slate-700">
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

            </form>
          </div>

          <aside className="pointer-events-none absolute right-4 top-4 z-20 hidden w-[min(30rem,calc(100%-2rem))] flex-col gap-4 xl:flex">
            <article className={rideCard}>
              <p className="crm-label">Requested rides</p>
              {requestedRides.length === 0 ? (
                <p className="mt-2 text-sm text-muted">No rides requested yet.</p>
              ) : (
                <div className="mt-2 max-h-[42dvh] space-y-2 overflow-y-auto pr-1">
                  {requestedRides.map((ride) => (
                    <details
                      key={ride.orderId}
                      className="overflow-hidden rounded-xl border border-slate-100 bg-slate-50/90 shadow-sm"
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
                      <div className="space-y-1 border-t border-slate-100 bg-white/90 px-3 py-2 text-sm text-slate-700">
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
          </aside>
        </div>
      </div>
    </section>
  );
}
