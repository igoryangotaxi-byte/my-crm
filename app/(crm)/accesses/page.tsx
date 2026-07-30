import { redirect } from "next/navigation";

export default function AccessesPage() {
  redirect("/sales-operation/settings?section=access");
}
