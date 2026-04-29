import fs from "node:fs";
import path from "node:path";

type EmployeeControlItem = {
  ordersAllowed: boolean;
  allowedRideClasses: string[];
  updatedAt: string;
};

type EmployeeControlsStore = Record<string, Record<string, EmployeeControlItem>>;

const STORE_PATH = path.join(process.cwd(), "data", "client-employee-controls.json");

function readStore(): EmployeeControlsStore {
  if (!fs.existsSync(STORE_PATH)) return {};
  try {
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as EmployeeControlsStore;
  } catch {
    return {};
  }
}

function writeStore(store: EmployeeControlsStore) {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

export function getClientEmployeeControls(tenantId: string): Record<string, EmployeeControlItem> {
  const store = readStore();
  return store[tenantId] ?? {};
}

export function upsertClientEmployeeControl(input: {
  tenantId: string;
  userId: string;
  ordersAllowed: boolean;
  allowedRideClasses: string[];
}) {
  const tenantId = input.tenantId.trim();
  const userId = input.userId.trim();
  if (!tenantId || !userId) {
    throw new Error("tenantId and userId are required.");
  }

  const normalizedClasses = [...new Set(input.allowedRideClasses.map((v) => v.trim()).filter(Boolean))];
  const store = readStore();
  const tenantControls = store[tenantId] ?? {};
  tenantControls[userId] = {
    ordersAllowed: input.ordersAllowed,
    allowedRideClasses: normalizedClasses,
    updatedAt: new Date().toISOString(),
  };
  store[tenantId] = tenantControls;
  writeStore(store);
  return tenantControls[userId];
}
