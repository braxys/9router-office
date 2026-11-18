'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createSeededRandom } from '@/lib/random';

/* -------------------------------------------------------------------------- */
/*  Palette                                                                   */
/* -------------------------------------------------------------------------- */

export const OFFICE = {
  floorLight: '#f7e4cb',
  floorDark: '#edd3b4',
  wall: '#ffffff',
  wallShade: '#fffaf2',
  trim: '#ffffff',
  sky: '#bfe6ff',
  grass: '#8fd97a',
  wood: '#d99a5b',
  woodDeep: '#b87a42',
  white: '#fffdf8',
  metal: '#c9d6e0',
  ink: '#4a5a68',
} as const;

/** Deterministic 0..1 helper so nothing random happens during render. */
function seeded(seed: number) {
  const rand = createSeededRandom(seed);
  return () => rand();
}

/* -------------------------------------------------------------------------- */
/*  Floor: warm oak planks + rainbow rug                                      */
/* -------------------------------------------------------------------------- */

function WoodFloor({ size = 26 }: { size?: number }) {
  const instanced = useRef<THREE.InstancedMesh>(null);

  const planks = useMemo(() => {
    const rand = seeded(0xf100);
    const rows = 16;
    const plankDepth = size / rows;
    const items: { x: number; z: number; w: number; d: number; color: string }[] = [];

    for (let r = 0; r < rows; r += 1) {
      // Stagger each row, then emit contiguous segments with NO gaps.
      let x = -size / 2 - rand() * 2.5;
      const rowEnd = size / 2 + 0.01;
      while (x < rowEnd) {
        const len = 2.0 + rand() * 2.2;
        const shade = rand();
        const start = Math.max(x, -size / 2);
        const end = Math.min(x + len, size / 2);
        if (end > start) {
          items.push({
            x: (start + end) / 2,
            z: -size / 2 + r * plankDepth + plankDepth / 2,
            w: end - start,
            d: plankDepth,
            color:
              shade > 0.66 ? '#fdf0de' : shade > 0.33 ? OFFICE.floorLight : OFFICE.floorDark,
          });
        }
        x += len;
      }
    }
    return items;
  }, [size]);

  // All planks share one BoxGeometry; only the matrix and colour vary, so a
  // single InstancedMesh renders the whole floor in one draw call.
  useLayoutEffect(() => {
    const mesh = instanced.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    planks.forEach((p, i) => {
      dummy.position.set(p.x, -0.05, p.z);
      dummy.scale.set(p.w, 0.1, p.d);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, color.set(p.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [planks]);

  return (
    <group>
      {/* solid sub-floor so no background ever shows through seams */}
      <mesh position={[0, -0.11, 0]}>
        <boxGeometry args={[size, 0.1, size]} />
        <meshLambertMaterial color={OFFICE.floorDark} />
      </mesh>
      <instancedMesh
        ref={instanced}
        args={[undefined, undefined, planks.length]}
       
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshLambertMaterial />
      </instancedMesh>
    </group>
  );
}

/** Chunky concentric rug — flat toy blocks, one per colour band. */
function Rug({ radius = 4.6 }: { radius?: number }) {
  const bands = [
    { r: radius, color: '#ffd166' },
    { r: radius * 0.82, color: '#ffb4a2' },
    { r: radius * 0.64, color: '#a0e7e5' },
    { r: radius * 0.46, color: '#fdfcdc' },
  ];
  return (
    <group position={[0, 0.02, 0]}>
      {bands.map((b, i) => (
        <mesh key={i} position={[0, i * 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[b.r, 56]} />
          <meshLambertMaterial color={b.color} />
        </mesh>
      ))}
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/*  Walls with windows, clock, whiteboard, shelves, plants                     */
/* -------------------------------------------------------------------------- */

function WallClock({ position }: { position: [number, number, number] }) {
  const minuteHand = useRef<THREE.Mesh>(null);
  const hourHand = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    // Fast, playful ticking (not real time) so the clock feels alive.
    if (minuteHand.current) minuteHand.current.rotation.z = -t * 0.9;
    if (hourHand.current) hourHand.current.rotation.z = -t * 0.075;
  });

  return (
    <group position={position}>
      {/* rim — rotated so the disc faces the room (+Z), not the ceiling */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.46, 0.46, 0.1, 28]} />
        <meshLambertMaterial color="#ff8fa3" />
      </mesh>
      <mesh position={[0, 0, 0.06]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.37, 0.37, 0.02, 28]} />
        <meshLambertMaterial color="#fffdf8" />
      </mesh>
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return (
          <mesh
            key={i}
            position={[Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0.075]}
            rotation={[0, 0, a]}
          >
            <boxGeometry args={[0.055, 0.014, 0.01]} />
            <meshBasicMaterial color="#c9b8a8" />
          </mesh>
        );
      })}
      <mesh ref={hourHand} position={[0, 0, 0.085]}>
        <boxGeometry args={[0.03, 0.19, 0.012]} />
        <meshBasicMaterial color="#4a5a68" />
      </mesh>
      <mesh ref={minuteHand} position={[0, 0, 0.095]}>
        <boxGeometry args={[0.022, 0.28, 0.012]} />
        <meshBasicMaterial color="#ff6b7a" />
      </mesh>
      <mesh position={[0, 0, 0.105]}>
        <sphereGeometry args={[0.035, 12, 12]} />
        <meshBasicMaterial color="#4a5a68" />
      </mesh>
    </group>
  );
}

