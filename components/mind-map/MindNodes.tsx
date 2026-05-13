"use client";

import {
  Handle,
  Position,
  useReactFlow,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import { useEffect, useState } from "react";
import { useMindMapUi } from "@/components/mind-map/MindMapUiContext";
import type { DefaultBlockData, FileBlockData, LinkBlockData, StickyBlockData } from "@/lib/mind-map-types";
import { normalizeHttpsUrl } from "@/components/mind-map/constants";

export function MindDefaultNode(props: NodeProps<Node<DefaultBlockData, "mindDefault">>) {
  const { id, data, selected } = props;
  const { setNodes } = useReactFlow();

  const onLabel = (label: string) => {
    setNodes((nds) =>
      nds.map((n) => (n.id === id ? { ...n, data: { ...(n.data as DefaultBlockData), label } } : n)),
    );
  };

  const onColor = (color: string) => {
    setNodes((nds) =>
      nds.map((n) => (n.id === id ? { ...n, data: { ...(n.data as DefaultBlockData), color } } : n)),
    );
  };

  return (
    <div
      className={`min-w-[140px] max-w-[220px] rounded-xl border border-white/20 px-3 py-2 shadow-lg backdrop-blur-sm transition-shadow ${
        selected ? "ring-2 ring-white/80 ring-offset-2 ring-offset-transparent" : ""
      }`}
      style={{ backgroundColor: data.color }}
    >
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !border-0 !bg-white/90" />
      <textarea
        className="nodrag nopan min-h-[52px] w-full resize-none bg-transparent text-sm font-medium text-white placeholder:text-white/70 outline-none"
        rows={2}
        value={data.label}
        onChange={(e) => onLabel(e.target.value)}
        spellCheck={false}
      />
      {selected ? (
        <div className="mt-2 flex flex-wrap gap-1 border-t border-white/25 pt-2">
          {[
            "#6366f1",
            "#ec4899",
            "#22c55e",
            "#f97316",
            "#0ea5e9",
            "#64748b",
          ].map((c) => (
            <button
              key={c}
              type="button"
              title={c}
              className="h-5 w-5 rounded-full border border-white/40 ring-offset-1 hover:scale-110"
              style={{ backgroundColor: c }}
              onClick={() => onColor(c)}
            />
          ))}
        </div>
      ) : null}
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !border-0 !bg-white/90" />
    </div>
  );
}

export function MindStickyNode(props: NodeProps<Node<StickyBlockData, "mindSticky">>) {
  const { id, data } = props;
  const { setNodes } = useReactFlow();

  const setLabel = (label: string) => {
    setNodes((nds) =>
      nds.map((n) => (n.id === id ? { ...n, data: { ...(n.data as StickyBlockData), label } } : n)),
    );
  };

  const setStickyColor = (stickyColor: string) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id ? { ...n, data: { ...(n.data as StickyBlockData), stickyColor } } : n,
      ),
    );
  };

  return (
    <div
      className={`relative min-w-[120px] max-w-[200px] -rotate-1 rounded-sm px-3 py-2 shadow-lg ${
        props.selected ? "ring-2 ring-amber-900/40 ring-offset-2" : ""
      }`}
      style={{
        backgroundColor: data.stickyColor,
        boxShadow: "4px 4px 0 rgba(0,0,0,0.12)",
      }}
    >
      <Handle type="target" position={Position.Top} className="!bg-neutral-700/40 !border-0" />
      <textarea
        className="nodrag nopan min-h-[72px] w-full resize-none bg-transparent text-sm text-neutral-900 outline-none"
        rows={3}
        value={data.label}
        onChange={(e) => setLabel(e.target.value)}
        spellCheck={false}
      />
      {props.selected ? (
        <div className="mt-1 flex flex-wrap gap-1 border-t border-black/10 pt-1">
          {["#fef08a", "#fde047", "#fbcfe8", "#bfdbfe", "#bbf7d0"].map((c) => (
            <button
              key={c}
              type="button"
              className="h-4 w-4 rounded-sm border border-black/15 hover:scale-110"
              style={{ backgroundColor: c }}
              onClick={() => setStickyColor(c)}
            />
          ))}
        </div>
      ) : null}
      <Handle type="source" position={Position.Bottom} className="!bg-neutral-700/40 !border-0" />
    </div>
  );
}

