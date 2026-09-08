// State halo — fragment shader
//
// A frosted glass ring, not a copy of the core filaments. Shape is
// still a broken listen arc or voice-swollen speak band. Colour is
// still the orb palette. The fill is a veil, a glass lip, and dust.

uniform float uListen;
uniform float uSpeak;
uniform vec3 uPhase;
uniform float uLevel;
uniform float uBass;
uniform float uMids;
uniform float uTreble;

varying vec2 vXY;

float blob(float ang, float freq, float phase, float sharpness) {
  return pow(max(0.0, 0.5 + 0.5 * sin(ang * freq + phase)), sharpness);
}

float seed(float id, float salt) {
  return fract(sin(id * 127.1 + salt * 311.7) * 43758.5453);
}

void main() {
  float presence = max(uListen, uSpeak);
  if (presence < 0.01) discard;

  float r = length(vXY);
  vec2 circ = vXY / max(r, 1e-4);
  float ang = atan(circ.y, circ.x);

  float midR = 0.66;

  float outerFade = 1.0 - smoothstep(0.76, 0.88, r);
  float innerFade = smoothstep(0.50, 0.58, r);
  float ring = innerFade * outerFade;

  // --- listening: broken arc ---
  float listenBand = 1.0 - smoothstep(0.0, 0.05, abs(r - midR));
  float listenArc = smoothstep(0.12, 0.6, 0.5 + 0.5 * cos(ang - uPhase.x));
  float listenMask = listenBand * listenArc * uListen;

  // --- speaking: voice blobs, same reach as before ---
  float drive = max(uLevel, max(uBass, max(uMids, uTreble)));
  float amp = (0.05 + drive * 0.22) * 0.7;
  float lobes =
    blob(ang, 3.0, uPhase.x, 2.1) * (0.35 + uBass * 0.9) +
    blob(ang, 5.0, -uPhase.y * 2.0, 2.3) * (0.28 + uMids * 0.85) +
    blob(ang, 8.0, uPhase.z * 2.0, 2.6) * (0.18 + uTreble * 0.7) +
    blob(ang, 2.0, uPhase.y, 1.8) * (0.22 + uLevel * 0.55);
  float swell = amp * lobes;
  float dist = abs(r - midR) - swell;
  float speakBlob = 1.0 - smoothstep(0.0, 0.05 + swell * 0.4, max(dist, 0.0));
  float baseline = 1.0 - smoothstep(0.0, 0.02, abs(r - midR));
  float speakMask = max(speakBlob, baseline * 0.4) * uSpeak;

  float shape = max(listenMask, speakMask) * ring;
  if (shape < 0.012) discard;

  float halfW = 0.05 + swell * 0.55;
  float edge = clamp(abs(r - midR) / max(halfW, 0.02), 0.0, 1.0);

  // Soft veil — hollow through the middle, like frosted glass.
  float veil = pow(max(1.0 - edge, 0.0), 1.55) * 0.38;

  // Slow silk — a gentle brightness walk, not chunky sectors.
  float silk =
    0.5 + 0.5 * sin(ang * 8.0 + uPhase.y * 2.0) * sin(ang * 3.0 - uPhase.x);
  silk = mix(0.55, 1.0, silk * silk) * (1.0 - edge) * 0.32;

  // Thin glass lip on the inner and outer edge of the band.
  float rim = pow(1.0 - smoothstep(0.7, 1.0, edge), 2.8) * 0.7;
  rim *= 0.55 + 0.45 * (0.5 + 0.5 * sin(ang * 2.0 + uPhase.x));

  // Traveling sheen — a couple of highlights sliding around.
  float sheen = pow(max(0.0, sin(ang * 2.0 + uPhase.x * 1.4 + r * 2.5)), 12.0);
  sheen *= (1.0 - edge) * 0.55;

  // Living motes. Stable per-id seeds so they never flicker;
  // uneven rest, size, and breath so they do not read as a necklace.
  float dust = 0.0;
  for (int i = 0; i < 36; i++) {
    float id = float(i);
    float rest = seed(id, 1.0);
    float pace = seed(id, 2.0);
    float lift = seed(id, 3.0);
    float bulk = seed(id, 4.0);
    float will = seed(id, 5.0);
    float huddle = seed(id, 6.0);

    float pack = floor(rest * 5.0);
    float packHome = (pack + 0.5) * 1.2566;
    float theta = mix(rest * 6.28318, packHome + (rest - 0.5) * 0.55, step(0.62, huddle));
    theta += uPhase.x * (0.035 + pace * 0.08);

    float sr = midR + (lift - 0.5) * 0.038 + 0.01 * sin(uPhase.x * 0.11 + id);
    vec2 mote = vec2(cos(theta), sin(theta)) * sr;
    float d = length(vXY - mote);

    float tight = mix(7200.0, 12500.0, bulk);
    float bright = mix(0.28, 0.52, 1.0 - bulk);
    float chosen = step(0.84, will);
    tight = mix(tight, 6800.0, chosen);
    bright = mix(bright, 0.62, chosen);
    float breath = 0.62 + 0.38 * sin(uPhase.x * (0.16 + pace * 0.12) + rest * 6.28318);
    dust += exp(-d * d * tight) * bright * breath;
  }
  dust = min(dust, 0.42);

  float glow = (veil + silk + rim + sheen * 0.7 + dust * 0.85) * shape;
  if (glow < 0.01) discard;

  vec3 ivory = mix(vec3(1.0, 0.93, 0.8), vec3(0.82, 0.98, 0.86), uListen);
  ivory = mix(ivory, vec3(0.38, 0.64, 1.0), uSpeak);
  vec3 amber = mix(vec3(0.86, 0.62, 0.36), vec3(0.34, 0.78, 0.46), uListen);
  amber = mix(amber, vec3(0.14, 0.38, 0.96), uSpeak);
  vec3 bronze = mix(vec3(0.42, 0.28, 0.18), vec3(0.14, 0.34, 0.20), uListen);
  bronze = mix(bronze, vec3(0.05, 0.12, 0.46), uSpeak);

  vec3 col = mix(bronze, amber, smoothstep(0.08, 0.45, glow));
  col = mix(col, ivory, smoothstep(0.55, 0.98, rim + sheen * 0.65 + dust * 0.35));
  col *= mix(vec3(1.0), vec3(0.52, 0.70, 1.35), uSpeak);

  gl_FragColor = vec4(col * glow * 0.9, glow * 0.7);
}
