/**
 * Ops Floor Ask-Ops heuristics — maps short commands to dock / classic actions.
 * No OpenClaw; CRM APIs remain the system of record.
 */

import type {
  OfficeDockTab,
  OfficeIntentAction,
  OfficePipelineFilter,
  OfficeRoomId,
} from "@/lib/sales-operation/office/types";

export type OfficeIntentResponse = {
  ok: true;
  action: OfficeIntentAction;
  reply: string;
};

export function parseOfficeIntentHeuristic(text: string): OfficeIntentResponse {
  const t = text.trim().toLowerCase();
  if (!t) {
    return {
      ok: true,
      action: { type: "noop", message: "Try: overdue, stuck, my leads, briefing…" },
      reply: "Ask Ops: overdue tasks, stuck deals, my leads, new leads, meetings…",
    };
  }

  if (t.includes("briefing") || t.includes("attention") || t.includes("morning")) {
    return {
      ok: true,
      action: { type: "open_dock", tab: "attention" },
      reply: "Opening Attention queue — what needs you now.",
    };
  }

  if (t.includes("my desk") || t.includes("my lead") || t.includes("mine")) {
    return {
      ok: true,
      action: { type: "open_dock", tab: "my_desk", filter: { kind: "mine" } },
      reply: "Opening My Desk — your open leads and tasks.",
    };
  }

  if (t.includes("team") || t.includes("managers")) {
    return {
      ok: true,
      action: { type: "open_dock", tab: "team" },
      reply: "Opening Team Floor — managers and load.",
    };
  }

  if (t.includes("overdue") || (t.includes("task") && !t.includes("tracker"))) {
    return {
      ok: true,
      action: { type: "open_dock", tab: "attention" },
      reply: "Attention queue highlights overdue tasks first.",
    };
  }

  if (t.includes("stuck") || t.includes("negotiation") || t.includes("at risk")) {
    return {
      ok: true,
      action: {
        type: "open_dock",
        tab: "attention",
        filter: { kind: "stuck" },
      },
      reply: "Focusing stuck deals on the Pipeline Wall.",
    };
  }

  if (t.includes("new lead") || t.includes("unassigned")) {
    return {
      ok: true,
      action: {
        type: "open_dock",
        tab: "attention",
        filter: { kind: "status", status: "new" },
      },
      reply: "Showing new / unassigned leads.",
    };
  }

  if (t.includes("pipeline") || t.includes("deal") || t.includes("sticker")) {
    return {
      ok: true,
      action: { type: "open_room", roomId: "pipeline" },
      reply: "Pipeline Wall — click a sticker or use the dock to Advance.",
    };
  }

  if (t.includes("calendar") || t.includes("meeting")) {
    return {
      ok: true,
      action: { type: "open_classic", path: "/sales-operation/calendar" },
      reply: "Opening classic Calendar.",
    };
  }

  if (t.includes("analytics") || t.includes("dashboard") || t.includes("revenue")) {
    return {
      ok: true,
      action: { type: "open_classic", path: "/sales-operation/analytics" },
      reply: "Opening classic Analytics.",
    };
  }

  if (t.includes("discovery") || t.includes("find leads")) {
    return {
      ok: true,
      action: { type: "open_classic", path: "/sales-operation/lead-discovery" },
      reply: "Opening Lead Discovery.",
    };
  }

  if (t.includes("tracker")) {
    return {
      ok: true,
      action: { type: "open_classic", path: "/sales-operation/tracker" },
      reply: "Opening Tracker.",
    };
  }

  if (t.includes("portfolio")) {
    return {
      ok: true,
      action: { type: "open_classic", path: "/sales-operation/portfolio" },
      reply: "Opening Portfolio.",
    };
  }

  if (t.includes("automation")) {
    return {
      ok: true,
      action: { type: "open_classic", path: "/sales-operation/automation" },
      reply: "Opening Automations.",
    };
  }

  const roomWords: Array<{ keys: string[]; room: OfficeRoomId; tab?: OfficeDockTab }> = [
    { keys: ["reception"], room: "reception", tab: "attention" },
    { keys: ["sales"], room: "sales", tab: "team" },
  ];
  for (const row of roomWords) {
    if (row.keys.some((k) => t.includes(k))) {
      return {
        ok: true,
        action: row.tab
          ? { type: "open_dock", tab: row.tab }
          : { type: "open_room", roomId: row.room },
        reply: `Going to ${row.room}.`,
      };
    }
  }

  return {
    ok: true,
    action: { type: "noop", message: "Try: overdue, stuck, my leads, team, pipeline." },
    reply: "I can open Attention, My Desk, Team, stuck deals, or jump to classic CRM pages.",
  };
}

export function defaultFilterForDock(
  tab: OfficeDockTab,
): OfficePipelineFilter {
  if (tab === "my_desk") return { kind: "mine" };
  if (tab === "attention") return { kind: "all" };
  return { kind: "all" };
}
