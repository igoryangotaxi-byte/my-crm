import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SALES_OPERATION_SIDEBAR_ROUTE_ORDER } from "@/lib/sales-operation/sidebar-nav-order";

describe("sales operation sidebar nav order", () => {
  it("sidebar route order places pipeline before orders (shared with firstAllowedSalesOperationPath)", () => {
    const orderPrefixes = SALES_OPERATION_SIDEBAR_ROUTE_ORDER.map((row) => row.prefix);
    const pipelineIdx = orderPrefixes.indexOf("/sales-operation/pipeline");
    const ordersIdx = orderPrefixes.indexOf("/sales-operation/orders");
    assert.ok(pipelineIdx >= 0 && ordersIdx >= 0);
    assert.ok(pipelineIdx < ordersIdx);
  });
});
