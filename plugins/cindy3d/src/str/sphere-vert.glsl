uniform mat4 uProjectionMatrix;

uniform mat4 uModelViewMatrix;

in vec4 aCenter;

in vec4 aColor;

in vec4 aRelativeShininessRadius;

out vec3 vViewSpacePos;

out vec3 vViewSpaceCenter;

out vec4 vColor;

out float vRadius;

// ----------------------------------------------------------------------------
// Vertex shader for sphere rendering
// ----------------------------------------------------------------------------
void main() {
  // Compute screen aligned coordinate system
  vec4 viewPosHom = uModelViewMatrix*aCenter;
  vViewSpaceCenter = viewPosHom.xyz / viewPosHom.w;
  vec3 dir = normalize(-vViewSpaceCenter);
  vec3 right = normalize(cross(dir, vec3(0, 1, 0)));
  vec3 up = normalize(cross(right, dir));

  // Copy ins to outs for use in the fragment shader
  vColor = aColor;
  vShininess = aRelativeShininessRadius.z;
  vRadius = aRelativeShininessRadius.w;

  // Cover sphere by quad in front of the real sphere
  vViewSpacePos = vViewSpaceCenter +
	vRadius*(right * aRelativeShininessRadius.x +
                 up * aRelativeShininessRadius.y + dir);

  // Transform position into screen space
  gl_Position = uProjectionMatrix * vec4(vViewSpacePos, 1);
}
