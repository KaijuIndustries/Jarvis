// Thinking satellites — fragment shader
//
// A short volume march in the same language as the core: hollow
// shell, ribbons, hair, ivory / amber / bronze. Presence is uThink.

uniform float uThink;
uniform float uPulse;
uniform float uSlot;
uniform float uRadius;
uniform vec3 uPhase;

varying vec3 vWorldPos;
varying vec3 vCenter;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.11, 0.17, 0.23));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

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

float fbm(vec3 p) {
  float value = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    value += amp * noise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.4);
    amp *= 0.5;
  }
  return value;
}

float energyDensity(vec3 p) {
  float r = max(length(p), 0.0001);
  vec3 dir = p / r;
  float cs = cos(uPhase.x + uSlot * 0.6);
  float sn = sin(uPhase.x + uSlot * 0.6);
  vec3 circulating = vec3(cs * p.x + sn * p.z, p.y, -sn * p.x + cs * p.z);
  vec2 loop = vec2(cos(uPhase.y + uSlot), sin(uPhase.y + uSlot * 0.7));

  vec3 probe = circulating;
  vec3 drift = vec3(
    fbm(probe + vec3(loop.x * 0.28, 0.35, 1.1)),
    fbm(probe + vec3(2.4, -loop.y * 0.23, 0.6)),
    fbm(probe + vec3(0.7, 1.9, loop.x * 0.33))
  );
  vec3 advected = probe + (drift - 0.5) * (0.42 + uPulse * 0.12);

  float n = fbm(advected * 2.2 + drift * 0.4);
  float fine = fbm(advected * 4.6 + vec3(drift.z, loop.y * 0.4, drift.x));
  float ribbon = pow(max(1.0 - abs(n - 0.52) * 7.4, 0.0), 4.2);
  float hair = pow(max(1.0 - abs(fine - 0.5) * 9.0, 0.0), 6.0);

  float lobe = fbm(dir * 1.7 + vec3(2.3, loop.x * 0.55, 0.9 + uSlot)) - 0.5;
  float shellR = 0.62 + lobe * 0.1 + uPulse * 0.04;
  float shell = exp(-pow((r - shellR) / 0.30, 2.0));
  float heart = exp(-r * r * 14.0) * 0.08;
  float envelope = smoothstep(1.08 + lobe * 0.12, 0.36, r);
  float pool = mix(0.88, 1.1, fbm(dir * 1.7 + drift));
  return (heart + shell * (0.1 + ribbon * 1.05 + hair * 0.36)) * envelope * pool;
}

vec2 intersectSphere(vec3 ro, vec3 rd, float radius) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - radius * radius;
  float h = b * b - c;
  if (h < 0.0) return vec2(-1.0);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}

void main() {
  if (uThink < 0.01) discard;

  vec3 rd = normalize(vWorldPos - cameraPosition);
  vec3 ro = cameraPosition - vCenter;
  const float MARCH_PAD = 1.28;
  vec2 hit = intersectSphere(ro, rd, uRadius * MARCH_PAD);
  if (hit.y < 0.0) discard;

  float tStart = max(hit.x, 0.0);
  float tEnd = hit.y;
  float span = max(tEnd - tStart, 0.0001);
  const int STEPS = 10;
  float stepSize = span / float(STEPS);

  vec3 ivory = vec3(0.96, 0.98, 1.0);
  vec3 amber = vec3(0.78, 0.84, 0.92);
  vec3 bronze = vec3(0.42, 0.48, 0.58);

  float live = (0.88 + uPulse * 0.28) * uThink;
  vec3 accumulated = vec3(0.0);
  float alpha = 0.0;

  for (int i = 0; i < STEPS; i++) {
    float t = tStart + (float(i) + 0.5) * stepSize;
    vec3 worldP = cameraPosition + rd * t;
    vec3 localP = (worldP - vCenter) / max(uRadius, 0.001);
    float density = energyDensity(localP) * live;
    vec3 tone = mix(bronze, amber, smoothstep(0.1, 0.42, density));
    tone = mix(tone, ivory, smoothstep(0.55, 0.95, density));
    vec3 glow = tone * density * stepSize * 6.2;
    accumulated += glow * (1.0 - alpha);
    alpha += density * stepSize * 1.2 * (1.0 - alpha);
  }

  vec3 dir = normalize(vWorldPos - vCenter);
  vec2 loop = vec2(cos(uPhase.y + uSlot), sin(uPhase.y));
  float limbBreak = fbm(dir * 2.6 + vec3(loop.x * 0.3, loop.y * 0.3, 0.8));
  accumulated *= mix(0.55, 1.0, smoothstep(0.28, 0.7, limbBreak));

  if (length(accumulated) < 0.012) discard;
  gl_FragColor = vec4(accumulated * 0.62, 1.0);
}
