"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { Html, OrbitControls, RoundedBox } from "@react-three/drei";
import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  type MutableRefObject,
  type ReactNode,
} from "react";
import * as THREE from "three";
import type {
  OfficeCrmSnapshot,
  OfficePipelineFilter,
  OfficePipelineSticker,
  OfficeRoomId,
} from "@/lib/sales-operation/office/types";
import { NEXT_PIPELINE_STATUS, filterStickers } from "@/lib/sales-operation/office/types";
import type { OfficePerformanceSettings } from "@/lib/sales-operation/office/performance";
import type { SalesLeadStatus } from "@/lib/sales-operation/types";
import { OfficeWalkingAgents } from "@/components/sales-operation/office/OfficeWalkingAgents";

const STAGE_COLORS: Record<string, string> = {
  new: "#2563eb",
  in_progress: "#7c3aed",
  proposal_sent: "#d97706",
  negotiation: "#dc2626",
  signed: "#059669",
  rejected: "#64748b",
};

/** More isometric / Claw3D-like angles */
const ROOM_CAMERAS: Record<
  OfficeRoomId,
  { position: [number, number, number]; target: [number, number, number] }
> = {
  reception: { position: [0, 12, 14], target: [0, 0.5, 2] },
  sales: { position: [-11, 9, 8], target: [-8.5, 0.8, 0.5] },
  pipeline: { position: [12, 9, 8], target: [8.2, 1.2, 0.2] },
  calendar: { position: [-11, 8.5, 2], target: [-8.5, 0.8, -7] },
  tasks: { position: [0, 8.5, 2], target: [0, 0.8, -7] },
  dashboard: { position: [11, 8.5, 2], target: [8.5, 0.8, -7] },
  automation: { position: [0, 14, 16], target: [0, 0.5, 0] },
};

function Wall({
  position,
  size,
  color = "#f3efe6",
}: {
  position: [number, number, number];
  size: [number, number, number];
  color?: string;
}) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.92} metalness={0.02} />
    </mesh>
  );
}

function BuildingShell() {
  const wallH = 3.2;
  const wallY = wallH / 2;
  return (
    <group>
      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[28, 22]} />
        <meshStandardMaterial color="#d6cbb8" roughness={0.95} />
      </mesh>
      {/* Floor accent rugs */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 6.2]} receiveShadow>
        <planeGeometry args={[6, 3.2]} />
        <meshStandardMaterial color="#c45c4a" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-8.5, 0.01, 0.8]} receiveShadow>
        <planeGeometry args={[6.5, 6]} />
        <meshStandardMaterial color="#b9c4d4" roughness={1} />
      </mesh>

      {/* Outer walls */}
      <Wall position={[0, wallY, -10.8]} size={[28, wallH, 0.28]} color="#ebe4d8" />
      <Wall position={[0, wallY, 10.8]} size={[28, wallH, 0.28]} color="#ebe4d8" />
      <Wall position={[-13.9, wallY, 0]} size={[0.28, wallH, 22]} color="#ebe4d8" />
      <Wall position={[13.9, wallY, 0]} size={[0.28, wallH, 22]} color="#ebe4d8" />

      {/* Interior partitions */}
      <Wall position={[0, wallY, 3.6]} size={[12, wallH, 0.22]} color="#f7f2ea" />
      <Wall position={[-4.2, wallY, -2.2]} size={[0.22, wallH, 11.5]} color="#f7f2ea" />
      <Wall position={[4.2, wallY, -2.2]} size={[0.22, wallH, 11.5]} color="#f7f2ea" />
      <Wall position={[-8.5, wallY, 3.6]} size={[8, wallH, 0.22]} color="#f7f2ea" />
      <Wall position={[8.5, wallY, 3.6]} size={[8, wallH, 0.22]} color="#f7f2ea" />

      {/* Door openings as darker frames */}
      {[
        [0, 1.1, 3.6] as [number, number, number],
        [-4.2, 1.1, 0.5] as [number, number, number],
        [4.2, 1.1, 0.5] as [number, number, number],
      ].map((pos, i) => (
        <mesh key={i} position={pos}>
          <boxGeometry args={i === 0 ? [1.8, 2.2, 0.26] : [0.26, 2.2, 1.8]} />
          <meshStandardMaterial color="#1f2937" roughness={0.6} />
        </mesh>
      ))}

      {/* Ceiling strip lights */}
      {[
        [0, 3.05, 6],
        [-8.5, 3.05, 0.5],
        [8.5, 3.05, 0.5],
        [0, 3.05, -7],
        [-8.5, 3.05, -7],
        [8.5, 3.05, -7],
      ].map((pos, i) => (
        <mesh key={`light-${i}`} position={pos as [number, number, number]}>
          <boxGeometry args={[2.2, 0.08, 0.35]} />
          <meshStandardMaterial color="#fff8e7" emissive="#fff1c2" emissiveIntensity={0.85} />
        </mesh>
      ))}
    </group>
  );
}

