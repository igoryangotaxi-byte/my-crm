"use client";

import "@xyflow/react/dist/style.css";

import {
  addEdge,
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type Viewport,
  type XYPosition,
} from "@xyflow/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LinkPreviewPanel } from "@/components/mind-map/LinkPreviewPanel";
import { MindMapUiProvider } from "@/components/mind-map/MindMapUiContext";
import { BLOCK_PALETTE, STICKY_PALETTE, normalizeHttpsUrl } from "@/components/mind-map/constants";
import { mindNodeTypes } from "@/components/mind-map/MindNodes";
import type { LinkBlockData, MindMapDocument } from "@/lib/mind-map-types";

function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `n_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

type ToolbarInnerProps = {
  title: string;
  setTitle: (v: string) => void;
  titleBlur: () => void;
  saveState: "idle" | "saving" | "saved" | "error";
  onAddAtCenter: (
    type: "mindDefault" | "mindSticky" | "mindLink",
    flowPosition: XYPosition,
  ) => void;
  onPickFile: () => void;
  onDeleteMap: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
};

function MindMapToolbarInner(props: ToolbarInnerProps) {
  const t = useTranslations("mindMap");
  const router = useRouter();
  const rf = useReactFlow();

  const addCentered = useCallback(
    (type: "mindDefault" | "mindSticky" | "mindLink") => {
      const pos = rf.screenToFlowPosition({
        x: window.innerWidth / 2 - 80,
        y: window.innerHeight / 2 - 40,
      });
      props.onAddAtCenter(type, pos);
    },
    [props, rf],
  );

  return (
    <Panel position="top-left" className="!m-0 w-full max-w-none border-b border-white/10 bg-black/35 px-3 py-2 backdrop-blur-md">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium hover:bg-white/10"
          onClick={() => router.push("/notes/mind-map")}
        >
          {t("back")}
        </button>
        <input
          className="min-w-[12rem] flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm outline-none ring-primary/30 focus:ring-2"
          value={props.title}
          onChange={(e) => props.setTitle(e.target.value)}
          onBlur={props.titleBlur}
          placeholder={t("titlePlaceholder")}
        />
        <span className="text-[11px] text-muted">
          {props.saveState === "saving"
            ? t("saving")
            : props.saveState === "saved"
              ? t("saved")
              : props.saveState === "error"
                ? t("saveError")
                : ""}
        </span>
        <div className="ml-auto flex flex-wrap gap-1">
          <button
            type="button"
            className="rounded-lg bg-indigo-600/90 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-500"
            onClick={() => addCentered("mindDefault")}
          >
            {t("addBlock")}
          </button>
          <button
            type="button"
            className="rounded-lg bg-amber-500/90 px-2.5 py-1 text-xs font-medium text-neutral-900 hover:bg-amber-400"
            onClick={() => addCentered("mindSticky")}
          >
            {t("addSticky")}
          </button>
          <button
            type="button"
            className="rounded-lg bg-sky-600/90 px-2.5 py-1 text-xs font-medium text-white hover:bg-sky-500"
            onClick={() => addCentered("mindLink")}
          >
            {t("addLink")}
          </button>
          <button
            type="button"
            className="rounded-lg bg-neutral-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-neutral-500"
            onClick={props.onPickFile}
          >
            {t("addFile")}
          </button>
          <input
            ref={props.fileInputRef}
            type="file"
            className="hidden"
            accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
            onChange={props.onFileChange}
          />
          <button
            type="button"
            className="rounded-lg border border-red-500/40 px-2.5 py-1 text-xs text-red-300 hover:bg-red-950/40"
            onClick={props.onDeleteMap}
          >
            {t("deleteMap")}
          </button>
        </div>
      </div>
    </Panel>
  );
}

function MindMapFlow({ mapId }: { mapId: string }) {
  const t = useTranslations("mindMap");
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [flowMountKey, setFlowMountKey] = useState(0);
  const [initialViewport, setInitialViewport] = useState<Viewport | null>(null);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const viewportRef = useRef<Viewport>({ x: 0, y: 0, zoom: 1 });
  const titleRef = useRef(title);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  titleRef.current = title;
  nodesRef.current = nodes;
  edgesRef.current = edges;

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = useCallback(async () => {
    const doc: MindMapDocument = {
      nodes: nodesRef.current,
      edges: edgesRef.current,
      viewport: viewportRef.current,
    };
    setSaveState("saving");
    try {
      const res = await fetch(`/api/mind-maps/${mapId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: titleRef.current,
          document: doc,
        }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean };
      if (!res.ok || !json?.ok) {
        setSaveState("error");
        return;
      }
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1500);
    } catch {
      setSaveState("error");
    }
  }, [mapId]);

  const schedulePersist = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void persist();
    }, 1200);
  }, [persist]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch(`/api/mind-maps/${mapId}`, { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as {
          ok?: boolean;
          map?: { title?: string; document?: MindMapDocument };
          error?: string;
        };
        if (!res.ok || !json?.ok || !json.map?.document) {
          if (!cancelled) setLoadError(json?.error ?? t("loadError"));
          return;
        }
        if (cancelled) return;
        setTitle(json.map.title ?? "");
        const d = json.map.document;
        setNodes(d.nodes ?? []);
        setEdges(d.edges ?? []);
        const vp = d.viewport ?? { x: 0, y: 0, zoom: 1 };
        viewportRef.current = vp;
        setInitialViewport(vp);
        setFlowMountKey((k) => k + 1);
      } catch {
        if (!cancelled) setLoadError(t("loadError"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mapId, setEdges, setNodes, t]);

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            id: `e_${newId()}`,
            type: "smoothstep",
          },
          eds,
        ),
      );
      schedulePersist();
    },
    [schedulePersist, setEdges],
  );

  const wrapNodesChange: typeof onNodesChange = useCallback(
    (changes) => {
      onNodesChange(changes);
      schedulePersist();
    },
    [onNodesChange, schedulePersist],
  );

  const wrapEdgesChange: typeof onEdgesChange = useCallback(
    (changes) => {
      onEdgesChange(changes);
      schedulePersist();
    },
    [onEdgesChange, schedulePersist],
  );

  const onMoveEnd = useCallback(
    (_event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
      viewportRef.current = viewport;
      schedulePersist();
    },
    [schedulePersist],
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.type === "mindLink") {
      const u = normalizeHttpsUrl((node.data as LinkBlockData).url ?? "");
      if (u) setPreviewUrl(u);
    }
  }, []);

  const openLinkPreview = useCallback((url: string) => {
    setPreviewUrl(url);
  }, []);

  const uiHandlers = useMemo(() => ({ openLinkPreview }), [openLinkPreview]);

  const onAddAtCenter = useCallback(
    (type: "mindDefault" | "mindSticky" | "mindLink", flowPosition: XYPosition) => {
      const id = newId();
      let node: Node;
      if (type === "mindDefault") {
        node = {
          id,
          type: "mindDefault",
          position: flowPosition,
          data: { label: t("newBlock"), color: BLOCK_PALETTE[0] },
        };
      } else if (type === "mindSticky") {
        node = {
          id,
          type: "mindSticky",
          position: flowPosition,
          data: { label: t("newSticky"), stickyColor: STICKY_PALETTE[0] },
        };
      } else {
        node = {
          id,
          type: "mindLink",
          position: flowPosition,
          data: { label: t("newLink"), url: "https://example.com" },
        };
      }
      setNodes((nds) => [...nds, node]);
      schedulePersist();
    },
    [schedulePersist, setNodes, t],
  );

  const fileInputRef = useRef<HTMLInputElement>(null);

  const onPickFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      const fd = new FormData();
      fd.set("mindMapId", mapId);
      fd.set("file", file);
      try {
        const res = await fetch("/api/mind-maps/upload", { method: "POST", body: fd });
        const json = (await res.json().catch(() => null)) as {
          ok?: boolean;
          path?: string;
          name?: string;
          mime?: string;
          size?: number;
          error?: string;
        };
        if (!res.ok || !json?.ok || !json.path) {
          setLoadError(json?.error ?? t("uploadFailed"));
          return;
        }
        const vp = viewportRef.current;
        const centerScreen = { x: window.innerWidth / 2 - 100, y: window.innerHeight / 2 - 60 };
        const flowX = (centerScreen.x - vp.x) / vp.zoom;
        const flowY = (centerScreen.y - vp.y) / vp.zoom;
        const node: Node = {
          id: newId(),
          type: "mindFile",
          position: { x: flowX, y: flowY },
          data: {
            label: file.name,
            path: json.path,
            name: json.name ?? file.name,
            mime: json.mime ?? file.type,
            size: json.size ?? file.size,
          },
        };
        setNodes((nds) => [...nds, node]);
        schedulePersist();
      } catch {
        setUploadErr(t("uploadFailed"));
      }
    },
    [mapId, schedulePersist, setNodes, t],
  );

  const titleBlur = useCallback(() => {
    schedulePersist();
  }, [schedulePersist]);

  const deleteMap = useCallback(async () => {
    if (!window.confirm(t("deleteConfirm"))) return;
    const res = await fetch(`/api/mind-maps/${mapId}`, { method: "DELETE" });
    const json = (await res.json().catch(() => null)) as { ok?: boolean };
    if (res.ok && json?.ok) {
      router.push("/notes/mind-map");
    }
  }, [mapId, router, t]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-24 text-sm text-muted">{t("loading")}</div>
    );
  }

  if (loadError && nodes.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-24">
        <p className="text-sm text-amber-400">{loadError}</p>
        <button
          type="button"
          className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
          onClick={() => router.push("/notes/mind-map")}
        >
          {t("backToList")}
        </button>
      </div>
    );
  }

  return (
    <MindMapUiProvider value={uiHandlers}>
      <div className="relative flex min-h-[calc(100dvh-7rem)] flex-1 flex-col">
        <LinkPreviewPanel url={previewUrl} onClose={() => setPreviewUrl(null)} />

        {uploadErr ? (
          <div className="border-b border-red-500/30 bg-red-950/40 px-4 py-2 text-center text-xs text-red-200">
            {uploadErr}
            <button
              type="button"
              className="ml-2 underline"
              onClick={() => setUploadErr(null)}
            >
              {t("dismiss")}
            </button>
          </div>
        ) : null}

        <div className="relative flex-1 min-h-[420px]">
          <ReactFlow
            key={flowMountKey}
            nodes={nodes}
            edges={edges}
            onNodesChange={wrapNodesChange}
            onEdgesChange={wrapEdgesChange}
            onConnect={onConnect}
            onMoveEnd={onMoveEnd}
            onNodeClick={onNodeClick}
            nodeTypes={mindNodeTypes}
            defaultViewport={initialViewport ?? { x: 0, y: 0, zoom: 1 }}
            minZoom={0.2}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{
              type: "smoothstep",
              style: { strokeWidth: 2, stroke: "#94a3b8" },
            }}
          >
            <MindMapToolbarInner
              title={title}
              setTitle={setTitle}
              titleBlur={titleBlur}
              saveState={saveState}
              onAddAtCenter={onAddAtCenter}
              onPickFile={onPickFile}
              onDeleteMap={() => void deleteMap()}
              fileInputRef={fileInputRef}
              onFileChange={(e) => void onFileChange(e)}
            />
            <Background gap={20} size={1} color="rgba(255,255,255,0.06)" />
            <Controls className="!m-3 !rounded-xl !border !border-white/15 !bg-black/40 !shadow-xl" />
            <MiniMap
              className="!m-3 !rounded-xl !border !border-white/15 !bg-black/50"
              maskColor="rgba(0,0,0,0.55)"
            />
          </ReactFlow>
        </div>
      </div>
    </MindMapUiProvider>
  );
}

export function MindMapEditor({ mapId }: { mapId: string }) {
  return (
    <ReactFlowProvider>
      <MindMapFlow mapId={mapId} />
    </ReactFlowProvider>
  );
}
