import type { AppRole } from "@/types/auth";
import type { TrackerAction } from "@/lib/sales-operation/tracker-types";

const MATRIX: Record<AppRole, Record<TrackerAction, boolean>> = {
  Admin: {
    editBoard: true,
    editStatuses: true,
    createTickets: true,
    assignTickets: true,
    deleteTickets: true,
    archiveTickets: true,
  },
  "Account Manager": {
    editBoard: true,
    editStatuses: true,
    createTickets: true,
    assignTickets: true,
    deleteTickets: true,
    archiveTickets: true,
  },
  "Sales Manager": {
    editBoard: true,
    editStatuses: true,
    createTickets: true,
    assignTickets: true,
    deleteTickets: true,
    archiveTickets: true,
  },
  "Team Lead": {
    editBoard: false,
    editStatuses: true,
    createTickets: true,
    assignTickets: true,
    deleteTickets: true,
    archiveTickets: true,
  },
  User: {
    editBoard: false,
    editStatuses: false,
    createTickets: true,
    assignTickets: true,
    deleteTickets: true,
    archiveTickets: true,
  },
};

export function canTracker(action: TrackerAction, role: AppRole): boolean {
  return MATRIX[role]?.[action] ?? false;
}

export function trackerForbiddenResponse(action: TrackerAction): Response {
  return Response.json(
    { ok: false, error: `Missing Tracker permission: ${action}` },
    { status: 403 },
  );
}
