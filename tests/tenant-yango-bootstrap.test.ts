import test from "node:test";
import assert from "node:assert/strict";

import { discoverYangoTenantDefaultCostCenterId } from "../lib/tenant-yango-bootstrap";

test("default CC: single prefetched cost center wins when users have no costCenterId", async () => {
  const id = await discoverYangoTenantDefaultCostCenterId({
    tokenLabel: "TEST",
    apiClientId: "client-1",
    yangoUsers: [{ costCenterId: null }, { costCenterId: "" }],
    prefetchedCostCenters: [{ id: "cc-uuid-sole" }],
  });
  assert.equal(id, "cc-uuid-sole");
});

test("default CC: first user costCenterId wins over prefetched centers", async () => {
  const id = await discoverYangoTenantDefaultCostCenterId({
    tokenLabel: "TEST",
    apiClientId: "client-1",
    yangoUsers: [{ costCenterId: "from-user" }],
    prefetchedCostCenters: [{ id: "from-list" }],
  });
  assert.equal(id, "from-user");
});
