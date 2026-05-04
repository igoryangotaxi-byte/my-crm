"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  RequestRidesMap,
  type RequestRidesMapFitPadding,
  type RequestRidesMapPoint,
  type RouteTrafficFeatureCollection,
} from "@/components/request-rides/RequestRidesMap";
import {
  PendingUploadsPanel,
  type PendingUpload,
  type PendingUploadAddress,
} from "@/components/request-rides/PendingUploadsPanel";
import { dedupePhones, normalizePhone } from "@/lib/phone-utils";
import { publicErrorMessage } from "@/lib/public-error-message";
import { downloadBulkUploadSampleXlsx } from "@/lib/xlsx-bulk-upload-sample";
import { parseXlsxRidesFile } from "@/lib/xlsx-rides-parser";
import { useAuth } from "@/components/auth/AuthProvider";
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
  yangoTraceId?: string | null;
  yangoRequestId?: string | null;
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
  fullName?: string | null;
  phone?: string | null;
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
    provider?: "google" | "osrm";
  };
  error?: string;
};

type RouteOptimizeResponse = {
  ok: boolean;
  result?: {
    orderedIndices: number[];
    optimized: {
      durationSeconds: number;
      distanceMeters: number;
      encodedPolyline: string;
      coordinates: Array<[number, number]>;
      legs: Array<{ durationSeconds: number; distanceMeters: number }>;
    };
    original: { durationSeconds: number; distanceMeters: number | null };
    savingsSeconds: number;
    savingsMeters: number | null;
  };
  error?: string;
};

type Optimization = {
  orderedIndices: number[];
  originalDurationSeconds: number;
  optimizedDurationSeconds: number;
  savingsSeconds: number;
  originalDistanceMeters: number | null;
  optimizedDistanceMeters: number;
  savingsMeters: number | null;
  coordinates: Array<[number, number]>;
};

type AddressField = {
  text: string;
  lat: number | null;
  lon: number | null;
};

type StopField = AddressField & { id: string; phone: string };

/** Fixed Yango ride class for CRM Request Rides (no UI override). */
const REQUEST_RIDES_RIDE_CLASS = "comfortplus_b2b" as const;

type RideSmsState = {
  /** ISO timestamp when the per-stop "request_created" SMS finished sending. */
  requestedAtIso?: string;
  /** ISO timestamp when the "driver_on_way" SMS finished sending. */
  driverOnWaySentAt?: string;
};

type RequestedRideItem = {
  orderId: string;
  createdAtIso: string;
  scheduledAtIso: string | null;
  tokenLabel: string;
  clientId: string;
  sourceAddress: string;
  destinationAddress: string;
  riderPhone: string;
  /** Phone numbers tied to stops + destination (no pickup). Used for SMS dispatch + replays. */
  addressPhones: string[];
  rideClass: string;
  status: RequestRideStatus | null;
  smsState: RideSmsState;
};

const STORAGE_KEY = "crm.requested-rides.v1";
const STOP_STATUSES = new Set(["completed", "cancelled"]);
const POLL_INTERVAL_MS = 6000;
const POLL_MAX_ATTEMPTS = 30;

function createEmptyAddressField(): AddressField {
  return { text: "", lat: null, lon: null };
}

function createEmptyStopField(): StopField {
  return { id: globalThis.crypto.randomUUID(), text: "", lat: null, lon: null, phone: "" };
}

const SMS_REQUEST_TZ = "Asia/Jerusalem";

function formatRideTimeForSms(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: SMS_REQUEST_TZ,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return formatter.format(date).replace(",", "");
  } catch {
    return date.toISOString();
  }
}

function buildRequestedRideSmsText(
  scheduledAtIso: string | null,
  createdAtIso: string,
  meta?: { traceId?: string | null },
): string {
  const base = scheduledAtIso
    ? `Hey, someone requested a pre-order on ${formatRideTimeForSms(scheduledAtIso)} with Yango. Be ready on time and have a nice trip.`
    : `Hey, someone requested a ride for you ${formatRideTimeForSms(createdAtIso)}. Be ready on time and have a nice trip.`;
  const tid = meta?.traceId?.trim();
  if (!tid) return base;
  return `${base} trace_id=${tid}`;
}

function appendYangoTraceIdsToErrorLine(
  base: string,
  traceId: string | null | undefined,
  requestId: string | null | undefined,
): string {
  let s = base;
  const tid = traceId?.trim();
  const rid = requestId?.trim();
  if (tid && !s.includes("trace_id=")) s += ` trace_id=${tid}`;
  if (rid && !s.includes("request_id=")) s += ` request_id=${rid}`;
  return s;
}

function buildDriverOnWaySmsText(status: RequestRideStatus): string {
  const fullName =
    [status.driverFirstName ?? null, status.driverLastName ?? null].filter(Boolean).join(" ").trim() ||
    (status.driverName ?? "").trim();
  const carParts = [status.carModel?.trim(), status.carPlate?.trim()].filter(
    (entry): entry is string => Boolean(entry && entry.length > 0),
  );
  if (carParts.length > 0 && fullName) {
    return `Hey, your driver is on the way ${carParts.join(", ")}, ${fullName}.`;
  }
  if (carParts.length > 0) {
    return `Hey, your driver is on the way ${carParts.join(", ")}.`;
  }
  if (fullName) {
    return `Hey, your driver ${fullName} is on the way.`;
  }
  return "Hey, your driver is on the way.";
}

function detectInputLanguage(value: string): "he" | "ru" | "en" {
  if (/[\u0590-\u05FF]/.test(value)) return "he";
  if (/[\u0400-\u04FF]/.test(value)) return "ru";
  return "en";
}

