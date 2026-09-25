import { notFound } from "next/navigation";
import { OpsApiOutcomePreviewsClient } from "./OpsApiOutcomePreviewsClient";

/** Local / preview only — 404 in production builds. */
export default function OpsApiOutcomePreviewsPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return <OpsApiOutcomePreviewsClient />;
}
