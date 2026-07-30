export type {
  OfficeCrmSnapshot,
  OfficeFocusEntity,
  OfficeIntentAction,
  OfficeRoomId,
} from "@/lib/sales-operation/office/types";
export { fetchOfficeCrmSnapshot, transitionOfficeLead } from "@/lib/sales-operation/office/adapter";
export {
  loadOfficePerformance,
  saveOfficePerformance,
  OFFICE_PERF_PRESETS,
} from "@/lib/sales-operation/office/performance";
export { parseOfficeIntentHeuristic } from "@/lib/sales-operation/office/intent-types";
