import { getSupabaseAdminClient } from "@/lib/supabase";
import { buildSnapshotFromPath } from "@/lib/route-bundles/recalculate";
import type {
  BundleEvent,
  BundleSnapshotPayload,
  BundleStatus,
  RouteBundle,
  RouteBundleItem,
  RouteBundleOpportunity,
  ScoredBundlePath,
} from "@/lib/route-bundles/types";
import { CALCULATOR_VERSION } from "@/lib/route-bundles/types";

function mapItem(row: Record<string, unknown>): RouteBundleItem {
  return {
    id: String(row.id),
    bundleId: String(row.bundle_id),
    sequence: Number(row.sequence),
    orderId: String(row.order_id),
    tokenLabel: String(row.token_label),
    clientId: String(row.client_id),
    clientName: String(row.client_name),
    pickupAddress: String(row.pickup_address),
    dropoffAddress: String(row.dropoff_address),
    pickupLat: Number(row.pickup_lat),
    pickupLon: Number(row.pickup_lon),
    dropoffLat: Number(row.dropoff_lat),
    dropoffLon: Number(row.dropoff_lon),
    scheduledAt: String(row.scheduled_at),
    expectedPickupArrival: row.expected_pickup_arrival ? String(row.expected_pickup_arrival) : null,
    expectedDropoff: row.expected_dropoff ? String(row.expected_dropoff) : null,
    emptyDriveFromPrevSec: Number(row.empty_drive_from_prev_sec ?? 0),
    emptyDriveFromPrevM: Number(row.empty_drive_from_prev_m ?? 0),
    bufferBeforePickupSec: Number(row.buffer_before_pickup_sec ?? 0),
    serviceDurationSec: Number(row.service_duration_sec ?? 0),
    serviceDurationConfidence: String(row.service_duration_confidence ?? "estimated"),
  };
}

function mapBundle(row: Record<string, unknown>, items: RouteBundleItem[]): RouteBundle {
  return {
    id: String(row.id),
    status: row.status as BundleStatus,
    health: row.health as RouteBundle["health"],
    driverId: typeof row.driver_id === "string" ? row.driver_id : null,
    driverName: typeof row.driver_name === "string" ? row.driver_name : null,
    driverPhone: typeof row.driver_phone === "string" ? row.driver_phone : null,
    tokenLabel: typeof row.token_label === "string" ? row.token_label : null,
    minBufferSec: Number(row.min_buffer_sec ?? 0),
    emptyDriveM: Number(row.empty_drive_m ?? 0),
    emptyDriveSec: Number(row.empty_drive_sec ?? 0),
    totalDistanceM: Number(row.total_distance_m ?? 0),
    score: Number(row.score ?? 0),
    scoreBreakdown: (row.score_breakdown as Record<string, number>) ?? {},
    explainText: typeof row.explain_text === "string" ? row.explain_text : null,
    windowStart: row.window_start ? String(row.window_start) : null,
    windowEnd: row.window_end ? String(row.window_end) : null,
    createdBy: typeof row.created_by === "string" ? row.created_by : null,
    updatedBy: typeof row.updated_by === "string" ? row.updated_by : null,
    confirmedAt: row.confirmed_at ? String(row.confirmed_at) : null,
    contactedAt: row.contacted_at ? String(row.contacted_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    items,
  };
}

export async function logBundleEvent(input: {
  bundleId: string;
  actorUserId: string | null;
  actorName: string | null;
  action: string;
  payload?: Record<string, unknown>;
}) {
  try {
    const supabase = getSupabaseAdminClient();
    await supabase.from("preorder_route_bundle_events").insert({
      bundle_id: input.bundleId,
      actor_user_id: input.actorUserId,
      actor_name: input.actorName,
      action: input.action,
      payload: input.payload ?? {},
    });
  } catch (error) {
    console.error("logBundleEvent:", error);
  }
}

export async function listBundleEvents(bundleId: string): Promise<BundleEvent[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("preorder_route_bundle_events")
    .select("*")
    .eq("bundle_id", bundleId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    bundleId: String(row.bundle_id),
    actorUserId: row.actor_user_id ?? null,
    actorName: row.actor_name ?? null,
    action: String(row.action),
    payload: (row.payload as Record<string, unknown>) ?? {},
    createdAt: String(row.created_at),
  }));
}

