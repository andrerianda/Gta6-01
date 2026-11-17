// The key light of MARAZUL (the sun by day, the moon by night) and its shadows. One directional
// light does the lighting; it and up to three companions each render a shadow map of a sphere
// around the camera: a small one for crisp shadows at the player's feet, larger and coarser ones
// behind it out to the skyline. The lit materials pick the tightest cascade per fragment
// (shadowCascadePatch.js).
//
// Stability: every cascade covers a sphere of fixed radius, so its resolution does not change when
// the camera turns or zooms, and its centre moves in whole shadow-map texels, so shadow edges do
// not crawl when the camera moves. The far cascades are re-rendered only every few frames.
//
//   const rig = createSunShadowRig(renderer, scene, 'high');
//   rig.update(camera, directionTowardLight, color, intensity, softness);

import * as THREE from 'three';
import { applyShadowCascadePatch } from './shadowCascadePatch.js';

/**
 * Shadow settings per quality level: the radius in metres of each cascade's sphere, the edge
 * length of its shadow map, and how many frames pass between its refreshes.
 * @type {Readonly<Record<string, {radii: number[], mapSizes: number[], intervals: number[]}>>}
 */
export const SHADOW_QUALITY = Object.freeze({
  off: { radii: [], mapSizes: [], intervals: [] },
  low: { radii: [46], mapSizes: [1024], intervals: [1] },
  medium: { radii: [21, 96], mapSizes: [2048, 1024], intervals: [1, 2] },
  high: { radii: [18, 62, 230], mapSizes: [2048, 2048, 2048], intervals: [1, 1, 3] },
  ultra: { radii: [16, 52, 170, 640], mapSizes: [4096, 2048, 2048, 2048], intervals: [1, 1, 2, 6] },
});

const MAX_CASCADES = 4;
/** How far behind a cascade's sphere, toward the light, shadow casters are still captured. */
const CASTER_PULLBACK = 950;
/** The world-space width of the penumbra at softness 1, metres. */
const BASE_PENUMBRA = 0.045;

/**
 * Creates the key light and its shadow cascades and adds them to the scene.
 * @param {THREE.WebGLRenderer} renderer The game's renderer; its shadow map is enabled here.
 * @param {THREE.Scene} scene The scene the lights are added to.
 * @param {keyof typeof SHADOW_QUALITY} [quality] The starting quality level.
 * @returns {{
 *   keyLight: THREE.DirectionalLight,
 *   group: THREE.Group,
 *   shadowDistance: number,
 *   cascadeCount: number,
 *   setQuality: (level: keyof typeof SHADOW_QUALITY) => void,
 *   update: (camera: THREE.Camera, towardLight: THREE.Vector3, color: THREE.Color, intensity: number, softness: number) => void,
 *   invalidate: () => void,
 *   dispose: () => void,
 * }} `keyLight` is the light that carries the sun's colour and intensity; `shadowDistance` is how
 *   far from the camera shadows reach at the current quality.
 */
