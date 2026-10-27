'use client';
import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

const COUNT = 1500;
const DURATION = 1.2;

function Burst() {
  const points = useRef<THREE.Points>(null);
  const start = useRef<number | null>(null);
  const { geometry, velocities, material } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(COUNT * 3);
    const col = new Float32Array(COUNT * 3);
    const vel = new Float32Array(COUNT * 3);
    const flame = new THREE.Color('#FFB829');
    const ember = new THREE.Color('#FF7A1A');
    for (let i = 0; i < COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = 1.5 + Math.random() * 3.5;
      vel.set([Math.sin(phi) * Math.cos(theta) * speed, Math.sin(phi) * Math.sin(theta) * speed + 1, Math.cos(phi) * speed], i * 3);
      const c = flame.clone().lerp(ember, Math.random());
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.PointsMaterial({
      size: 0.06,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return { geometry: g, velocities: vel, material: m };
  }, []);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useFrame(({ clock }, delta) => {
    start.current ??= clock.elapsedTime;
    const t = (clock.elapsedTime - start.current) / DURATION;
    const pos = geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < COUNT; i++) {
      velocities[i * 3 + 1]! -= 4 * delta; // gravity
      pos.array[i * 3]! += velocities[i * 3]! * delta;
      pos.array[i * 3 + 1]! += velocities[i * 3 + 1]! * delta;
      pos.array[i * 3 + 2]! += velocities[i * 3 + 2]! * delta;
    }
    pos.needsUpdate = true;
    material.opacity = Math.max(0, 1 - t);
    if (points.current) points.current.visible = t < 1;
  });

  return <points ref={points} geometry={geometry} material={material} position={[0, 1, 0]} />;
}

/** Phuljhadi spark burst over the winner (~1,500 particles, 1.2 s). Lazy-loaded; never on the Live Table. */
export function Sparks() {
  const paused = useRef(false);
  useEffect(() => {
    const onVis = () => (paused.current = document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0">
      <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0, 8], fov: 50 }} frameloop="always" gl={{ alpha: true, antialias: false }}>
        <Burst />
      </Canvas>
    </div>
  );
}