async function replaceItems(bundleId: string, path: ScoredBundlePath) {
  const supabase = getSupabaseAdminClient();
  await supabase.from("preorder_route_bundle_items").delete().eq("bundle_id", bundleId);
  const rows = path.nodes.map((node, idx) => {
    const empty = path.emptyLegs.find((l) => l.toOrderId === node.orderId);
    const passenger = path.passengerLegs[idx];
    const expectedDropoff = new Date(
      node.scheduledAt.getTime() + Math.max(passenger?.durationSec ?? 0, node.serviceDurationSec) * 1000,
    );
    return {
      bundle_id: bundleId,
      sequence: idx + 1,
      order_id: node.orderId,
      token_label: node.tokenLabel,
      client_id: node.clientId,
      client_name: node.clientName,
      pickup_address: node.pickupAddress,
      dropoff_address: node.dropoffAddress,
      pickup_lat: node.pickup.lat,
      pickup_lon: node.pickup.lon,
      dropoff_lat: node.dropoff.lat,
      dropoff_lon: node.dropoff.lon,
      scheduled_at: node.scheduledAt.toISOString(),
      expected_pickup_arrival: empty?.expectedArrivalAtPickup.toISOString() ?? node.scheduledAt.toISOString(),
      expected_dropoff: expectedDropoff.toISOString(),
      empty_drive_from_prev_sec: empty?.emptyDrive.durationSec ?? 0,
      empty_drive_from_prev_m: empty?.emptyDrive.distanceM ?? 0,
      buffer_before_pickup_sec: empty?.bufferBeforePickupSec ?? 0,
      service_duration_sec: node.serviceDurationSec,
      service_duration_confidence: node.serviceDurationConfidence,
    };
  });
  if (rows.length) {
    const { error } = await supabase.from("preorder_route_bundle_items").insert(rows);
    if (error) throw new Error(error.message);
  }
}

export async function saveSnapshot(
  bundleId: string,
  reason: string,
  snapshot: BundleSnapshotPayload,
) {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("preorder_route_bundle_snapshots").insert({
    bundle_id: bundleId,
    reason,
    passenger_geojson: snapshot.passengerGeojson,
    empty_drive_geojson: snapshot.emptyDriveGeojson,
    full_polyline_coordinates: snapshot.fullPolylineCoordinates,
    google_metadata: snapshot.googleMetadata,
    timeline: snapshot.timeline,
    calculator_version: CALCULATOR_VERSION,
  });
  if (error) throw new Error(error.message);
}

export async function applyPathToBundle(
  bundleId: string,
  path: ScoredBundlePath,
  reason: string,
  updatedBy: string | null,
  explainText?: string | null,
) {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("preorder_route_bundles")
    .update({
      health: path.health,
      token_label: path.nodes[0]?.tokenLabel ?? null,
      min_buffer_sec: path.minBufferSec,
      empty_drive_m: path.emptyDriveM,
      empty_drive_sec: path.emptyDriveSec,
      total_distance_m: path.totalDistanceM,
      score: path.score,
      score_breakdown: path.scoreBreakdown,
      explain_text: explainText ?? null,
      window_start: path.windowStart.toISOString(),
      window_end: path.windowEnd.toISOString(),
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    })
    .eq("id", bundleId);
  if (error) throw new Error(error.message);
  await replaceItems(bundleId, path);
  await saveSnapshot(bundleId, reason, buildSnapshotFromPath(path));
}

