import { redirect } from "next/navigation";
import { resolveRootLandingPath } from "@/lib/server-staff-landing";

export default async function HomePage() {
  redirect(await resolveRootLandingPath());
}
