in vec4 vPos;
in vec4 vNormal;

uniform bool uTextured;
uniform sampler2D uTexture;

void main() {
  if (uTextured) // color is actually a texture coordinate
    gColor = textureProj(uTexture, vColor.xyz);
  else
    gColor = vColor;
  finish(vPos.xyz / vPos.w, normalize(vNormal.xyz));
}