function Whiteboard({ position }: { position: [number, number, number] }) {
  const scribbles = useMemo(() => {
    const rand = seeded(0x5c4b);
    const colors = ['#ff6b7a', '#5cb8f2', '#58d6a9', '#ffb020', '#b98bff'];
    const marks: { x: number; y: number; w: number; h: number; color: string; rot: number }[] = [];
    for (let i = 0; i < 26; i += 1) {
      marks.push({
        x: (rand() - 0.5) * 2.2,
        y: (rand() - 0.5) * 1.15,
        w: 0.1 + rand() * 0.42,
        h: 0.028 + rand() * 0.05,
        color: colors[Math.floor(rand() * colors.length)],
        rot: (rand() - 0.5) * 0.25,
      });
    }
    return marks;
  }, []);

  return (
    <group position={position}>
      {/* frame */}
      <mesh>
        <boxGeometry args={[2.5, 1.45, 0.09]} />
        <meshLambertMaterial color="#d8c7b2" />
      </mesh>
      <mesh position={[0, 0, 0.055]}>
        <boxGeometry args={[2.32, 1.28, 0.02]} />
        <meshLambertMaterial color="#ffffff" />
      </mesh>
      {scribbles.map((m, i) => (
        <mesh key={i} position={[m.x, m.y, 0.07]} rotation={[0, 0, m.rot]}>
          <boxGeometry args={[m.w, m.h, 0.008]} />
          <meshBasicMaterial color={m.color} />
        </mesh>
      ))}
      {/* marker tray */}
      <mesh position={[0, -0.74, 0.09]}>
        <boxGeometry args={[2.0, 0.07, 0.16]} />
        <meshLambertMaterial color="#e8dccb" />
      </mesh>
    </group>
  );
}

function Bookshelf({ position }: { position: [number, number, number] }) {
  const W = 1.3;
  const H = 1.6;
  const D = 0.42;

  const books = useMemo(() => {
    const rand = seeded(0xb00c);
    const colors = ['#ff6b7a', '#5cb8f2', '#58d6a9', '#ffb020', '#b98bff', '#ff9d5c'];
    const items: { x: number; y: number; h: number; color: string; tilt: number }[] = [];
    // Books rest ON each shelf board, in front of the back panel.
    const shelfTops = [0.06, 0.5, 0.94];
    shelfTops.forEach((y) => {
      let x = -W / 2 + 0.1;
      while (x < W / 2 - 0.14) {
        const w = 0.075 + rand() * 0.055;
        items.push({
          x: x + w / 2,
          y,
          h: 0.22 + rand() * 0.15,
          color: colors[Math.floor(rand() * colors.length)],
          tilt: rand() > 0.9 ? 0.12 : 0,
        });
        x += w + 0.02;
      }
    });
    return items;
  }, []);

  return (
    <group position={position}>
      {/* back panel — thin, so books read as sitting in front of it */}
      <mesh position={[0, 0, -D / 2 + 0.03]}>
        <boxGeometry args={[W, H, 0.06]} />
        <meshLambertMaterial color="#f6e6d0" />
      </mesh>

      {/* side walls */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[(side * W) / 2 - side * 0.04, 0, 0]}>
          <boxGeometry args={[0.08, H, D]} />
          <meshLambertMaterial color="#e2b37b" />
        </mesh>
      ))}

      {/* top + bottom boards */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[0, (side * H) / 2 - side * 0.04, 0]}>
          <boxGeometry args={[W, 0.08, D]} />
          <meshLambertMaterial color="#e2b37b" />
        </mesh>
      ))}

      {/* shelf boards */}
      {[0.02, 0.46, 0.9].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <boxGeometry args={[W - 0.16, 0.05, D - 0.06]} />
          <meshLambertMaterial color="#c98a4b" />
        </mesh>
      ))}

      {/* books sit on top of each board */}
      {books.map((b, i) => (
        <mesh
          key={i}
          position={[b.x, b.y + b.h / 2, 0.01]}
          rotation={[0, 0, b.tilt]}
         
        >
          <boxGeometry args={[0.07, b.h, 0.22]} />
          <meshLambertMaterial color={b.color} />
        </mesh>
      ))}
    </group>
  );
}

