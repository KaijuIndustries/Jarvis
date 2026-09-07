// Sparse energy motes — vertex shader
//
// Each mote is a point. We only set its screen size here.
// Position is written from the JS orbit simulation each frame.

attribute float aSize;
attribute float aFlare;

uniform float uPixelRatio;
uniform float uIntensity;
uniform float uAudioLevel;

varying float vFlare;

void main() {
  vFlare = aFlare;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;

  // Perspective scale: closer motes read slightly larger.
  float atten = 2.4 / max(-mv.z, 0.35);
  float pulse = aSize * (1.0 + aFlare * 0.7);
  gl_PointSize = pulse * atten * uPixelRatio * uIntensity;
}
