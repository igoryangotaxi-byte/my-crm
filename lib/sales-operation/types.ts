export const SALES_LEAD_STATUSES = [
  "new",
  "in_progress",
  "proposal_sent",
  "negotiation",
  "signed",
  "rejected",
] as const;
export type SalesLeadStatus = (typeof SALES_LEAD_STATUSES)[number];

/**
 * Statuses that may be missing from an older DB `status` check-constraint.
 * They are persisted as `in_progress` + a `_pipelineStatus` override until the
 * corresponding SQL migration is applied (mirrors the original proposal_sent compat).
 */
export const SALES_LEAD_COMPAT_STATUSES = ["proposal_sent", "negotiation"] as const;

export const SALES_LEAD_SOURCES = ["manual", "import", "meta", "wordpress"] as const;
export type SalesLeadSource = (typeof SALES_LEAD_SOURCES)[number];

export type PipelineStage = {
  key: string;
  label: string;
  orderIndex: number;
  probability: number;
  isWon: boolean;
  isLost: boolean;
  isTerminal: boolean;
  isActive: boolean;
  color: string | null;
};

export type SalesSegment = {
  id: string;
  name: string;
  orderIndex: number;
  isActive: boolean;
};

export type SalesLead = {
  id: string;
  status: SalesLeadStatus;
  source: SalesLeadSource;
  fullName: string;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  campaignId: string | null;
  campaignName: string | null;
  adId: string | null;
  adName: string | null;
  formId: string | null;
  customFields: Record<string, unknown>;
  assignedManagerUserId: string | null;
  assignedManagerName: string | null;
  // Phase 1 — richer lead / deal fields (nullable, additive).
  legalName: string | null;
  companyRegNumber: string | null;
  website: string | null;
  segmentId: string | null;
  subSegment: string | null;
  employeesCount: number | null;
  estimatedMonthlyPotential: number | null;
  estimatedMonthlyTrips: number | null;
  expectedCloseDate: string | null;
  probabilityOverride: number | null;
  clientAddress: string | null;
  generalNotes: string | null;
  pricingProposal: string | null;
  pricingAmount: number | null;
  contractNumber: string | null;
  corpClientId: string | null;
  // Phase 9 — soft archive (additive, defaults keep leads active).
  isArchived: boolean;
  archivedAt: string | null;
  statusEnteredAt: string;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  createdByName: string | null;
};

export const SALES_CONTACT_CHANNELS = ["phone", "email", "whatsapp", "sms", "other"] as const;
export type SalesContactChannel = (typeof SALES_CONTACT_CHANNELS)[number];

