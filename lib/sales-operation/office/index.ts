export type {
  OfficeCrmSnapshot,
  OfficeFocusEntity,
  OfficeIntentAction,
  OfficeRoomId,
  OfficeDockTab,
  OfficePipelineFilter,
  OfficeAttentionItem,
  OfficeManagerAvatar,
} from "@/lib/sales-operation/office/types";
export {
  NEXT_PIPELINE_STATUS,
  filterStickers,
  isStuckLead,
  daysSince,
  MANAGER_COLORS,
} from "@/lib/sales-operation/office/types";
export {
  fetchOfficeCrmSnapshot,
  transitionOfficeLead,
  completeOfficeTask,
  assignOfficeLeadToMe,
  markOfficeNotificationsRead,
} from "@/lib/sales-operation/office/adapter";
export {
  loadOfficePerformance,
  saveOfficePerformance,
  OFFICE_PERF_PRESETS,
} from "@/lib/sales-operation/office/performance";
export { parseOfficeIntentHeuristic } from "@/lib/sales-operation/office/intent-types";
export { buildAttentionItems } from "@/lib/sales-operation/office/attention";
