"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronRight, Mic, Square, X } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { useAiPageContext } from "@/components/ai/AiPageContext";
import { AppliChip, type AppliChipState } from "@/components/ai/AppliChip";
import { AppliProposeCard } from "@/components/ai/AppliProposeCard";
import { AppliTokenStrip, type AppliTokenChip } from "@/components/ai/AppliTokenStrip";
import { APPLI_OPEN_EVENT } from "@/components/ai/appli-events";
import type { AiSseEvent, AiUiBlock } from "@/lib/ai/types";

type ChatItem = {
  id: string;
  role: "user" | "assistant";
  content: string;
  blocks?: AiUiBlock[];
};

type VoiceState = "idle" | "listening" | "thinking" | "working" | "speaking" | "confirm";
type ConfirmMark = "busy" | "approved" | "cancelled";

export function AppliAssistant() {
  const t = useTranslations("salesOperation.ai");
  const { canAccess } = useAuth();
  const pageContext = useAiPageContext();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [items, setItems] = useState<ChatItem[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [holdTalk, setHoldTalk] = useState(false);
  const [chatExpanded, setChatExpanded] = useState(false);
  const [tokens, setTokens] = useState<AppliTokenChip[]>([]);
  const [tokensLoading, setTokensLoading] = useState(false);
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);
  const [dockSeenReady, setDockSeenReady] = useState(false);
  const [confirmMarks, setConfirmMarks] = useState<Record<string, ConfirmMark>>({});
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const voiceModeRef = useRef(false);
  const holdTalkRef = useRef(false);
  const busyRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const allowed = canAccess("salesAiAssistant") && canAccess("salesOperation");
  voiceModeRef.current = voiceMode;
  busyRef.current = busy;
  holdTalkRef.current = holdTalk;

  const pendingConfirmTokens = useMemo(() => {
    const tokensPending: string[] = [];
    for (const item of items) {
      for (const block of item.blocks ?? []) {
        if (block.type !== "confirmation") continue;
        const mark = confirmMarks[block.token];
        if (!mark || mark === "busy") tokensPending.push(block.token);
      }
    }
    return tokensPending;
  }, [items, confirmMarks]);

  const proposeBlocks = useMemo(() => {
    const out: AiUiBlock[] = [];
    for (const item of items) {
      for (const block of item.blocks ?? []) {
        if (block.type === "confirmation" || block.type === "propose" || block.type === "connect") {
          out.push(block);
        }
      }
    }
    return out;
  }, [items]);

  const deadCount = tokens.filter((row) => row.status === "dead").length;
  const chipState: AppliChipState = busy
    ? "thinking"
    : pendingConfirmTokens.length > 0
      ? "needs-confirm"
      : deadCount > 0
        ? "token-dead"
        : "idle";

  const loadTokens = useCallback(async () => {
    setTokensLoading(true);
    try {
      const res = await fetch("/api/ai/assistant/tokens", { cache: "no-store" });
      const json = (await res.json()) as { ok?: boolean; tokens?: AppliTokenChip[] };
      if (json.ok && Array.isArray(json.tokens)) setTokens(json.tokens);
    } catch {
      // strip stays honest; empty + connect if we never loaded
    } finally {
      setTokensLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!allowed) return;
    void loadTokens();
    const timer = window.setInterval(() => void loadTokens(), 60_000);
    return () => window.clearInterval(timer);
  }, [allowed, loadTokens]);

  useEffect(() => {
    if (!allowed) return;
    const onOpen = () => setOpen(true);
    window.addEventListener(APPLI_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(APPLI_OPEN_EVENT, onOpen);
  }, [allowed]);

  useEffect(() => {
    if (!allowed || typeof window === "undefined") return;
    try {
      const seen = window.localStorage.getItem("appli-dock-seen") === "1";
      setWelcomeDismissed(seen);
      if (!seen) setOpen(true);
    } catch {
      // localStorage blocked — skip auto-open
    } finally {
      setDockSeenReady(true);
    }
  }, [allowed]);

  const markDockSeen = useCallback(() => {
    setWelcomeDismissed(true);
    try {
      window.localStorage.setItem("appli-dock-seen", "1");
    } catch {
      // ignore
    }
  }, []);

  const dismissWelcome = useCallback(() => {
    markDockSeen();
  }, [markDockSeen]);

  const cancelInFlight = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    audioRef.current?.pause();
    audioRef.current = null;
    setBusy(false);
    setStatus(null);
    setVoiceState("idle");
  }, []);

  const send = useCallback(
    async (text: string, opts?: { speak?: boolean }) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;
      setBusy(true);
      setStatus(t("thinking"));
      setVoiceState("thinking");
      const userItem: ChatItem = { id: crypto.randomUUID(), role: "user", content: trimmed };
      setItems((prev) => [...prev, userItem]);
      setInput("");
      let assistantText = "";
      const blocks: AiUiBlock[] = [];
      try {
        const res = await fetch("/api/ai/assistant/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed, conversationId, pageContext }),
          signal: abort.signal,
        });
        if (!res.ok || !res.body) {
          const json = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(json?.error ?? t("error"));
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          if (abort.signal.aborted) throw new DOMException("Aborted", "AbortError");
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";
          for (const part of parts) {
            const line = part.replace(/^data:\s*/, "").trim();
            if (!line) continue;
            const event = JSON.parse(line) as AiSseEvent;
            if (event.type === "status") {
              setStatus(event.text);
              setVoiceState(event.text.toLowerCase().includes("check") ? "working" : "thinking");
            } else if (event.type === "delta") {
              assistantText += event.text;
              setVoiceState("idle");
            } else if (event.type === "card") {
              blocks.push(event.card);
            } else if (event.type === "confirmation") {
              blocks.push(event.card);
              setVoiceState("confirm");
            } else if (event.type === "done") {
              setConversationId(event.conversationId);
            } else if (event.type === "error") {
              throw new Error(event.error);
            }
          }
        }
        setItems((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: assistantText || t("done"),
            blocks,
          },
        ]);
        if (opts?.speak && assistantText && !blocks.some((block) => block.type === "confirmation")) {
          setVoiceState("speaking");
          const speakRes = await fetch("/api/ai/voice/speak", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: assistantText }),
            signal: abort.signal,
          });
          if (speakRes.ok) {
            const blob = await speakRes.blob();
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            audioRef.current = audio;
            await new Promise<void>((resolve) => {
              audio.onended = () => resolve();
              audio.onerror = () => resolve();
              void audio.play().catch(() => resolve());
            });
          }
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          setItems((prev) => [
            ...prev,
            { id: crypto.randomUUID(), role: "assistant", content: t("cancelled") },
          ]);
        } else {
          setItems((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: error instanceof Error ? error.message : t("error"),
            },
          ]);
        }
      } finally {
        if (abortRef.current === abort) abortRef.current = null;
        setBusy(false);
        setStatus(null);
        if (voiceModeRef.current) {
          setVoiceState((prev) => (prev === "confirm" ? "confirm" : "listening"));
        } else {
          setVoiceState("idle");
        }
      }
    },
    [busy, conversationId, pageContext, t],
  );

  const confirm = async (token: string) => {
    setConfirmMarks((prev) => ({ ...prev, [token]: "busy" }));
    const res = await fetch("/api/ai/assistant/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, action: "approve" }),
    });
    const json = (await res.json()) as {
      ok?: boolean;
      result?: { userMessage?: string; error?: string; uiBlocks?: AiUiBlock[] };
    };
    setConfirmMarks((prev) => ({ ...prev, [token]: "approved" }));
    const extraBlocks = json.result?.uiBlocks ?? [];
    setItems((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: json.result?.userMessage ?? json.result?.error ?? (json.ok ? t("done") : t("error")),
        blocks: extraBlocks,
      },
    ]);
    setVoiceState("idle");
  };

  const reject = async (token: string) => {
    setConfirmMarks((prev) => ({ ...prev, [token]: "busy" }));
    await fetch("/api/ai/assistant/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, action: "reject" }),
    }).catch(() => null);
    setConfirmMarks((prev) => ({ ...prev, [token]: "cancelled" }));
    setVoiceState("idle");
  };

  const bargeIn = () => {
    audioRef.current?.pause();
    audioRef.current = null;
  };

  const startRecording = async () => {
    if (recorderRef.current?.state === "recording") return;
    bargeIn();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorderRef.current = recorder;
    recorder.start();
    setVoiceState("listening");
  };

  const stopRecordingAndSend = async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      recorder.stop();
      recorder.stream.getTracks().forEach((track) => track.stop());
    });
    const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
    const form = new FormData();
    form.set("file", blob, "speech.webm");
    setVoiceState("thinking");
    const res = await fetch("/api/ai/voice/transcribe", { method: "POST", body: form });
    const json = (await res.json()) as { ok?: boolean; text?: string; error?: string };
    if (json.text) await send(json.text, { speak: true });
    else {
      setVoiceState("idle");
      setItems((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", content: json.error ?? t("error") },
      ]);
    }
  };

  useEffect(() => {
    if (!allowed) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "Space" || !event.altKey) return;
      event.preventDefault();
      if (event.repeat || holdTalkRef.current || busyRef.current) return;
      holdTalkRef.current = true;
      setHoldTalk(true);
      setOpen(true);
      void startRecording();
    };
    const onUp = (event: KeyboardEvent) => {
      if (event.code !== "Space" || !holdTalkRef.current) return;
      holdTalkRef.current = false;
      setHoldTalk(false);
      void stopRecordingAndSend();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onUp);
    };
  }, [allowed]);

  if (!allowed) return null;

  const suggestions = [t("suggestSchedule"), t("suggestTask"), t("suggestLeads"), t("suggestFind")];
  const showCards = proposeBlocks.length > 0;
  const showWelcome = dockSeenReady && !welcomeDismissed && !showCards;
  const statusLine =
    chipState === "thinking"
      ? t("statusThinking")
      : chipState === "needs-confirm"
        ? t("statusConfirm")
        : chipState === "token-dead"
          ? t("statusTokenDead")
          : t("statusReady");

  return (

    <>
      <AppliChip
        state={chipState}
        label={t("brand")}
        confirmCount={pendingConfirmTokens.length}
        onClick={() => setOpen(true)}
      />

      {open ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={() => {
            markDockSeen();
            setOpen(false);
          }}>
          <aside
            className="flex h-full w-full max-w-[400px] flex-col border-l border-[var(--so-border)] bg-[var(--so-surface)] shadow-[var(--so-shadow-md)] sm:w-[380px]"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-[var(--so-border)] px-4 py-2.5">
              <div className="min-w-0">
                <div className="ycds-h2 text-[var(--so-text)]">{t("title")}</div>
                <div className="ycds-small mt-0.5 text-[var(--so-muted)]">{statusLine}</div>
              </div>
              <div className="flex items-center gap-1">
                {busy ? (
                  <button
                    type="button"
                    className="so-focus-ring rounded-[8px] px-2 py-1 text-xs text-[var(--so-muted)] hover:bg-[var(--so-surface-hover)]"
                    onClick={cancelInFlight}
                  >
                    {t("cancel")}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="so-focus-ring inline-flex h-8 w-8 items-center justify-center rounded-[8px] hover:bg-[var(--so-surface-hover)]"
                  onClick={() => {
                    setVoiceMode(true);
                    setVoiceState("listening");
                    void startRecording();
                  }}
                  aria-label={t("conversation")}
                >
                  <Mic className="h-4 w-4 text-[var(--so-muted)]" />
                </button>
                <button
                  type="button"
                  className="so-focus-ring inline-flex h-8 w-8 items-center justify-center rounded-[8px] hover:bg-[var(--so-surface-hover)]"
                  onClick={() => {
                    markDockSeen();
                    setOpen(false);
                  }}
                  aria-label={t("close")}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </header>

            <AppliTokenStrip
              tokens={tokens}
              loading={tokensLoading}
              emptyLabel={t("tokensEmpty")}
              connectLabel={t("tokensConnect")}
            />

            <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
              {showWelcome ? (
                <div className="mb-3 rounded-[12px] border border-[color-mix(in_srgb,#FF2D2D_28%,var(--so-border))] bg-[color-mix(in_srgb,#FF2D2D_5%,white)] p-3">
                  <p className="text-sm text-[var(--so-text)]">{t("welcomeBrief")}</p>
                  <button
                    type="button"
                    className="crm-button-secondary mt-2 inline-flex h-8 items-center rounded-[8px] border border-[color-mix(in_srgb,#FF2D2D_40%,var(--so-border))] px-3 text-xs font-medium text-[var(--so-accent-strong)] hover:bg-[color-mix(in_srgb,#FF2D2D_8%,white)]"
                    onClick={dismissWelcome}
                  >
                    {t("welcomeDismiss")}
                  </button>
                </div>
              ) : null}
              {showCards ? (
                <div className="space-y-2">
                  {proposeBlocks.map((block, index) => {
                    const token = block.type === "confirmation" ? block.token : `propose-${index}`;
                    const mark = block.type === "confirmation" ? confirmMarks[block.token] : undefined;
                    return (
                      <AppliProposeCard
                        key={token}
                        block={block}
                        approveLabel={t("approve")}
                        cancelLabel={t("cancel")}
                        busy={mark === "busy"}
                        settled={mark === "approved" || mark === "cancelled" ? mark : undefined}
                        onApprove={(value) => void confirm(value)}
                        onCancel={(value) => void reject(value)}
                      />
                    );
                  })}
                </div>
              ) : items.length === 0 ? (
                <div className="space-y-2">
                  <p className="ycds-small text-[var(--so-muted)]">{t("empty")}</p>
                  {suggestions.map((label) => (
                    <button
                      key={label}
                      type="button"
                      className="block w-full rounded-[8px] border border-[var(--so-border)] px-3 py-2 text-left text-sm text-[var(--so-text)] hover:bg-[var(--so-surface-hover)]"
                      onClick={() => void send(label)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : null}

              <button
                type="button"
                className="mt-3 flex items-center gap-1 text-xs text-[var(--so-muted)]"
                onClick={() => setChatExpanded((value) => !value)}
              >
                {chatExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                {t("chatToggle")}
              </button>

              {chatExpanded || (!showCards && items.length > 0) ? (
                <div className="mt-2 space-y-3">
                  {items.length === 0 ? (
                    <div className="space-y-2">
                      {suggestions.map((label) => (
                        <button
                          key={label}
                          type="button"
                          className="block w-full rounded-[8px] border border-[var(--so-border)] px-3 py-2 text-left text-sm text-[var(--so-text)] hover:bg-[var(--so-surface-hover)]"
                          onClick={() => void send(label)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    items.map((item) => (
                      <div key={item.id} className={item.role === "user" ? "text-right" : ""}>
                        <div
                          className={`inline-block max-w-[90%] whitespace-pre-wrap rounded-[12px] px-3 py-2 text-sm ${
                            item.role === "user"
                              ? "bg-[var(--so-surface-2)] text-[var(--so-text)]"
                              : "bg-transparent text-[var(--so-text)]"
                          }`}
                        >
                          {item.content}
                        </div>
                      </div>
                    ))
                  )}
                  {status ? <p className="ycds-small text-[var(--so-muted)]">{status}</p> : null}
                </div>
              ) : status ? (
                <p className="mt-2 ycds-small text-[var(--so-muted)]">{status}</p>
              ) : null}
            </div>

            <form
              className="border-t border-[var(--so-border)] p-3"
              onSubmit={(event) => {
                event.preventDefault();
                void send(input);
              }}
            >
              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
                    event.preventDefault();
                    if (busy || !input.trim()) return;
                    void send(input);
                  }}
                  rows={2}
                  placeholder={t("placeholder")}
                  className="so-focus-ring min-h-[44px] flex-1 resize-none rounded-[8px] border border-[var(--so-border-strong)] bg-[var(--so-surface)] px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  className={`so-focus-ring inline-flex h-10 w-10 items-center justify-center rounded-[8px] border ${
                    holdTalk
                      ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                      : "border-[var(--so-border-strong)] text-[var(--so-muted)]"
                  }`}
                  onMouseDown={() => {
                    setHoldTalk(true);
                    void startRecording();
                  }}
                  onMouseUp={() => {
                    setHoldTalk(false);
                    void stopRecordingAndSend();
                  }}
                  aria-label={t("pushToTalk")}
                >
                  <Mic className="h-4 w-4" />
                </button>
                <Button type="submit" disabled={busy || !input.trim()}>
                  {t("send")}
                </Button>
              </div>
              <p className="mt-1 text-[11px] text-[var(--so-muted)]">{t("shortcutHint")}</p>
            </form>
          </aside>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title={t("brand")}
          className="so-focus-ring fixed bottom-4 end-4 z-40 hidden h-10 w-10 items-center justify-center rounded-full border border-[var(--so-accent)] bg-[var(--so-accent)] text-xs font-medium text-white shadow-[var(--so-shadow-xs)] hover:bg-[var(--so-accent-strong)] md:inline-flex"
          aria-label={t("open")}
        >
          A
        </button>
      )}

      {voiceMode ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div className="w-[min(420px,92vw)] rounded-[16px] border border-[var(--so-border)] bg-[var(--so-surface)] p-8 text-center shadow-[var(--so-shadow-md)]">
            <button
              type="button"
              className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border-2 ${
                voiceState === "listening" || voiceState === "speaking"
                  ? "border-[var(--primary)]"
                  : "border-[var(--so-border-strong)]"
              }`}
              onMouseDown={() => {
                setHoldTalk(true);
                void startRecording();
              }}
              onMouseUp={() => {
                setHoldTalk(false);
                void stopRecordingAndSend();
              }}
              aria-label={t("pushToTalk")}
            >
              <Mic className="h-6 w-6" />
            </button>
            <div className="text-sm font-medium capitalize text-[var(--so-text)]">
              {voiceState === "working" ? t("working") : voiceState}
            </div>
            <p className="mt-2 text-xs text-[var(--so-muted)]">{t("conversationHint")}</p>
            <button
              type="button"
              className="mt-6 inline-flex items-center gap-2 text-sm text-[var(--so-muted)]"
              onClick={() => {
                bargeIn();
                setVoiceMode(false);
                setVoiceState("idle");
                recorderRef.current?.stop();
                recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
              }}
            >
              <Square className="h-3 w-3" />
              {t("endConversation")}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
