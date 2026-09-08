// State halo — vertex shader
//
// A square in XY. The fragment shader carves the ring, so there is
// no mesh join for the band to split on.

varying vec2 vXY;

void main() {
  vXY = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
