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
  OfficeAgentId,
  OfficeCrmSnapshot,
  OfficePipelineSticker,
  OfficeRoomId,
} from "@/lib/sales-operation/office/types";
import type { OfficePerformanceSettings } from "@/lib/sales-operation/office/performance";
import type { SalesLeadStatus } from "@/lib/sales-operation/types";
import { OFFICE_AGENTS, agentLiveBadge } from "@/lib/sales-operation/office/agents";
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
              {sticker.company ?? sticker.status.replace("_", " ")}
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

function ScreenOnWall({
  position,
  rotation = 0,
  color,
  title,
}: {
  position: [number, number, number];
  rotation?: number;
  color: string;
  title: string;
}) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh castShadow>
        <boxGeometry args={[2.4, 1.4, 0.08]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>
      <mesh position={[0, 0, 0.05]}>
        <planeGeometry args={[2.2, 1.2]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} />
      </mesh>
      <Html position={[0, 0.85, 0.1]} center>
        <div className="rounded bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">
          {title}
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

const NEXT_STATUS: Partial<Record<SalesLeadStatus, SalesLeadStatus>> = {
  new: "in_progress",
  in_progress: "proposal_sent",
  proposal_sent: "negotiation",
  negotiation: "signed",
};

type OfficeSceneProps = {
  snapshot: OfficeCrmSnapshot | null;
  activeRoom: OfficeRoomId;
  selectedLeadId?: string | null;
  selectedAgentId?: OfficeAgentId | null;
  pipelineStatusFilter?: SalesLeadStatus | null;
  perf: OfficePerformanceSettings;
  onSelectRoom: (room: OfficeRoomId) => void;
  onOpenLead: (leadId: string) => void;
  onMoveLead: (leadId: string, toStatus: SalesLeadStatus) => void;
  onSelectAgent: (agentId: OfficeAgentId) => void;
  onTalkReception: () => void;
  briefingOpen: boolean;
};

export function OfficeScene({
  snapshot,
  activeRoom,
  selectedLeadId,
  selectedAgentId,
  pipelineStatusFilter = null,
  perf,
  onSelectRoom,
  onOpenLead,
  onMoveLead,
  onSelectAgent,
  onTalkReception,
  briefingOpen,
}: OfficeSceneProps) {
  const controlsRef = useRef<{
    target: THREE.Vector3;
    object: THREE.Camera;
    update: () => void;
  } | null>(null);

  const stickersByStage = useMemo(() => {
    const map = new Map<string, OfficePipelineSticker[]>();
    for (const s of snapshot?.stickers ?? []) {
      if (pipelineStatusFilter && s.status !== pipelineStatusFilter) continue;
      const list = map.get(s.status) ?? [];
      list.push(s);
      map.set(s.status, list);
    }
    return map;
  }, [snapshot, pipelineStatusFilter]);

  const stages = (snapshot?.stages ?? []).filter((s) =>
    ["new", "in_progress", "proposal_sent", "negotiation"].includes(s.key),
  );

  const agentBadges = useMemo(() => {
    const reception = snapshot?.reception;
    const stickers = snapshot?.stickers ?? [];
    const badges: Partial<Record<OfficeAgentId, string | null>> = {};
    for (const agent of OFFICE_AGENTS) {
      const ownerLeadCount = stickers.filter((s) => {
        const name = (s.ownerName ?? "").toLowerCase();
        return agent.ownerMatch.some((m) => name.includes(m));
      }).length;
      badges[agent.id] = agentLiveBadge(agent, {
        newLeads: reception?.newLeads ?? 0,
        overdueTasks: reception?.overdueTasks ?? 0,
        meetingsToday: reception?.meetingsToday ?? 0,
        unread: reception?.unreadNotifications ?? 0,
        ownerLeadCount,
      });
    }
    return badges;
  }, [snapshot]);

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
                    onTalkReception();
                  }}
                  className="w-full rounded-lg bg-[#ff2d2d] px-3 py-1.5 text-[11px] font-semibold text-white"
                >
                  Open workbench
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
                      const next = NEXT_STATUS[sticker.status];
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

        {/* Calendar room */}
        <HotspotPad position={[-8.5, 0, -7]} size={[6.5, 5]} onClick={() => onSelectRoom("calendar")}>
          <mesh position={[-8.5, 1.6, -10.4]} castShadow>
            <boxGeometry args={[3.2, 2.2, 0.1]} />
            <meshStandardMaterial color="#e2e8f0" />
          </mesh>
          {Array.from({ length: 20 }).map((_, i) => {
            const x = -9.7 + (i % 5) * 0.55;
            const y = 2.3 - Math.floor(i / 5) * 0.45;
            return (
              <mesh key={i} position={[x, y, -10.34]}>
                <planeGeometry args={[0.45, 0.35]} />
                <meshStandardMaterial color={i % 7 === 0 ? "#fecaca" : "#ffffff"} />
              </mesh>
            );
          })}
          <Desk position={[-8.5, 0, -7.2]} />
          <RoomSign
            position={[-8.5, 2.85, -7]}
            label="Calendar"
            active={activeRoom === "calendar"}
            onClick={() => onSelectRoom("calendar")}
          />
        </HotspotPad>

        {/* Tasks room */}
        <HotspotPad position={[0, 0, -7]} size={[6.5, 5]} onClick={() => onSelectRoom("tasks")}>
          <mesh position={[0, 1.55, -10.4]} castShadow>
            <boxGeometry args={[3.6, 2.1, 0.1]} />
            <meshStandardMaterial color="#fef3c7" />
          </mesh>
          {[0, 1, 2, 3].map((i) => (
            <RoundedBox
              key={i}
              args={[1.4, 0.35, 0.04]}
              radius={0.03}
              position={[-1.1 + (i % 2) * 1.6, 2.1 - Math.floor(i / 2) * 0.55, -10.32]}
              castShadow
            >
              <meshStandardMaterial color={i < 2 ? "#fee2e2" : "#dcfce7"} />
            </RoundedBox>
          ))}
          <Desk position={[0, 0, -7]} />
          <RoomSign
            position={[0, 2.85, -7]}
            label="Tasks"
            active={activeRoom === "tasks"}
            onClick={() => onSelectRoom("tasks")}
          />
        </HotspotPad>

        {/* Dashboard room */}
        <HotspotPad position={[8.5, 0, -7]} size={[6.5, 5]} onClick={() => onSelectRoom("dashboard")}>
          <ScreenOnWall position={[7.2, 1.7, -10.4]} color="#38bdf8" title="Revenue" />
          <ScreenOnWall position={[10, 1.7, -10.4]} color="#a78bfa" title="Funnel" />
          <Desk position={[8.5, 0, -7]} />
          <RoomSign
            position={[8.5, 2.85, -7]}
            label="Dashboard"
            active={activeRoom === "dashboard"}
            onClick={() => onSelectRoom("dashboard")}
          />
        </HotspotPad>

        {/* Named team agents — walk the office with hover + talk */}
        <OfficeWalkingAgents
          selectedAgentId={selectedAgentId}
          animate={perf.animateAgents}
          badges={agentBadges}
          onSelectAgent={(id) => {
            const agent = OFFICE_AGENTS.find((a) => a.id === id);
            onSelectRoom(agent?.roomId ?? "reception");
            onSelectAgent(id);
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
