// The cheap, unlimited representation of night lights: every registered lamp is drawn as a glow
// sprite (the bright source itself, which the bloom then spreads), lamps near enough also as a
// soft pool of light added onto the ground beneath them, on wet ground as a long reflection streak
// toward the viewer, and beams as faint cones in the haze. None of this lights other surfaces;
// that is the job of the few real lights the manager places.
// Three instanced draw calls in total, whatever the number of lamps.

import * as THREE from 'three';
import { WET_SURFACE_UNIFORMS } from '../weather/wetSurface.js';

/** Capacities of the three instance buffers. */
export const MAX_GLOWS = 4096;
export const MAX_POOLS = 512;
export const MAX_CONES = 96;

const GLOW_VERTEX_SHADER = /* glsl */ `
attribute vec4 glowPlace;        // world position, radius in metres
attribute vec3 glowColor;        // radiance of the core
uniform float uPixelsPerRadian;  // picture height in pixels over the vertical field of view factor
varying vec2 vOffset;
varying vec3 vColor;

void main() {
  vec4 viewPosition = viewMatrix * vec4(glowPlace.xyz, 1.0);
  float range = max(-viewPosition.z, 0.1);
  float radius = glowPlace.w;
  // A lamp far away would shrink below a pixel and flicker; hold it at a minimum size on screen
  // and dim it instead, as the eye sees distant lights.
  float pixels = radius * uPixelsPerRadian / range;
  float grow = max(1.0, 1.7 / pixels);
  viewPosition.xy += position.xy * radius * grow;
  // Step toward the camera so that the glow is not buried inside the lamp's own housing.
  viewPosition.xyz *= 1.0 - min(min(0.6 * radius, 0.4) / range, 0.5);
  gl_Position = projectionMatrix * viewPosition;
  // A lamp behind the camera must not be drawn at all.
  if (viewPosition.z > -0.05) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  vOffset = position.xy;
  vColor = glowColor / pow(grow, 1.35);
}
`;

const GLOW_FRAGMENT_SHADER = /* glsl */ `
varying vec2 vOffset;
varying vec3 vColor;

void main() {
  float r2 = dot(vOffset, vOffset);
  if (r2 > 1.0) discard;
  float core = exp(-r2 * 22.0);
  float halo = (1.0 - r2) * (1.0 - r2) * 0.16;
  gl_FragColor = vec4(vColor * (core + halo), 1.0);
}
`;

const POOL_VERTEX_SHADER = /* glsl */ `
attribute vec4 poolPlace;        // world centre (on the ground), rotation about Y in radians
attribute vec4 poolShape;        // half length, half width, kind (see the fragment stage), unused
attribute vec3 poolColor;        // radiance at the brightest point
varying vec2 vLocal;
varying vec2 vPlace;
varying vec3 vColor;
varying float vKind;

void main() {
  vLocal = position.xy;
  vColor = poolColor;
  vKind = poolShape.z;
  float c = cos(poolPlace.w);
  float s = sin(poolPlace.w);
  vec2 extent = position.xy * poolShape.xy;
  vec3 world = poolPlace.xyz + vec3(extent.x * c - extent.y * s, 0.03, extent.x * s + extent.y * c);
  vPlace = world.xz;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const POOL_FRAGMENT_SHADER = /* glsl */ `
uniform sampler2D uWetNoise;
uniform float uPuddles;
varying vec2 vLocal;
varying vec2 vPlace;
varying vec3 vColor;
varying float vKind;

void main() {
  float shape;
  if (vKind > 0.0) {
    // A lamp above a plane (kind = lamp height over pool radius): irradiance falls as height
    // over distance cubed.
    float r = length(vLocal);
    float ratio = r / vKind;
    shape = pow(1.0 + ratio * ratio, -1.5) * (1.0 - smoothstep(0.7, 1.0, r));
  } else if (vKind > -0.5) {
    // A beam thrown forward along +X (kind 0): starts just ahead of the lamp, widens, fades.
    float t = vLocal.x * 0.5 + 0.5;
    float width = 0.3 + 0.7 * t;
    shape = smoothstep(0.0, 0.1, t) * pow(1.0 - t, 1.4) * (1.0 - smoothstep(0.3, 1.0, abs(vLocal.y) / width));
  } else {
    // The reflection of a light on wet ground (kind -1): a streak along the line of sight,
    // strong in the puddles and broken up on merely damp asphalt. The puddle field is the one
    // the wet materials use (wetSurface.js), so streaks and puddles coincide.
    shape = exp(-vLocal.x * vLocal.x * 3.2) * exp(-vLocal.y * vLocal.y * 4.5);
    float hollow = texture2D(uWetNoise, vPlace * 0.021).r * 0.6 + texture2D(uWetNoise, vPlace * 0.083 + 0.37).b * 0.4;
    float level = 1.0 - uPuddles * 0.7;
    float fine = texture2D(uWetNoise, vPlace * 0.9).a;
    shape *= mix(0.2 + 0.5 * fine, 1.0, smoothstep(level, level + 0.07, hollow));
  }
  gl_FragColor = vec4(vColor * shape, 1.0);
}
`;

const CONE_VERTEX_SHADER = /* glsl */ `
attribute vec4 coneApex;         // world position of the lamp, length of the visible beam
attribute vec4 coneAxis;         // unit direction, tangent of the half angle
attribute vec3 coneColor;
uniform vec3 uViewPosition;
varying vec3 vColor;
varying float vAlong;
varying float vFacing;

