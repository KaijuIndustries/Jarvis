// Inner energy core — vertex shader
//
// Runs once per vertex of the icosahedron.
// We do two jobs here:
//   1. Nudge the surface so the core is not a perfect sphere.
//   2. Pass world-space positions to the fragment shader so it
//      can walk a ray through the volume (not just paint the skin).

uniform float uTime;
uniform float uDistortion;
uniform float uIntensity;
uniform float uJitter;
uniform float uCoreDrive;

varying vec3 vWorldPos;
varying vec3 vCenter;
varying vec3 vWorldNormal;

// Tiny 3D hash → 0..1. Same idea as in the fragment shader,
// kept short here because the vertex stage only needs a gentle wobble.
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
  // Two slow noise samples at different scales. Added together they
  // stop the silhouette from pulsing as a single obvious sine wave.
  float n1 = valueNoise(position * 2.15 + vec3(uTime * 0.23, 0.4, uTime * 0.11));
  float n2 = valueNoise(position * 3.6 + vec3(uTime * -0.17, uTime * 0.21, 0.8));
  float n3 = valueNoise(position * 1.4 + vec3(0.6, uTime * 0.14, uTime * -0.19));
  float displace = (n1 * 0.5 + n2 * 0.3 + n3 * 0.2) - 0.5;

  float amp = 0.045 + uDistortion * 0.05 + uCoreDrive * 0.035 + uJitter * 0.25;
  vec3 displaced = position + normal * displace * amp * uIntensity;

  vec4 world = modelMatrix * vec4(displaced, 1.0);
  vWorldPos = world.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  // Sphere centre in world space. The orb stays at the origin for now,
  // but this still works if we later move the mesh.
  vCenter = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;

  gl_Position = projectionMatrix * viewMatrix * world;
}