function Desk({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <RoundedBox args={[1.6, 0.08, 0.8]} radius={0.03} position={[0, 0.72, 0]} castShadow>
        <meshStandardMaterial color="#8b5a2b" roughness={0.55} />
      </RoundedBox>
      {[
        [-0.7, 0.36, -0.3],
        [0.7, 0.36, -0.3],
        [-0.7, 0.36, 0.3],
        [0.7, 0.36, 0.3],
      ].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]} castShadow>
          <cylinderGeometry args={[0.04, 0.05, 0.72, 8]} />
          <meshStandardMaterial color="#5c4030" />
        </mesh>
      ))}
      {/* Monitor */}
      <mesh position={[0, 1.05, -0.15]} castShadow>
        <boxGeometry args={[0.7, 0.42, 0.05]} />
        <meshStandardMaterial color="#111827" />
      </mesh>
      <mesh position={[0, 1.05, -0.12]}>
        <planeGeometry args={[0.62, 0.34]} />
        <meshStandardMaterial color="#60a5fa" emissive="#2563eb" emissiveIntensity={0.35} />
      </mesh>
    </group>
  );
}

function Plant({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.2, 0]} castShadow>
        <cylinderGeometry args={[0.18, 0.14, 0.4, 10]} />
        <meshStandardMaterial color="#7c2d12" />
      </mesh>
      <mesh position={[0, 0.55, 0]} castShadow>
        <sphereGeometry args={[0.32, 12, 12]} />
        <meshStandardMaterial color="#166534" />
      </mesh>
    </group>
  );
}

function RoomSign({
  position,
  label,
  active,
  onClick,
}: {
  position: [number, number, number];
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Html position={position} center distanceFactor={14} zIndexRange={[20, 0]}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        className={`rounded-full border px-3 py-1 text-[11px] font-bold shadow-md transition ${
          active
            ? "border-[#ff2d2d] bg-[#ff2d2d] text-white"
            : "border-white/80 bg-white/95 text-slate-800 hover:border-[#ff2d2d]"
        }`}
      >
        {label}
      </button>
    </Html>
  );
}

function PipelineStickerMesh({
  sticker,
  position,
  selected,
  onOpen,
  onAdvance,
}: {
  sticker: OfficePipelineSticker;
  position: [number, number, number];
  selected: boolean;
  onOpen: () => void;
  onAdvance: () => void;
}) {
  const color = STAGE_COLORS[sticker.status] ?? "#64748b";
  return (
    <group position={position}>
      <RoundedBox
        args={[1.05, 0.78, 0.05]}
        radius={0.04}
        castShadow
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
      >
        <meshStandardMaterial color={selected ? "#fff7ed" : "#fffdf8"} roughness={0.8} />
      </RoundedBox>
      <mesh position={[0, 0.3, 0.03]}>
        <planeGeometry args={[0.95, 0.08]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <Html position={[0, -0.05, 0.04]} center distanceFactor={9} transform>
        <div className="w-[110px] text-left">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
            className="w-full cursor-pointer"
          >
            <div className="truncate text-[10px] font-bold text-slate-900">{sticker.title}</div>
            <div className="truncate text-[9px] text-slate-500">
              {sticker.company ?? sticker.status.replace(/_/g, " ")} · {sticker.daysInStage}d
            </div>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAdvance();
            }}
            className="mt-1 w-full rounded bg-slate-900 px-1 py-0.5 text-[9px] font-semibold text-white"
          >
            Advance →
          </button>
        </div>
      </Html>
    </group>
  );
}

