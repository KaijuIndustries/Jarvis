# Integrating the Jarvis Orb

The Orb is a display component. The Jarvis application chooses a logical
state and may supply audio. The Orb decides how that looks.

It does not know about Ollama, Whisper, Piper, microphones, or Home Assistant.

## 1. Files to copy

Copy the whole folder, minus this guide if you do not want it in the target
repo:

```text
components/orb/
  index.ts
  JarvisOrb.tsx
  OrbScene.tsx
  OrbCore.tsx
  OrbParticles.tsx
  OrbBloom.tsx
  energy.ts
  stateVisuals.ts
  uniforms.ts
  types.ts
  glsl.d.ts
  shaders/
    core.vert.glsl
    core.frag.glsl
    particles.vert.glsl
    particles.frag.glsl
```

Do not copy development leftovers. There is no playground page, no slider
panel, and no fake-audio hook.

## 2. npm packages

Install these in the target Next.js app:

```bash
npm install three @react-three/fiber @react-three/postprocessing postprocessing
npm install -D @types/three raw-loader
```

Versions used while this Orb was frozen:

| Package | Role |
| --- | --- |
| `three` | WebGL renderer and geometry |
| `@react-three/fiber` | React renderer, `Canvas`, `useFrame` |
| `@react-three/postprocessing` | Bloom |
| `postprocessing` | Peer of the bloom effect |
| `@types/three` | TypeScript types |
| `raw-loader` | Turbopack loader so `.glsl` imports as strings |

`@react-three/drei` is **not** required.

Peer versions this Orb was built against: React 19, Next.js 16.

## 3. Next.js config

`.glsl` files must import as source strings. Add both rules — Turbopack
covers `next dev`, webpack covers `next build`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.glsl": {
        loaders: ["raw-loader"],
        as: "*.js",
      },
    },
  },
  webpack: (config) => {
    config.module.rules.push({
      test: /\.glsl$/,
      type: "asset/source",
    });
    return config;
  },
};

export default nextConfig;
```

`components/orb/glsl.d.ts` already declares the module type. Keep that file
on the TypeScript include path (the default `**/*.d.ts` is enough).

## 4. Where it should live

```text
components/orb/     ← copy here
```

Import only from the folder barrel. Internal files (`OrbScene`,
`uniforms`, shaders) are not a public API.

## 5. Import and render

`JarvisOrb` is a client component. It dynamically loads the WebGL scene
with `ssr: false`, so a Server Component page may import it directly.

```tsx
import { JarvisOrb } from "@/components/orb";

export default function Page() {
  return (
    <div className="h-dvh w-full">
      <JarvisOrb state="idle" />
    </div>
  );
}
```

The canvas fills its parent. Give that parent an explicit width and height
(`h-full`, `h-64`, `aspect-square`, etc.). Do not assume a fixed desktop
resolution.

## 6. Control state

```tsx
<JarvisOrb state="listening" />
```

| State | When the parent should send it |
| --- | --- |
| `idle` | Powered, waiting. Default. |
| `listening` | Microphone is open (not wired yet). |
| `thinking` | Model is generating. |
| `speaking` | Piper / TTS is playing (not wired yet). |
| `error` | The parent wants the error look. |

Transitions are sprung inside the Orb. Do not animate uniforms from the
parent.

In this repo the mapping lives in `components/resolveOrbState.ts` and is
applied by `AppShell`:

- Ollama down → `error`
- chat streaming → `thinking`
- otherwise → `idle`

`listening` and `speaking` are reserved for the voice stage.

## 7. Provide audio

All bands are **0 → 1**. Values outside that range are clamped internally.
Zero audio is valid and is how idle / thinking currently run.

Props (updates on React render — fine for infrequent changes):

```tsx
<JarvisOrb
  state="speaking"
  audioLevel={0.4}
  bass={0.35}
  mids={0.2}
  treble={0.1}
/>
```

Ref (no React re-render — use this for live analysers):

```tsx
"use client";

import { useRef } from "react";
import { JarvisOrb, type OrbAudioSource } from "@/components/orb";

export function LiveOrb() {
  const audioRef = useRef<OrbAudioSource>({
    audioLevel: 0,
    bass: 0,
    mids: 0,
    treble: 0,
  });

  // Later: write audioRef.current.* from a Web Audio AnalyserNode
  // inside requestAnimationFrame. Do not call setState per sample.

  return <JarvisOrb state="listening" audioRef={audioRef} />;
}
```

If `audioRef` is set, the numeric audio props are ignored.

## 8. Position in the Jarvis UI

In this app the Orb sits in the chat column above the transcript:

- empty conversation: large, `flex-1`
- active conversation: compact strip (`h-36` / `sm:h-44`)

It stays mounted across those size changes so the WebGL context is not
recreated when the first message arrives.

Place it wherever you want in another layout. It is only a sized `<div>`
that fills itself with a canvas. `pointer-events` are not required —
the Orb does not capture input.

## 9. Client / SSR rules

- Do **not** mark the whole app `"use client"` because of the Orb.
- `JarvisOrb` is `"use client"`.
- `OrbScene` is loaded with `next/dynamic(..., { ssr: false })`.
- Three.js, R3F, and the bloom composer never run on the server.
- No environment variables are required.

Optional: pass `paused` when the Orb is off-screen if you want the clock
frozen without unmounting.

## 10. Environment variables

None.

## Later: microphone and Piper

Do not put capture or TTS inside the Orb.

```text
Microphone  →  Web Audio analyser  →  audioRef + state="listening"
Piper       →  Web Audio analyser  →  audioRef + state="speaking"
Ollama      →  state="thinking"
Idle        →  state="idle"  (audio all zero)
```

The analyser writes `{ audioLevel, bass, mids, treble }` in 0 → 1.
Whisper, Piper, Wyoming, and Home Assistant stay outside this folder.
