uniform mat4 uProjectionMatrix;
uniform mat4 uModelViewMatrix;

in vec4 aPos;
in vec4 aNormalAndShininess;
in vec4 aColor;

out vec4 vPos;
out vec4 vNormal;
out vec4 vColor;

void main() {
  vPos = uModelViewMatrix * aPos;
  gl_Position = uProjectionMatrix * vPos;
  vNormal = uModelViewMatrix * vec4(aNormalAndShininess.xyz, 0.0);
  vShininess = aNormalAndShininess.w;
  vColor = aColor;
}
