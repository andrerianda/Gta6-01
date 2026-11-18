// The visible beam of a searchlight in the night air: an open cone of unit radius and unit length
// with its apex at the origin pointing down -Y (scale x/z by the radius at the far end, y by the
// length, and turn it onto the beam), with dust motes drifting inside it. Drawn additively without
// depth writes; the cone is brightest near the lens and fades toward its far end, and it keeps a
// soft floor of light even when seen down its axis (from the car the beam is on) so it reads as
// light in haze against the night sky rather than vanishing edge-on; the wall near a viewer standing
// inside the cone's wide end is faded out so it never fogs the frame. The motes are one Points draw
// (a child of the cone, so they follow it) that glint as they turn through the light. Set the
// strength of both with beam.material.uniforms.strength.value (keep beam.visible false when off)
// and advance the motes with stepSearchlightBeam(beam, dt).
import * as THREE from 'three';

/** Dust motes in the beam (one draw). */
const MOTE_COUNT = 360;

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
    // Soft silhouette edges, and a floor so a beam seen along its axis still glows.
    float body = 0.22 + 0.78 * smoothstep(0.0, 0.6, facing);
    // The wall right around a viewer inside the wide far end would wash the whole frame: only
    // the beam further off (the shaft up to the lens) shows.
    float away = smoothstep(8.0, 45.0, length(vView));
    gl_FragColor = vec4(tint, strength * vFade * body * away);
  }
`;

const MOTE_VERTEX = /* glsl */ `
  attribute vec4 seed;
  uniform float time;
  varying float vGlint;
  void main() {
    float t = fract(seed.x + time * 0.006);
    float y = -mix(0.04, 0.98, t);
    float angle = seed.y + time * (0.05 + 0.08 * seed.w);
    float r = seed.z * -y * 0.92;
    vec3 p = vec3(cos(angle) * r, y, sin(angle) * r);
    vec4 viewPosition = modelViewMatrix * vec4(p, 1.0);
    float distance = max(1.0, -viewPosition.z);
    gl_PointSize = clamp(90.0 / distance, 1.5, 5.0);
    // Brighter near the lens, twinkling as each mote turns its faces to the light.
    vGlint = pow(1.0 - t, 1.2) * (0.45 + 0.55 * sin(time * (1.5 + 3.0 * seed.w) + seed.y * 7.0) * 0.5 + 0.275);
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const MOTE_FRAGMENT = /* glsl */ `
  uniform vec3 tint;
  uniform float strength;
  varying float vGlint;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = dot(c, c) * 4.0;
    if (d > 1.0) discard;
    gl_FragColor = vec4(tint, strength * 2.6 * vGlint * (1.0 - d));
  }
`;

/**
 * Makes a searchlight beam mesh (with its dust motes as a child).
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
    fade[i] = 0.06 + 0.94 * Math.pow(1 - t, 1.25);
  }
  geometry.setAttribute('fade', new THREE.BufferAttribute(fade, 1));
  const uniforms = { tint: { value: new THREE.Color(colour) }, strength: { value: 0 } };
  const material = new THREE.ShaderMaterial({
    uniforms,
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
  const motes = createMotes(uniforms);
  beam.add(motes);
  beam.userData.motes = motes;
  return beam;
}

/**
 * Advances the beam's dust motes (call each frame while it shows).
 * @param {THREE.Mesh} beam What createSearchlightBeam made.
 * @param {number} dt Seconds.
 */
export function stepSearchlightBeam(beam, dt) {
  const motes = beam?.userData?.motes;
  if (motes) motes.material.uniforms.time.value += dt;
}

/** The motes: seeds in the unit cone, placed and drifted on the GPU; shares the beam's tint and strength. */
function createMotes(uniforms) {
  const seeds = new Float32Array(MOTE_COUNT * 4);
  let s = 0x9e3779b9;
  const next = () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
  for (let i = 0; i < MOTE_COUNT; i += 1) {
    seeds[i * 4] = next();
    seeds[i * 4 + 1] = next() * Math.PI * 2;
    seeds[i * 4 + 2] = Math.sqrt(next());
    seeds[i * 4 + 3] = next();
  }
  const geometry = new THREE.BufferGeometry();
  // Positions are made in the shader; this attribute only sets the count (and a bound).
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MOTE_COUNT * 3), 3));
  geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
  const material = new THREE.ShaderMaterial({
    uniforms: { tint: uniforms.tint, strength: uniforms.strength, time: { value: 0 } },
    vertexShader: MOTE_VERTEX,
    fragmentShader: MOTE_FRAGMENT,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  const motes = new THREE.Points(geometry, material);
  motes.name = 'police_helicopter_beam_motes';
  motes.frustumCulled = false;
  motes.renderOrder = 6;
  return motes;
}
