import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Edge, Node } from "@xyflow/react";
import {
  findMatchingTriggers,
  getOutgoingTargets,
  pickRoundRobinUser,
  statusMatches,
  triggerMatches,
  walkActionNodes,
} from "@/lib/sales-operation/automation/graph";
import { applyAutomationTemplate, buildSmsTemplateVars } from "@/lib/sales-operation/automation/template";
import { isInforuSmsSendEnabled, runAutomationsForStatusChange } from "@/lib/sales-operation/automation/engine";
import type { SalesAutomation } from "@/lib/sales-operation/automation/types";
import type { SalesLead } from "@/lib/sales-operation/types";

describe("sales automation template", () => {
  it("interpolates known placeholders and blanks unknown", () => {
    const text = applyAutomationTemplate("Hi {{full_name}} / {{missing}} / {{ status }}", {
      full_name: "Ada",
      status: "signed",
    });
    assert.equal(text, "Hi Ada /  / signed");
  });

  it("builds vars from lead", () => {
    const lead = {
      fullName: "Ada",
      phone: "+9725",
      companyName: "Co",
      status: "new",
      email: "a@b.c",
    } as SalesLead;
    assert.deepEqual(buildSmsTemplateVars(lead), {
      full_name: "Ada",
      phone: "+9725",
      company_name: "Co",
      status: "new",
      email: "a@b.c",
    });
  });
});

describe("sales automation graph", () => {
  it("matches status wildcards and exact values", () => {
    assert.equal(statusMatches("*", "new"), true);
    assert.equal(statusMatches("signed", "signed"), true);
    assert.equal(statusMatches("signed", "rejected"), false);
    assert.equal(
      triggerMatches({ fromStatus: "new", toStatus: "*" }, "new", "in_progress"),
      true,
    );
    assert.equal(
      triggerMatches({ fromStatus: "new", toStatus: "signed" }, "new", "in_progress"),
      false,
    );
  });

  it("walks actions in stable edge order", () => {
    const nodes: Node[] = [
      { id: "t1", type: "triggerLeadStatus", position: { x: 0, y: 0 }, data: { fromStatus: "*", toStatus: "*" } },
      { id: "a1", type: "actionSms", position: { x: 0, y: 0 }, data: { text: "one" } },
      { id: "a2", type: "actionAssignManager", position: { x: 0, y: 0 }, data: { mode: "fixed", userId: "u1" } },
    ];
    const edges: Edge[] = [
      { id: "e2", source: "t1", target: "a2" },
      { id: "e1", source: "t1", target: "a1" },
    ];
    assert.deepEqual(getOutgoingTargets(edges, "t1"), ["a1", "a2"]);
    const walked = walkActionNodes(nodes, edges, "t1").map((n) => n.id);
    assert.deepEqual(walked, ["a1", "a2"]);
  });

  it("finds matching triggers only", () => {
    const nodes: Node[] = [
      {
        id: "t1",
        type: "triggerLeadStatus",
        position: { x: 0, y: 0 },
        data: { fromStatus: "new", toStatus: "in_progress" },
      },
      {
        id: "t2",
        type: "triggerLeadStatus",
        position: { x: 0, y: 0 },
        data: { fromStatus: "*", toStatus: "signed" },
      },
      { id: "sms", type: "actionSms", position: { x: 0, y: 0 }, data: { text: "x" } },
    ];
    const matched = findMatchingTriggers(nodes, "new", "in_progress").map((n) => n.id);
    assert.deepEqual(matched, ["t1"]);
  });

  it("picks round-robin users and advances cursor", () => {
    assert.equal(pickRoundRobinUser([], 0), null);
    assert.deepEqual(pickRoundRobinUser(["a", "b"], 0), { userId: "a", nextCursor: 1 });
    assert.deepEqual(pickRoundRobinUser(["a", "b"], 1), { userId: "b", nextCursor: 2 });
    assert.deepEqual(pickRoundRobinUser(["a", "b"], 2), { userId: "a", nextCursor: 1 });
  });
});

describe("sales automation engine gates", () => {
  const lead: SalesLead = {
    id: "lead-1",
    status: "in_progress",
    source: "manual",
    fullName: "Ada",
    email: null,
    phone: null,
    companyName: null,
    campaignId: null,
    campaignName: null,
    adId: null,
    adName: null,
    formId: null,
    customFields: {},
    assignedManagerUserId: null,
    assignedManagerName: null,
    statusEnteredAt: "2026-07-10T00:00:00.000Z",
    createdAt: "2026-07-10T00:00:00.000Z",
    updatedAt: "2026-07-10T00:00:00.000Z",
    createdByUserId: null,
    createdByName: null,
  };

  it("skips SMS when lead has no phone (and does not call sender)", async () => {
    const calls: unknown[] = [];
    const automation: SalesAutomation = {
      id: "auto-1",
      name: "SMS",
      enabled: true,
      graph: {
        nodes: [
          {
            id: "t1",
            type: "triggerLeadStatus",
            position: { x: 0, y: 0 },
            data: { fromStatus: "*", toStatus: "*" },
          },
          {
            id: "s1",
            type: "actionSms",
            position: { x: 0, y: 0 },
            data: { text: "Hello {{full_name}}" },
          },
        ],
        edges: [{ id: "e1", source: "t1", target: "s1" }],
      },
      roundRobinState: {},
      createdByUserId: null,
      createdByName: null,
      createdAt: "2026-07-10T00:00:00.000Z",
      updatedAt: "2026-07-10T00:00:00.000Z",
    };

    const prev = process.env.INFORU_SMS_ENABLED;
    process.env.INFORU_SMS_ENABLED = "true";
    try {
      await runAutomationsForStatusChange(lead, "new", "in_progress", {
        listEnabled: async () => [automation],
        insertRun: async () => undefined,
        assignManager: async () => undefined,
        updateRoundRobin: async () => undefined,
        sendSms: async (input) => {
          calls.push(input);
          return {
            ok: true,
            numberOfRecipients: 1,
            statusCode: 1,
            description: "ok",
          };
        },
      });
    } finally {
      if (prev === undefined) delete process.env.INFORU_SMS_ENABLED;
      else process.env.INFORU_SMS_ENABLED = prev;
    }

    assert.equal(calls.length, 0);
  });

  it("exposes INFORU enable helper", () => {
    const prev = process.env.INFORU_SMS_ENABLED;
    process.env.INFORU_SMS_ENABLED = "yes";
    assert.equal(isInforuSmsSendEnabled(), true);
    process.env.INFORU_SMS_ENABLED = "false";
    assert.equal(isInforuSmsSendEnabled(), false);
    if (prev === undefined) delete process.env.INFORU_SMS_ENABLED;
    else process.env.INFORU_SMS_ENABLED = prev;
  });
});
