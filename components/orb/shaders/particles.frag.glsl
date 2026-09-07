// Sparse energy motes — fragment shader
//
// Soft radial spark. gl_PointCoord is 0..1 across the point sprite.
// Hard squares are the usual giveaway of a cheap particle system.

uniform float uIntensity;
uniform float uPulse;

varying float vFlare;

void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float d = length(uv);
  if (d > 1.0) discard;

  float hot = exp(-d * d * 5.2);
  float halo = exp(-d * d * 1.7) * 0.28;
  float spark = (hot + halo) * (0.32 + vFlare * 0.85 + uPulse * 0.1);

  vec3 amber = vec3(0.80, 0.54, 0.28);
  vec3 ivory = vec3(0.98, 0.92, 0.78);
  vec3 col = mix(amber, ivory, hot * (0.35 + vFlare * 0.5));

  gl_FragColor = vec4(col * spark * uIntensity, 1.0);
}
