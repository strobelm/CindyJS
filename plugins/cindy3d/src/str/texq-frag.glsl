precision highp float;

uniform sampler2D uTexture;
out vec2 vPos;

out texture2D FragColor;
void main() {
  FragColor = texture2D(uTexture, vPos);
}
