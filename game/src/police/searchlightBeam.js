// The visible beam of a searchlight in the night air: an open cone of unit radius and unit length
// with its apex at the origin pointing down -Y (scale x/z by the radius at the far end, y by the
// length, and turn it onto the beam). Drawn additively without depth writes; it is brightest along
// its axis and near the lens and fades out toward its silhouette edges and its far end, so it reads
// as light in haze rather than a solid grey cone. Set its strength with
// beam.material.uniforms.strength.value (0 hides it in effect; keep beam.visible false when off).
import * as THREE from 'three';

const VERTEX = /* glsl */ `
  attribute float fade;
  varying float vFade;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vFade = fade;
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalMatrix * normal;
    vView = -viewPosition.xyz;
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 tint;
  uniform float strength;
  varying float vFade;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float facing = abs(dot(normalize(vNormal), normalize(vView)));
    float alpha = strength * vFade * facing * facing;
    gl_FragColor = vec4(tint, alpha);
  }
`;

/**
 * Makes a searchlight beam mesh.
 * @param {THREE.ColorRepresentation} [colour] The light's colour.
 * @returns {THREE.Mesh} The beam, named 'police_helicopter_beam'.
 */
export function createSearchlightBeam(colour = 0xfff2dc) {
  const geometry = new THREE.ConeGeometry(1, 1, 32, 8, true);
  // The cone's tip is at +0.5: move it to the origin, the open end one unit down.
  geometry.translate(0, -0.5, 0);
  const position = geometry.attributes.position;
  const fade = new Float32Array(position.count);
  for (let i = 0; i < position.count; i += 1) {
    const t = Math.min(1, Math.max(0, -position.getY(i)));
    fade[i] = 0.04 + 0.96 * Math.pow(1 - t, 1.4);
  }
  geometry.setAttribute('fade', new THREE.BufferAttribute(fade, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: { tint: { value: new THREE.Color(colour) }, strength: { value: 0 } },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
    toneMapped: false,
  });
  const beam = new THREE.Mesh(geometry, material);
  beam.name = 'police_helicopter_beam';
  beam.frustumCulled = false;
  beam.renderOrder = 5;
  return beam;
}
