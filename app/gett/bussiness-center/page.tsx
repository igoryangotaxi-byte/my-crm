import { redirect } from "next/navigation";

/** Legacy URL (typo) — canonical route is `/gett/business-center`. */
export default function GettBussinessCenterRedirectPage() {
  redirect("/gett/business-center");
}
