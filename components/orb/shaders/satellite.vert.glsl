// Thinking satellites — vertex shader
//
// Same job as the core: nudge the proxy so the silhouette is not a
// perfect sphere, then pass world positions for a short volume march.

uniform float uPulse;
uniform float uSlot;
uniform vec3 uPhase;

varying vec3 vWorldPos;
varying vec3 vCenter;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float valueNoise(vec3 x) {
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

void main() {
  vec2 loop = vec2(cos(uPhase.y + uSlot), sin(uPhase.y + uSlot * 0.7));
  vec2 slow = vec2(cos(uPhase.x + uSlot * 1.3), sin(uPhase.x));
  float n1 = valueNoise(position * 2.1 + vec3(loop.x * 0.4, 0.4, loop.y * 0.3));
  float n2 = valueNoise(position * 3.5 + vec3(slow.y * 0.35, loop.x * 0.4, 0.8));
  float n3 = valueNoise(position * 1.4 + vec3(0.6, slow.x * 0.3, loop.y * -0.35));
  float displace = (n1 * 0.5 + n2 * 0.3 + n3 * 0.2) - 0.5;
  float amp = 0.07 + uPulse * 0.03;
  vec3 displaced = position + normal * displace * amp;

  vec4 world = modelMatrix * vec4(displaced, 1.0);
  vWorldPos = world.xyz;
  vCenter = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
