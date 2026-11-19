// Rain near the camera: thousands of streaks falling through a box that wraps around the viewer,
// slanted by the wind, and small expanding rings where drops hit the ground. Two instanced draw
// calls; all motion happens in the vertex shaders from one clock, so nothing is updated per drop
// on the CPU. Farther away the rain is not drawn: the weather thickens the haze instead.
//
//   const rain = createRainEffect(4000);
//   scene.add(rain.group);
//   rain.update(dt, intensity, wind, groundLevel, ambientColor, flash);

import * as THREE from 'three';
import { createSmallRandom } from './lightningModel.js';

/** The box of falling drops, metres: wide enough that its edges are lost in the haze. */
const BOX_X = 34;
const BOX_Y = 22;
const BOX_Z = 34;
const FALL_SPEED = 13;
const SPLASH_AREA = 28;

const STREAK_VERTEX_SHADER = /* glsl */ `
attribute vec4 drop;             // three random numbers placing the drop in the box, one ranking it
uniform float uTime;
uniform float uAmount;           // fraction of the drops that are falling, 0..1
uniform vec3 uVelocity;          // wind and gravity, metres per second
uniform vec3 uBox;
varying float vAcross;
varying float vAlong;
varying float vFade;

void main() {
  vec3 velocity = uVelocity * (0.85 + 0.3 * drop.w);
  // Each drop falls through its own column and re-enters at the top; the box is centred on the
  // camera but the drops keep their world positions while the camera moves through them.
  vec3 place = drop.xyz * uBox + velocity * uTime;
  place = mod(place - cameraPosition, uBox) - 0.5 * uBox + cameraPosition;

  vec3 along = normalize(velocity);
  vec3 toEye = cameraPosition - place;
  float range = length(toEye);
  vec3 across = normalize(cross(along, toEye));
  float streak = 0.2 + 0.2 * drop.w;
  float width = 0.0016 + 0.0009 * range;
  vec3 world = place + along * (position.y * streak) + across * (position.x * width);

  vAcross = position.x;
  vAlong = position.y;
  // Drops fade in away from the lens and out toward the far side of the box.
  vFade = smoothstep(1.2, 5.0, range) * (1.0 - smoothstep(0.38 * uBox.x, 0.5 * uBox.x, range));
  vFade *= step(drop.w, uAmount);
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const STREAK_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uColor;
varying float vAcross;
varying float vAlong;
varying float vFade;

void main() {
  float shape = (1.0 - abs(vAcross)) * (1.0 - vAlong * vAlong);
  gl_FragColor = vec4(uColor * shape * vFade, 1.0);
}
`;

const SPLASH_VERTEX_SHADER = /* glsl */ `
attribute vec4 splash;           // two random numbers placing it, a phase, a size
uniform float uTime;
uniform float uAmount;
uniform float uGroundLevel;
uniform float uArea;
varying vec2 vLocal;
varying float vLife;

void main() {
  // A splash lives for a fraction of a second, then reappears somewhere else.
  float cycle = uTime * (2.2 + splash.w) + splash.z * 17.0;
  float life = fract(cycle);
  float generation = floor(cycle);
  vec2 jitter = fract(vec2(splash.x + generation * 0.618, splash.y + generation * 0.414));
  vec2 place = jitter * uArea;
  place = mod(place - cameraPosition.xz, uArea) - 0.5 * uArea + cameraPosition.xz;

  float radius = (0.015 + 0.06 * life) * (0.7 + 0.6 * splash.w);
  vec3 world = vec3(place.x + position.x * radius, uGroundLevel + 0.025, place.y + position.y * radius);
  float range = length(world - cameraPosition);
  vLocal = position.xy;
  vLife = (1.0 - life) * step(splash.z, uAmount) * (1.0 - smoothstep(0.35 * uArea, 0.5 * uArea, range));
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const SPLASH_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uColor;
varying vec2 vLocal;
varying float vLife;

void main() {
  float r = length(vLocal);
  float ring = smoothstep(0.55, 0.8, r) * (1.0 - smoothstep(0.85, 1.0, r));
  gl_FragColor = vec4(uColor * ring * vLife * 0.9, 1.0);
}
`;

/**
 * Creates the rain effect.
 * @param {number} [dropCount] Streaks at full intensity (4000 is the high setting, 1500 low).
 * @returns {{
 *   group: THREE.Group,
 *   setDropCount: (count: number) => void,
 *   update: (deltaSeconds: number, intensity: number, windX: number, windZ: number, groundLevel: number,
 *     ambient: THREE.Color, brightness: number) => void,
 *   dispose: () => void,
 * }}
 */
