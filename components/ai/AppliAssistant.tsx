"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Mic, Sparkles, Square, X } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { useAiPageContext } from "@/components/ai/AiPageContext";
import type { AiSseEvent, AiUiBlock } from "@/lib/ai/types";

type ChatItem = {
  id: string;
  role: "user" | "assistant";
  content: string;
  blocks?: AiUiBlock[];
};

type VoiceState = "idle" | "listening" | "thinking" | "working" | "speaking" | "confirm";

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
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const voiceModeRef = useRef(false);
  const holdTalkRef = useRef(false);
  const busyRef = useRef(false);

  const allowed = canAccess("salesAiAssistant") && canAccess("salesOperation");
  voiceModeRef.current = voiceMode;
  busyRef.current = busy;
  holdTalkRef.current = holdTalk;

  const send = useCallback(
    async (text: string, opts?: { speak?: boolean }) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
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
        });
        if (!res.ok || !res.body) {
          const json = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(json?.error ?? t("error"));
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
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
        setItems((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: error instanceof Error ? error.message : t("error"),
          },
        ]);
      } finally {
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
    const res = await fetch("/api/ai/assistant/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const json = (await res.json()) as { ok?: boolean; result?: { userMessage?: string; error?: string } };
    setItems((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: json.result?.userMessage ?? json.result?.error ?? (json.ok ? t("done") : t("error")),
      },
    ]);
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

  const suggestions = [
    t("suggestSchedule"),
    t("suggestTask"),
    t("suggestLeads"),
    t("suggestFind"),
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="so-focus-ring inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-[var(--so-border-strong)] px-2.5 text-sm text-[var(--so-text)] transition-colors hover:bg-[var(--so-surface-hover)]"
        aria-label={t("open")}
      >
        <Sparkles className="h-4 w-4 text-[var(--primary)]" />
        <span className="hidden sm:inline">{t("brand")}</span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={() => setOpen(false)}>
          <aside
            className="flex h-full w-full max-w-md flex-col border-l border-[var(--so-border)] bg-[var(--so-surface)] shadow-[var(--so-shadow-md)]"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-[var(--so-border)] px-4 py-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[var(--primary)]" />
                <div>
                  <div className="text-sm font-medium text-[var(--so-text)]">{t("title")}</div>
                  <div className="text-xs text-[var(--so-muted)]">{t("subtitle")}</div>
                </div>
              </div>
              <div className="flex items-center gap-1">
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
                  <Mic className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="so-focus-ring inline-flex h-8 w-8 items-center justify-center rounded-[8px] hover:bg-[var(--so-surface-hover)]"
                  onClick={() => setOpen(false)}
                  aria-label={t("close")}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
              {items.length === 0 ? (
                <div className="space-y-2">
                  <p className="text-sm text-[var(--so-muted)]">{t("empty")}</p>
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
                <div className="space-y-3">
                  {items.map((item) => (
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
                      {item.blocks?.map((block, index) => (
                        <BlockCard
                          key={`${item.id}-${index}`}
                          block={block}
                          onConfirm={(token) => void confirm(token)}
                          confirmLabel={t("confirm")}
                          cancelLabel={t("cancel")}
                        />
                      ))}
                    </div>
                  ))}
                  {status ? <p className="text-xs text-[var(--so-muted)]">{status}</p> : null}
                </div>
              )}
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
                  rows={2}
                  placeholder={t("placeholder")}
                  className="so-focus-ring min-h-[44px] flex-1 resize-none rounded-[8px] border border-[var(--so-border-strong)] bg-[var(--so-surface)] px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  className={`so-focus-ring inline-flex h-10 w-10 items-center justify-center rounded-[8px] border ${
                    holdTalk ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-[var(--so-border-strong)]"
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
      ) : null}

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

function BlockCard({
  block,
  onConfirm,
  confirmLabel,
  cancelLabel,
}: {
  block: AiUiBlock;
  onConfirm: (token: string) => void;
  confirmLabel: string;
  cancelLabel: string;
}) {
  if (block.type === "confirmation") {
    return (
      <div className="mt-2 rounded-[12px] border border-[var(--so-border)] p-3 text-left text-sm">
        <div className="font-medium">{block.title}</div>
        <p className="mt-1 whitespace-pre-wrap text-[var(--so-muted)]">{block.body}</p>
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={() => onConfirm(block.token)}>
            {confirmLabel}
          </Button>
          <Button size="sm" variant="secondary">
            {cancelLabel}
          </Button>
        </div>
      </div>
    );
  }
  if (block.type === "meeting_slots") {
    return (
      <div className="mt-2 space-y-1 rounded-[12px] border border-[var(--so-border)] p-3 text-left text-sm">
        {block.slots.map((slot) => (
          <div key={slot.start}>
            {new Date(slot.start).toLocaleString()} — {slot.reason}
          </div>
        ))}
      </div>
    );
  }
  if (block.type === "metric") {
    return (
      <div className="mt-2 rounded-[12px] border border-[var(--so-border)] p-3 text-left text-sm">
        <div className="font-medium">{block.title}</div>
        <p className="mt-1">{block.fact}</p>
        {block.inference ? <p className="mt-1 text-[var(--so-muted)]">{block.inference}</p> : null}
        {block.recommendation ? <p className="mt-1">{block.recommendation}</p> : null}
      </div>
    );
  }
  if (block.type === "meeting_preview") {
    return (
      <div className="mt-2 rounded-[12px] border border-[var(--so-border)] p-3 text-left text-sm">
        <div className="font-medium">{block.title}</div>
        <p className="mt-1 text-[var(--so-muted)]">
          {new Date(block.start).toLocaleString()} – {new Date(block.end).toLocaleString()}
        </p>
        {block.attendees?.length ? <p className="mt-1">{block.attendees.join(", ")}</p> : null}
      </div>
    );
  }
  if (block.type === "task_preview") {
    return (
      <div className="mt-2 rounded-[12px] border border-[var(--so-border)] p-3 text-left text-sm">
        <div className="font-medium">{block.title}</div>
        <p className="mt-1 text-[var(--so-muted)]">
          {[block.assignee, block.dueAt ? new Date(block.dueAt).toLocaleString() : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
    );
  }
  if (block.type === "status") {
    return <p className="mt-2 text-xs text-[var(--so-muted)]">{block.text}</p>;
  }
  if (block.type === "connect") {
    const href =
      block.integration === "gmail"
        ? "/api/ai/integrations/gmail/connect"
        : block.integration === "googleCalendar"
          ? "/api/google/calendar/connect"
          : "/sales-operation/settings";
    return (
      <a href={href} className="mt-2 block rounded-[12px] border border-[var(--so-border)] p-3 text-left text-sm">
        {block.text}
      </a>
    );
  }
  return null;
}
