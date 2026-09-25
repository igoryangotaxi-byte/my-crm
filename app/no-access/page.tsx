import { NoAccessState } from "@/components/auth/NoAccessState";

/** Stable staff screen when authenticated but no CRM section is allowed (no redirect loop). */
export default function StaffNoAccessPage() {
  return <NoAccessState permission={null} />;
}
