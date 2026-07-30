/**
 * Office AI intent heuristics — maps natural language to CRM actions.
 */

import type { OfficeIntentAction, OfficeRoomId } from "@/lib/sales-operation/office/types";

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
      action: { type: "noop", message: "Try: show new leads, open calendar, briefing…" },
      reply: "I'm listening — ask me to open a room or find leads.",
    };
  }

  if (t.includes("in progress") || t.includes("working")) {
    return {
      ok: true,
      action: { type: "open_pipeline", status: "in_progress" },
      reply: "Showing In Progress deals on the Pipeline Wall.",
    };
  }

  if (t.includes("proposal")) {
    return {
      ok: true,
      action: { type: "open_pipeline", status: "proposal_sent" },
      reply: "Showing Proposal Sent on the Pipeline Wall.",
    };
  }

  if (t.includes("portfolio") || t.includes("clients")) {
    return {
      ok: true,
      action: { type: "open_classic", path: "/sales-operation/portfolio" },
      reply: "Opening Portfolio.",
    };
  }

  if (t.includes("igor k") || t.includes("team lead") || t.includes("briefing")) {
    return {
      ok: true,
      action: { type: "open_room", roomId: "reception" },
      reply: "Igor K — Team Lead. Here's your reception briefing.",
    };
  }

  if (t.includes("lior") || t.includes("igor r") || t.includes("itay")) {
    return {
      ok: true,
      action: { type: "open_room", roomId: "sales" },
      reply: "Sales floor — Lior, Igor R and Itay cover active deals.",
    };
  }

  if (t.includes("egor")) {
    return {
      ok: true,
      action: { type: "open_room", roomId: "dashboard" },
      reply: "Egor — Analytics. Opening Dashboard room.",
    };
  }

  if (t.includes("ido")) {
    return {
      ok: true,
      action: { type: "open_room", roomId: "tasks" },
      reply: "Ido — Operations. Opening Task room.",
    };
  }

  if (t.includes("adam")) {
    return {
      ok: true,
      action: { type: "open_classic", path: "/sales-operation/lead-discovery" },
      reply: "Adam — Growth. Opening Lead Discovery.",
    };
  }

  if (t.includes("gal")) {
    return {
      ok: true,
      action: { type: "open_classic", path: "/sales-operation/tracker" },
      reply: "Gal — Account Manager. Opening Tracker.",
    };
  }

  if (t.includes("new lead")) {
    return {
      ok: true,
      action: { type: "open_pipeline", status: "new" },
      reply: "Opening new leads on the Pipeline Wall. Click a sticker to open the card.",
    };
  }

  if (t.includes("stuck") || t.includes("negotiation") || t.includes("at risk")) {
    return {
      ok: true,
      action: { type: "open_pipeline", status: "negotiation" },
      reply: "Focusing Pipeline Wall on Negotiation — deals most at risk.",
    };
  }

  if (t.includes("pipeline") || t.includes("deal") || t.includes("sticker")) {
    return {
      ok: true,
      action: { type: "open_room", roomId: "pipeline" },
      reply: "Moving to Pipeline Wall. Click a sticker to open · use Advance to move stage.",
    };
  }

  if (t.includes("sales coach") || t.includes("sales room") || t.includes("manager")) {
    return {
      ok: true,
      action: { type: "open_room", roomId: "sales" },
      reply: "Sales Room — managers at desks. Click a manager for their analytics.",
    };
  }

  if (t.includes("calendar") || t.includes("meeting")) {
    return {
      ok: true,
      action: { type: "open_room", roomId: "calendar" },
      reply: "Calendar room ready — open classic calendar to edit meetings.",
    };
  }

  if (t.includes("overdue") || t.includes("task")) {
    return {
      ok: true,
      action: { type: "open_room", roomId: "tasks" },
      reply: "Task room. Open classic My Space to complete overdue work.",
    };
  }

  if (t.includes("analytics") || t.includes("dashboard") || t.includes("revenue")) {
    return {
      ok: true,
      action: { type: "open_room", roomId: "dashboard" },
      reply: "Dashboard room — open classic Analytics for full charts.",
    };
  }

  if (t.includes("automation") || t.includes("campaign") || t.includes("marketing")) {
    return {
      ok: true,
      action: { type: "open_classic", path: "/sales-operation/automation" },
      reply: "Opening Automations in classic UI.",
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

  const roomWords: Array<{ keys: string[]; room: OfficeRoomId }> = [
    { keys: ["reception"], room: "reception" },
  ];
  for (const row of roomWords) {
    if (row.keys.some((k) => t.includes(k))) {
      return {
        ok: true,
        action: { type: "open_room", roomId: row.room },
        reply: `Going to ${row.room}.`,
      };
    }
  }

  return {
    ok: true,
    action: { type: "noop", message: "Try: new leads, stuck deals, open calendar, briefing." },
    reply:
      "I can open Pipeline / Sales / Calendar / Tasks / Dashboard, show new or stuck deals, or jump to Automations.",
  };
}
