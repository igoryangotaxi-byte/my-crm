export const TRACKER_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TrackerPriority = (typeof TRACKER_PRIORITIES)[number];

export const TRACKER_LINK_TYPES = [
  "blocks",
  "blocked_by",
  "parent",
  "child",
  "related",
  "duplicate",
] as const;
export type TrackerLinkType = (typeof TRACKER_LINK_TYPES)[number];

export const TRACKER_ACTIONS = [
  "editBoard",
  "editStatuses",
  "createTickets",
  "assignTickets",
  "deleteTickets",
  "archiveTickets",
] as const;
export type TrackerAction = (typeof TRACKER_ACTIONS)[number];

export type TrackerProject = {
  id: string;
  name: string;
  description: string | null;
  createdByUserId: string | null;
  createdByName: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  ticketCount?: number;
  openTicketCount?: number;
};

export type TrackerStatus = {
  id: string;
  projectId: string;
  name: string;
  color: string;
  position: number;
  wipLimit: number | null;
  isDone: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TrackerLabel = {
  id: string;
  projectId: string;
  name: string;
  color: string;
  createdAt: string;
};

export type TrackerAssignee = {
  userId: string;
  userName: string | null;
};

export type TrackerChecklistItem = {
  id: string;
  ticketId: string;
  title: string;
  done: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type TrackerComment = {
  id: string;
  ticketId: string;
  authorUserId: string | null;
  authorName: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type TrackerTicketLink = {
  id: string;
  fromTicketId: string;
  toTicketId: string;
  linkType: TrackerLinkType;
  createdByUserId: string | null;
  createdAt: string;
  toTicketTitle?: string | null;
  toTicketProjectId?: string | null;
};

export type TrackerActivity = {
  id: string;
  ticketId: string;
  actorUserId: string | null;
  actorName: string | null;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type TrackerFile = {
  id: string;
  ticketId: string;
  storagePath: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedByUserId: string | null;
  uploadedByName: string | null;
  createdAt: string;
  downloadUrl: string | null;
};

export type TrackerTicket = {
  id: string;
  projectId: string;
  statusId: string;
  title: string;
  description: string | null;
  priority: TrackerPriority;
  dueAt: string | null;
  position: number;
  parentTicketId: string | null;
  createdByUserId: string | null;
  createdByName: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  assignees: TrackerAssignee[];
  labels: TrackerLabel[];
  checklistDone?: number;
  checklistTotal?: number;
  commentCount?: number;
  projectName?: string | null;
  statusName?: string | null;
  statusIsDone?: boolean;
  statusColor?: string | null;
};

export type TrackerTicketDetail = TrackerTicket & {
  checklist: TrackerChecklistItem[];
  comments: TrackerComment[];
  links: TrackerTicketLink[];
  activity: TrackerActivity[];
  files: TrackerFile[];
  subtasks: TrackerTicket[];
};

export type TrackerBoardFilters = {
  q?: string | null;
  assigneeUserIds?: string[];
  creatorUserIds?: string[];
  priorities?: TrackerPriority[];
  labelIds?: string[];
  statusIds?: string[];
  dueFrom?: string | null;
  dueTo?: string | null;
  createdFrom?: string | null;
  createdTo?: string | null;
  updatedFrom?: string | null;
  updatedTo?: string | null;
  includeArchived?: boolean;
  limitPerStatus?: number;
};

export const DEFAULT_TRACKER_STATUSES: Array<{
  name: string;
  color: string;
  isDone: boolean;
}> = [
  { name: "Backlog", color: "#94a3b8", isDone: false },
  { name: "To Do", color: "#3b82f6", isDone: false },
  { name: "In Progress", color: "#f59e0b", isDone: false },
  { name: "Review", color: "#8b5cf6", isDone: false },
  { name: "Done", color: "#22c55e", isDone: true },
];
