export const DRIVER_LEAD_STATUSES = [
  "new",
  "in_progress",
  "registered",
  "rejected",
] as const;
export type DriverLeadStatus = (typeof DRIVER_LEAD_STATUSES)[number];

export const DRIVER_LEAD_SOURCES = ["manual", "import", "wordpress"] as const;
export type DriverLeadSource = (typeof DRIVER_LEAD_SOURCES)[number];

export type DriverLead = {
  id: string;
  status: DriverLeadStatus;
  source: DriverLeadSource;
  fullName: string;
  email: string | null;
  phone: string | null;
  rejectedSubstatus: string | null;
  campaignName: string | null;
  formId: string | null;
  customFields: Record<string, unknown>;
  assignedManagerUserId: string | null;
  assignedManagerName: string | null;
  generalNotes: string | null;
  statusEnteredAt: string;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  createdByName: string | null;
};

export type CreateDriverLeadInput = {
  fullName: string;
  email?: string | null;
  phone?: string | null;
  status?: DriverLeadStatus;
  source?: DriverLeadSource;
  rejectedSubstatus?: string | null;
  campaignName?: string | null;
  formId?: string | null;
  customFields?: Record<string, unknown>;
  assignedManagerUserId?: string | null;
  assignedManagerName?: string | null;
  generalNotes?: string | null;
};

export type UpdateDriverLeadInput = Partial<CreateDriverLeadInput>;

export type DriverLeadNote = {
  id: string;
  leadId: string;
  authorUserId: string | null;
  authorName: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};
