"use client";

import { useEffect, useRef } from "react";

/** Fast poll for linked call-center / telephony operators (including hidden tabs). */
export const LINKED_OPERATOR_POLL_MS = 2000;

/** Slow recheck when not linked or auth denied (not permanent after 403). */
export const UNLINKED_LIVE_RECHECK_MS = 5 * 60 * 1000;

export type LivePollTier = "fast" | "idle";

/**
 * Linked operators: 2s poll on any SO page (even hidden). Unlinked / 401 / 403: stop fast poll;
 * recheck on focus + every 5 minutes; resume fast automatically when linked again.
 */
export function useLinkedOperatorLivePoll(
  refresh: () => Promise<LivePollTier | void>,
  pollTier: LivePollTier,
): void {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    void refreshRef.current();
  }, []);

  useEffect(() => {
    if (pollTier === "fast") {
      const id = window.setInterval(() => {
        void refreshRef.current();
      }, LINKED_OPERATOR_POLL_MS);
      return () => window.clearInterval(id);
    }

    const tick = () => {
      if (!document.hidden) {
        void refreshRef.current();
      }
    };

    tick();
    const id = window.setInterval(tick, UNLINKED_LIVE_RECHECK_MS);
    const onVisibilityChange = () => {
      if (!document.hidden) tick();
    };
    const onFocus = () => tick();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
    };
  }, [pollTier]);
}
