'use client';
import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

const flameVertex = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  // cheap 2D noise
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1,0)), u.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);
  }
  void main(){
    vUv = uv;
    vec3 p = position;
    float n = noise(vec2(p.y * 3.0 - uTime * 2.5, uTime));
    p.x += (n - 0.5) * 0.18 * smoothstep(0.0, 1.0, uv.y);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;
const flameFragment = /* glsl */ `
  uniform float uTime;
  uniform float uFade;
  varying vec2 vUv;
  void main(){
    vec2 c = vUv - vec2(0.5, 0.3);
    float shape = 1.0 - smoothstep(0.0, 0.5, length(vec2(c.x * (1.6 + vUv.y * 2.2), c.y * 0.9)));
    vec3 ember = vec3(1.0, 0.478, 0.102);
    vec3 flame = vec3(1.0, 0.722, 0.161);
    vec3 col = mix(ember, flame, smoothstep(0.0, 0.8, vUv.y)) + vec3(0.25) * pow(shape, 4.0);
    gl_FragColor = vec4(col, shape * uFade);
  }
`;

function Flame({ fade }: { fade: React.RefObject<number> }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: flameVertex,
        fragmentShader: flameFragment,
        uniforms: { uTime: { value: 0 }, uFade: { value: 0 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );
  const geo = useMemo(() => new THREE.PlaneGeometry(1.2, 2.2, 1, 32), []);
  useEffect(
    () => () => {
      mat.dispose();
      geo.dispose();
    },
    [mat, geo],
  );
  useFrame(({ clock }) => {
    mat.uniforms.uTime!.value = clock.elapsedTime;
    mat.uniforms.uFade!.value = fade.current ?? 0;
  });
  return <mesh geometry={geo} material={mat} position={[0, 0.3, 0]} />;
}

function Sparks({ fade }: { fade: React.RefObject<number> }) {
  const COUNT = 600;
  const { geo, mat, speed } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(COUNT * 3);
    const sp = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      pos.set([(Math.random() - 0.5) * 8, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 4], i * 3);
      sp[i] = 0.2 + Math.random() * 0.8;
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ size: 0.035, color: '#FFB829', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    return { geo: g, mat: m, speed: sp };
  }, []);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  useFrame((_, delta) => {
    const a = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < COUNT; i++) {
      let y = (a.array[i * 3 + 1] as number) + speed[i]! * delta;
      if (y > 5) y = -5;
      a.array[i * 3 + 1] = y;
    }
    a.needsUpdate = true;
    mat.opacity = 0.7 * (fade.current ?? 0);
  });
  return <points geometry={geo} material={mat} />;
}

/** Diya flame shader + ~600 drifting sparks on a dark field, ≤ 1.6 s, skippable. */
export function DiyaSplash({ onDone }: { onDone: () => void }) {
  const fade = useRef(0);
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = (now - start) / 1600;
      fade.current = t < 0.25 ? t / 0.25 : t > 0.8 ? Math.max(0, (1 - t) / 0.2) : 1;
      if (t >= 1) return onDone();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const onVis = () => document.hidden && onDone();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [onDone]);
  return (
    <div role="presentation" onClick={onDone} className="fixed inset-0 z-50 bg-bg">
      <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0, 4], fov: 50 }} gl={{ alpha: true, antialias: false }}>
        <Sparks fade={fade} />
        <Flame fade={fade} />
      </Canvas>
    </div>
  );
}