export function createSunShadowRig(renderer, scene, quality = 'high') {
  const cascadesAvailable = applyShadowCascadePatch();
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const group = new THREE.Group();
  group.name = 'marazul-key-light';
  const lights = [];
  for (let i = 0; i < MAX_CASCADES; i += 1) {
    const light = new THREE.DirectionalLight(0xffffff, 0);
    light.name = `marazul-key-cascade-${i}`;
    light.castShadow = false;
    light.visible = i === 0;
    light.shadow.autoUpdate = false;
    group.add(light);
    group.add(light.target);
    lights.push(light);
  }
  scene.add(group);

  const rig = {
    keyLight: lights[0],
    group,
    shadowDistance: 0,
    cascadeCount: 0,
    setQuality,
    update,
    invalidate,
    dispose,
  };

  let settings = SHADOW_QUALITY.off;
  let frame = 0;
  let forceRefresh = true;
  const lastDirection = new THREE.Vector3(0, 1, 0);

  // Scratch objects: nothing is allocated per frame.
  const forward = new THREE.Vector3();
  const centre = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const axisX = new THREE.Vector3();
  const axisY = new THREE.Vector3();
  const origin = new THREE.Vector3();
  const worldUp = new THREE.Vector3(0, 1, 0);

  /** Switches the number, size and reach of the cascades. Recompiles lit shaders once. */
  function setQuality(level) {
    const wanted = SHADOW_QUALITY[level] ?? SHADOW_QUALITY.high;
    const count = cascadesAvailable ? wanted.radii.length : Math.min(1, wanted.radii.length);
    settings = cascadesAvailable || count === 0 ? wanted : SHADOW_QUALITY.low;
    rig.cascadeCount = count;
    for (let i = 0; i < MAX_CASCADES; i += 1) {
      const light = lights[i];
      const active = i < count;
      light.visible = active || i === 0;
      light.castShadow = active;
      if (!active) continue;
      const radius = settings.radii[i];
      const mapSize = Math.min(settings.mapSizes[i], renderer.capabilities.maxTextureSize);
      const shadow = light.shadow;
      if (shadow.mapSize.x !== mapSize) {
        shadow.mapSize.set(mapSize, mapSize);
        if (shadow.map) {
          shadow.map.dispose();
          shadow.map = null;
        }
      }
      const camera = shadow.camera;
      camera.left = -radius;
      camera.right = radius;
      camera.top = radius;
      camera.bottom = -radius;
      camera.near = 1;
      camera.far = CASTER_PULLBACK + radius * 2 + 60;
      camera.updateProjectionMatrix();
      const texel = (radius * 2) / mapSize;
      shadow.normalBias = texel * 1.3;
      shadow.bias = (-texel * 1.2) / (camera.far - camera.near);
    }
    const last = count > 0 ? settings.radii[count - 1] : 0;
    rig.shadowDistance = last * 1.7;
    forceRefresh = true;
  }

  /**
   * Aims the key light and refits the cascades around the camera. Call once per frame before
   * rendering.
   * @param {THREE.Camera} camera The game camera (its world matrix must be current).
   * @param {THREE.Vector3} towardLight Unit vector from the ground toward the sun or moon.
   * @param {THREE.Color} color The light's colour.
   * @param {number} intensity The light's intensity; 0 skips shadow rendering.
   * @param {number} softness Penumbra scale; 1 is a crisp noon shadow.
   */
  function update(camera, towardLight, color, intensity, softness) {
    frame += 1;
    const key = lights[0];
    key.color.copy(color);
    key.intensity = intensity;

    // A jump of the light (sun handing over to the moon) invalidates every cascade at once.
    if (lastDirection.dot(towardLight) < 0.9995) forceRefresh = true;

    camera.getWorldDirection(forward);
    basis.lookAt(towardLight, origin, worldUp);
    axisX.setFromMatrixColumn(basis, 0);
    axisY.setFromMatrixColumn(basis, 1);

    for (let i = 0; i < rig.cascadeCount; i += 1) {
      const light = lights[i];
      const shadow = light.shadow;
      const due = forceRefresh || (frame + i) % settings.intervals[i] === 0;
      if (intensity <= 0.0005 || !due) {
        shadow.needsUpdate = false;
        continue;
      }
      const radius = settings.radii[i];
      const texel = (radius * 2) / shadow.mapSize.x;

      // The sphere sits ahead of the camera so that most of it is on screen.
      centre.copy(camera.position).addScaledVector(forward, radius * 0.78);
      // Move the centre onto the shadow map's texel grid, measured along the light's own axes.
      const alongX = centre.dot(axisX);
      const alongY = centre.dot(axisY);
      centre.addScaledVector(axisX, Math.round(alongX / texel) * texel - alongX);
      centre.addScaledVector(axisY, Math.round(alongY / texel) * texel - alongY);

      light.target.position.copy(centre);
      light.position.copy(centre).addScaledVector(towardLight, CASTER_PULLBACK + radius);
      light.updateMatrixWorld();
      light.target.updateMatrixWorld();

      const penumbraTexels = (BASE_PENUMBRA * softness * (1 + i * 0.6)) / texel;
      shadow.radius = Math.min(i === 0 ? 3.6 : 2.6, Math.max(1.1, penumbraTexels));
      shadow.needsUpdate = true;
    }
    if (rig.cascadeCount === 0) {
      // Without shadows the light still needs a direction.
      key.position.copy(towardLight).multiplyScalar(100);
      key.target.position.set(0, 0, 0);
      key.updateMatrixWorld();
      key.target.updateMatrixWorld();
    }
    if (intensity > 0.0005) {
      lastDirection.copy(towardLight);
      forceRefresh = false;
    }
  }

  /**
   * Makes the next update() re-render every cascade, including the far ones that normally wait
   * their turn. Call after the camera has jumped (a cut, a teleport, before a screenshot).
   */
  function invalidate() {
    forceRefresh = true;
  }

  /** Removes the lights from the scene and frees the shadow maps. */
  function dispose() {
    scene.remove(group);
    for (const light of lights) {
      if (light.shadow.map) light.shadow.map.dispose();
      light.dispose();
    }
  }

  setQuality(quality);
  return rig;
}
