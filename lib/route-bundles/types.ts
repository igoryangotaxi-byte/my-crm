export type BundleStatus =
  | "suggested"
  | "reviewing"
  | "driver_contacted"
  | "accepted"
  | "rejected"
  | "active"
  | "completed"
  | "cancelled";

export type BundleHealth = "safe" | "tight" | "at_risk" | "conflict";

export type OpportunityStatus = "open" | "accepted" | "dismissed" | "expired";

export type LatLon = { lat: number; lon: number };

export type RouteBundleSettings = {
  maxOrdersPerBundle: number;
  minSafetyBufferMin: number;
  maxEmptyDriveKm: number;
  trafficAware: boolean;
  autoGenerateSuggestions: boolean;
  allowInsertIntoAccepted: boolean;
  serviceDurationFallbackMin: number;
  maxMatrixCellsPerGenerate: number;
  maxCandidateOrders: number;
  updatedAt: string;
  updatedBy: string | null;
};

export type EnrichedPreOrderNode = {
  orderId: string;
  tokenLabel: string;
  clientId: string;
  clientName: string;
  pickupAddress: string;
  dropoffAddress: string;
  pickup: LatLon;
  dropoff: LatLon;
  scheduledAt: Date;
  serviceDurationSec: number;
  serviceDurationConfidence: "routed" | "estimated";
};

export type TravelLeg = {
  durationSec: number;
  distanceM: number;
  trafficAware: boolean;
  coordinates?: Array<[number, number]>;
};

export type BundlePathLeg = {
  fromOrderId: string;
  toOrderId: string;
  emptyDrive: TravelLeg;
  bufferBeforePickupSec: number;
  expectedArrivalAtPickup: Date;
};

export type ScoredBundlePath = {
  orderIds: string[];
  nodes: EnrichedPreOrderNode[];
  passengerLegs: TravelLeg[];
  emptyLegs: BundlePathLeg[];
  minBufferSec: number;
  emptyDriveM: number;
  emptyDriveSec: number;
  totalDistanceM: number;
  score: number;
  scoreBreakdown: Record<string, number>;
  health: BundleHealth;
  windowStart: Date;
  windowEnd: Date;
};

export type TimelineEntry =
  | {
      kind: "pickup" | "dropoff";
      at: string;
      orderId: string;
      label: string;
    }
  | {
      kind: "transfer";
      from: string;
      to: string;
      driveSec: number;
      bufferSec: number;
      orderFromId: string;
      orderToId: string;
    };

export type BundleSnapshotPayload = {
  passengerGeojson: GeoJsonLineCollection | null;
  emptyDriveGeojson: GeoJsonLineCollection | null;
  fullPolylineCoordinates: Array<[number, number]>;
  googleMetadata: Record<string, unknown>;
  timeline: TimelineEntry[];
};

export type GeoJsonLineCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: {
      kind: "passenger" | "empty";
      orderId?: string;
      fromOrderId?: string;
      toOrderId?: string;
      sequence?: number;
      color?: string;
      [key: string]: unknown;
    };
    geometry: { type: "LineString"; coordinates: Array<[number, number]> };
  }>;
};

export type RouteBundleItem = {
  id: string;
  bundleId: string;
  sequence: number;
  orderId: string;
  tokenLabel: string;
  clientId: string;
  clientName: string;
  pickupAddress: string;
  dropoffAddress: string;
  pickupLat: number;
  pickupLon: number;
  dropoffLat: number;
  dropoffLon: number;
  scheduledAt: string;
  expectedPickupArrival: string | null;
  expectedDropoff: string | null;
  emptyDriveFromPrevSec: number;
  emptyDriveFromPrevM: number;
  bufferBeforePickupSec: number;
  serviceDurationSec: number;
  serviceDurationConfidence: string;
};

export type RouteBundle = {
  id: string;
  status: BundleStatus;
  health: BundleHealth;
  driverId: string | null;
  driverName: string | null;
  driverPhone: string | null;
  tokenLabel: string | null;
  minBufferSec: number;
  emptyDriveM: number;
  emptyDriveSec: number;
  totalDistanceM: number;
  score: number;
  scoreBreakdown: Record<string, number>;
  explainText: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  confirmedAt: string | null;
  contactedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: RouteBundleItem[];
  latestSnapshot?: BundleSnapshotPayload & { id: string; reason: string; calculatedAt: string };
};

export type RouteBundleOpportunity = {
  id: string;
  targetBundleId: string;
  candidateOrderId: string;
  candidateTokenLabel: string;
  proposedSequence: string[];
  deltaEmptyDriveM: number;
  deltaEmptyDriveSec: number;
  minBufferSec: number;
  scoreDelta: number;
  summary: string | null;
  status: OpportunityStatus;
  createdAt: string;
};

export type BundleEvent = {
  id: string;
  bundleId: string;
  actorUserId: string | null;
  actorName: string | null;
  action: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export const CALCULATOR_VERSION = "route-bundles-v1";
