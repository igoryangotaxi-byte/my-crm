import { kv } from "@vercel/kv";

const PREFIX = "appli:request-rides-addresses:v1:";
const DOC_VERSION = 1 as const;

export type RequestRideAddressSnapshot = {
  version: typeof DOC_VERSION;
  savedAt: string;
  sourceAddress: string;
  destinationAddress: string;
  waypointAddresses: string[];
};

const memoryDocs = new Map<string, RequestRideAddressSnapshot>();

function canUseKv() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function storageKey(tokenLabel: string, clientId: string, orderId: string): string {
  return `${PREFIX}${encodeURIComponent(tokenLabel)}:${encodeURIComponent(clientId)}:${encodeURIComponent(orderId)}`;
}

function normalizeSnapshot(raw: unknown): RequestRideAddressSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (row.version !== DOC_VERSION) return null;
  const sourceAddress = typeof row.sourceAddress === "string" ? row.sourceAddress.trim() : "";
  const destinationAddress =
    typeof row.destinationAddress === "string" ? row.destinationAddress.trim() : "";
  const waypointAddresses = Array.isArray(row.waypointAddresses)
    ? row.waypointAddresses
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item.length > 0)
    : [];
  if (!sourceAddress || !destinationAddress) return null;
  return {
    version: DOC_VERSION,
    savedAt: typeof row.savedAt === "string" ? row.savedAt : new Date().toISOString(),
    sourceAddress,
    destinationAddress,
    waypointAddresses,
  };
}

export async function saveRequestRideAddressSnapshot(input: {
  tokenLabel: string;
  clientId: string;
  orderId: string;
  sourceAddress: string;
  destinationAddress: string;
  waypointAddresses: string[];
}): Promise<void> {
  const sourceAddress = input.sourceAddress.trim();
  const destinationAddress = input.destinationAddress.trim();
  if (!sourceAddress || !destinationAddress) return;
  const doc: RequestRideAddressSnapshot = {
    version: DOC_VERSION,
    savedAt: new Date().toISOString(),
    sourceAddress,
    destinationAddress,
    waypointAddresses: input.waypointAddresses
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  };
  const key = storageKey(input.tokenLabel, input.clientId, input.orderId);
  if (canUseKv()) {
    try {
      await kv.set(key, doc);
      return;
    } catch {
      // fall through to memory
    }
  }
  memoryDocs.set(key, doc);
}

export async function loadRequestRideAddressSnapshotsBatch(input: {
  tokenLabel: string;
  clientId: string;
  orderIds: string[];
}): Promise<Record<string, RequestRideAddressSnapshot>> {
  const orderIds = [...new Set(input.orderIds.map((item) => item.trim()).filter(Boolean))];
  if (orderIds.length === 0) return {};

  const out: Record<string, RequestRideAddressSnapshot> = {};
  if (canUseKv()) {
    try {
      await Promise.all(
        orderIds.map(async (orderId) => {
          const key = storageKey(input.tokenLabel, input.clientId, orderId);
          const doc = normalizeSnapshot(await kv.get<unknown>(key));
          if (doc) out[orderId] = doc;
        }),
      );
      return out;
    } catch {
      // fall through to memory
    }
  }

  for (const orderId of orderIds) {
    const key = storageKey(input.tokenLabel, input.clientId, orderId);
    const doc = normalizeSnapshot(memoryDocs.get(key));
    if (doc) out[orderId] = doc;
  }
  return out;
}