/** One-shot camera move when room changes — does NOT fight zoom every frame. */
function RoomCameraSnap({
  activeRoom,
  controlsRef,
}: {
  activeRoom: OfficeRoomId;
  controlsRef: MutableRefObject<{
    target: THREE.Vector3;
    object: THREE.Camera;
    update: () => void;
  } | null>;
}) {
  const { camera } = useThree();
  const lastRoom = useRef<OfficeRoomId | null>(null);

  useEffect(() => {
    if (lastRoom.current === activeRoom) return;
    lastRoom.current = activeRoom;
    const cam = ROOM_CAMERAS[activeRoom] ?? ROOM_CAMERAS.reception;
    // Defer so OrbitControls ref is ready and we don't fight the first frame.
    const id = window.requestAnimationFrame(() => {
      camera.position.set(...cam.position);
      const controls = controlsRef.current;
      if (controls?.target) {
        controls.target.set(...cam.target);
        controls.update();
      } else {
        camera.lookAt(...cam.target);
      }
    });
    return () => window.cancelAnimationFrame(id);
  }, [activeRoom, camera, controlsRef]);

  return null;
}

function HotspotPad({
  position,
  size,
  onClick,
  children,
}: {
  position: [number, number, number];
  size: [number, number];
  onClick: () => void;
  children?: ReactNode;
}) {
  return (
    <group position={position}>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.02, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
      >
        <planeGeometry args={size} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.001} />
      </mesh>
      {children}
    </group>
  );
}

type OfficeSceneProps = {
  snapshot: OfficeCrmSnapshot | null;
  activeRoom: OfficeRoomId;
  selectedLeadId?: string | null;
  selectedManagerId?: string | null;
  pipelineFilter?: OfficePipelineFilter;
  currentUserId?: string | null;
  perf: OfficePerformanceSettings;
  onSelectRoom: (room: OfficeRoomId) => void;
  onOpenLead: (leadId: string) => void;
  onMoveLead: (leadId: string, toStatus: SalesLeadStatus) => void;
  onSelectManager: (managerId: string) => void;
  onOpenAttention: () => void;
  onOpenClassic: (path: string) => void;
  briefingOpen: boolean;
};