void main() {
  vec3 axis = coneAxis.xyz;
  vec3 helper = abs(axis.y) > 0.92 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  vec3 side = normalize(cross(helper, axis));
  vec3 up = cross(axis, side);
  float along = position.z;
  float spread = coneApex.w * coneAxis.w * along;
  vec3 world = coneApex.xyz + axis * (coneApex.w * along) + (side * position.x + up * position.y) * spread;
  vec3 outward = normalize(side * position.x + up * position.y - axis * coneAxis.w);
  vec3 toEye = normalize(uViewPosition - world);
  vFacing = abs(dot(outward, toEye));
  vAlong = along;
  vColor = coneColor;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const CONE_FRAGMENT_SHADER = /* glsl */ `
varying vec3 vColor;
varying float vAlong;
varying float vFacing;

void main() {
  // Brightest looking through the thick middle of the beam, fading at its silhouette and tip.
  float body = vFacing * vFacing * (1.0 - vAlong) * (1.0 - vAlong) * smoothstep(0.0, 0.06, vAlong);
  gl_FragColor = vec4(vColor * body, 1.0);
}
`;

/**
 * Creates the glow layer.
 * @returns {{
 *   group: THREE.Group,
 *   glowPlace: Float32Array, glowColor: Float32Array,
 *   poolPlace: Float32Array, poolShape: Float32Array, poolColor: Float32Array,
 *   coneApex: Float32Array, coneAxis: Float32Array, coneColor: Float32Array,
 *   commit: (glows: number, pools: number, cones: number, camera: THREE.PerspectiveCamera, viewportHeight: number) => void,
 *   dispose: () => void,
 * }} The manager writes instances into the typed arrays (4 or 3 numbers per instance, as named in
 *   the shaders) and then calls `commit` with the counts.
 */
export function createLightGlowLayer() {
  const group = new THREE.Group();
  group.name = 'marazul-light-glow';

  const quad = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);
  const quadIndex = [0, 1, 2, 0, 2, 3];

  // ---- glow sprites ----
  const glowGeometry = new THREE.InstancedBufferGeometry();
  glowGeometry.setAttribute('position', new THREE.BufferAttribute(quad, 3));
  glowGeometry.setIndex(quadIndex);
  const glowPlace = instancedAttribute(glowGeometry, 'glowPlace', MAX_GLOWS, 4);
  const glowColor = instancedAttribute(glowGeometry, 'glowColor', MAX_GLOWS, 3);
  const glowMaterial = additiveMaterial('marazul-light-glow', GLOW_VERTEX_SHADER, GLOW_FRAGMENT_SHADER, {
    uPixelsPerRadian: { value: 1000 },
  });
  const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);

  // ---- ground pools ----
  const poolGeometry = new THREE.InstancedBufferGeometry();
  poolGeometry.setAttribute('position', new THREE.BufferAttribute(quad, 3));
  poolGeometry.setIndex(quadIndex);
  const poolPlace = instancedAttribute(poolGeometry, 'poolPlace', MAX_POOLS, 4);
  const poolShape = instancedAttribute(poolGeometry, 'poolShape', MAX_POOLS, 4);
  const poolColor = instancedAttribute(poolGeometry, 'poolColor', MAX_POOLS, 3);
  const poolMaterial = additiveMaterial('marazul-light-pool', POOL_VERTEX_SHADER, POOL_FRAGMENT_SHADER, {
    uWetNoise: WET_SURFACE_UNIFORMS.uWetNoise,
    uPuddles: WET_SURFACE_UNIFORMS.uPuddles,
  });
  // The quad is laid flat by the vertex shader, which turns its front face down.
  poolMaterial.side = THREE.DoubleSide;
  poolMaterial.polygonOffset = true;
  poolMaterial.polygonOffsetFactor = -2;
  poolMaterial.polygonOffsetUnits = -4;
  const poolMesh = new THREE.Mesh(poolGeometry, poolMaterial);

  // ---- beam cones ----
  const coneGeometry = new THREE.InstancedBufferGeometry();
  const coneSegments = 20;
  const conePositions = new Float32Array((coneSegments + 1) * 2 * 3);
  const coneIndex = [];
  for (let i = 0; i <= coneSegments; i += 1) {
    const angle = (i / coneSegments) * Math.PI * 2;
    // Each ring vertex appears twice: at the apex (z 0) and at the rim (z 1).
    conePositions.set([Math.cos(angle), Math.sin(angle), 0], i * 6);
    conePositions.set([Math.cos(angle), Math.sin(angle), 1], i * 6 + 3);
    if (i < coneSegments) coneIndex.push(i * 2, i * 2 + 1, i * 2 + 3, i * 2, i * 2 + 3, i * 2 + 2);
  }
  coneGeometry.setAttribute('position', new THREE.BufferAttribute(conePositions, 3));
  coneGeometry.setIndex(coneIndex);
  const coneApex = instancedAttribute(coneGeometry, 'coneApex', MAX_CONES, 4);
  const coneAxis = instancedAttribute(coneGeometry, 'coneAxis', MAX_CONES, 4);
  const coneColor = instancedAttribute(coneGeometry, 'coneColor', MAX_CONES, 3);
  const coneMaterial = additiveMaterial('marazul-light-cone', CONE_VERTEX_SHADER, CONE_FRAGMENT_SHADER, {
    uViewPosition: { value: new THREE.Vector3() },
  });
  coneMaterial.side = THREE.DoubleSide;
  const coneMesh = new THREE.Mesh(coneGeometry, coneMaterial);

  const meshes = [poolMesh, coneMesh, glowMesh];
  meshes.forEach((mesh, order) => {
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.matrixAutoUpdate = false;
    // Pools first (they belong to the ground), then beams, then the sources on top.
    mesh.renderOrder = 900 + order;
    mesh.visible = false;
    group.add(mesh);
  });

  /**
   * Uploads the instances written this frame.
   * @param {number} glows Number of glow instances in use.
   * @param {number} pools Number of pool instances in use.
   * @param {number} cones Number of cone instances in use.
   * @param {THREE.PerspectiveCamera} camera The game camera.
   * @param {number} viewportHeight Height of the rendered picture in pixels.
   */
  function commit(glows, pools, cones, camera, viewportHeight) {
    setInstances(glowMesh, glows);
    setInstances(poolMesh, pools);
    setInstances(coneMesh, cones);
    glowMaterial.uniforms.uPixelsPerRadian.value = viewportHeight * 0.5 * camera.projectionMatrix.elements[5];
    coneMaterial.uniforms.uViewPosition.value.setFromMatrixPosition(camera.matrixWorld);
  }

  function dispose() {
    for (const mesh of meshes) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  }

  return {
    group,
    glowPlace, glowColor,
    poolPlace, poolShape, poolColor,
    coneApex, coneAxis, coneColor,
    commit,
    dispose,
  };
}

function instancedAttribute(geometry, name, capacity, itemSize) {
  const array = new Float32Array(capacity * itemSize);
  const attribute = new THREE.InstancedBufferAttribute(array, itemSize);
  attribute.setUsage(THREE.DynamicDrawUsage);
  attribute.marazulRange = { start: 0, count: 0 };
  geometry.setAttribute(name, attribute);
  return array;
}

function additiveMaterial(name, vertexShader, fragmentShader, uniforms) {
  return new THREE.ShaderMaterial({
    name,
    uniforms,
    vertexShader,
    fragmentShader,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
}

function setInstances(mesh, count) {
  mesh.visible = count > 0;
  mesh.geometry.instanceCount = count;
  if (count === 0) return;
  const attributes = mesh.geometry.attributes;
  for (const name in attributes) {
    const attribute = attributes[name];
    if (!attribute.isInstancedBufferAttribute) continue;
    // Upload only the instances in use. three.js empties the range list after each upload, so
    // the same range object is put back every frame instead of allocating a new one.
    const range = attribute.marazulRange;
    range.count = count * attribute.itemSize;
    attribute.updateRanges.length = 0;
    attribute.updateRanges.push(range);
    attribute.needsUpdate = true;
  }
}
