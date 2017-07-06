// Sphere mode: -1 = front, +1 = back
uniform float sphereMode;

// Surface position in view space
in vec3 vViewSpacePos;

in vec3 vViewSpaceCenter;

in float vRadius;

// ----------------------------------------------------------------------------
// Fragment shader for sphere rendering
// ----------------------------------------------------------------------------
void main() {
  gColor = vColor;
  vec3 pointOnSphere =
    sphere(vViewSpacePos, vViewSpaceCenter, vRadius, sphereMode);
  vec3 normal = normalize(pointOnSphere - vViewSpaceCenter);
  finish(pointOnSphere, normal);
}
