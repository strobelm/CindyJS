#version 300 es
precision highp float;

uniform sampler2D uTexture;
in vec2 vPos;

out vec4 FragColor;
void main() {
  FragColor = texture(uTexture, vPos);
}
