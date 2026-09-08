"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  type ShaderMaterial,
} from "three";
import particlesFrag from "./shaders/particles.frag.glsl";
import particlesVert from "./shaders/particles.vert.glsl";
import { useOrbUniforms } from "./uniforms";

const COUNT = 18;

if (typeof particlesVert !== "string" || typeof particlesFrag !== "string") {
  throw new Error("Orb particle shaders did not load as strings.");
}

function fract(n: number) {
  return n - Math.floor(n);
}

function seed(i: number, salt: number) {
  return fract(Math.sin(i * 127.1 + salt * 311.7) * 43758.5453);
}

type Mote = {
  radius: number;
  speed: number;
  angle: number;
  ecc: number;
  size: number;
  flareRate: number;
  flarePhase: number;
  // Orthonormal basis for a unique orbit plane.
  bx: [number, number, number];
  by: [number, number, number];
};

const TAU = Math.PI * 2;
const ORBIT_SCALE = 0.24;

function wrapTau(phase: number) {
  const wrapped = phase % TAU;
  return wrapped < 0 ? wrapped + TAU : wrapped;
}

function createMotes(): Mote[] {
  const motes: Mote[] = [];

  for (let i = 0; i < COUNT; i += 1) {
    const u = seed(i, 1);
    const v = seed(i, 2);
    const theta = Math.acos(2 * u - 1);
    const phi = v * Math.PI * 2;
    const nx = Math.sin(theta) * Math.cos(phi);
    const ny = Math.cos(theta);
    const nz = Math.sin(theta) * Math.sin(phi);

    // Build a basis around the random orbit-plane normal.
    const helper =
      Math.abs(ny) < 0.9 ? ([0, 1, 0] as const) : ([1, 0, 0] as const);
    let bx0 = helper[1] * nz - helper[2] * ny;
    let bx1 = helper[2] * nx - helper[0] * nz;
    let bx2 = helper[0] * ny - helper[1] * nx;
    const bxLen = Math.hypot(bx0, bx1, bx2) || 1;
    bx0 /= bxLen;
    bx1 /= bxLen;
    bx2 /= bxLen;
    const by0 = ny * bx2 - nz * bx1;
    const by1 = nz * bx0 - nx * bx2;
    const by2 = nx * bx1 - ny * bx0;

    motes.push({
      // A few close to the field, most in a loose outer band.
      radius: 1.08 + seed(i, 3) * 0.95,
      speed: 0.017 + seed(i, 4) * 0.029,
      angle: seed(i, 5) * Math.PI * 2,
      ecc: 0.04 + seed(i, 6) * 0.1,
      size: 7 + seed(i, 7) * 6,
      flareRate: 0.075 + seed(i, 8) * 0.12,
      flarePhase: seed(i, 9) * Math.PI * 2,
      bx: [bx0, bx1, bx2],
      by: [by0, by1, by2],
    });
  }

  return motes;
}

export function OrbParticles() {
  const store = useOrbUniforms();
  const matRef = useRef<ShaderMaterial>(null);
  const motes = useMemo(createMotes, []);

  const { geometry, positions, flares } = useMemo(() => {
    const positions = new Float32Array(COUNT * 3);
    const flares = new Float32Array(COUNT);
    const sizes = new Float32Array(COUNT);
    motes.forEach((mote, i) => {
      sizes[i] = mote.size;
    });

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    geometry.setAttribute("aSize", new BufferAttribute(sizes, 1));
    geometry.setAttribute("aFlare", new BufferAttribute(flares, 1));
    return { geometry, positions, flares };
  }, [motes]);

  // Initial values only. The live values live on the material.
  const initialUniforms = useMemo(
    () => ({
      uPixelRatio: { value: 1 },
      uIntensity: { value: 1 },
      uAudioLevel: { value: 0 },
      uPulse: { value: 0 },
      uSpark: { value: 0 },
      uListen: { value: 0 },
      uSpeak: { value: 0 },
    }),
    [],
  );

  useFrame(({ gl }, delta) => {
    // ShaderMaterial clones its constructor uniforms, so the prop object
    // is a detached copy. Only writes through the material are rendered.
    const live = matRef.current?.uniforms;
    if (!live) return;

    const src = store.current;
    live.uPixelRatio.value = Math.min(gl.getPixelRatio(), 1.75);
    live.uIntensity.value = src.intensity;
    live.uListen.value = src.listenTint;
    live.uSpeak.value = src.speakTint;

    if (src.paused > 0.5) return;
    if (typeof document !== "undefined" && document.hidden) return;
    const step = Math.min(Math.max(delta, 0), 0.05);
    const listen = src.listenTint;
    const speak = src.speakTint;

    for (let i = 0; i < COUNT; i += 1) {
      const mote = motes[i];
      mote.angle = wrapTau(mote.angle + mote.speed * ORBIT_SCALE * step);
      mote.flarePhase = wrapTau(
        mote.flarePhase + mote.flareRate * ORBIT_SCALE * step,
      );
      const wave = Math.sin(mote.flarePhase);
      const rest = Math.min(1, Math.pow(Math.max(wave, 0), 10));
      // Speak: a ring of brightness walks the swarm. Listen: a steady
      // inner glow. Neither writes the core springs.
      const stagger = 0.5 + 0.5 * Math.sin(src.phaseMain * 2 + mote.flarePhase);
      const flare = Math.min(
        1,
        rest + speak * 0.48 * stagger * stagger + listen * 0.2,
      );
      flares[i] = flare;

      const inward = listen * 0.12 * (0.55 + 0.45 * Math.sin(mote.flarePhase));
      const radial = 1 - inward + speak * 0.12;
      const pull = 1 - flare * 0.16;
      const r =
        mote.radius * (1 + mote.ecc * Math.cos(mote.angle)) * pull * radial;
      const x = r * Math.cos(mote.angle);
      const y = r * Math.sin(mote.angle);

      positions[i * 3] = mote.bx[0] * x + mote.by[0] * y;
      positions[i * 3 + 1] = mote.bx[1] * x + mote.by[1] * y;
      positions[i * 3 + 2] = mote.bx[2] * x + mote.by[2] * y;
    }

    const posAttr = geometry.getAttribute("position") as BufferAttribute;
    const flareAttr = geometry.getAttribute("aFlare") as BufferAttribute;
    posAttr.needsUpdate = true;
    flareAttr.needsUpdate = true;
  });

  return (
    <points geometry={geometry} renderOrder={4} frustumCulled={false}>
      <shaderMaterial
        ref={matRef}
        uniforms={initialUniforms}
        vertexShader={particlesVert}
        fragmentShader={particlesFrag}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        toneMapped={false}
        fog={false}
      />
    </points>
  );
}
