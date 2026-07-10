"use client";

import { use } from "react";
import { SalesAutomationEditor } from "@/components/sales-operation/automation/SalesAutomationEditor";

export default function SalesOperationAutomationEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <SalesAutomationEditor automationId={id} />;
}
