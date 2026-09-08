// Inner energy core — fragment shader
//
// Instead of colouring the mesh surface, each pixel walks a short ray
// from the camera through the sphere and adds up glowing "density".
// That is what makes the centre feel volumetric rather than like a
// painted ball.

// Only declare what this shader reads. The raw bands (level/bass/mids/
// treble) arrive already smoothed and split into the channels below —
// uCoreDrive is bass, uTurbulence is mids, uSpark is treble.
uniform vec3 uPhase;
uniform float uState;
uniform float uIntensity;
uniform float uDistortion;
uniform float uRadius;
uniform float uJitter;
uniform float uEnergy;
uniform float uCoreDrive;
uniform float uTurbulence;
uniform float uSpark;
uniform float uFlow;
uniform float uSize;
uniform float uListen;
uniform float uSpeak;

varying vec3 vWorldPos;
varying vec3 vCenter;
varying vec3 vWorldNormal;

// ---------------------------------------------------------------------------
// Procedural noise
// ---------------------------------------------------------------------------

// Hash: a stable pseudo-random 0..1 value from a 3D point.
float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.11, 0.17, 0.23));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

// Value noise: interpolate hashes at the eight surrounding cell corners.
// The f * f * (3 - 2f) curve is a smoothstep, so we do not see a grid.
float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);

  return mix(
    mix(
      mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
      mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x),
      f.y
    ),
    mix(
      mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
      mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x),
      f.y
    ),
    f.z
  );
}

// Fractal Brownian Motion: stack octaves of noise.
// Each octave is twice as detailed and half as strong, which looks organic.
float fbm(vec3 p) {
  float value = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    value += amp * noise(p);
    // Scale + a slight shear so later octaves do not line up with the first.
    p = p * 2.03 + vec3(1.7, 9.2, 3.4);
    amp *= 0.5;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Density: how much energy exists at a point inside the core
// p is in unit-sphere space (length 0 at centre, 1 at the mesh surface)
// ---------------------------------------------------------------------------

float energyDensity(vec3 p) {
  float r = max(length(p), 0.0001);
  vec3 dir = p / r;

  // Circulation is a looping angle, not a growing clock, so the field
  // returns to the same pose every turn instead of drifting forever.
  float cs = cos(uPhase.x);
  float sn = sin(uPhase.x);
  vec3 circulating = vec3(cs * p.x + sn * p.z, p.y, -sn * p.x + cs * p.z);
  vec2 loop = vec2(cos(uPhase.y), sin(uPhase.y));

  vec3 probe = circulating + (hash(circulating * 3.1 + vec3(loop, uPhase.z)) - 0.5) * uJitter * 0.45;

  // 3D flow field on top of the circulation. Sampled on a circle so
  // the drift repeats instead of marching through noise space.
  float rate = 0.32 * uFlow;
  vec3 drift = vec3(
    fbm(probe + vec3(loop.x * rate, 0.35, 1.1)),
    fbm(probe + vec3(2.4, -loop.y * rate * 0.83, 0.6)),
    fbm(probe + vec3(0.7, 1.9, loop.x * rate * 1.17))
  );
  // Mids (uTurbulence) and bass (uCoreDrive) both stir the field, but
  // at gains you can actually see. These used to sit near 0.12, which
  // moved warpAmt by under 1% across the whole state range.
  float warpAmt = 0.36 + uDistortion * 0.2 + uCoreDrive * 0.45 + uTurbulence * 0.5;
  vec3 advected = probe + (drift - 0.5) * warpAmt;

  // Mids also break the ribbons into finer, busier structure.
  float n = fbm(advected * (2.15 + uTurbulence * 0.9) + drift * 0.45);
  // Treble lives here: fast, small, high-frequency detail.
  float fine = fbm(advected * (4.7 + uSpark * 3.2) + vec3(drift.z, loop.y * 0.4, drift.x));

  // Tight ridges so the volume stays readable. Wide ridges filled
  // the orb with light and crushed the interior.
  float ribbon = pow(max(1.0 - abs(n - 0.52) * 7.4, 0.0), 4.2);
  float hair = pow(max(1.0 - abs(fine - 0.5) * 9.0, 0.0), 6.0);

  // Directional swell. uSize is only driven while listening or speaking,
  // so idle keeps its exact resting shape. The lobes drift with time and
  // are sampled per direction, so the silhouette deforms and travels
  // instead of scaling uniformly like a zoom.
  float lobe = fbm(dir * 1.7 + vec3(2.3, loop.x * 0.55, 0.9)) - 0.5;
  float swell = uSize * (0.5 + lobe);

  // Energy lives in a shell. The centre stays mostly hollow.
  // Bass pulls the shell inward and lights the hollow, so a low note
  // reads as a deep pulse rather than a change of size.
  float shellR = 0.64 - uCoreDrive * 0.12 + swell * 0.18;
  float shell = exp(-pow((r - shellR) / 0.30, 2.0));
  float heart = exp(-r * r * 14.0) * (0.07 + uCoreDrive * 0.1);
  // The outer edge, not the march sphere, is what you see as the shape.
  float envelope = smoothstep(1.06 + swell * 0.2, 0.38, r);

  float pool = mix(0.88, 1.1, fbm(dir * 1.7 + drift));

  float local = heart + shell * (0.1 + ribbon * 1.05 + hair * (0.32 + uSpark * 1.3));
  return local * envelope * pool;
}

// Ray vs sphere at the origin of local space. Returns entry/exit t,
// or (-1, -1) if the ray misses. t is distance along the ray.
vec2 intersectSphere(vec3 ro, vec3 rd, float radius) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - radius * radius;
  float h = b * b - c;
  if (h < 0.0) return vec2(-1.0);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}