export function createRainEffect(dropCount = 4000) {
  const random = createSmallRandom(0x7a11d0b5);
  const group = new THREE.Group();
  group.name = 'marazul-rain';
  group.visible = false;

  const maxDrops = 6000;
  const maxSplashes = 1400;
  const quad = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);
  const quadIndex = [0, 1, 2, 0, 2, 3];

  const streakGeometry = new THREE.InstancedBufferGeometry();
  streakGeometry.setAttribute('position', new THREE.BufferAttribute(quad, 3));
  streakGeometry.setIndex(quadIndex);
  const drops = new Float32Array(maxDrops * 4);
  for (let i = 0; i < maxDrops; i += 1) {
    drops[i * 4] = random();
    drops[i * 4 + 1] = random();
    drops[i * 4 + 2] = random();
    // The ranking decides which drops fall in light rain; it is spread evenly over the buffer.
    drops[i * 4 + 3] = random();
  }
  streakGeometry.setAttribute('drop', new THREE.InstancedBufferAttribute(drops, 4));
  const streakUniforms = {
    uTime: { value: 0 },
    uAmount: { value: 0 },
    uVelocity: { value: new THREE.Vector3(0, -FALL_SPEED, 0) },
    uBox: { value: new THREE.Vector3(BOX_X, BOX_Y, BOX_Z) },
    uColor: { value: new THREE.Color(0.3, 0.33, 0.38) },
  };
  const streakMaterial = additiveMaterial('marazul-rain-streaks', STREAK_VERTEX_SHADER, STREAK_FRAGMENT_SHADER, streakUniforms);
  const streaks = new THREE.Mesh(streakGeometry, streakMaterial);

  const splashGeometry = new THREE.InstancedBufferGeometry();
  splashGeometry.setAttribute('position', new THREE.BufferAttribute(quad, 3));
  splashGeometry.setIndex(quadIndex);
  const splashes = new Float32Array(maxSplashes * 4);
  for (let i = 0; i < maxSplashes; i += 1) {
    splashes[i * 4] = random();
    splashes[i * 4 + 1] = random();
    splashes[i * 4 + 2] = random();
    splashes[i * 4 + 3] = random();
  }
  splashGeometry.setAttribute('splash', new THREE.InstancedBufferAttribute(splashes, 4));
  const splashUniforms = {
    uTime: streakUniforms.uTime,
    uAmount: { value: 0 },
    uGroundLevel: { value: 0 },
    uArea: { value: SPLASH_AREA },
    uColor: streakUniforms.uColor,
  };
  const splashMaterial = additiveMaterial('marazul-rain-splashes', SPLASH_VERTEX_SHADER, SPLASH_FRAGMENT_SHADER, splashUniforms);
  // The quad is laid flat by the vertex shader, which turns its front face down.
  splashMaterial.side = THREE.DoubleSide;
  splashMaterial.polygonOffset = true;
  splashMaterial.polygonOffsetFactor = -2;
  splashMaterial.polygonOffsetUnits = -4;
  const splashMesh = new THREE.Mesh(splashGeometry, splashMaterial);

  for (const mesh of [streaks, splashMesh]) {
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.matrixAutoUpdate = false;
    mesh.renderOrder = 950;
    group.add(mesh);
  }

  let activeDrops = Math.min(maxDrops, dropCount);
  streakGeometry.instanceCount = activeDrops;
  splashGeometry.instanceCount = Math.round(maxSplashes * (activeDrops / maxDrops));
  let clock = 0;

  /** Sets the number of streaks drawn at full intensity (up to 6000). */
  function setDropCount(count) {
    activeDrops = Math.max(0, Math.min(maxDrops, count));
    streakGeometry.instanceCount = activeDrops;
    splashGeometry.instanceCount = Math.round(maxSplashes * (activeDrops / maxDrops));
  }

  /**
   * Advances the rain.
   * @param {number} deltaSeconds Time step.
   * @param {number} intensity Rain intensity, 0 to 1; at 0 nothing is drawn.
   * @param {number} windX Wind velocity toward +X, metres per second.
   * @param {number} windZ Wind velocity toward +Z, metres per second.
   * @param {number} groundLevel World height of the ground near the camera, for the splashes.
   * @param {THREE.Color} ambient The colour of the light the drops catch.
   * @param {number} brightness Scale on that colour (raised at night and by lightning).
   */
  function update(deltaSeconds, intensity, windX, windZ, groundLevel, ambient, brightness) {
    group.visible = intensity > 0.01 && activeDrops > 0;
    if (!group.visible) return;
    clock += deltaSeconds;
    streakUniforms.uTime.value = clock;
    streakUniforms.uAmount.value = Math.min(1, 0.15 + intensity * 0.85);
    streakUniforms.uVelocity.value.set(windX * 0.55, -FALL_SPEED, windZ * 0.55);
    streakUniforms.uColor.value.copy(ambient).multiplyScalar(brightness);
    splashUniforms.uAmount.value = intensity;
    splashUniforms.uGroundLevel.value = groundLevel;
  }

  function dispose() {
    streakGeometry.dispose();
    splashGeometry.dispose();
    streakMaterial.dispose();
    splashMaterial.dispose();
  }

  return { group, setDropCount, update, dispose };
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
