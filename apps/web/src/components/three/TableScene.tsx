'use client';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Flame } from './DiyaSplash';

const R = 0.3;
const H = 0.064;
const LIT = 1.1; // seconds for the chips to drop and the diya to catch
// [chip, dash] colors per denomination
const CHIPS = [
  ['#EFE3C4', '#C8432A'],
  ['#E8A226', '#FFF7DD'],
  ['#B8382A', '#FFF7DD'],
  ['#A93C6A', '#FFF7DD'],
  ['#1F7F7D', '#FFF7DD'],
  ['#241D18', '#C8AD86'],
] as const;

function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function texture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Side, top, bottom materials for one denomination: eight edge inserts and an inlay ring. */
function chipMaterials([color, dash]: readonly [string, string]) {
  const face = texture(256, 256, (g) => {
    g.fillStyle = color;
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = dash;
    for (let i = 0; i < 8; i++) {
      g.save();
      g.translate(128, 128);
      g.rotate((i * Math.PI) / 4);
      g.fillRect(-15, -128, 30, 34);
      g.restore();
    }
    g.strokeStyle = dash;
    g.globalAlpha = 0.6;
    g.lineWidth = 3;
    g.beginPath();
    g.arc(128, 128, 76, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([6, 8]);
    g.beginPath();
    g.arc(128, 128, 64, 0, Math.PI * 2);
    g.stroke();
  });
  const side = texture(512, 16, (g) => {
    g.fillStyle = color;
    g.fillRect(0, 0, 512, 16);
    g.fillStyle = dash;
    for (let i = 0; i < 8; i++) g.fillRect(i * 64 + 16, 0, 30, 16);
  });
  const mat = (map: THREE.Texture) =>
    new THREE.MeshStandardMaterial({ map, roughness: 0.55, metalness: 0.05 });
  return [mat(side), mat(face), mat(face)];
}

interface Chip {
  base: THREE.Vector3;
  rot: THREE.Euler;
  scatter: THREE.Vector3;
  spin: THREE.Vector3;
  delay: number;
}

/** Stacks around the diya, plus a few loose chips, grouped by denomination for instancing. */
function layout(): Chip[][] {
  const rand = seeded(11);
  const out: Chip[][] = CHIPS.map(() => []);
  const add = (c: number, base: THREE.Vector3, rot: THREE.Euler, delay: number) => {
    const out2 = new THREE.Vector3(base.x, 0, base.z).normalize();
    out[c]!.push({
      base,
      rot,
      scatter: out2.multiplyScalar(1.6 + rand() * 3).setY(0.6 + base.y + rand() * 0.9),
      spin: new THREE.Vector3((rand() - 0.5) * 6, (rand() - 0.5) * 4, (rand() - 0.5) * 6),
      delay,
    });
  };
  const stacks = [
    { x: -1.3, z: 0.25, n: 9, c: 2 },
    { x: -0.95, z: -0.85, n: 6, c: 4 },
    { x: 1.15, z: 0.5, n: 7, c: 1 },
    { x: 1.5, z: -0.55, n: 12, c: 5 },
    { x: 0.4, z: 1.3, n: 4, c: 0 },
    { x: -0.35, z: -1.5, n: 5, c: 3 },
    { x: 0.55, z: -1.15, n: 3, c: 0 },
  ];
  stacks.forEach((s, si) => {
    for (let i = 0; i < s.n; i++) {
      const c = i === s.n - 1 && rand() > 0.5 ? (s.c + 1) % CHIPS.length : s.c;
      const base = new THREE.Vector3(s.x + (rand() - 0.5) * 0.03, H / 2 + i * H, s.z + (rand() - 0.5) * 0.03);
      add(c, base, new THREE.Euler(0, rand() * Math.PI, 0), si * 0.07 + i * 0.035);
    }
  });
  const loose = [
    { x: 0.85, z: 1.05, c: 2 },
    { x: -0.8, z: 0.95, c: 1 },
    { x: -1.75, z: -0.3, c: 0 },
    { x: 1.9, z: 0.35, c: 4 },
  ];
  loose.forEach((l, i) =>
    add(
      l.c,
      new THREE.Vector3(l.x, H / 2, l.z),
      new THREE.Euler((rand() - 0.5) * 0.08, rand() * Math.PI, (rand() - 0.5) * 0.08),
      0.5 + i * 0.06,
    ),
  );
  return out;
}

const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const smooth = (t: number) => t * t * (3 - 2 * t);

function Chips({ scroll, born }: { scroll: React.RefObject<number>; born: React.RefObject<number> }) {
  const groups = useMemo(() => layout(), []);
  const geo = useMemo(() => new THREE.CylinderGeometry(R, R, H, 48), []);
  const mats = useMemo(() => CHIPS.map(chipMaterials), []);
  const meshes = useRef<(THREE.InstancedMesh | null)[]>([]);
  const tmp = useMemo(() => ({ o: new THREE.Object3D(), last: -1 }), []);
  useEffect(
    () => () => {
      geo.dispose();
      mats.flat().forEach((m) => {
        m.map?.dispose();
        m.dispose();
      });
    },
    [geo, mats],
  );
  useFrame(({ clock }) => {
    const t = clock.elapsedTime - (born.current ?? 0);
    const p = smooth(scroll.current ?? 0);
    const key = t < LIT + 1 ? t : p + 1000; // after the drop, only redraw when scroll moves
    if (key === tmp.last) return;
    tmp.last = key;
    groups.forEach((chips, gi) => {
      const mesh = meshes.current[gi];
      if (!mesh) return;
      chips.forEach((c, i) => {
        const drop = ease((t - c.delay) / 0.45);
        const o = tmp.o;
        o.position.copy(c.base).addScaledVector(c.scatter, p);
        o.position.y += (1 - drop) * 2.5;
        o.rotation.set(
          c.rot.x + c.spin.x * p,
          c.rot.y + c.spin.y * p + (1 - drop) * 2,
          c.rot.z + c.spin.z * p,
        );
        o.updateMatrix();
        mesh.setMatrixAt(i, o.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    });
  });
  return groups.map((chips, gi) => (
    <instancedMesh
      key={gi}
      ref={(m) => {
        meshes.current[gi] = m;
      }}
      args={[geo, mats[gi], chips.length]}
      castShadow
      receiveShadow
    />
  ));
}

/** Clay lamp: a lathed bowl with a pinched spout, oil, wick. */
function Diya() {
  const geo = useMemo(() => {
    const pts = [
      [0, 0],
      [0.2, 0],
      [0.3, 0.03],
      [0.4, 0.11],
      [0.46, 0.21],
      [0.44, 0.22],
      [0.36, 0.15],
      [0.22, 0.12],
      [0, 0.11],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const g = new THREE.LatheGeometry(pts, 64);
    // pull one side out into a spout
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const a = Math.atan2(z, x);
      const pull = Math.pow(Math.max(0, Math.cos(a)), 8) * 0.22 * (pos.getY(i) / 0.22);
      pos.setX(i, x * (1 + pull));
    }
    g.computeVertexNormals();
    return g;
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <group>
      <mesh geometry={geo} castShadow receiveShadow>
        <meshStandardMaterial color="#9C5A36" roughness={0.92} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.165, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.36, 48]} />
        <meshStandardMaterial color="#3B2A12" roughness={0.15} metalness={0.4} />
      </mesh>
      <mesh position={[0.46, 0.22, 0]} rotation={[0, 0, -0.9]}>
        <cylinderGeometry args={[0.012, 0.016, 0.12, 8]} />
        <meshStandardMaterial color="#2a1a10" />
      </mesh>
    </group>
  );
}

const EMBERS = 70;

function Embers({ lit }: { lit: React.RefObject<number> }) {
  const { geo, mat, speed } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(EMBERS * 3);
    const sp = new Float32Array(EMBERS);
    for (let i = 0; i < EMBERS; i++) {
      pos.set([(Math.random() - 0.5) * 0.3, Math.random() * 3, (Math.random() - 0.5) * 0.3], i * 3);
      sp[i] = 0.15 + Math.random() * 0.35;
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({
      size: 0.022,
      color: '#FFB829',
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return { geo: g, mat: m, speed: sp };
  }, []);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  useFrame(({ clock }, delta) => {
    const a = geo.attributes.position as THREE.BufferAttribute;
    const t = clock.elapsedTime;
    for (let i = 0; i < EMBERS; i++) {
      let y = a.getY(i) + speed[i]! * delta;
      let x = a.getX(i) + Math.sin(t * 1.3 + i) * 0.002;
      if (y > 3) {
        y = 0;
        x = (Math.random() - 0.5) * 0.2;
      }
      a.setXY(i, x, y);
    }
    a.needsUpdate = true;
    mat.opacity = 0.75 * (lit.current ?? 0);
  });
  return <points geometry={geo} material={mat} position={[0.5, 0.35, 0]} />;
}

function Halo({ lit }: { lit: React.RefObject<number> }) {
  const mat = useMemo(() => {
    const map = texture(128, 128, (g) => {
      const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      r.addColorStop(0, 'rgba(255,184,41,0.55)');
      r.addColorStop(0.35, 'rgba(255,122,26,0.18)');
      r.addColorStop(1, 'rgba(255,122,26,0)');
      g.fillStyle = r;
      g.fillRect(0, 0, 128, 128);
    });
    return new THREE.SpriteMaterial({
      map,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  }, []);
  useEffect(
    () => () => {
      mat.map?.dispose();
      mat.dispose();
    },
    [mat],
  );
  useFrame(({ clock }) => {
    mat.opacity =
      (lit.current ?? 0) *
      (0.85 + Math.sin(clock.elapsedTime * 9) * 0.05 + Math.sin(clock.elapsedTime * 3.7) * 0.08);
  });
  return <sprite material={mat} position={[0.5, 0.45, 0]} scale={[1.6, 1.6, 1]} />;
}

function Rig({ scroll, onReady }: { scroll: React.RefObject<number>; onReady: () => void }) {
  const { camera, size } = useThree();
  const born = useRef<number | null>(null);
  const lit = useRef(0);
  const light = useRef<THREE.PointLight>(null);
  const group = useRef<THREE.Group>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const look = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => {
    const move = (e: PointerEvent) => {
      pointer.current = { x: (e.clientX / innerWidth) * 2 - 1, y: (e.clientY / innerHeight) * 2 - 1 };
    };
    addEventListener('pointermove', move, { passive: true });
    return () => removeEventListener('pointermove', move);
  }, []);
  const wide = size.width / size.height > 1.1;
  useFrame(({ clock }) => {
    if (born.current === null) {
      born.current = clock.elapsedTime;
      onReady();
    }
    const t = clock.elapsedTime - born.current;
    const p = scroll.current ?? 0;
    lit.current = ease((t - 0.35) / 0.8);
    if (light.current) {
      const flicker = 0.88 + Math.sin(t * 11) * 0.05 + Math.sin(t * 4.3 + 1) * 0.07;
      light.current.intensity = 9 * lit.current * flicker;
    }
    if (group.current) group.current.position.x = wide ? 1.15 : 0;
    const dist = wide ? 6.6 : 7.8;
    camera.position.lerp(
      new THREE.Vector3(
        pointer.current.x * 0.5,
        (wide ? 2.3 : 3.1) + p * 0.8 - pointer.current.y * 0.25,
        dist + p * 2,
      ),
      0.05,
    );
    look.set(0, wide ? 0.55 : 1.1, 0);
    camera.lookAt(look);
  });
  const bornRef = born as React.RefObject<number>;
  return (
    <group ref={group}>
      <Chips scroll={scroll} born={bornRef} />
      <Diya />
      <group position={[0.55, 0.27, 0]} scale={0.24}>
        <Flame fade={lit} />
      </group>
      <Halo lit={lit} />
      <Embers lit={lit} />
      <pointLight
        ref={light}
        position={[0.53, 0.42, 0]}
        color="#FFB04A"
        intensity={0}
        distance={9}
        decay={1.6}
        castShadow
        shadow-mapSize={[512, 512]}
        shadow-bias={-0.003}
        shadow-radius={4}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#1C130C" roughness={0.9} />
      </mesh>
    </group>
  );
}

/** Hero: a diya lighting a table of chip stacks. Chips drop in on load, scatter as the hero scrolls away. */
export function TableScene({
  scroll,
  active,
  onReady,
}: {
  scroll: React.RefObject<number>;
  active: boolean;
  onReady: () => void;
}) {
  return (
    <Canvas
      aria-hidden
      dpr={[1, 1.75]}
      shadows
      frameloop={active ? 'always' : 'never'}
      camera={{ position: [0, 3, 7], fov: 34 }}
      gl={{ alpha: true, powerPreference: 'high-performance' }}
    >
      <fog attach="fog" args={['#0A0705', 4.5, 11]} />
      <hemisphereLight args={['#5a4632', '#0A0705', 0.35]} />
      <directionalLight position={[-3, 4, -4]} intensity={0.25} color="#C8AD86" />
      <Rig scroll={scroll} onReady={onReady} />
    </Canvas>
  );
}