export async function createBundleFromPath(input: {
  path: ScoredBundlePath;
  status: BundleStatus;
  createdBy: string | null;
  actorName: string | null;
  explainText?: string | null;
}): Promise<string> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("preorder_route_bundles")
    .insert({
      status: input.status,
      health: input.path.health,
      token_label: input.path.nodes[0]?.tokenLabel ?? null,
      min_buffer_sec: input.path.minBufferSec,
      empty_drive_m: input.path.emptyDriveM,
      empty_drive_sec: input.path.emptyDriveSec,
      total_distance_m: input.path.totalDistanceM,
      score: input.path.score,
      score_breakdown: input.path.scoreBreakdown,
      explain_text: input.explainText ?? null,
      window_start: input.path.windowStart.toISOString(),
      window_end: input.path.windowEnd.toISOString(),
      created_by: input.createdBy,
      updated_by: input.createdBy,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const id = String(data.id);
  await replaceItems(id, input.path);
  await saveSnapshot(id, "generate", buildSnapshotFromPath(input.path));
  await logBundleEvent({
    bundleId: id,
    actorUserId: input.createdBy,
    actorName: input.actorName,
    action: "created",
    payload: { orderIds: input.path.orderIds, score: input.path.score },
  });
  return id;
}

export async function deleteSuggestedBundles(): Promise<number> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("preorder_route_bundles")
    .delete()
    .eq("status", "suggested")
    .select("id");
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

export async function listBundles(status?: BundleStatus | BundleStatus[]): Promise<RouteBundle[]> {
  const supabase = getSupabaseAdminClient();
  let query = supabase.from("preorder_route_bundles").select("*").order("updated_at", { ascending: false });
  if (status) {
    const list = Array.isArray(status) ? status : [status];
    query = query.in("status", list);
  }
  const { data, error } = await query.limit(100);
  if (error) throw new Error(error.message);
  const bundles = data ?? [];
  if (!bundles.length) return [];

  const ids = bundles.map((b) => b.id);
  const { data: items, error: itemsError } = await supabase
    .from("preorder_route_bundle_items")
    .select("*")
    .in("bundle_id", ids)
    .order("sequence", { ascending: true });
  if (itemsError) throw new Error(itemsError.message);

  const byBundle = new Map<string, RouteBundleItem[]>();
  for (const row of items ?? []) {
    const item = mapItem(row as Record<string, unknown>);
    const list = byBundle.get(item.bundleId) ?? [];
    list.push(item);
    byBundle.set(item.bundleId, list);
  }
  return bundles.map((row) => mapBundle(row as Record<string, unknown>, byBundle.get(String(row.id)) ?? []));
}

export async function getBundle(id: string): Promise<RouteBundle | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.from("preorder_route_bundles").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const { data: items, error: itemsError } = await supabase
    .from("preorder_route_bundle_items")
    .select("*")
    .eq("bundle_id", id)
    .order("sequence", { ascending: true });
  if (itemsError) throw new Error(itemsError.message);
  const bundle = mapBundle(
    data as Record<string, unknown>,
    (items ?? []).map((row) => mapItem(row as Record<string, unknown>)),
  );

  const { data: snap } = await supabase
    .from("preorder_route_bundle_snapshots")
    .select("*")
    .eq("bundle_id", id)
    .order("calculated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (snap) {
    bundle.latestSnapshot = {
      id: String(snap.id),
      reason: String(snap.reason),
      calculatedAt: String(snap.calculated_at),
      passengerGeojson: snap.passenger_geojson as BundleSnapshotPayload["passengerGeojson"],
      emptyDriveGeojson: snap.empty_drive_geojson as BundleSnapshotPayload["emptyDriveGeojson"],
      fullPolylineCoordinates: (snap.full_polyline_coordinates as Array<[number, number]>) ?? [],
      googleMetadata: (snap.google_metadata as Record<string, unknown>) ?? {},
      timeline: (snap.timeline as BundleSnapshotPayload["timeline"]) ?? [],
    };
  }
  return bundle;
}

export async function updateBundleStatus(
  id: string,
  status: BundleStatus,
  actor: { userId: string | null; name: string | null },
) {
  const supabase = getSupabaseAdminClient();
  const patch: Record<string, unknown> = {
    status,
    updated_by: actor.userId,
    updated_at: new Date().toISOString(),
  };
  if (status === "driver_contacted") patch.contacted_at = new Date().toISOString();
  if (status === "accepted") patch.confirmed_at = new Date().toISOString();
  const { error } = await supabase.from("preorder_route_bundles").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  await logBundleEvent({
    bundleId: id,
    actorUserId: actor.userId,
    actorName: actor.name,
    action: "status_changed",
    payload: { status },
  });
}