function WaterCooler({ position }: { position: [number, number, number] }) {
  const bubble = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (bubble.current) {
      bubble.current.position.y = 0.62 + Math.sin(t * 1.6) * 0.012;
      bubble.current.rotation.y = t * 0.5;
    }
  });

  return (
    <group position={position}>
      {/* base */}
      <mesh position={[0, 0.22, 0]}>
        <boxGeometry args={[0.44, 0.44, 0.38]} />
        <meshLambertMaterial color="#eef4f8" />
      </mesh>
      <mesh position={[0, 0.28, 0.2]}>
        <boxGeometry args={[0.1, 0.08, 0.04]} />
        <meshLambertMaterial color="#5cb8f2" />
      </mesh>
      {/* bottle */}
      <mesh ref={bubble} position={[0, 0.62, 0]}>
        <cylinderGeometry args={[0.17, 0.19, 0.36, 16]} />
        <meshLambertMaterial color="#9fdcf7" transparent opacity={0.85} />
      </mesh>
      <mesh position={[0, 0.82, 0]}>
        <cylinderGeometry args={[0.07, 0.14, 0.08, 12]} />
        <meshLambertMaterial color="#7fcdf0" transparent opacity={0.9} />
      </mesh>
    </group>
  );
}

/** Blocky cactus — stacked boxes with a pink bloom. */
function Cactus({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.09, 0]}>
        <boxGeometry args={[0.3, 0.18, 0.3]} />
        <meshLambertMaterial color="#ff9d5c" />
      </mesh>
      <mesh position={[0, 0.36, 0]}>
        <boxGeometry args={[0.16, 0.4, 0.16]} />
        <meshLambertMaterial color="#58d6a9" />
      </mesh>
      <mesh position={[0.13, 0.42, 0]}>
        <boxGeometry args={[0.12, 0.1, 0.1]} />
        <meshLambertMaterial color="#58d6a9" />
      </mesh>
      <mesh position={[-0.12, 0.3, 0]}>
        <boxGeometry args={[0.1, 0.09, 0.09]} />
        <meshLambertMaterial color="#4bc496" />
      </mesh>
      <mesh position={[0, 0.58, 0]}>
        <boxGeometry args={[0.07, 0.07, 0.07]} />
        <meshLambertMaterial color="#ff8fa3" />
      </mesh>
    </group>
  );
}

