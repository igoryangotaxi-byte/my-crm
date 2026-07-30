"use client";

import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import {
  OFFICE_AGENTS,
  OFFICE_WAYPOINTS,
  type OfficeAgent,
  type OfficeAgentId,
} from "@/lib/sales-operation/office/agents";

type OfficeWalkingAgentsProps = {
  selectedAgentId?: OfficeAgentId | null;
  animate: boolean;
  badges?: Partial<Record<OfficeAgentId, string | null>>;
  onSelectAgent: (id: OfficeAgentId) => void;
};

function WalkingAgent({
  agent,
  selected,
  animate,
  badge,
  onSelect,
}: {
  agent: OfficeAgent;
  selected: boolean;
  animate: boolean;
  badge?: string | null;
  onSelect: () => void;
}) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const leftLeg = useRef<THREE.Mesh>(null);
  const rightLeg = useRef<THREE.Mesh>(null);
  const leftArm = useRef<THREE.Mesh>(null);
  const rightArm = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  const route = useMemo(() => {
    const step = 2 + (agent.pathOffset % 3);
    const pts: Array<[number, number, number]> = [];
    for (let i = 0; i < OFFICE_WAYPOINTS.length; i++) {
      pts.push(OFFICE_WAYPOINTS[(agent.pathOffset + i * step) % OFFICE_WAYPOINTS.length]);
    }
    return pts;
  }, [agent.pathOffset]);

  const start = OFFICE_WAYPOINTS[agent.pathOffset % OFFICE_WAYPOINTS.length];
  const motion = useRef({
    wpIndex: 0,
    pauseUntil: 0,
    gait: agent.pathOffset * 1.7,
    walking: false,
    pos: new THREE.Vector3(start[0], 0, start[2]),
  });

  useFrame((_, delta) => {
    if (!root.current) return;
    const s = motion.current;
    const now = performance.now() / 1000;
    let walking = false;

    if (animate) {
      if (now >= s.pauseUntil) {
        const target = route[s.wpIndex % route.length];
        const goal = new THREE.Vector3(target[0], 0, target[2]);
        const dist = s.pos.distanceTo(goal);
        if (dist < 0.1) {
          s.pos.copy(goal);
          s.pauseUntil = now + 0.85 + (agent.pathOffset % 4) * 0.4;
          s.wpIndex = (s.wpIndex + 1) % route.length;
        } else {
          walking = true;
          const speed = agent.walkSpeed * (hovered || selected ? 0.5 : 1);
          const stepLen = Math.min(dist, speed * delta * 1.7);
          const dir = goal.clone().sub(s.pos).normalize();
          s.pos.addScaledVector(dir, stepLen);
          const face = Math.atan2(dir.x, dir.z);
          root.current.rotation.y = THREE.MathUtils.damp(root.current.rotation.y, face, 10, delta);
          s.gait += delta * 10 * speed;
        }
      }
    }

    s.walking = walking;
    root.current.position.copy(s.pos);

    const bob = walking
      ? Math.abs(Math.sin(s.gait)) * 0.045
      : Math.sin(now * 1.4 + agent.pathOffset) * 0.012;
    if (body.current) {
      body.current.position.y = bob;
      const scale = hovered || selected ? 1.1 : 1;
      body.current.scale.setScalar(THREE.MathUtils.damp(body.current.scale.x, scale, 12, delta));
    }

    const leg = walking ? Math.sin(s.gait) * 0.6 : 0;
    const arm = walking ? Math.sin(s.gait) * 0.45 : Math.sin(now + agent.pathOffset) * 0.04;
    if (leftLeg.current) leftLeg.current.rotation.x = leg;
    if (rightLeg.current) rightLeg.current.rotation.x = -leg;
    if (leftArm.current) leftArm.current.rotation.x = arm;
    if (rightArm.current) rightArm.current.rotation.x = -arm;
  });

  const glow = hovered || selected;

  return (
    <group
      ref={root}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = "auto";
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      <group ref={body}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <circleGeometry args={[0.28, 20]} />
          <meshBasicMaterial
            color={selected ? "#ff2d2d" : hovered ? agent.color : "#000000"}
            transparent
            opacity={glow ? 0.38 : 0.16}
          />
        </mesh>
        {glow ? (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]}>
            <ringGeometry args={[0.32, 0.44, 32]} />
            <meshBasicMaterial color={selected ? "#ff2d2d" : agent.color} transparent opacity={0.95} />
          </mesh>
        ) : null}

        <mesh ref={leftLeg} position={[-0.09, 0.28, 0]} castShadow>
          <boxGeometry args={[0.12, 0.42, 0.14]} />
          <meshStandardMaterial color="#1e293b" roughness={0.85} />
        </mesh>
        <mesh ref={rightLeg} position={[0.09, 0.28, 0]} castShadow>
          <boxGeometry args={[0.12, 0.42, 0.14]} />
          <meshStandardMaterial color="#1e293b" roughness={0.85} />
        </mesh>
        <mesh position={[-0.09, 0.06, 0.04]} castShadow>
          <boxGeometry args={[0.14, 0.08, 0.22]} />
          <meshStandardMaterial color="#0f172a" />
        </mesh>
        <mesh position={[0.09, 0.06, 0.04]} castShadow>
          <boxGeometry args={[0.14, 0.08, 0.22]} />
          <meshStandardMaterial color="#0f172a" />
        </mesh>

        <mesh position={[0, 0.72, 0]} castShadow>
          <boxGeometry args={[0.42, 0.48, 0.26]} />
          <meshStandardMaterial color={agent.color} roughness={0.55} metalness={0.05} />
        </mesh>
        <mesh position={[0, 0.92, 0.02]} castShadow>
          <boxGeometry args={[0.28, 0.08, 0.22]} />
          <meshStandardMaterial color="#f8fafc" />
        </mesh>

        <mesh ref={leftArm} position={[-0.28, 0.72, 0]} castShadow>
          <boxGeometry args={[0.1, 0.4, 0.12]} />
          <meshStandardMaterial color={agent.color} />
        </mesh>
        <mesh ref={rightArm} position={[0.28, 0.72, 0]} castShadow>
          <boxGeometry args={[0.1, 0.4, 0.12]} />
          <meshStandardMaterial color={agent.color} />
        </mesh>

        <mesh position={[0, 1.12, 0]} castShadow>
          <boxGeometry args={[0.28, 0.28, 0.28]} />
          <meshStandardMaterial color="#f0c7a0" roughness={0.7} />
        </mesh>
        <mesh position={[0, 1.26, -0.02]} castShadow>
          <boxGeometry args={[0.3, 0.1, 0.3]} />
          <meshStandardMaterial color={agent.hair} />
        </mesh>
        <mesh position={[-0.07, 1.14, 0.14]}>
          <boxGeometry args={[0.05, 0.05, 0.04]} />
          <meshStandardMaterial color="#0f172a" />
        </mesh>
        <mesh position={[0.07, 1.14, 0.14]}>
          <boxGeometry args={[0.05, 0.05, 0.04]} />
          <meshStandardMaterial color="#0f172a" />
        </mesh>

        <pointLight
          position={[0.18, 0.78, 0.16]}
          intensity={glow ? 0.65 : 0.18}
          distance={2}
          color={agent.color}
        />
        <mesh position={[0.18, 0.78, 0.14]}>
          <boxGeometry args={[0.08, 0.1, 0.03]} />
          <meshStandardMaterial
            color={agent.color}
            emissive={agent.color}
            emissiveIntensity={glow ? 1 : 0.4}
          />
        </mesh>
      </group>

      <mesh position={[0, 0.7, 0]} visible={false}>
        <boxGeometry args={[0.75, 1.55, 0.75]} />
      </mesh>

      {glow ? (
        <Html position={[0, 1.9, 0]} center distanceFactor={10} zIndexRange={[50, 0]}>
          <div
            className={`pointer-events-none min-w-[100px] rounded-xl border px-2.5 py-1.5 text-center shadow-lg backdrop-blur ${
              selected ? "border-[#ff2d2d] bg-[#fff1f1]/95" : "border-white/80 bg-white/95"
            }`}
          >
            <div className="text-[11px] font-bold text-slate-900">{agent.name}</div>
            <div className="text-[10px] font-semibold" style={{ color: agent.color }}>
              {agent.role}
            </div>
            {badge ? (
              <div className="mt-0.5 text-[9px] font-bold text-slate-700">{badge}</div>
            ) : null}
            <div className="mt-0.5 text-[9px] text-slate-500">Click to work</div>
          </div>
        </Html>
      ) : (
        <Html position={[0, 1.65, 0]} center distanceFactor={13} zIndexRange={[20, 0]}>
          <div className="pointer-events-none flex flex-col items-center gap-0.5">
            <div className="rounded-md bg-black/50 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white">
              {agent.name}
            </div>
            {badge ? (
              <div
                className="rounded-full px-1.5 py-0.5 text-[8px] font-bold text-white"
                style={{ backgroundColor: agent.color }}
              >
                {badge}
              </div>
            ) : null}
          </div>
        </Html>
      )}
    </group>
  );
}

export function OfficeWalkingAgents({
  selectedAgentId,
  animate,
  badges,
  onSelectAgent,
}: OfficeWalkingAgentsProps) {
  return (
    <group>
      {OFFICE_AGENTS.map((agent) => (
        <WalkingAgent
          key={agent.id}
          agent={agent}
          selected={selectedAgentId === agent.id}
          animate={animate}
          badge={badges?.[agent.id]}
          onSelect={() => onSelectAgent(agent.id)}
        />
      ))}
    </group>
  );
}