export async function updateBundleDriver(
  id: string,
  driver: { driverId?: string | null; driverName?: string | null; driverPhone?: string | null },
  actor: { userId: string | null; name: string | null },
) {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("preorder_route_bundles")
    .update({
      driver_id: driver.driverId ?? null,
      driver_name: driver.driverName ?? null,
      driver_phone: driver.driverPhone ?? null,
      updated_by: actor.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  await logBundleEvent({
    bundleId: id,
    actorUserId: actor.userId,
    actorName: actor.name,
    action: "driver_set",
    payload: driver,
  });
}

export async function listOpportunities(status: "open" | "all" = "open"): Promise<RouteBundleOpportunity[]> {
  const supabase = getSupabaseAdminClient();
  let query = supabase
    .from("preorder_route_bundle_opportunities")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (status === "open") query = query.eq("status", "open");
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    targetBundleId: String(row.target_bundle_id),
    candidateOrderId: String(row.candidate_order_id),
    candidateTokenLabel: String(row.candidate_token_label),
    proposedSequence: (row.proposed_sequence as string[]) ?? [],
    deltaEmptyDriveM: Number(row.delta_empty_drive_m ?? 0),
    deltaEmptyDriveSec: Number(row.delta_empty_drive_sec ?? 0),
    minBufferSec: Number(row.min_buffer_sec ?? 0),
    scoreDelta: Number(row.score_delta ?? 0),
    summary: typeof row.summary === "string" ? row.summary : null,
    status: row.status as RouteBundleOpportunity["status"],
    createdAt: String(row.created_at),
  }));
}

export async function upsertOpportunity(row: {
  targetBundleId: string;
  candidateOrderId: string;
  candidateTokenLabel: string;
  proposedSequence: string[];
  deltaEmptyDriveM: number;
  deltaEmptyDriveSec: number;
  minBufferSec: number;
  scoreDelta: number;
  summary: string | null;
}): Promise<void> {
  const supabase = getSupabaseAdminClient();
  await supabase
    .from("preorder_route_bundle_opportunities")
    .update({ status: "expired", updated_at: new Date().toISOString() })
    .eq("target_bundle_id", row.targetBundleId)
    .eq("candidate_order_id", row.candidateOrderId)
    .eq("status", "open");
  const { error } = await supabase.from("preorder_route_bundle_opportunities").insert({
    target_bundle_id: row.targetBundleId,
    candidate_order_id: row.candidateOrderId,
    candidate_token_label: row.candidateTokenLabel,
    proposed_sequence: row.proposedSequence,
    delta_empty_drive_m: row.deltaEmptyDriveM,
    delta_empty_drive_sec: row.deltaEmptyDriveSec,
    min_buffer_sec: row.minBufferSec,
    score_delta: row.scoreDelta,
    summary: row.summary,
    status: "open",
  });
  if (error) throw new Error(error.message);
}

export async function setOpportunityStatus(
  id: string,
  status: "accepted" | "dismissed" | "expired",
) {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("preorder_route_bundle_opportunities")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function getOpportunity(id: string): Promise<RouteBundleOpportunity | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("preorder_route_bundle_opportunities")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    id: String(data.id),
    targetBundleId: String(data.target_bundle_id),
    candidateOrderId: String(data.candidate_order_id),
    candidateTokenLabel: String(data.candidate_token_label),
    proposedSequence: (data.proposed_sequence as string[]) ?? [],
    deltaEmptyDriveM: Number(data.delta_empty_drive_m ?? 0),
    deltaEmptyDriveSec: Number(data.delta_empty_drive_sec ?? 0),
    minBufferSec: Number(data.min_buffer_sec ?? 0),
    scoreDelta: Number(data.score_delta ?? 0),
    summary: typeof data.summary === "string" ? data.summary : null,
    status: data.status as RouteBundleOpportunity["status"],
    createdAt: String(data.created_at),
  };
}