export function MindLinkNode(props: NodeProps<Node<LinkBlockData, "mindLink">>) {
  const { id, data } = props;
  const { setNodes } = useReactFlow();
  const ui = useMindMapUi();

  const setLabel = (label: string) => {
    setNodes((nds) =>
      nds.map((n) => (n.id === id ? { ...n, data: { ...(n.data as LinkBlockData), label } } : n)),
    );
  };

  const setUrl = (url: string) => {
    setNodes((nds) =>
      nds.map((n) => (n.id === id ? { ...n, data: { ...(n.data as LinkBlockData), url } } : n)),
    );
  };

  const href = normalizeHttpsUrl(data.url);

  return (
    <div
      className={`min-w-[160px] max-w-[240px] rounded-lg border border-sky-400/40 bg-sky-950/90 px-3 py-2 shadow-lg backdrop-blur-md ${
        props.selected ? "ring-2 ring-sky-300 ring-offset-2 ring-offset-transparent" : ""
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-sky-300 !border-0" />
      <div className="text-[10px] font-semibold uppercase tracking-wide text-sky-200">Link</div>
      <input
        className="nodrag nopan mb-1 mt-1 w-full rounded bg-black/25 px-2 py-1 text-xs text-white outline-none ring-1 ring-white/10"
        value={data.label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Title"
      />
      <input
        className="nodrag nopan mb-2 w-full rounded bg-black/20 px-2 py-1 text-[11px] text-sky-100 outline-none ring-1 ring-white/10"
        value={data.url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://…"
      />
      <button
        type="button"
        className="w-full rounded-md bg-sky-600 px-2 py-1 text-xs font-medium text-white shadow hover:bg-sky-500"
        onClick={() => {
          if (href) ui?.openLinkPreview(href);
        }}
        disabled={!href}
      >
        Open preview
      </button>
      <Handle type="source" position={Position.Bottom} className="!bg-sky-300 !border-0" />
    </div>
  );
}

export function MindFileNode(props: NodeProps<Node<FileBlockData, "mindFile">>) {
  const { id, data } = props;
  const { setNodes } = useReactFlow();
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSignedUrl(null);
    setFailed(false);
    fetch(`/api/mind-maps/signed-file?path=${encodeURIComponent(data.path)}`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((j: { ok?: boolean; url?: string }) => {
        if (!cancelled && j.ok && j.url) setSignedUrl(j.url);
        else if (!cancelled) setFailed(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [data.path]);

  const setLabel = (label: string) => {
    setNodes((nds) =>
      nds.map((n) => (n.id === id ? { ...n, data: { ...(n.data as FileBlockData), label } } : n)),
    );
  };

  const isImage = data.mime.startsWith("image/");

  return (
    <div className="min-w-[140px] max-w-[220px] rounded-xl border border-white/15 bg-neutral-900/90 px-2 py-2 shadow-xl backdrop-blur-md">
      <Handle type="target" position={Position.Top} className="!bg-neutral-500 !border-0" />
      <div className="text-[10px] uppercase text-neutral-400">File</div>
      <input
        className="nodrag nopan mb-2 mt-1 w-full rounded bg-black/30 px-2 py-1 text-xs text-white outline-none"
        value={data.label}
        onChange={(e) => setLabel(e.target.value)}
      />
      <div className="overflow-hidden rounded-md bg-black/40">
        {isImage && signedUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={signedUrl} alt={data.name} className="max-h-40 w-full object-contain" />
        ) : (
          <div className="flex min-h-[72px] flex-col items-center justify-center gap-1 px-2 py-3 text-center text-[11px] text-neutral-300">
            <span className="break-all">{data.name}</span>
            {failed ? <span className="text-amber-400">Preview unavailable</span> : null}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-neutral-500 !border-0" />
    </div>
  );
}

export const mindNodeTypes = {
  mindDefault: MindDefaultNode,
  mindSticky: MindStickyNode,
  mindLink: MindLinkNode,
  mindFile: MindFileNode,
} as NodeTypes;
