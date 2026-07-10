export const SALES_LEAD_STATUSES = [
  "new",
  "in_progress",
  "proposal_sent",
  "signed",
  "rejected",
] as const;
export type SalesLeadStatus = (typeof SALES_LEAD_STATUSES)[number];

export const SALES_LEAD_SOURCES = ["manual", "import", "meta", "wordpress"] as const;
export type SalesLeadSource = (typeof SALES_LEAD_SOURCES)[number];

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
  statusEnteredAt: string;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  createdByName: string | null;
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

export type CreateSalesLeadInput = {
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
