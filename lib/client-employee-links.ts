import fs from "node:fs";
import path from "node:path";

type TenantLinks = Record<string, string>;
type EmployeeLinksStore = Record<string, TenantLinks>;

const STORE_PATH = path.join(process.cwd(), "data", "client-employee-links.json");

function readStore(): EmployeeLinksStore {
  if (!fs.existsSync(STORE_PATH)) return {};
  try {
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as EmployeeLinksStore;
  } catch {
    return {};
  }
}

function writeStore(store: EmployeeLinksStore) {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

export function getTenantEmployeeLinks(tenantId: string): TenantLinks {
  const store = readStore();
  return store[tenantId] ?? {};
}

export function setTenantEmployeeLinks(tenantId: string, links: TenantLinks) {
  const store = readStore();
  store[tenantId] = links;
  writeStore(store);
}