function normalizePhoneLookupKey(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0")) return `972${digits.slice(1)}`;
  return digits;
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

function RequestedRideAccordionCard({
  ride,
  index,
  deletingOrderId,
  onRemove,
}: {
  ride: RequestedRideItem;
  index: number;
  deletingOrderId: string | null;
  onRemove: (orderId: string) => void | Promise<void>;
}) {
  return (
    <details
      className="rr-requested-ride-card"
      style={{ animationDelay: `${Math.min(index, 14) * 45}ms` }}
    >
      <summary className="rr-requested-ride-card-summary">
        <div className="flex items-start gap-2">
          <span className="rr-requested-ride-icon-wrap mt-0.5 rounded-lg bg-slate-100 p-1 text-slate-700">
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
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="text-xs text-slate-500">{getRideStatusLabel(ride.status)}</span>
            <span className="rr-requested-ride-chevron text-slate-400">
              <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.9">
                <path d="M5 7.5l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2 border-t border-slate-100/90 pt-2 text-sm text-slate-700">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-400 text-[10px]">
            o
          </span>
          <span className="truncate">
            {ride.sourceAddress} {"->"} {ride.destinationAddress}
          </span>
        </div>
      </summary>
      <div className="rr-requested-ride-body-clip">
        <div className="rr-requested-ride-body">
          <div className="space-y-1 border-t border-slate-100 bg-white/95 px-3 py-2.5 text-sm text-slate-700">
            <p>Order: {ride.orderId}</p>
            <p>Phone: {ride.riderPhone}</p>
            <p>Class: {ride.rideClass}</p>
            <p>Client: {ride.tokenLabel}</p>
            <div className="pt-1">
              <button
                type="button"
                disabled={deletingOrderId === ride.orderId}
                onClick={() => void onRemove(ride.orderId)}
                className="crm-hover-lift rounded-lg border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletingOrderId === ride.orderId ? "Cancelling…" : "Remove (cancel trip)"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </details>
  );
}

export default function RequestRidesPage() {
  const { currentUser, users } = useAuth();
  const isClientScopedUser = currentUser?.accountType === "client";
  const [clients, setClients] = useState<YangoApiClientRef[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [clientsError, setClientsError] = useState<string | null>(null);

  const [selectedClientKey, setSelectedClientKey] = useState("");
  const [pickup, setPickup] = useState<AddressField>(() => createEmptyAddressField());
  const [destination, setDestination] = useState<AddressField>(() => createEmptyAddressField());
  const [destinationPhone, setDestinationPhone] = useState("");
  const [stops, setStops] = useState<StopField[]>([]);
  const [smsWarning, setSmsWarning] = useState<string | null>(null);
  const driverOnWayDispatchRef = useRef<Set<string>>(new Set());
  const [addressSuggestions, setAddressSuggestions] = useState<Record<string, AddressSuggestion[]>>({});
  const [addressSuggestLoading, setAddressSuggestLoading] = useState<Record<string, boolean>>({});
  const [activeAddressFieldId, setActiveAddressFieldId] = useState<string | null>(null);
  const [mapRouteCoordinates, setMapRouteCoordinates] = useState<Array<[number, number]>>([]);
  const [mapTrafficGeojson, setMapTrafficGeojson] = useState<RouteTrafficFeatureCollection | null>(null);
  const [routeDistanceKm, setRouteDistanceKm] = useState<number | null>(null);
  const [routeDurationMin, setRouteDurationMin] = useState<number | null>(null);
  const [routePreviewError, setRoutePreviewError] = useState<string | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizationError, setOptimizationError] = useState<string | null>(null);
  const [optimization, setOptimization] = useState<Optimization | null>(null);
  const [optimizationInfo, setOptimizationInfo] = useState<string | null>(null);
  /** When true, only intermediate stops are reordered; the form destination stays the final drop-off (round trips). */
  const [fixDestinationForOptimization, setFixDestinationForOptimization] = useState(false);
  const [mapClickPoint, setMapClickPoint] = useState<{ lat: number; lon: number } | null>(null);
  const [mapClickLabel, setMapClickLabel] = useState<string>("");
  const [mapClickLoading, setMapClickLoading] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
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
      const parsed = JSON.parse(raw) as Partial<RequestedRideItem>[];
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((item) => Boolean(item?.orderId && item?.tokenLabel && item?.clientId))
        .map((item) => ({
          ...(item as RequestedRideItem),
          addressPhones: Array.isArray(item.addressPhones) ? item.addressPhones : [],
          smsState: (item.smsState && typeof item.smsState === "object"
            ? item.smsState
            : {}) as RideSmsState,
        }));
    } catch {
      return [];
    }
  });
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const [rideListError, setRideListError] = useState<string | null>(null);
  const [overlayWideLayout, setOverlayWideLayout] = useState(false);
  const [rightOverlayVisible, setRightOverlayVisible] = useState(false);
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [focusedPendingUploadId, setFocusedPendingUploadId] = useState<string | null>(null);
  const [optimizingPendingUploadIds, setOptimizingPendingUploadIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadParsing, setUploadParsing] = useState(false);
  const [uploadSubmitting, setUploadSubmitting] = useState(false);
  /** Keep Select Client expanded by default; user may collapse. */
  const [selectClientPanelOpen, setSelectClientPanelOpen] = useState(true);
  /** Expand Route & stops when a client is chosen (user may collapse afterward). */
  const [routeStopsPanelOpen, setRouteStopsPanelOpen] = useState(false);
  const xlsxInputRef = useRef<HTMLInputElement>(null);
  const clientPickerButtonRef = useRef<HTMLButtonElement>(null);
  const phoneSuggestAnchorRef = useRef<HTMLDivElement>(null);
  const rideFormScrollRef = useRef<HTMLDivElement>(null);
  const [clientMenuRect, setClientMenuRect] = useState<{
    left: number;
    top: number;
    width: number;
  } | null>(null);
  const [phoneSuggestRect, setPhoneSuggestRect] = useState<{
    left: number;
    top: number;
    width: number;
  } | null>(null);

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
    /** Map is `fixed inset-0`; pad for sidebar + form column (aligned with header title). */
    if (overlayWideLayout) {
      /** Left pad matches sidebar + glass column (≈36rem form + outer shell padding). */
      return { top: 56, bottom: 56, left: 724, right: rightOverlayVisible ? 288 : 56 };
    }
    return { top: 88, bottom: 40, left: 148, right: 20 };
  }, [overlayWideLayout, rightOverlayVisible]);

  const pollAttemptRef = useRef(0);
  const pollTimerRef = useRef<number | null>(null);

  const selectedClient = useMemo(
    () =>
      isClientScopedUser
        ? (clients[0] ?? null)
        : clients.find((c) => `${c.tokenLabel}:${c.clientId}` === selectedClientKey) ?? null,
    [clients, isClientScopedUser, selectedClientKey],
  );

  useEffect(() => {
    if (selectedClient) {
      setRouteStopsPanelOpen(true);
    }
  }, [selectedClient]);

  useLayoutEffect(() => {
    const syncOverlayRects = () => {
      if (showClientDropdown && clientPickerButtonRef.current) {
        const r = clientPickerButtonRef.current.getBoundingClientRect();
        setClientMenuRect({ left: r.left, top: r.bottom + 4, width: r.width });
      } else {
        setClientMenuRect(null);
      }
      if (
        showPhoneSuggestions &&
        selectedClient &&
        phoneNumber.trim() &&
        phoneSuggestAnchorRef.current
      ) {
        const r = phoneSuggestAnchorRef.current.getBoundingClientRect();
        setPhoneSuggestRect({ left: r.left, top: r.bottom + 4, width: r.width });
      } else {
        setPhoneSuggestRect(null);
      }
    };

    syncOverlayRects();

    const overlaysActive =
      showClientDropdown ||
      Boolean(showPhoneSuggestions && selectedClient && phoneNumber.trim());
    if (!overlaysActive) return;

    const scrollEl = rideFormScrollRef.current;
    window.addEventListener("scroll", syncOverlayRects, true);
    window.addEventListener("resize", syncOverlayRects);
    scrollEl?.addEventListener("scroll", syncOverlayRects);
    return () => {
      window.removeEventListener("scroll", syncOverlayRects, true);
      window.removeEventListener("resize", syncOverlayRects);
      scrollEl?.removeEventListener("scroll", syncOverlayRects);
    };
  }, [
    showClientDropdown,
    showPhoneSuggestions,
    selectedClient,
    phoneNumber,
    clients.length,
    phoneSuggestions.length,
    suggestionsLoading,
  ]);

  const tenantEmployeeNameByPhone = useMemo(() => {
    const tokenLabel = selectedClient?.tokenLabel?.trim();
    const apiClientId = selectedClient?.clientId?.trim();
    if (!tokenLabel || !apiClientId) return new Map<string, string>();
    const out = new Map<string, string>();
    for (const user of users) {
      if (user.accountType !== "client") continue;
      if ((user.tokenLabel ?? "").trim() !== tokenLabel) continue;
      if ((user.apiClientId ?? "").trim() !== apiClientId) continue;
      const key = normalizePhoneLookupKey(user.phoneNumber ?? "");
      const name = user.name?.trim();
      if (!key || !name) continue;
      out.set(key, name);
    }
    return out;
  }, [selectedClient, users]);

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

  const focusedPendingUpload = useMemo(
    () => pendingUploads.find((row) => row.id === focusedPendingUploadId) ?? null,
    [pendingUploads, focusedPendingUploadId],
  );

  const pendingUploadMapPoints = useMemo<RequestRidesMapPoint[]>(() => {
    if (!focusedPendingUpload) return [];
    const filledAddresses = focusedPendingUpload.addresses.filter((entry) => entry.text.trim().length > 0);
    if (filledAddresses.length < 2) return [];
    return filledAddresses
      .map((address, idx): RequestRidesMapPoint | null => {
        if (address.lat == null || address.lon == null) return null;
        const role =
          idx === 0 ? "pickup" : idx === filledAddresses.length - 1 ? "destination" : "stop";
        return {
          id: `pending:${focusedPendingUpload.id}:${idx}`,
          role,
          label: address.text,
          lat: address.lat,
          lon: address.lon,
        };
      })
      .filter((item): item is RequestRidesMapPoint => Boolean(item));
  }, [focusedPendingUpload]);

  const effectiveMapPoints = pendingUploadMapPoints.length >= 2 ? pendingUploadMapPoints : mapPoints;


  useEffect(() => {
    let cancelled = false;
    (async () => {
      setClientsLoading(true);
      setClientsError(null);
      try {
        const response = await fetch("/api/request-rides-clients", { cache: "no-store" });
        const data = (await response.json()) as ClientsResponse;
        if (!response.ok || !data.ok) {
          throw new Error(data.error ?? "Couldn’t load clients.");
        }
        if (cancelled) return;
        const loadedClients = data.clients ?? [];
        setClients(loadedClients);
      } catch (error) {
        if (!cancelled) {
          setClientsError(publicErrorMessage(error, "Couldn’t load clients. Try again later."));
        }
      } finally {
        if (!cancelled) setClientsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isClientScopedUser]);

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
    if (effectiveMapPoints.length < 2) {
      const clearId = window.setTimeout(() => {
        setMapRouteCoordinates([]);
        setMapTrafficGeojson(null);
        setRouteDistanceKm(null);
        setRouteDurationMin(null);
        setRoutePreviewError(null);
      }, 0);
      return () => window.clearTimeout(clearId);
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        setRoutePreviewError(null);
        const response = await fetch("/api/route-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            points: effectiveMapPoints.map((point) => ({ lat: point.lat, lon: point.lon })),
          }),
        });
        const data = (await response.json()) as RoutePreviewResponse;
        if (!response.ok || !data.ok) {
          throw new Error(data.error ?? "Couldn’t load the route preview.");
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
          setRoutePreviewError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setMapRouteCoordinates([]);
          setMapTrafficGeojson(null);
          setRouteDistanceKm(null);
          setRouteDurationMin(null);
          setRoutePreviewError(
            publicErrorMessage(error, "Couldn’t load the route preview. Try again later."),
          );
        }
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [effectiveMapPoints]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setOptimization(null);
      setOptimizationError(null);
      setOptimizationInfo(null);
    }, 0);
    return () => window.clearTimeout(t);
  }, [pickup, destination, stops]);

  const optimizeCurrentRoute = async () => {
    if (optimizing) return;
    if (pickup.lat == null || pickup.lon == null) {
      setOptimizationError("Pickup must be a geocoded address.");
      return;
    }
    const tail: AddressField[] = [...stops, destination];
    const others = tail.filter(
      (entry): entry is AddressField & { lat: number; lon: number } =>
        entry.lat != null && entry.lon != null && entry.text.trim().length > 0,
    );
    if (others.length !== tail.length) {
      setOptimizationError("All stops and destination must be geocoded before optimization.");
      return;
    }
    if (others.length < 2) {
      setOptimizationError("Add at least 2 stops to optimize the order.");
      return;
    }
    setOptimizing(true);
    setOptimizationError(null);
    setOptimizationInfo(null);
    try {
      const response = await fetch("/api/route-optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pickup: { lat: pickup.lat, lon: pickup.lon },
          others: others.map((entry) => ({ lat: entry.lat, lon: entry.lon })),
          fixDestination: fixDestinationForOptimization,
        }),
      });
      const data = (await response.json()) as RouteOptimizeResponse;
      if (!response.ok || !data.ok || !data.result) {
        throw new Error(data.error ?? "Failed to optimize route.");
      }
      const result = data.result;
      const isIdentity = result.orderedIndices.every((idx, position) => idx === position);
      if (result.savingsSeconds <= 0 || isIdentity) {
        setOptimization(null);
        setOptimizationInfo("Current order is already the fastest in traffic.");
        return;
      }
      setOptimization({
        orderedIndices: result.orderedIndices,
        originalDurationSeconds: result.original.durationSeconds,
        optimizedDurationSeconds: result.optimized.durationSeconds,
        savingsSeconds: result.savingsSeconds,
        originalDistanceMeters: result.original.distanceMeters ?? null,
        optimizedDistanceMeters: result.optimized.distanceMeters,
        savingsMeters: result.savingsMeters ?? null,
        coordinates: result.optimized.coordinates,
      });
    } catch (error) {
      setOptimization(null);
      setOptimizationError(
        publicErrorMessage(error, "Couldn’t optimize the route. Try again later."),
      );
    } finally {
      setOptimizing(false);
    }
  };

  const applyOptimization = () => {
    if (!optimization) return;
    type TailEntry = AddressField & { phone: string };
    const tail: TailEntry[] = [
      ...stops.map((s) => ({ text: s.text, lat: s.lat, lon: s.lon, phone: s.phone })),
      { text: destination.text, lat: destination.lat, lon: destination.lon, phone: destinationPhone },
    ];
    const reordered = optimization.orderedIndices.map((idx) => tail[idx]).filter(Boolean);
    if (reordered.length !== tail.length) return;
    const newDestination = reordered[reordered.length - 1];
    const newStopsSource = reordered.slice(0, -1);
    setStops((prev) => {
      const reused = newStopsSource.map((entry, idx) => ({
        id: prev[idx]?.id ?? globalThis.crypto.randomUUID(),
        text: entry.text,
        lat: entry.lat,
        lon: entry.lon,
        phone: entry.phone,
      }));
      return reused;
    });
    setDestination({
      text: newDestination.text,
      lat: newDestination.lat,
      lon: newDestination.lon,
    });
    setDestinationPhone(newDestination.phone);
    if (optimization.coordinates.length >= 2) {
      setMapRouteCoordinates(optimization.coordinates);
      setMapTrafficGeojson(null);
    }
  };

  const dismissOptimization = () => {
    setOptimization(null);
    setOptimizationInfo(null);
  };

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
      setMapClickLabel("Couldn’t look up this spot.");
    } finally {
      setMapClickLoading(false);
    }
  };

  const handleMapPointDrag = async (input: { id: string; lat: number; lon: number }) => {
    if (input.id.startsWith("pending:")) {
      const [, rowId, rawAddressIndex] = input.id.split(":");
      const addressIndex = Number(rawAddressIndex);
      if (!rowId || !Number.isInteger(addressIndex) || addressIndex < 0) return;
      const language = detectInputLanguage(
        pendingUploads
          .find((row) => row.id === rowId)
          ?.addresses.map((entry) => entry.text)
          .join(" ") ?? "",
      );
      setPendingUploads((prev) =>
        prev.map((row) => {
          if (row.id !== rowId) return row;
          const nextAddresses = row.addresses.map((entry, idx) =>
            idx === addressIndex
              ? { ...entry, lat: input.lat, lon: input.lon, geocodeError: undefined }
              : entry,
          );
          return { ...row, addresses: nextAddresses };
        }),
      );
      try {
        const response = await fetch("/api/address-reverse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat: input.lat, lon: input.lon, language }),
        });
        const data = (await response.json()) as AddressReverseResponse;
        if (!response.ok || !data.ok || !data.suggestion) {
          throw new Error(data.error ?? "Failed to decode dragged point.");
        }
        const label = data.suggestion.label || data.suggestion.displayName;
        setPendingUploads((prev) =>
          prev.map((row) => {
            if (row.id !== rowId) return row;
            const nextAddresses = row.addresses.map((entry, idx) =>
              idx === addressIndex
                ? { ...entry, text: label, lat: input.lat, lon: input.lon, geocodeError: undefined }
                : entry,
            );
            return { ...row, addresses: nextAddresses };
          }),
        );
      } catch {
        // Keep dragged coordinates on pending row even when reverse-geocoding fails.
      }
      return;
    }
    if (input.id !== "pickup" && input.id !== "destination" && !input.id.startsWith("stop:")) {
      return;
    }
    const language = detectInputLanguage(
      [pickup.text, destination.text, ...stops.map((stop) => stop.text)].join(" "),
    );

    if (input.id === "pickup") {
      setPickup((prev) => ({ ...prev, lat: input.lat, lon: input.lon }));
    } else if (input.id === "destination") {
      setDestination((prev) => ({ ...prev, lat: input.lat, lon: input.lon }));
    } else {
      const stopId = input.id.slice("stop:".length);
      setStops((prev) =>
        prev.map((stop) => (stop.id === stopId ? { ...stop, lat: input.lat, lon: input.lon } : stop)),
      );
    }

    try {
      const response = await fetch("/api/address-reverse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: input.lat, lon: input.lon, language }),
      });
      const data = (await response.json()) as AddressReverseResponse;
      if (!response.ok || !data.ok || !data.suggestion) {
        throw new Error(data.error ?? "Failed to decode dragged point.");
      }
      const label = data.suggestion.label || data.suggestion.displayName;
      if (input.id === "pickup") {
        setPickup({ text: label, lat: input.lat, lon: input.lon });
      } else if (input.id === "destination") {
        setDestination({ text: label, lat: input.lat, lon: input.lon });
      } else {
        const stopId = input.id.slice("stop:".length);
        setStops((prev) =>
          prev.map((stop) =>
            stop.id === stopId ? { ...stop, text: label, lat: input.lat, lon: input.lon } : stop,
          ),
        );
      }
    } catch {
      // Keep dragged coordinates even if reverse-geocode fails.
    }
  };

  const sendSms = async (input: {
    phones: string[];
    text: string;
    orderId: string;
    kind: "request_created" | "driver_on_way";
  }): Promise<{ ok: boolean; skipped?: boolean; error?: string }> => {
    const phones = dedupePhones(input.phones);
    if (phones.length === 0 || !input.text.trim()) {
      return { ok: false, error: "no_recipients" };
    }
    try {
      const response = await fetch("/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phones,
          text: input.text,
          orderId: input.orderId,
          kind: input.kind,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        skipped?: boolean;
        error?: string;
      };
      if (data.skipped) return { ok: true, skipped: true };
      if (!response.ok || !data.ok) {
        return { ok: false, error: data.error ?? `HTTP ${response.status}` };
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  };

  const dispatchDriverOnWaySms = async (
    ride: RequestedRideItem,
    nextStatus: RequestRideStatus,
  ): Promise<void> => {
    if (ride.smsState?.driverOnWaySentAt) return;
    if (!ride.addressPhones || ride.addressPhones.length === 0) return;
    if (nextStatus.lifecycleStatus !== "driver_assigned") return;
    const previousLifecycle = ride.status?.lifecycleStatus;
    if (previousLifecycle === "driver_assigned") return;
    if (driverOnWayDispatchRef.current.has(ride.orderId)) return;
    driverOnWayDispatchRef.current.add(ride.orderId);
    const text = buildDriverOnWaySmsText(nextStatus);
    const smsResult = await sendSms({
      phones: ride.addressPhones,
      text,
      orderId: ride.orderId,
      kind: "driver_on_way",
    });
    const smsDelivered = Boolean(smsResult.ok && !smsResult.skipped);
    if (!smsDelivered) {
      driverOnWayDispatchRef.current.delete(ride.orderId);
      if (process.env.NODE_ENV !== "test") {
        const detail =
          smsResult.skipped || !smsResult.error ? "SMS disabled or not sent" : smsResult.error;
        console.warn("[request-rides] driver-on-way SMS not sent", ride.orderId, detail);
      }
      return;
    }
    const sentAt = new Date().toISOString();
    setRequestedRides((prev) =>
      prev.map((item) =>
        item.orderId === ride.orderId
          ? { ...item, smsState: { ...item.smsState, driverOnWaySentAt: sentAt } }
          : item,
      ),
    );
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
      const updatedResult = data.result;
      setRequestedRides((prev) => {
        const next = prev.map((item) => {
          if (item.orderId !== updatedResult.orderId) return item;
          void dispatchDriverOnWaySms(item, updatedResult);
          return { ...item, status: updatedResult };
        });
        return next;
      });
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
      setStatusError(publicErrorMessage(error, "Couldn’t load ride status. Try again later."));
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
            if (!nextStatus) return ride;
            void dispatchDriverOnWaySms(ride, nextStatus);
            return { ...ride, status: nextStatus };
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
    // Polling is keyed on the ride list only; driver SMS helper is stable enough for this side-effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- avoid resetting interval every render
  }, [requestedRides]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedClient) {
      setFormError("Select a client first.");
      return;
    }
    if (!phoneNumber.trim()) {
      setFormError("Rider phone is required.");
      return;
    }
    if (!pickup.text.trim() || !destination.text.trim()) {
      setFormError("Pickup location and Destination are required.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    setStatusError(null);
    setSmsWarning(null);
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
          rideClass: REQUEST_RIDES_RIDE_CLASS,
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
        const base = data.error ?? "Failed to create ride.";
        setFormError(
          publicErrorMessage(
            appendYangoTraceIdsToErrorLine(base, data.yangoTraceId, data.yangoRequestId),
            "Couldn’t create the ride. Try again later.",
          ),
        );
        return;
      }
      const created = data.result;
      const createdAtIso = new Date().toISOString();
      const addressPhones = dedupePhones([
        ...stops.map((stop) => stop.phone),
        destinationPhone,
      ]);
      const createdRide: RequestedRideItem = {
        orderId: created.orderId,
        createdAtIso,
        scheduledAtIso: scheduleAtIso,
        tokenLabel: selectedClient.tokenLabel,
        clientId: selectedClient.clientId,
        sourceAddress: pickup.text.trim(),
        destinationAddress: destination.text.trim(),
        riderPhone: phoneNumber.trim(),
        addressPhones,
        rideClass: REQUEST_RIDES_RIDE_CLASS,
        status: null,
        smsState: {},
      };
      setRequestedRides((prev) => [createdRide, ...prev.filter((item) => item.orderId !== created.orderId)]);
      setCreateResult(created);
      if (addressPhones.length > 0) {
        const text = buildRequestedRideSmsText(scheduleAtIso, createdAtIso, {
          traceId: created.traceId,
        });
        const smsResult = await sendSms({
          phones: addressPhones,
          text,
          orderId: created.orderId,
          kind: "request_created",
        });
        if (smsResult.ok && !smsResult.skipped) {
          const sentAt = new Date().toISOString();
          setRequestedRides((prev) =>
            prev.map((item) =>
              item.orderId === created.orderId
                ? { ...item, smsState: { ...item.smsState, requestedAtIso: sentAt } }
                : item,
            ),
          );
        } else if (smsResult.skipped) {
          setSmsWarning(
            "SMS was not sent: outbound SMS is disabled until INFORU_SMS_ENABLED=true after your provider enables API send. The ride was still requested.",
          );
        } else if (smsResult.error && smsResult.error !== "no_recipients") {
          setSmsWarning(
            publicErrorMessage(
              smsResult.error,
              "We couldn’t send the SMS notifications, but the ride was requested.",
            ),
          );
        }
      }
      await requestStatus(createdRide, { withRetry: true });
    } catch (error) {
      setFormError(publicErrorMessage(error, "Couldn’t create the ride. Try again later."));
    } finally {
      setSubmitting(false);
    }
  };

  const checkPhoneRegistration = async () => {
    if (!selectedClient && !isClientScopedUser) {
      setPhoneLookupOk(false);
      setPhoneLookupMessage("Select a client first.");
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
          tokenLabel: selectedClient?.tokenLabel ?? "",
          clientId: selectedClient?.clientId ?? "",
          phoneNumber,
        }),
      });
      const data = (await response.json()) as UserLookupResponse;
      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Couldn’t look up this phone.");
      }
      if (data.found && data.userId) {
        setPhoneLookupOk(true);
        const name = data.fullName?.trim();
        const phone = data.phone?.trim();
        setPhoneLookupMessage(
          name
            ? `Registered user: ${name}${phone ? ` (${phone})` : ""}.`
            : `Registered user found${phone ? ` (${phone})` : ""}.`,
        );
      } else {
        setPhoneLookupOk(false);
        setPhoneLookupMessage("This phone isn’t registered for the selected client.");
      }
    } catch (error) {
      setPhoneLookupOk(false);
      setPhoneLookupMessage(publicErrorMessage(error, "Couldn’t look up this phone. Try again later."));
    } finally {
      setPhoneChecking(false);
    }
  };

  const handleUploadButtonClick = () => {
    if (!selectedClient) {
      setUploadError("Select a client first.");
      return;
    }
    setUploadError(null);
    xlsxInputRef.current?.click();
  };

  const geocodeAddressText = async (text: string): Promise<PendingUploadAddress> => {
    const trimmed = text.trim();
    if (!trimmed) {
      return { text: "", lat: null, lon: null };
    }
    try {
      const language = detectInputLanguage(trimmed);
      const queryCandidates = [trimmed];
      const commaParts = trimmed
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
      if (commaParts.length >= 2) {
        const swapped = [commaParts.slice(1).join(", "), commaParts[0]].filter(Boolean).join(", ");
        if (swapped && !queryCandidates.includes(swapped)) queryCandidates.push(swapped);
      }
      if (language === "en") {
        const withCountry = `${trimmed}, Israel`;
        if (!queryCandidates.includes(withCountry)) queryCandidates.push(withCountry);
        if (commaParts.length >= 2) {
          const swappedWithCountry = `${[commaParts.slice(1).join(", "), commaParts[0]]
            .filter(Boolean)
            .join(", ")}, Israel`;
          if (swappedWithCountry && !queryCandidates.includes(swappedWithCountry)) {
            queryCandidates.push(swappedWithCountry);
          }
        }
      }

      let first: AddressSuggestion | undefined;
      let lastError: string | null = null;
      for (const query of queryCandidates) {
        const response = await fetch("/api/address-suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, language }),
        });
        const data = (await response.json()) as AddressSuggestResponse;
        if (!response.ok || !data.ok) {
          lastError = data.error ?? "Failed to geocode address.";
          continue;
        }
        first = data.suggestions?.[0];
        if (first) break;
      }
      if (!first) {
        return {
          text: trimmed,
          lat: null,
          lon: null,
          geocodeError: lastError ?? "No matching address found.",
        };
      }
      return {
        text: first.label || first.displayName || trimmed,
        lat: first.lat,
        lon: first.lon,
      };
    } catch (error) {
      return {
        text: trimmed,
        lat: null,
        lon: null,
        geocodeError: publicErrorMessage(error, "Couldn’t resolve this address."),
      };
    }
  };

  const handleXlsxFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploadError(null);
    setUploadParsing(true);
    try {
      const rows = await parseXlsxRidesFile(file);
      if (rows.length === 0) {
        setUploadError("No ride rows found in the file.");
        return;
      }
      const parsed: PendingUpload[] = rows.map((row) => ({
        id: globalThis.crypto.randomUUID(),
        rowIndex: row.rowIndex,
        scheduleAtIso: row.scheduleAtIso,
        phone: row.phone,
        comment: row.comment,
        addresses: row.addresses.map((text, idx) => ({
          text,
          lat: null,
          lon: null,
          phone: row.addressPhones[idx] ?? "",
        })),
        state: row.errors.length > 0 ? "blocked" : "geocoding",
        errors: row.errors,
      }));
      setPendingUploads((prev) => [...prev, ...parsed]);

      const concurrency = 1;
      const tasks = parsed.flatMap((row) =>
        row.state === "blocked"
          ? []
          : row.addresses.map((address, addressIndex) => ({
              rowId: row.id,
              addressIndex,
              text: address.text,
            })),
      );
      const geocodeCache = new Map<string, Promise<PendingUploadAddress>>();
      const resolveGeocodeCached = (text: string) => {
        const key = text.trim().toLowerCase();
        const existing = geocodeCache.get(key);
        if (existing) return existing;
        const pending = geocodeAddressText(text);
        geocodeCache.set(key, pending);
        return pending;
      };

      let cursor = 0;
      const worker = async () => {
        while (true) {
          const taskIndex = cursor;
          cursor += 1;
          if (taskIndex >= tasks.length) return;
          const task = tasks[taskIndex];
          const resolved = await resolveGeocodeCached(task.text);
          setPendingUploads((prev) =>
            prev.map((row) => {
              if (row.id !== task.rowId) return row;
              const nextAddresses = row.addresses.map((address, idx) =>
                idx === task.addressIndex ? { ...resolved, phone: address.phone } : address,
              );
              return { ...row, addresses: nextAddresses };
            }),
          );
        }
      };
      const workerCount = Math.min(concurrency, Math.max(1, tasks.length));
      await Promise.all(Array.from({ length: workerCount }, () => worker()));

      const optimizationCandidates: Array<{
        rowId: string;
        pickup: { lat: number; lon: number };
        others: Array<{ lat: number; lon: number }>;
      }> = [];
      setPendingUploads((prev) =>
        prev.map((row) => {
          if (row.state !== "geocoding") return row;
          const filled = row.addresses.filter((entry) => entry.text);
          const hasGeocodeError = row.addresses.some((entry) => entry.geocodeError);
          const missingCoords = filled.some((entry) => entry.lat == null || entry.lon == null);
          if (filled.length < 2) {
            return {
              ...row,
              state: "blocked",
              errors: [...row.errors, "Need at least pickup and destination."],
            };
          }
          if (hasGeocodeError || missingCoords) {
            return {
              ...row,
              state: "blocked",
              message: "Some addresses could not be geocoded.",
            };
          }
          if (filled.length >= 3) {
            const pickupAddr = filled[0];
            const otherAddrs = filled.slice(1);
            if (
              pickupAddr.lat != null &&
              pickupAddr.lon != null &&
              otherAddrs.every((entry) => entry.lat != null && entry.lon != null)
            ) {
              optimizationCandidates.push({
                rowId: row.id,
                pickup: { lat: pickupAddr.lat, lon: pickupAddr.lon },
                others: otherAddrs.map((entry) => ({ lat: entry.lat as number, lon: entry.lon as number })),
              });
            }
          }
          return { ...row, state: "ready" };
        }),
      );
      void runBulkOptimization(optimizationCandidates);
    } catch (error) {
      setUploadError(publicErrorMessage(error, "Couldn’t read this file. Check the format and try again."));
    } finally {
      setUploadParsing(false);
    }
  };

  const runBulkOptimization = async (
    candidates: Array<{
      rowId: string;
      pickup: { lat: number; lon: number };
      others: Array<{ lat: number; lon: number }>;
    }>,
  ) => {
    if (candidates.length === 0) return;
    const concurrency = 2;
    let cursor = 0;
    const worker = async () => {
      while (cursor < candidates.length) {
        const taskIndex = cursor;
        cursor += 1;
        const task = candidates[taskIndex];
        try {
          const response = await fetch("/api/route-optimize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pickup: task.pickup, others: task.others }),
          });
          if (!response.ok) continue;
          const data = (await response.json()) as RouteOptimizeResponse;
          if (!data.ok || !data.result) continue;
          const result = data.result;
          const isIdentity = result.orderedIndices.every((idx, position) => idx === position);
          if (result.savingsSeconds <= 0 || isIdentity) continue;
          setPendingUploads((prev) =>
            prev.map((row) => {
              if (row.id !== task.rowId) return row;
              if (row.state !== "ready") return row;
              const filled = row.addresses.filter((entry) => entry.text);
              if (filled.length < 3) return row;
              const pickupAddress = filled[0];
              const tail = filled.slice(1);
              const reorderedTail = result.orderedIndices.map((idx) => tail[idx]).filter(Boolean);
              if (reorderedTail.length !== tail.length) return row;
              const nextAddresses: PendingUploadAddress[] = [pickupAddress, ...reorderedTail];
              return {
                ...row,
                addresses: nextAddresses,
                optimization: {
                  savingsSeconds: result.savingsSeconds,
                  originalDurationSeconds: result.original.durationSeconds,
                  optimizedDurationSeconds: result.optimized.durationSeconds,
                  savingsMeters: result.savingsMeters ?? undefined,
                },
              };
            }),
          );
        } catch {
          /* ignore individual row optimization errors */
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, candidates.length) }, () => worker()));
  };

  const optimizePendingUploadRoute = async (rowId: string) => {
    if (optimizingPendingUploadIds.has(rowId)) return;
    const row = pendingUploads.find((entry) => entry.id === rowId);
    if (!row || row.state === "creating" || row.state === "created") return;
    const filled = row.addresses.filter((entry) => entry.text);
    if (filled.length < 3) {
      setPendingUploads((prev) =>
        prev.map((entry) =>
          entry.id === rowId
            ? { ...entry, message: "Add at least one stop between pickup and destination to optimize." }
            : entry,
        ),
      );
      return;
    }
    const hasMissingCoords = filled.some((entry) => entry.lat == null || entry.lon == null);
    if (hasMissingCoords) {
      setPendingUploads((prev) =>
        prev.map((entry) =>
          entry.id === rowId
            ? { ...entry, message: "All points must be geocoded before route optimization." }
            : entry,
        ),
      );
      return;
    }

    const pickupAddr = filled[0];
    const others = filled
      .slice(1)
      .map((entry) => ({ lat: entry.lat as number, lon: entry.lon as number }));

    setOptimizingPendingUploadIds((prev) => {
      const next = new Set(prev);
      next.add(rowId);
      return next;
    });
    try {
      const response = await fetch("/api/route-optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pickup: { lat: pickupAddr.lat as number, lon: pickupAddr.lon as number },
          others,
        }),
      });
      const data = (await response.json()) as RouteOptimizeResponse;
      if (!response.ok || !data.ok || !data.result) {
        throw new Error(data.error ?? "Failed to optimize route.");
      }
      const result = data.result;
      const isIdentity = result.orderedIndices.every((idx, position) => idx === position);
      setPendingUploads((prev) =>
        prev.map((entry) => {
          if (entry.id !== rowId) return entry;
          const filledCurrent = entry.addresses.filter((addr) => addr.text);
          if (filledCurrent.length < 3) return entry;
          if (result.savingsSeconds <= 0 || isIdentity) {
            return { ...entry, message: "Route is already optimal." };
          }
          const pickupCurrent = filledCurrent[0];
          const tail = filledCurrent.slice(1);
          const reorderedTail = result.orderedIndices.map((idx) => tail[idx]).filter(Boolean);
          if (reorderedTail.length !== tail.length) {
            return { ...entry, message: "Couldn’t apply optimized stop order." };
          }
          return {
            ...entry,
            addresses: [pickupCurrent, ...reorderedTail],
            message: "Route optimized for current traffic.",
            optimization: {
              savingsSeconds: result.savingsSeconds,
              originalDurationSeconds: result.original.durationSeconds,
              optimizedDurationSeconds: result.optimized.durationSeconds,
              savingsMeters: result.savingsMeters ?? undefined,
            },
          };
        }),
      );
    } catch (error) {
      const message = publicErrorMessage(error, "Couldn’t optimize this route right now.");
      setPendingUploads((prev) =>
        prev.map((entry) => (entry.id === rowId ? { ...entry, message } : entry)),
      );
    } finally {
      setOptimizingPendingUploadIds((prev) => {
        const next = new Set(prev);
        next.delete(rowId);
        return next;
      });
    }
  };

  const handleConfirmPendingUploads = async () => {
    if (uploadSubmitting) return;
    if (!selectedClient) {
      setUploadError("Select a client first.");
      return;
    }
    const readyRows = pendingUploads.filter((row) => row.state === "ready");
    if (readyRows.length === 0) return;
    setUploadError(null);
    setUploadSubmitting(true);

    for (const snapshot of readyRows) {
      const rowId = snapshot.id;
      setPendingUploads((prev) =>
        prev.map((row) =>
          row.id === rowId ? { ...row, state: "creating", message: undefined } : row,
        ),
      );
      const filled = snapshot.addresses.filter((entry) => entry.text);
      const pickupAddress = filled[0];
      const destinationAddress = filled[filled.length - 1];
      const stopsAddresses = filled.slice(1, -1);

      try {
        const response = await fetch("/api/request-rides-create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tokenLabel: selectedClient.tokenLabel,
            clientId: selectedClient.clientId,
            rideClass: REQUEST_RIDES_RIDE_CLASS,
            sourceAddress: pickupAddress.text,
            destinationAddress: destinationAddress.text,
            sourceLat: pickupAddress.lat ?? undefined,
            sourceLon: pickupAddress.lon ?? undefined,
            destinationLat: destinationAddress.lat ?? undefined,
            destinationLon: destinationAddress.lon ?? undefined,
            waypoints: stopsAddresses
              .map((stop) => ({
                address: stop.text,
                lat: stop.lat ?? undefined,
                lon: stop.lon ?? undefined,
              }))
              .filter((stop) => stop.address.length > 0),
            phoneNumber: snapshot.phone,
            comment: snapshot.comment,
            scheduleAtIso: snapshot.scheduleAtIso,
          }),
        });
        const data = (await response.json()) as CreateResponse;
        if (!response.ok || !data.ok || !data.result) {
          const base = data.error ?? "Failed to create ride.";
          throw new Error(
            appendYangoTraceIdsToErrorLine(base, data.yangoTraceId, data.yangoRequestId),
          );
        }
        const created = data.result;
        const createdAtIso = new Date().toISOString();
        const bulkAddressPhones = dedupePhones(
          snapshot.addresses.slice(1).map((entry) => entry.phone ?? ""),
        );
        const createdRide: RequestedRideItem = {
          orderId: created.orderId,
          createdAtIso,
          scheduledAtIso: snapshot.scheduleAtIso,
          tokenLabel: selectedClient.tokenLabel,
          clientId: selectedClient.clientId,
          sourceAddress: pickupAddress.text,
          destinationAddress: destinationAddress.text,
          riderPhone: snapshot.phone,
          addressPhones: bulkAddressPhones,
          rideClass: REQUEST_RIDES_RIDE_CLASS,
          status: null,
          smsState: {},
        };
        setRequestedRides((prev) => [
          createdRide,
          ...prev.filter((item) => item.orderId !== created.orderId),
        ]);
        setPendingUploads((prev) =>
          prev.map((row) =>
            row.id === rowId
              ? { ...row, state: "created", createdOrderId: created.orderId, message: undefined }
              : row,
          ),
        );
        if (bulkAddressPhones.length > 0) {
          const text = buildRequestedRideSmsText(snapshot.scheduleAtIso, createdAtIso, {
            traceId: created.traceId,
          });
          const smsResult = await sendSms({
            phones: bulkAddressPhones,
            text,
            orderId: created.orderId,
            kind: "request_created",
          });
          if (smsResult.ok && !smsResult.skipped) {
            const sentAt = new Date().toISOString();
            setRequestedRides((prev) =>
              prev.map((item) =>
                item.orderId === created.orderId
                  ? { ...item, smsState: { ...item.smsState, requestedAtIso: sentAt } }
                  : item,
              ),
            );
          } else if (smsResult.skipped && process.env.NODE_ENV !== "test") {
            console.warn("[request-rides] bulk SMS skipped (INFORU_SMS_ENABLED)", created.orderId);
          } else if (
            !smsResult.skipped &&
            smsResult.error &&
            smsResult.error !== "no_recipients" &&
            process.env.NODE_ENV !== "test"
          ) {
            console.warn("[request-rides] bulk SMS failed", created.orderId, smsResult.error);
          }
        }
        void requestStatus(createdRide);
      } catch (error) {
        const message = publicErrorMessage(error, "Couldn’t create this ride. Try again later.");
        setPendingUploads((prev) =>
          prev.map((row) =>
            row.id === rowId ? { ...row, state: "failed", message } : row,
          ),
        );
      }
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    }
    setUploadSubmitting(false);
  };

  const removePendingUpload = (id: string) => {
    if (focusedPendingUploadId === id) {
      setFocusedPendingUploadId(null);
    }
    setPendingUploads((prev) => prev.filter((row) => row.id !== id));
  };

  const clearPendingUploads = () => {
    if (uploadSubmitting) return;
    setFocusedPendingUploadId(null);
    setPendingUploads([]);
    setUploadError(null);
  };

  const removeRequestedRide = async (orderId: string) => {
    const ride = requestedRides.find((item) => item.orderId === orderId);
    if (!ride) return;
    if (
      !window.confirm(
        "Cancel this trip? It will be removed from the list when cancellation succeeds.",
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
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) {
        const detail =
          typeof data.error === "string" && data.error.trim()
            ? data.error.trim()
            : `HTTP ${response.status}`;
        throw new Error(detail);
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
      setRideListError(publicErrorMessage(error, "Couldn’t cancel this order. Try again later."));
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
        <span className="crm-label block">{params.label}</span>
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
            className="crm-input rr-input-volumetric h-11 w-full px-10 text-sm"
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

  const rideCard = "rr-glass-card p-4";
  const rideCardStatic = "rr-glass-card-static p-4";
  /** Figma Make — accordion shells */
  const makePanelClass = "group rr-make-panel relative";
  const makeSummaryClass = "rr-make-panel-summary";
  const collapsibleCardClass = `${makePanelClass} p-0`;
  const collapsibleSummaryClass = makeSummaryClass;
  const dropdownPanelClass =
    "absolute left-0 right-0 top-full z-[200] mt-1 max-h-56 w-full overflow-auto rr-dropdown-panel";
  /** Body portaled menus — `position: fixed` + coords from getBoundingClientRect. */
  const portalDropdownShellClass =
    "fixed z-[7000] max-h-56 min-w-[12rem] overflow-y-auto rr-dropdown-panel";
  const dropdownOptionClass = "rr-dropdown-option";

  return (
    <section className="relative flex min-h-0 flex-1 flex-col gap-0 overflow-visible">
      <div className="relative min-h-0 flex-1 w-full overflow-visible">
          <div className="fixed inset-0 z-0 bg-gradient-to-br from-gray-100 via-gray-50 to-gray-100">
            <RequestRidesMap
              points={effectiveMapPoints}
              routeCoordinates={mapRouteCoordinates}
              routeTrafficGeojson={mapTrafficGeojson}
              fitPadding={mapFitPadding}
              onMapClick={(point) => void handleMapClick(point)}
              onPointDrag={(point) => void handleMapPointDrag(point)}
            />
          </div>

          <div className="pointer-events-none absolute inset-0 z-10 pb-4 pl-[calc(0.75rem+4rem+1.25rem)] pr-3 pt-[39px] lg:pl-[calc(0.75rem+4rem+1.5rem)] lg:pr-4">
            <div className="rr-glass-column-shell pointer-events-auto flex h-full w-full max-w-[min(36rem,calc(100vw-1.5rem))] flex-col overflow-x-hidden rounded-3xl p-3 lg:p-4">
              <form
                onSubmit={handleSubmit}
                className="flex min-h-0 flex-1 flex-col pointer-events-auto"
              >
              <div
                ref={rideFormScrollRef}
                className="relative z-10 min-h-0 flex-1 space-y-5 overflow-y-auto overflow-x-hidden pb-6 pr-0.5"
              >
              <details
                className={`${collapsibleCardClass} relative z-30`}
                open={selectClientPanelOpen}
                onToggle={(event) => setSelectClientPanelOpen(event.currentTarget.open)}
              >
                <summary className={collapsibleSummaryClass}>
                  <span className="rr-make-panel-summary-title-md min-w-0 flex-1 truncate">
                    {isClientScopedUser
                      ? "Client context"
                      : clientsLoading
                        ? "Loading clients…"
                        : selectedClient
                          ? `${selectedClient.clientName} (${selectedClient.tokenLabel})`
                          : "Select Client"}
                  </span>
                  <span className="inline-flex shrink-0 text-slate-600 transition-transform duration-300 group-open:rotate-180">
                    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.9">
                      <path d="M5 7.5l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </summary>
                <div className="rr-make-panel-body-clip">
                <div className="rr-make-panel-body space-y-3">
                <label className="block">
                  <span className="crm-label block">
                    {isClientScopedUser ? "Cabinet" : "Client"}
                  </span>
                  {isClientScopedUser ? (
                    <div className="rr-make-panel-dropdown-trigger min-h-[2.75rem] cursor-default font-semibold">
                      {selectedClient
                        ? `${selectedClient.clientName} (${selectedClient.tokenLabel})`
                        : "Client from your cabinet"}
                    </div>
                  ) : (
                    <div className="relative">
                      <button
                        ref={clientPickerButtonRef}
                        type="button"
                        disabled={clientsLoading || isClientScopedUser}
                        onClick={() => {
                          if (isClientScopedUser) return;
                          setShowClientDropdown((prev) => !prev);
                        }}
                        onBlur={() => {
                          window.setTimeout(() => setShowClientDropdown(false), 120);
                        }}
                        className="rr-make-panel-dropdown-trigger text-left text-sm font-semibold outline-none focus:outline-none focus-visible:ring-0"
                      >
                        <span
                          className={`min-w-0 flex-1 truncate ${selectedClient ? "text-slate-900" : "text-slate-500"}`}
                        >
                          {clientsLoading
                            ? "Loading clients…"
                            : selectedClient
                              ? `${selectedClient.clientName} (${selectedClient.tokenLabel})`
                              : "Choose client…"}
                        </span>
                        <span className="inline-flex shrink-0 text-slate-600">
                          <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.9">
                            <path d="M5 7.5l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </span>
                      </button>
                    </div>
                  )}
                </label>

                <label
                  className={`block ${!selectedClient ? "cursor-not-allowed" : ""}`}
                >
                  <span className="crm-label block">Rider phone</span>
                  <div ref={phoneSuggestAnchorRef} className="relative">
                    <input
                      value={phoneNumber}
                      disabled={!selectedClient}
                      onChange={(event) => {
                        setPhoneNumber(event.target.value);
                        if (!event.target.value.trim()) {
                          setPhoneSuggestions([]);
                        }
                        setShowPhoneSuggestions(true);
                        setPhoneLookupOk(null);
                        setPhoneLookupMessage(null);
                      }}
                      onFocus={() => selectedClient && setShowPhoneSuggestions(true)}
                      onBlur={() => {
                        window.setTimeout(() => setShowPhoneSuggestions(false), 120);
                      }}
                      className="crm-input rr-input-volumetric h-11 w-full px-3 text-sm disabled:cursor-not-allowed disabled:opacity-55"
                      placeholder={
                        selectedClient
                          ? "+972..."
                          : isClientScopedUser && clientsLoading
                            ? "Loading…"
                            : "Select a client first"
                      }
                      required={Boolean(selectedClient)}
                    />
                  </div>
                </label>

                {selectedClient ? (
                  <div className="space-y-2 rounded-2xl border border-slate-200/80 bg-white/90 p-3 shadow-sm">
                    <p className="text-xs text-slate-600">
                      Bulk orders use this client:{" "}
                      <span className="font-semibold text-slate-800">
                        {selectedClient.clientName} ({selectedClient.tokenLabel})
                      </span>
                    </p>
                    <div className="flex items-stretch gap-2">
                      <button
                        type="button"
                        onClick={handleUploadButtonClick}
                        disabled={uploadParsing}
                        className="crm-hover-lift min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm font-semibold text-slate-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {uploadParsing ? "Parsing XLS/XLSX…" : "Upload XLS/XLSX (bulk)"}
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadBulkUploadSampleXlsx()}
                        className="crm-hover-lift shrink-0 self-stretch rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-white hover:text-slate-900"
                        title="Download example .xlsx"
                      >
                        Sample
                      </button>
                    </div>
                    <input
                      ref={xlsxInputRef}
                      type="file"
                      accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      className="hidden"
                      onChange={(event) => void handleXlsxFileChange(event)}
                    />
                    {uploadError ? <p className="text-xs text-rose-700">{uploadError}</p> : null}
                  </div>
                ) : null}
                </div>
                </div>
              </details>

              <details
                className={`${collapsibleCardClass} relative z-30`}
                open={routeStopsPanelOpen}
                onToggle={(event) => setRouteStopsPanelOpen(event.currentTarget.open)}
              >
                <summary className={collapsibleSummaryClass}>
                  <span className="rr-make-panel-summary-title-md">Route & stops</span>
                  <span className="inline-flex shrink-0 text-slate-600 transition-transform duration-300 group-open:rotate-180">
                    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.9">
                      <path d="M5 7.5l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </summary>
                <div className="rr-make-panel-body-clip">
                <div className="rr-make-panel-body space-y-3">
                  {renderAddressInput({
                    fieldId: "pickup",
                    label: "Pickup location",
                    value: pickup,
                    required: true,
                    onChange: setPickup,
                  })}
                  <button
                    type="button"
                    onClick={() => setStops((prev) => [...prev, createEmptyStopField()])}
                    className="crm-hover-lift flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200/90 bg-white/95 px-4 py-3 text-sm font-medium text-slate-900 shadow-md transition hover:bg-white"
                  >
                    <svg
                      viewBox="0 0 20 20"
                      fill="none"
                      className="h-4 w-4"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden
                    >
                      <path d="M10 4v12M4 10h12" strokeLinecap="round" />
                    </svg>
                    Add Stop
                  </button>
                  {stops.map((stop) => (
                    <div
                      key={stop.id}
                      className="rounded-2xl border border-slate-200/70 bg-white/70 p-3 shadow-sm"
                    >
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1 space-y-2">
                          {renderAddressInput({
                            fieldId: `stop:${stop.id}`,
                            label: "Stop along the way",
                            value: stop,
                            onChange: (next) =>
                              setStops((prev) =>
                                prev.map((item) => (item.id === stop.id ? { ...item, ...next } : item)),
                              ),
                          })}
                          <label className="block">
                            <span className="crm-label block">Passenger phone (SMS)</span>
                            <input
                              type="tel"
                              inputMode="tel"
                              value={stop.phone}
                              onChange={(event) =>
                                setStops((prev) =>
                                  prev.map((item) =>
                                    item.id === stop.id ? { ...item, phone: event.target.value } : item,
                                  ),
                                )
                              }
                              className="crm-input rr-input-volumetric h-10 w-full px-3 text-sm"
                              placeholder="+972..."
                            />
                          </label>
                        </div>
                        <button
                          type="button"
                          aria-label="Remove stop"
                          onClick={() => setStops((prev) => prev.filter((item) => item.id !== stop.id))}
                          className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-rose-100 bg-rose-50 text-rose-600 shadow-sm transition hover:bg-rose-100"
                        >
                          <svg
                            viewBox="0 0 20 20"
                            fill="none"
                            className="h-5 w-5"
                            stroke="currentColor"
                            strokeWidth="2"
                            aria-hidden
                          >
                            <path d="M5 5l10 10M15 5l-10 10" strokeLinecap="round" />
                          </svg>
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
                  <label className="block">
                    <span className="crm-label block">Passenger phone at destination (SMS)</span>
                    <input
                      type="tel"
                      inputMode="tel"
                      value={destinationPhone}
                      onChange={(event) => setDestinationPhone(event.target.value)}
                      className="crm-input rr-input-volumetric h-10 w-full px-3 text-sm"
                      placeholder="+972..."
                    />
                  </label>
                  <div className="flex flex-col gap-2">
                    <label className="flex cursor-pointer items-center gap-3 text-sm font-medium text-slate-900">
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
                        className="h-5 w-5 cursor-pointer rounded-md border-2 border-slate-400 bg-white accent-red-600 focus:outline-none focus:ring-2 focus:ring-red-400/40"
                      />
                      Schedule ride
                    </label>
                    {scheduleEnabled ? (
                      <label className="block">
                        <span className="crm-label block">Schedule datetime</span>
                        <input
                          type="datetime-local"
                          value={scheduleAtInput}
                          onChange={(event) => setScheduleAtInput(event.target.value)}
                          className="crm-input rr-input-volumetric h-11 w-full px-3 text-sm"
                        />
                      </label>
                    ) : null}
                  </div>
                </div>
                </div>
              </details>

              {effectiveMapPoints.length >= 2 ? (
                <details className={`${makePanelClass} text-xs text-slate-800`}>
                  <summary className={makeSummaryClass}>
                    <span className="rr-make-panel-summary-title-md">Route preview</span>
                    <span className="inline-flex shrink-0 text-slate-600 transition-transform duration-300 group-open:rotate-180">
                      <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.9">
                        <path d="M5 7.5l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  </summary>
                  <div className="rr-make-panel-body-clip">
                  <div className="rr-make-panel-body space-y-0.5">
                    <p>
                      Est km: <span className="font-semibold text-slate-900">{routeDistanceKm ?? "n/a"}</span>
                    </p>
                    <p>
                      Est trip time:{" "}
                      <span className="font-semibold text-slate-900">
                        {routeDurationMin != null ? `${routeDurationMin} min` : "n/a"}
                      </span>
                    </p>
                    {routePreviewError ? (
                      <p className="text-[11px] text-rose-700">{routePreviewError}</p>
                    ) : null}
                  </div>
                  </div>
                </details>
              ) : null}

              {mapPoints.length >= 3 ? (
                <details className={`${collapsibleCardClass} text-sm text-slate-800`} open={false}>
                  <summary className={collapsibleSummaryClass}>
                    <span className="rr-make-panel-summary-title-md">Route optimization</span>
                    <span className="inline-flex shrink-0 text-slate-600 transition-transform duration-300 group-open:rotate-180">
                      <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.9">
                        <path d="M5 7.5l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  </summary>
                  <div className="rr-make-panel-body-clip">
                  <div className="rr-make-panel-body space-y-2">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                        Optimize order (traffic-aware)
                      </p>
                      <button
                        type="button"
                        onClick={() => void optimizeCurrentRoute()}
                        disabled={optimizing}
                        className="crm-hover-lift shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {optimizing ? "Calculating…" : "Find fastest order"}
                      </button>
                    </div>
                  <label className="flex cursor-pointer items-start gap-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={fixDestinationForOptimization}
                      onChange={(event) => setFixDestinationForOptimization(event.target.checked)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-semibold text-slate-900">Keep final drop-off as in the form</span>{" "}
                      (round trip / return home). We only reorder intermediate stops; the address in{" "}
                      <span className="font-medium">Destination</span> stays last.
                    </span>
                  </label>
                  {optimization ? (
                    (() => {
                      const tail: AddressField[] = [...stops, destination];
                      const reordered = optimization.orderedIndices
                        .map((idx) => tail[idx])
                        .filter(Boolean);
                      const savedMin = optimization.savingsSeconds / 60;
                      const savedLabel =
                        savedMin >= 1 ? `${Math.round(savedMin)} min` : "< 1 min";
                      const formatPoint = (entry: AddressField | undefined) =>
                        entry?.text?.trim() ? entry.text.trim() : "Untitled";
                      const beforeChain = [
                        formatPoint(pickup),
                        ...stops.map((s) => formatPoint(s)),
                        formatPoint(destination),
                      ];
                      const afterChain = [formatPoint(pickup), ...reordered.map(formatPoint)];
                      const kmSaved =
                        optimization.savingsMeters != null && optimization.savingsMeters >= 50
                          ? `${(optimization.savingsMeters / 1000).toFixed(1)} km shorter`
                          : null;
                      return (
                        <div className="space-y-3">
                          <p className="text-xs leading-relaxed text-slate-700">
                            We compared <span className="font-semibold">every allowed order</span> of your
                            points after pickup using <span className="font-semibold">current traffic</span>{" "}
                            between them.
                            {fixDestinationForOptimization ? (
                              <>
                                {" "}
                                The <span className="font-semibold">Destination</span> field stays the final
                                stop; only intermediate stops are reordered.
                              </>
                            ) : (
                              <>
                                {" "}
                                The last leg can be any of your addresses — the former &quot;Destination&quot;
                                may move if that order is faster.
                              </>
                            )}{" "}
                            Pickup is always first; same addresses, different sequence where it helps.
                          </p>
                          <div className="rounded-lg border border-slate-100 bg-slate-50/90 p-2 text-xs text-slate-800">
                            <p className="font-semibold text-slate-900">Current form order</p>
                            <ol className="mt-1 list-decimal space-y-0.5 pl-4">
                              <li>Pickup — {beforeChain[0]}</li>
                              {beforeChain.slice(1, -1).map((label, idx) => (
                                <li key={`before-${idx}`}>
                                  Stop {idx + 1} — {label}
                                </li>
                              ))}
                              <li>Final drop-off — {beforeChain[beforeChain.length - 1]}</li>
                            </ol>
                          </div>
                          <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-2 text-xs text-slate-800">
                            <p className="font-semibold text-emerald-900">Faster order (apply to use)</p>
                            <ol className="mt-1 list-decimal space-y-0.5 pl-4">
                              <li>Pickup — {afterChain[0]}</li>
                              {afterChain.slice(1, -1).map((label, idx) => (
                                <li key={`after-${idx}`}>
                                  Via point {idx + 1} — {label}
                                </li>
                              ))}
                              <li>Final drop-off — {afterChain[afterChain.length - 1]}</li>
                            </ol>
                          </div>
                          <p className="text-xs text-emerald-800">
                            Saves ~{savedLabel} in traffic (
                            {Math.max(1, Math.round(optimization.optimizedDurationSeconds / 60))} min vs{" "}
                            {Math.max(1, Math.round(optimization.originalDurationSeconds / 60))} min for the
                            same points).
                            {kmSaved ? ` Estimated ${kmSaved} shorter by combined leg distances.` : ""}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={applyOptimization}
                              className="crm-button-primary h-8 rounded-lg px-3 text-xs font-semibold"
                            >
                              Apply order
                            </button>
                            <button
                              type="button"
                              onClick={dismissOptimization}
                              className="crm-hover-lift rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                            >
                              Dismiss
                            </button>
                          </div>
                        </div>
                      );
                    })()
                  ) : null}
                  {!optimization && optimizationInfo ? (
                    <p className="text-xs text-slate-600">{optimizationInfo}</p>
                  ) : null}
                  {optimizationError ? (
                    <p className="text-xs text-rose-700">{optimizationError}</p>
                  ) : null}
                  </div>
                  </div>
                </details>
              ) : null}

              <details className={collapsibleCardClass} open={false}>
                <summary className={collapsibleSummaryClass}>
                  <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="rr-make-panel-summary-title-md">Driver instructions</span>
                    <span className="text-xs font-normal text-slate-500">Optional</span>
                  </span>
                  <span className="inline-flex shrink-0 text-slate-600 transition-transform duration-300 group-open:rotate-180">
                    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.9">
                      <path d="M5 7.5l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </summary>
                <div className="rr-make-panel-body-clip">
                  <div className="rr-make-panel-body space-y-3">
                    <label className="block">
                      <span className="crm-label block">Notes for the driver</span>
                      <textarea
                        value={comment}
                        onChange={(event) => setComment(event.target.value)}
                        className="crm-input rr-input-volumetric min-h-20 w-full resize-y px-3 py-2 text-sm"
                        placeholder="Sent with the order when filled"
                      />
                    </label>
                  </div>
                </div>
              </details>

              <div className={rideCardStatic}>
                <div className="rr-primary-submit-wrap rounded-2xl">
                  <button
                    type="submit"
                    disabled={
                      submitting ||
                      clientsLoading ||
                      !selectedClient ||
                      !phoneNumber.trim() ||
                      !pickup.text.trim() ||
                      !destination.text.trim()
                    }
                    className="h-12 w-full rounded-2xl border border-red-700/25 bg-gradient-to-br from-red-400 via-red-500 to-red-600 text-base font-medium text-white shadow-[0_10px_30px_rgba(239,68,68,0.3),inset_0_1px_0_rgba(255,255,255,0.3)] transition hover:brightness-[1.03] disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:brightness-100"
                  >
                    {submitting ? "Requesting ride..." : "Request ride"}
                  </button>
                </div>
                <div className="mt-3 space-y-2">
                  <button
                    type="button"
                    onClick={() => void checkPhoneRegistration()}
                    disabled={
                      phoneChecking ||
                      (!selectedClient && !isClientScopedUser) ||
                      !phoneNumber.trim()
                    }
                    className="crm-hover-lift w-full rounded-2xl border border-slate-200/90 bg-white/95 px-4 py-3 text-sm font-semibold text-slate-800 shadow-md backdrop-blur-sm disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    {phoneChecking ? "Checking phone..." : "Check phone registration"}
                  </button>
                  {phoneLookupMessage ? (
                    <p className={`text-sm ${phoneLookupOk ? "text-emerald-700" : "text-rose-700"}`}>
                      {phoneLookupMessage}
                    </p>
                  ) : null}
                  {clientsError ? <p className="text-sm text-rose-700">{clientsError}</p> : null}
                  {formError ? <p className="text-sm text-rose-700">{formError}</p> : null}
                  {rideListError ? <p className="text-sm text-rose-700">{rideListError}</p> : null}
                  {smsWarning ? <p className="text-sm text-amber-700">{smsWarning}</p> : null}
                </div>
              </div>

              {mapClickPoint ? (
                <details className={`${collapsibleCardClass} text-sm`} open={false}>
                  <summary className={collapsibleSummaryClass}>
                    <span className="rr-make-panel-summary-title-md">Map point actions</span>
                    <span className="inline-flex shrink-0 text-slate-600 transition-transform duration-300 group-open:rotate-180">
                      <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.9">
                        <path d="M5 7.5l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  </summary>
                  <div className="rr-make-panel-body-clip">
                  <div className="rr-make-panel-body space-y-3">
                  <p className="text-slate-700">
                    {mapClickLoading ? "Resolving address..." : mapClickLabel || "Address not resolved"}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setPickup({
                          text: mapClickLabel || `${mapClickPoint.lat.toFixed(6)}, ${mapClickPoint.lon.toFixed(6)}`,
                          lat: mapClickPoint.lat,
                          lon: mapClickPoint.lon,
                        })
                      }
                      className="crm-hover-lift rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm"
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
                      className="crm-hover-lift rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm"
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
                            phone: "",
                          },
                        ])
                      }
                      className="crm-hover-lift w-full rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm"
                    >
                      Add as Stop along the way
                    </button>
                  </div>
                  </div>
                  </div>
                </details>
              ) : null}

              <div className="space-y-3 xl:hidden">
                <PendingUploadsPanel
                  items={pendingUploads}
                  isSubmitting={uploadSubmitting}
                  optimizingItemIds={optimizingPendingUploadIds}
                  selectedItemId={focusedPendingUploadId}
                  onSelectItem={(id) =>
                    setFocusedPendingUploadId((prev) => (prev === id ? null : id))
                  }
                  onOptimizeItem={(id) => void optimizePendingUploadRoute(id)}
                  cardClassName={`pointer-events-auto ${rideCardStatic}`}
                  onConfirmAll={() => void handleConfirmPendingUploads()}
                  onClearAll={clearPendingUploads}
                  onRemove={removePendingUpload}
                />
                <div className="rounded-2xl border border-white/80 bg-white/85 p-3 shadow-lg backdrop-blur-xl">
                  <p className="rr-make-panel-summary-title-sm">Requested rides</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {requestedRides.length === 0
                      ? "No rides requested yet"
                      : `${requestedRides.length} ride${requestedRides.length === 1 ? "" : "s"} in progress`}
                  </p>
                </div>
                {requestedRides.length > 0 ? (
                  <article className={`pointer-events-auto ${rideCardStatic}`}>
                    <div className="rr-requested-ride-list max-h-[32dvh] space-y-3 overflow-y-auto pr-1">
                      {requestedRides.map((ride, index) => (
                        <RequestedRideAccordionCard
                          key={ride.orderId}
                          ride={ride}
                          index={index}
                          deletingOrderId={deletingOrderId}
                          onRemove={removeRequestedRide}
                        />
                      ))}
                    </div>
                  </article>
                ) : null}
              </div>

              </div>

              {typeof document !== "undefined"
                ? createPortal(
                    <>
                      {showClientDropdown && clientMenuRect ? (
                        <div
                          role="listbox"
                          className={portalDropdownShellClass}
                          style={{
                            left: clientMenuRect.left,
                            top: clientMenuRect.top,
                            width: clientMenuRect.width,
                          }}
                        >
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
                      {showPhoneSuggestions &&
                      selectedClient &&
                      phoneNumber.trim() &&
                      phoneSuggestRect ? (
                        <div
                          role="listbox"
                          className={portalDropdownShellClass}
                          style={{
                            left: phoneSuggestRect.left,
                            top: phoneSuggestRect.top,
                            width: phoneSuggestRect.width,
                          }}
                        >
                          {suggestionsLoading ? (
                            <p className="px-3 py-2 text-xs text-slate-500">Searching users...</p>
                          ) : phoneSuggestions.length > 0 ? (
                            phoneSuggestions.map((item) => {
                              const phoneKey = normalizePhoneLookupKey(item.phone ?? "");
                              const resolvedName =
                                (phoneKey ? tenantEmployeeNameByPhone.get(phoneKey) : null) ||
                                item.fullName?.trim() ||
                                null;
                              return (
                                <button
                                  key={`${item.userId}:${item.phone ?? "none"}`}
                                  type="button"
                                  onMouseDown={(event) => {
                                    event.preventDefault();
                                    const displayName = resolvedName || item.phone?.trim() || "employee";
                                    if (item.phone) {
                                      setPhoneNumber(item.phone);
                                    }
                                    setPhoneLookupOk(true);
                                    setPhoneLookupMessage(
                                      `Selected ${displayName}${item.phone ? ` (${item.phone})` : ""}.`,
                                    );
                                    setShowPhoneSuggestions(false);
                                  }}
                                  className={dropdownOptionClass}
                                >
                                  <p className="text-sm font-semibold text-slate-800">
                                    {resolvedName || item.phone || "Employee"}
                                  </p>
                                  <p className="text-xs text-slate-600">
                                    {item.phone ?? "Phone n/a"} • {item.source}
                                  </p>
                                </button>
                              );
                            })
                          ) : (
                            <p className="px-3 py-2 text-xs text-slate-500">No matching users found.</p>
                          )}
                        </div>
                      ) : null}
                    </>,
                    document.body,
                  )
                : null}

              </form>
            </div>
          </div>

          <aside className="pointer-events-none absolute right-4 top-4 z-20 hidden w-[min(30rem,calc(100%-2rem))] flex-col gap-4 xl:flex">
            <PendingUploadsPanel
              items={pendingUploads}
              isSubmitting={uploadSubmitting}
              optimizingItemIds={optimizingPendingUploadIds}
              selectedItemId={focusedPendingUploadId}
              onSelectItem={(id) =>
                setFocusedPendingUploadId((prev) => (prev === id ? null : id))
              }
              onOptimizeItem={(id) => void optimizePendingUploadRoute(id)}
              cardClassName={`pointer-events-auto ${rideCardStatic}`}
              onConfirmAll={() => void handleConfirmPendingUploads()}
              onClearAll={clearPendingUploads}
              onRemove={removePendingUpload}
            />
            <div className="pointer-events-auto rounded-2xl border border-white/80 bg-white/85 p-3 shadow-lg backdrop-blur-xl">
              <p className="rr-make-panel-summary-title-sm">Requested rides</p>
              <p className="mt-1 text-xs text-slate-500">
                {requestedRides.length === 0
                  ? "No rides requested yet"
                  : `${requestedRides.length} ride${requestedRides.length === 1 ? "" : "s"} in progress`}
              </p>
            </div>
            {requestedRides.length > 0 ? (
              <article className={`pointer-events-auto ${rideCardStatic}`}>
                <div className="rr-requested-ride-list max-h-[42dvh] space-y-3 overflow-y-auto pr-1">
                  {requestedRides.map((ride, index) => (
                    <RequestedRideAccordionCard
                      key={ride.orderId}
                      ride={ride}
                      index={index}
                      deletingOrderId={deletingOrderId}
                      onRemove={removeRequestedRide}
                    />
                  ))}
                </div>
              </article>
            ) : null}
          </aside>
        </div>
    </section>
  );
}