/** Blocky monstera — big flat leaves fanned out of a pot. */
function Monstera({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  const leaves = useMemo(() => {
    const rand = seeded(0x1ea5);
    return Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * Math.PI * 2 + rand() * 0.5;
      return {
        a,
        tilt: 0.5 + rand() * 0.5,
        size: 0.34 + rand() * 0.16,
        color: i % 2 === 0 ? '#6ec96f' : '#58d6a9',
      };
    });
  }, []);

  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.14, 0]}>
        <cylinderGeometry args={[0.2, 0.16, 0.28, 12]} />
        <meshLambertMaterial color="#ffb4a2" />
      </mesh>
      {leaves.map((l, i) => (
        <group key={i} rotation={[0, l.a, 0]} position={[0, 0.3, 0]}>
          <mesh rotation={[l.tilt, 0, 0]} position={[0, l.size * 0.5, l.size * 0.35]}>
            <boxGeometry args={[l.size, 0.03, l.size * 0.8]} />
            <meshLambertMaterial color={l.color} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Window cut into the back wall showing sky + a couple of clouds. */
function Window({
  position,
  width = 2.6,
  height = 2.0,
}: {
  position: [number, number, number];
  width?: number;
  height?: number;
}) {
  const cloud = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!cloud.current) return;
    cloud.current.position.x = Math.sin(state.clock.elapsedTime * 0.12) * 0.5;
  });

  return (
    <group position={position}>
      {/* sky pane */}
      <mesh>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial color={OFFICE.sky} />
      </mesh>
      {/* sun glow */}
      <mesh position={[width * 0.28, height * 0.24, 0.01]}>
        <circleGeometry args={[0.3, 24]} />
        <meshBasicMaterial color="#fff3b0" />
      </mesh>
      {/* drifting clouds */}
      <group ref={cloud} position={[0, 0, 0.02]}>
        {[
          [-0.6, 0.35, 0.42],
          [0.45, -0.2, 0.34],
          [0.05, 0.6, 0.3],
        ].map(([x, y, s], i) => (
          <mesh key={i} position={[x, y, 0]}>
            <planeGeometry args={[s * 1.6, s]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.9} />
          </mesh>
        ))}
      </group>
      {/* mullions */}
      <mesh position={[0, 0, 0.03]}>
        <boxGeometry args={[0.07, height, 0.05]} />
        <meshLambertMaterial color={OFFICE.trim} />
      </mesh>
      <mesh position={[0, 0, 0.03]}>
        <boxGeometry args={[width, 0.07, 0.05]} />
        <meshLambertMaterial color={OFFICE.trim} />
      </mesh>
      {/* frame */}
      {[
        [0, height / 2, width + 0.18, 0.13],
        [0, -height / 2, width + 0.18, 0.13],
        [-width / 2, 0, 0.13, height],
        [width / 2, 0, 0.13, height],
      ].map(([x, y, w, h], i) => (
        <mesh key={i} position={[x, y, 0.04]}>
          <boxGeometry args={[w, h, 0.1]} />
          <meshLambertMaterial color={OFFICE.trim} />
        </mesh>
      ))}
      {/* sill */}
      <mesh position={[0, -height / 2 - 0.1, 0.12]}>
        <boxGeometry args={[width + 0.4, 0.1, 0.34]} />
        <meshLambertMaterial color="#f2e3cd" />
      </mesh>
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/*  The room                                                                  */
/* -------------------------------------------------------------------------- */

export function OfficeRoom() {
  const WALL_H = 4.4;
  const ROOM = 9.5; // half-extent

  return (
    <group>
      <WoodFloor size={ROOM * 2} />

      {/* ---- back wall (behind the desks, -Z) ---- */}
      <group position={[0, 0, -ROOM]}>
        <mesh position={[0, WALL_H / 2, 0]}>
          <boxGeometry args={[ROOM * 2, WALL_H, 0.3]} />
          <meshLambertMaterial color={OFFICE.wall} />
        </mesh>
        {/* skirting */}
        <mesh position={[0, 0.14, 0.16]}>
          <boxGeometry args={[ROOM * 2, 0.28, 0.06]} />
          <meshLambertMaterial color={OFFICE.wallShade} />
        </mesh>

        <Window position={[-4.6, 2.2, 0.18]} width={2.4} height={1.9} />
        <Window position={[4.6, 2.2, 0.18]} width={2.4} height={1.9} />

        <Whiteboard position={[-0.9, 2.15, 0.2]} />
        <WallClock position={[2.3, 3.25, 0.22]} />
      </group>

      {/* ---- left wall (-X) ---- */}
      <group position={[-ROOM, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <mesh position={[0, WALL_H / 2, 0]}>
          <boxGeometry args={[ROOM * 2, WALL_H, 0.3]} />
          <meshLambertMaterial color={OFFICE.wallShade} />
        </mesh>
        <mesh position={[0, 0.14, 0.16]}>
          <boxGeometry args={[ROOM * 2, 0.28, 0.06]} />
          <meshLambertMaterial color={OFFICE.wall} />
        </mesh>
        <Window position={[-3.6, 2.2, 0.18]} width={2.2} height={1.8} />
        <Bookshelf position={[2.0, 0.8, 0.42]} />
        <Cactus position={[4.2, 0, 0.85]} scale={1.2} />
      </group>

      {/* ---- right side: open to the camera (diorama cutaway) ----
          Furniture along +X keeps the room feeling furnished without a wall
          blocking the isometric view. */}
      <group>
        <WaterCooler position={[ROOM - 1.0, 0, -3.0]} />
        <Monstera position={[ROOM - 1.1, 0, 1.2]} scale={1.1} />
        {/* bookshelf against the back wall, not the open side */}
        <Bookshelf position={[ROOM - 1.2, 0.8, -ROOM + 0.85]} />
      </group>

      {/* ---- rug under the hub ---- */}
      <Rug radius={4.4} />

      {/* corner plants for depth */}
      <Monstera position={[-6.4, 0, 6.0]} scale={1.3} />
      <Cactus position={[6.6, 0, 5.9]} scale={1.35} />
    </group>
  );
}