export type SalesContact = {
  id: string;
  leadId: string;
  fullName: string;
  jobTitle: string | null;
  department: string | null;
  email: string | null;
  mobilePhone: string | null;
  officePhone: string | null;
  preferredChannel: SalesContactChannel | null;
  isPrimary: boolean;
  isDecisionMaker: boolean;
  notes: string | null;
  isActive: boolean;
  createdByUserId: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateSalesContactInput = {
  fullName: string;
  jobTitle?: string | null;
  department?: string | null;
  email?: string | null;
  mobilePhone?: string | null;
  officePhone?: string | null;
  preferredChannel?: SalesContactChannel | null;
  isPrimary?: boolean;
  isDecisionMaker?: boolean;
  notes?: string | null;
};

export type UpdateSalesContactInput = Partial<CreateSalesContactInput & { isActive: boolean }>;

export const SALES_TASK_TYPES = ["call", "email", "meeting", "whatsapp", "todo", "other"] as const;
export type SalesTaskType = (typeof SALES_TASK_TYPES)[number];

export const SALES_TASK_STATUSES = ["open", "done", "cancelled"] as const;
export type SalesTaskStatus = (typeof SALES_TASK_STATUSES)[number];

export const SALES_TASK_PRIORITIES = ["low", "normal", "high"] as const;
export type SalesTaskPriority = (typeof SALES_TASK_PRIORITIES)[number];

export type SalesTask = {
  id: string;
  leadId: string;
  title: string;
  description: string | null;
  taskType: SalesTaskType | null;
  status: SalesTaskStatus;
  priority: SalesTaskPriority;
  dueAt: string | null;
  assignedToUserId: string | null;
  assignedToName: string | null;
  completedAt: string | null;
  completedByUserId: string | null;
  completedByName: string | null;
  createdByUserId: string | null;
  createdByName: string | null;
  resultSummary: string | null;
  parentTaskId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SalesTaskWithLead = SalesTask & {
  leadName: string;
  leadCompanyName: string | null;
  leadStatus: SalesLeadStatus;
};

export const SALES_TASK_EVENT_TYPES = [
  "created",
  "status_changed",
  "reassigned",
  "due_changed",
  "summary_updated",
  "follow_up_created",
  "comment",
  "updated",
] as const;
export type SalesTaskEventType = (typeof SALES_TASK_EVENT_TYPES)[number];

export type SalesTaskEvent = {
  id: string;
  taskId: string;
  leadId: string | null;
  eventType: SalesTaskEventType;
  body: string | null;
  changes: Record<string, unknown> | null;
  actorUserId: string | null;
  actorName: string;
  createdAt: string;
};

export type CreateSalesTaskInput = {
  title: string;
  description?: string | null;
  taskType?: SalesTaskType | null;
  priority?: SalesTaskPriority;
  dueAt?: string | null;
  assignedToUserId?: string | null;
  assignedToName?: string | null;
  parentTaskId?: string | null;
};

export type UpdateSalesTaskInput = Partial<
  CreateSalesTaskInput & { status: SalesTaskStatus; resultSummary: string | null }
>;

export type PersonalTask = {
  id: string;
  userId: string;
  userEmail: string | null;
  title: string;
  description: string | null;
  status: SalesTaskStatus;
  priority: SalesTaskPriority;
  dueAt: string | null;
  completedAt: string | null;
  clientId: string | null;
  leadId: string | null;
  sourceClientId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreatePersonalTaskInput = {
  title: string;
  description?: string | null;
  priority?: SalesTaskPriority;
  dueAt?: string | null;
  clientId?: string | null;
  leadId?: string | null;
  sourceClientId?: string | null;
};

export type UpdatePersonalTaskInput = Partial<
  CreatePersonalTaskInput & { status: SalesTaskStatus }
>;

export type PersonalNote = {
  id: string;
  userId: string;
  userEmail: string | null;
  title: string | null;
  body: string;
  pinned: boolean;
  clientId: string | null;
  sourceClientNoteId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreatePersonalNoteInput = {
  title?: string | null;
  body: string;
  pinned?: boolean;
  clientId?: string | null;
  sourceClientNoteId?: string | null;
};

export type UpdatePersonalNoteInput = Partial<CreatePersonalNoteInput>;

export const SALES_ACTIVITY_TYPES = [
  "call",
  "email",
  "meeting",
  "whatsapp",
  "sms",
  "note",
  "task_created",
  "task_completed",
  "status_changed",
  "field_changed",
  "manual",
  "other",
] as const;
export type SalesActivityType = (typeof SALES_ACTIVITY_TYPES)[number];

export type SalesActivity = {
  id: string;
  leadId: string;
  type: SalesActivityType;
  title: string | null;
  body: string | null;
  meta: Record<string, unknown>;
  actorUserId: string | null;
  actorName: string | null;
  occurredAt: string;
  createdAt: string;
};

export const SALES_NOTIFICATION_TYPES = [
  "task_assigned",
  "lead_assigned",
  "task_due",
  "mention",
  "automation",
  "system",
] as const;
export type SalesNotificationType = (typeof SALES_NOTIFICATION_TYPES)[number];

export type SalesNotification = {
  id: string;
  userId: string;
  type: SalesNotificationType;
  title: string;
  body: string | null;
  leadId: string | null;
  link: string | null;
  isRead: boolean;
  createdAt: string;
};

export const SALES_EMAIL_LOCALES = ["en", "he"] as const;
export type SalesEmailLocale = (typeof SALES_EMAIL_LOCALES)[number];

export type SalesEmailTemplate = {
  id: string;
  name: string;
  subject: string;
  body: string;
  locale: SalesEmailLocale;
  isActive: boolean;
  createdByUserId: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
};

export const SALES_EMAIL_DIRECTIONS = ["outbound", "inbound"] as const;
export type SalesEmailDirection = (typeof SALES_EMAIL_DIRECTIONS)[number];

export const SALES_EMAIL_STATUSES = ["sent", "failed", "logged", "received"] as const;
export type SalesEmailStatus = (typeof SALES_EMAIL_STATUSES)[number];

export type SalesEmailMessage = {
  id: string;
  leadId: string;
  direction: SalesEmailDirection;
  status: SalesEmailStatus;
  fromAddress: string | null;
  toAddress: string | null;
  ccAddress: string | null;
  subject: string;
  body: string;
  provider: string | null;
  providerMessageId: string | null;
  error: string | null;
  templateId: string | null;
  actorUserId: string | null;
  actorName: string | null;
  occurredAt: string;
  createdAt: string;
};

export type SalesFile = {
  id: string;
  leadId: string;
  storagePath: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedByUserId: string | null;
  uploadedByName: string | null;
  createdAt: string;
  downloadUrl: string | null;
};

export type SalesLeadNote = {
  id: string;
  leadId: string;
  authorUserId: string | null;
  authorName: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type SalesClient = {
  id: string;
  leadId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  campaignId: string | null;
  campaignName: string | null;
  adId: string | null;
  adName: string | null;
  formId: string | null;
  customFields: Record<string, unknown>;
  corpClientId: string | null;
  corpClientName: string | null;
  accountManagerUserId: string | null;
  accountManagerName: string | null;
  salesManagerUserId: string | null;
  salesManagerName: string | null;
  pendingSalesManagerUserId: string | null;
  pendingSalesManagerName: string | null;
  signedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type SalesClientNote = {
  id: string;
  clientId: string;
  authorUserId: string | null;
  authorName: string;
  body: string;
  sourceLeadNoteId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SalesLeadStatusEvent = {
  id: string;
  leadId: string;
  fromStatus: SalesLeadStatus | null;
  toStatus: SalesLeadStatus;
  changedByUserId: string | null;
  changedByName: string | null;
  createdAt: string;
};

export type SalesLeadDealFields = {
  legalName?: string | null;
  companyRegNumber?: string | null;
  website?: string | null;
  segmentId?: string | null;
  subSegment?: string | null;
  employeesCount?: number | null;
  estimatedMonthlyPotential?: number | null;
  estimatedMonthlyTrips?: number | null;
  expectedCloseDate?: string | null;
  probabilityOverride?: number | null;
  clientAddress?: string | null;
  generalNotes?: string | null;
  pricingProposal?: string | null;
  pricingAmount?: number | null;
  contractNumber?: string | null;
  corpClientId?: string | null;
};

export type CreateSalesLeadInput = SalesLeadDealFields & {
  fullName: string;
  email?: string | null;
  phone?: string | null;
  companyName?: string | null;
  campaignId?: string | null;
  campaignName?: string | null;
  adId?: string | null;
  adName?: string | null;
  formId?: string | null;
  customFields?: Record<string, unknown>;
  source?: SalesLeadSource;
  status?: SalesLeadStatus;
  assignedManagerUserId?: string | null;
  assignedManagerName?: string | null;
};

export type UpdateSalesLeadInput = Partial<
  Omit<CreateSalesLeadInput, "source"> & {
    status: SalesLeadStatus;
  }
>;

export type SalesAnalyticsSummary = {
  leadsTotal: number;
  byStatus: Record<SalesLeadStatus, number>;
  signedConversionPct: number;
  topCampaigns: Array<{ campaignName: string; count: number }>;
  leadsByStatusChart: Array<{ status: string; count: number }>;
  topCampaignsChart: Array<{ campaignName: string; count: number }>;
};
