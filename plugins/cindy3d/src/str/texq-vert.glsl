#version 300 es
precision highp float;

in vec4 aPos;
out vec2 vPos;

void main() {
  vPos = aPos.zw;
  gl_Position = vec4(aPos.xy, 0, 1);
}
