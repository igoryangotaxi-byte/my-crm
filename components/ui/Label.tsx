import type { LabelHTMLAttributes } from "react";
import { cn } from "@/lib/ui/cn";

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("ycds-label block", className)} {...props} />;
}
