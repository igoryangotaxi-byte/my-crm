import { redirect } from "next/navigation";

export default function ClientHomePage() {
  redirect("/client/request-rides");
}
