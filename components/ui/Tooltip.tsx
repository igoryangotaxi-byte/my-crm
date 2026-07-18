"use client";

import type { ReactNode } from "react";
import * as RadixTooltip from "@radix-ui/react-tooltip";

type TooltipProps = {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  delayDuration?: number;
};

export function Tooltip({ content, children, side = "top", delayDuration = 200 }: TooltipProps) {
  return (
    <RadixTooltip.Provider delayDuration={delayDuration}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content
            side={side}
            sideOffset={6}
            className="so-pop z-[100] select-none rounded-lg bg-[#14161a] px-2.5 py-1.5 text-xs font-medium text-white shadow-[0_2px_4px_rgba(16,24,40,0.04),0_8px_20px_rgba(16,24,40,0.08)]"
          >
            {content}
            <RadixTooltip.Arrow className="fill-[#14161a]" />
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}