void main() {
  // Rebuild the view ray in world space, then shift into local sphere space.
  vec3 rd = normalize(vWorldPos - cameraPosition);
  vec3 ro = cameraPosition - vCenter;

  // March a padded sphere so the density envelope defines the silhouette.
  // If the march sphere and the envelope coincide, the edge is hard-clipped
  // to a perfect sphere and no amount of deformation can show through.
  const float MARCH_PAD = 1.32;
  vec2 hit = intersectSphere(ro, rd, uRadius * MARCH_PAD);
  if (hit.y < 0.0) discard;

  float tStart = max(hit.x, 0.0);
  float tEnd = hit.y;
  float span = max(tEnd - tStart, 0.0001);

  // Resting glow. Idle and thinking share this so a think swap does
  // not drop the breath term in one frame.
  float isRest = 1.0 - step(0.5, min(abs(uState), abs(uState - 2.0)));
  float inhale = 0.5 + 0.5 * sin(uPhase.y);
  float rest = 0.5 + 0.5 * sin(uPhase.x + 1.4);
  float idleBreath = inhale * 0.72 + rest * 0.28;
  idleBreath = idleBreath * idleBreath * (3.0 - 2.0 * idleBreath);

  float isError = 1.0 - step(0.5, abs(uState - 4.0));
  float live = uIntensity * (
    0.86
    + idleBreath * isRest * 0.18
    + uEnergy * 0.32
    + uCoreDrive * 0.2
  );
  live *= 1.0 + isError * 0.12 * step(0.88, hash(vec3(floor(uPhase.z * 12.0), 1.7, 0.3)));

  // Walk the ray. 14 steps is enough for this small volume at 60fps.
  const int STEPS = 14;
  float stepSize = span / float(STEPS);

  // The ray span grows with uRadius, so an expanding Orb would also
  // get brighter for free. Cancel most of that so swelling reads as
  // size rather than as a flash.
  float spanComp = 1.0 / (1.0 + max(uSize, 0.0) * 0.5);

  vec3 accumulated = vec3(0.0);
  float alpha = 0.0;

  // Warm palette: ivory on ribbon crests, amber filaments, bronze hollow.
  // Listening and speaking only retint these three stops. Idle, thinking
  // and error keep the original mix (error already leans red).
  vec3 ivory = mix(vec3(1.0, 0.93, 0.8), vec3(0.96, 0.84, 0.8), isError * 0.35);
  vec3 amber = mix(vec3(0.86, 0.62, 0.36), vec3(0.74, 0.4, 0.32), isError * 0.5);
  vec3 bronze = mix(vec3(0.42, 0.28, 0.18), vec3(0.36, 0.2, 0.18), isError * 0.4);
  ivory = mix(ivory, vec3(0.82, 0.98, 0.86), uListen);
  amber = mix(amber, vec3(0.34, 0.78, 0.46), uListen);
  bronze = mix(bronze, vec3(0.14, 0.34, 0.20), uListen);
  ivory = mix(ivory, vec3(0.38, 0.64, 1.0), uSpeak);
  amber = mix(amber, vec3(0.14, 0.38, 0.96), uSpeak);
  bronze = mix(bronze, vec3(0.05, 0.12, 0.46), uSpeak);

  for (int i = 0; i < STEPS; i++) {
    float t = tStart + (float(i) + 0.5) * stepSize;
    vec3 worldP = cameraPosition + rd * t;
    vec3 localP = (worldP - vCenter) / uRadius;

    float density = energyDensity(localP) * live;

    vec3 tone = mix(bronze, amber, smoothstep(0.1, 0.42, density));
    tone = mix(tone, ivory, smoothstep(0.55, 0.95, density));

    vec3 glow = tone * density * stepSize * 5.4 * spanComp;
    accumulated += glow * (1.0 - alpha);
    alpha += density * stepSize * 1.15 * spanComp * (1.0 - alpha);
  }

  vec3 dir = normalize(vWorldPos - vCenter);
  vec2 loop = vec2(cos(uPhase.y), sin(uPhase.y));
  float limbBreak = fbm(dir * 2.6 + vec3(loop.x * 0.3, loop.y * 0.3, 0.8));
  accumulated *= mix(0.55, 1.0, smoothstep(0.28, 0.7, limbBreak));
  // Additive stacking bleaches a blue palette toward white. Re-weight
  // the finished volume so speaking stays clearly blue.
  accumulated *= mix(vec3(1.0), vec3(0.52, 0.70, 1.35), uSpeak);

  gl_FragColor = vec4(accumulated * 0.5, 1.0);
}