export function OfficeScene({
  snapshot,
  activeRoom,
  selectedLeadId,
  selectedManagerId,
  pipelineFilter = { kind: "all" },
  currentUserId,
  perf,
  onSelectRoom,
  onOpenLead,
  onMoveLead,
  onSelectManager,
  onOpenAttention,
  onOpenClassic,
  briefingOpen,
}: OfficeSceneProps) {
  const controlsRef = useRef<{
    target: THREE.Vector3;
    object: THREE.Camera;
    update: () => void;
  } | null>(null);

  const filteredStickers = useMemo(
    () => filterStickers(snapshot?.stickers ?? [], pipelineFilter, currentUserId),
    [snapshot?.stickers, pipelineFilter, currentUserId],
  );

  const stickersByStage = useMemo(() => {
    const map = new Map<string, OfficePipelineSticker[]>();
    for (const s of filteredStickers) {
      const list = map.get(s.status) ?? [];
      list.push(s);
      map.set(s.status, list);
    }
    return map;
  }, [filteredStickers]);

  const stages = (snapshot?.stages ?? []).filter((s) =>
    ["new", "in_progress", "proposal_sent", "negotiation"].includes(s.key),
  );

  const meetingsToday = snapshot?.meetings.length ?? 0;
  const overdueTasks = snapshot?.reception.overdueTasks ?? 0;
  const leadsTotal = snapshot?.analytics.leadsTotal ?? 0;
  const discovery = snapshot?.discovery;

  return (
    <Canvas
      shadows={perf.shadows}
      dpr={[1, perf.dprMax]}
      camera={{ position: ROOM_CAMERAS.reception.position, fov: 42, near: 0.1, far: 80 }}
      gl={{ antialias: perf.preset !== "low", powerPreference: "high-performance" }}
      style={{ width: "100%", height: "100%" }}
    >
      <color attach="background" args={["#c8d4e4"]} />
      <fog attach="fog" args={["#c8d4e4", 18, 42]} />
      <ambientLight intensity={0.55 + perf.environmentIntensity * 0.2} />
      <directionalLight
        castShadow={perf.shadows}
        position={[6, 12, 4]}
        intensity={1.15}
        shadow-mapSize-width={perf.shadows ? 2048 : 512}
        shadow-mapSize-height={perf.shadows ? 2048 : 512}
        shadow-camera-far={40}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
      />
      <hemisphereLight args={["#fff7ed", "#94a3b8", 0.35]} />

      <Suspense fallback={null}>
        <BuildingShell />

        {/* Reception */}
        <HotspotPad position={[0, 0, 6.5]} size={[5.5, 3]} onClick={() => onSelectRoom("reception")}>
          <RoundedBox args={[2.8, 1.05, 1.1]} radius={0.06} position={[0, 0.55, 0]} castShadow>
            <meshStandardMaterial color="#a16207" roughness={0.65} />
          </RoundedBox>
          <mesh position={[0, 1.15, 0.35]} castShadow>
            <boxGeometry args={[1.2, 0.08, 0.5]} />
            <meshStandardMaterial color="#78350f" />
          </mesh>
          <Plant position={[-1.8, 0, 0.2]} />
          <Plant position={[1.8, 0, 0.2]} />
          <RoomSign
            position={[0, 2.6, 0]}
            label="Reception"
            active={activeRoom === "reception"}
            onClick={() => onSelectRoom("reception")}
          />
          {briefingOpen ? (
            <Html position={[0, 2.05, 0.7]} center distanceFactor={12}>
              <div className="w-[240px] rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl">
                <p className="mb-2 whitespace-pre-line text-[11px] leading-snug text-slate-700">
                  {snapshot?.reception.briefing ?? "Loading…"}
                </p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenAttention();
                  }}
                  className="w-full rounded-lg bg-[#ff2d2d] px-3 py-1.5 text-[11px] font-semibold text-white"
                >
                  Open Attention
                </button>
              </div>
            </Html>
          ) : null}
        </HotspotPad>

        {/* Sales room */}
        <HotspotPad position={[-8.5, 0, 0.5]} size={[7, 6]} onClick={() => onSelectRoom("sales")}>
          <Desk position={[-10.2, 0, 1.5]} rotation={0.1} />
          <Desk position={[-10.2, 0, -0.4]} rotation={0.05} />
          <Desk position={[-7.2, 0, 1.5]} rotation={-0.15} />
          <Desk position={[-7.2, 0, -0.4]} rotation={-0.1} />
          <RoomSign
            position={[-8.5, 2.7, 0.5]}
            label="Sales Room"
            active={activeRoom === "sales"}
            onClick={() => onSelectRoom("sales")}
          />
          {/* Empty chairs — team walks the floor as named agents */}
          {[
            [-10.2, 0, 1.15],
            [-10.2, 0, -0.75],
            [-7.2, 0, 1.15],
            [-7.2, 0, -0.75],
          ].map((pos, i) => (
            <group key={i} position={pos as [number, number, number]}>
              <mesh position={[0, 0.35, 0.25]} castShadow>
                <boxGeometry args={[0.45, 0.08, 0.45]} />
                <meshStandardMaterial color="#334155" />
              </mesh>
              <mesh position={[0, 0.7, 0.42]} castShadow>
                <boxGeometry args={[0.45, 0.55, 0.08]} />
                <meshStandardMaterial color="#1e293b" />
              </mesh>
            </group>
          ))}
        </HotspotPad>

        {/* Pipeline wall — corkboard on back wall of east room */}
        <HotspotPad position={[8.5, 0, 0.5]} size={[7, 6]} onClick={() => onSelectRoom("pipeline")}>
          <mesh position={[8.5, 1.7, -2.85]} castShadow receiveShadow>
            <boxGeometry args={[6.2, 2.4, 0.12]} />
            <meshStandardMaterial color="#c4a574" roughness={0.9} />
          </mesh>
          <RoomSign
            position={[8.5, 2.95, -2.4]}
            label="Pipeline Wall"
            active={activeRoom === "pipeline"}
            onClick={() => onSelectRoom("pipeline")}
          />
          {stages.map((stage, col) => {
            const items = (stickersByStage.get(stage.key) ?? []).slice(0, 5);
            return (
              <group key={stage.key}>
                <Html position={[6.2 + col * 1.35, 2.75, -2.7]} center>
                  <div className="rounded bg-black/55 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                    {stage.label}
                  </div>
                </Html>
                {items.map((sticker, row) => (
                  <PipelineStickerMesh
                    key={sticker.id}
                    sticker={sticker}
                    selected={selectedLeadId === sticker.id}
                    position={[6.2 + col * 1.35, 2.15 - row * 0.85, -2.72]}
                    onOpen={() => onOpenLead(sticker.id)}
                    onAdvance={() => {
                      const next = NEXT_PIPELINE_STATUS[sticker.status];
                      if (next) onMoveLead(sticker.id, next);
                    }}
                  />
                ))}
              </group>
            );
          })}
          <Desk position={[10.5, 0, 1.6]} />
          <Plant position={[6.2, 0, 1.8]} />
        </HotspotPad>

        {/* Calendar — honest deep-link, no fake grid */}
        <HotspotPad position={[-8.5, 0, -7]} size={[6.5, 5]} onClick={() => onSelectRoom("calendar")}>
          <Desk position={[-8.5, 0, -7.2]} />
          <RoomSign
            position={[-8.5, 2.85, -7]}
            label="Calendar"
            active={activeRoom === "calendar"}
            onClick={() => onSelectRoom("calendar")}
          />
          <Html position={[-8.5, 1.6, -9.2]} center distanceFactor={12}>
            <div className="w-[180px] rounded-xl border border-slate-200 bg-white/95 p-2.5 shadow">
              <p className="text-[11px] font-bold text-slate-900">
                {meetingsToday} meeting{meetingsToday === 1 ? "" : "s"} today
              </p>
              <p className="mt-0.5 text-[10px] text-slate-500">Open classic calendar to schedule.</p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenClassic("/sales-operation/calendar");
                }}
                className="mt-2 w-full rounded-lg bg-slate-900 px-2 py-1 text-[10px] font-semibold text-white"
              >
                Open Calendar
              </button>
            </div>
          </Html>
        </HotspotPad>

        {/* Tasks — overdue count only */}
        <HotspotPad position={[0, 0, -7]} size={[6.5, 5]} onClick={() => onSelectRoom("tasks")}>
          <Desk position={[0, 0, -7]} />
          <RoomSign
            position={[0, 2.85, -7]}
            label="Tasks"
            active={activeRoom === "tasks"}
            onClick={() => onSelectRoom("tasks")}
          />
          <Html position={[0, 1.6, -9.2]} center distanceFactor={12}>
            <div className="w-[180px] rounded-xl border border-slate-200 bg-white/95 p-2.5 shadow">
              <p className="text-[11px] font-bold text-slate-900">
                {overdueTasks} overdue task{overdueTasks === 1 ? "" : "s"}
              </p>
              <p className="mt-0.5 text-[10px] text-slate-500">Act in Attention dock or My Space.</p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenAttention();
                }}
                className="mt-2 w-full rounded-lg bg-slate-900 px-2 py-1 text-[10px] font-semibold text-white"
              >
                Open Attention
              </button>
            </div>
          </Html>
        </HotspotPad>

        {/* Dashboard — summary + classic analytics */}
        <HotspotPad position={[8.5, 0, -7]} size={[6.5, 5]} onClick={() => onSelectRoom("dashboard")}>
          <Desk position={[8.5, 0, -7]} />
          <RoomSign
            position={[8.5, 2.85, -7]}
            label="Dashboard"
            active={activeRoom === "dashboard"}
            onClick={() => onSelectRoom("dashboard")}
          />
          <Html position={[8.5, 1.6, -9.2]} center distanceFactor={12}>
            <div className="w-[180px] rounded-xl border border-slate-200 bg-white/95 p-2.5 shadow">
              <p className="text-[11px] font-bold text-slate-900">{leadsTotal} leads total</p>
              <p className="mt-0.5 text-[10px] text-slate-500">
                Conversion{" "}
                {(snapshot?.analytics.signedConversionPct ?? 0).toFixed(0)}% · open Analytics for
                charts.
              </p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenClassic("/sales-operation/analytics");
                }}
                className="mt-2 w-full rounded-lg bg-slate-900 px-2 py-1 text-[10px] font-semibold text-white"
              >
                Open Analytics
              </button>
            </div>
          </Html>
        </HotspotPad>

        {/* Automation / Discovery — summary + deep-link */}
        <HotspotPad
          position={[0, 0, 9.5]}
          size={[4, 2]}
          onClick={() => onSelectRoom("automation")}
        >
          <RoomSign
            position={[0, 2.4, 9.2]}
            label="Discovery"
            active={activeRoom === "automation"}
            onClick={() => onSelectRoom("automation")}
          />
          <Html position={[0, 1.2, 9]} center distanceFactor={14}>
            <div className="w-[200px] rounded-xl border border-slate-200 bg-white/95 p-2.5 shadow">
              <p className="text-[11px] font-bold text-slate-900">
                {discovery?.enabled
                  ? `${discovery.activeCount}/${discovery.campaignCount} campaigns active`
                  : "Lead Discovery"}
              </p>
              <p className="mt-0.5 text-[10px] text-slate-500">
                Configure campaigns in classic Lead Discovery.
              </p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenClassic("/sales-operation/lead-discovery");
                }}
                className="mt-2 w-full rounded-lg bg-slate-900 px-2 py-1 text-[10px] font-semibold text-white"
              >
                Open Discovery
              </button>
            </div>
          </Html>
        </HotspotPad>

        {/* CRM managers — severity cues, click → Team dock */}
        <OfficeWalkingAgents
          managers={snapshot?.managers ?? []}
          selectedManagerId={selectedManagerId}
          animate={perf.animateAgents}
          onSelectManager={(id) => {
            onSelectRoom("sales");
            onSelectManager(id);
          }}
        />
      </Suspense>

      <OrbitControls
        ref={controlsRef as never}
        makeDefault
        enablePan
        enableZoom
        enableRotate
        zoomSpeed={0.85}
        rotateSpeed={0.7}
        panSpeed={0.6}
        maxPolarAngle={Math.PI / 2.05}
        minDistance={3.5}
        maxDistance={32}
        target={[0, 0.5, 2]}
      />
      <RoomCameraSnap activeRoom={activeRoom} controlsRef={controlsRef} />
    </Canvas>
  );
}
