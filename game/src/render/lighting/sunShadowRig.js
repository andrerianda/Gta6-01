// The key light of MARAZUL (the sun by day, the moon by night) and its shadows. One directional
// light does the lighting; it and up to three companions each render a shadow map of a sphere
// around the camera: a small one for crisp shadows at the player's feet, larger and coarser ones
// behind it out to the skyline. The lit materials pick the tightest cascade per fragment
// (shadowCascadePatch.js).
//
// Stability: every cascade covers a sphere of fixed radius, so its resolution does not change when
// the camera turns or zooms, and its centre moves in whole shadow-map texels, so shadow edges do
// not crawl when the camera moves.
//
// Cost: a far cascade (refresh interval above 1) is redrawn in bands, one horizontal band of its
// map per frame, so its triangles are spread evenly over `interval` frames instead of landing on
// one frame. The bands of a cycle go into a back map while the lit materials sample the last
// complete front map with the matrix it was drawn with; when the last band is done the two
// swap. A cut (invalidate()) or a jump of the light still redraws every cascade at once.
//
//   const rig = createSunShadowRig(renderer, scene, 'high');
//   rig.update(camera, directionTowardLight, color, intensity, softness);

import * as THREE from 'three';
import { applyShadowCascadePatch } from './shadowCascadePatch.js';

/**
 * Shadow settings per quality level: the radius in metres of each cascade's sphere, the edge
 * length of its shadow map, and how many frames one full refresh takes (above 1: drawn in that
 * many bands, one per frame).
 * @type {Readonly<Record<string, {radii: number[], mapSizes: number[], intervals: number[]}>>}
 */
export const SHADOW_QUALITY = Object.freeze({
  off: { radii: [], mapSizes: [], intervals: [] },
  low: { radii: [46], mapSizes: [1024], intervals: [1] },
  medium: { radii: [21, 96], mapSizes: [2048, 1024], intervals: [1, 2] },
  high: { radii: [18, 62, 230], mapSizes: [2048, 2048, 2048], intervals: [1, 1, 3] },
  ultra: { radii: [16, 52, 170, 640], mapSizes: [4096, 2048, 2048, 2048], intervals: [1, 1, 2, 6] },
  // The screenshot tier (quality 'cinematic'): ultra's reach, every map at the largest size,
  // every cascade redrawn every frame (no bands).
  cinematic: { radii: [16, 52, 170, 640], mapSizes: [4096, 4096, 4096, 4096], intervals: [1, 1, 1, 1] },
});

const MAX_CASCADES = 4;
/** How far behind a cascade's sphere, toward the light, shadow casters are still captured. */
const CASTER_PULLBACK = 950;
/** The world-space width of the penumbra at softness 1, metres. */
const BASE_PENUMBRA = 0.045;

/** What a banded cascade asked of the next shadow pass. */
const REQUEST_NONE = 0;
const REQUEST_FULL = 1;
const REQUEST_BAND = 2;

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
 *   update: (camera: THREE.Camera, towardLight: THREE.Vector3, color: THREE.Color, intensity: number, softness: number, strength?: number) => void,
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
  /** Per cascade: the band schedule and the front/back maps of a banded cascade. */
  const bands = [];
  for (let i = 0; i < MAX_CASCADES; i += 1) {
    const light = new THREE.DirectionalLight(0xffffff, 0);
    light.name = `marazul-key-cascade-${i}`;
    light.castShadow = false;
    light.visible = i === 0;
    light.shadow.autoUpdate = false;
    group.add(light);
    group.add(light.target);
    lights.push(light);
    bands.push({
      count: 1,
      next: 0,
      request: REQUEST_NONE,
      /** @type {THREE.WebGLRenderTarget | null} The complete map the materials sample. */
      front: null,
      /** @type {THREE.WebGLRenderTarget | null} The map the current cycle's bands go into. */
      back: null,
      frontMatrix: new THREE.Matrix4(),
      cycleMatrix: new THREE.Matrix4(),
    });
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

  // The shadow pass is wrapped so that a banded cascade draws its band into the back map and the
  // lit materials then sample the front map with the front matrix (three.js reads shadow.map and
  // shadow.matrix after its shadow pass, when it sets up the lights).
  const shadowMaps = renderer.shadowMap;
  const renderShadowMaps = shadowMaps.render;
  function renderShadowMapsInBands(shadowLights, shadowScene, viewCamera) {
    for (let i = 0; i < rig.cascadeCount; i += 1) {
      const band = bands[i];
      if (band.request === REQUEST_BAND && lights[i].shadow.needsUpdate) lights[i].shadow.map = band.back;
    }
    renderShadowMaps.call(shadowMaps, shadowLights, shadowScene, viewCamera);
    for (let i = 0; i < rig.cascadeCount; i += 1) {
      if (bands[i].count > 1) finishBand(i);
    }
  }
  shadowMaps.render = renderShadowMapsInBands;

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
      const band = bands[i];
      const banded = active && settings.intervals[i] > 1;
      if (!banded || band.count !== settings.intervals[i]) releaseBands(i);
      band.count = banded ? settings.intervals[i] : 1;
      if (!active) continue;
      const radius = settings.radii[i];
      const mapSize = Math.min(settings.mapSizes[i], renderer.capabilities.maxTextureSize);
      const shadow = light.shadow;
      if (shadow.mapSize.x !== mapSize) {
        shadow.mapSize.set(mapSize, mapSize);
        releaseBands(i);
        if (shadow.map) {
          shadow.map.dispose();
          shadow.map = null;
        }
      }
      const camera = shadow.camera;
      camera.near = 1;
      camera.far = CASTER_PULLBACK + radius * 2 + 60;
      aimRows(shadow, radius, 0, mapSize);
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
   * @param {number} [strength] How dark the shadows are, 0 to 1; at 0 (the moon) no shadow map is
   *   drawn and the light shades nothing, and the first frame after it redraws every cascade.
   */
  function update(camera, towardLight, color, intensity, softness, strength = 1) {
    frame += 1;
    const key = lights[0];
    key.color.copy(color);
    key.intensity = intensity;
    for (let i = 0; i < rig.cascadeCount; i += 1) lights[i].shadow.intensity = strength;
    const casting = intensity > 0.0005 && strength > 0.001;

    // A jump of the light (sun handing over to the moon) invalidates every cascade at once.
    if (lastDirection.dot(towardLight) < 0.9995 || !casting) forceRefresh = true;

    camera.getWorldDirection(forward);
    basis.lookAt(towardLight, origin, worldUp);
    axisX.setFromMatrixColumn(basis, 0);
    axisY.setFromMatrixColumn(basis, 1);

    for (let i = 0; i < rig.cascadeCount; i += 1) {
      const shadow = lights[i].shadow;
      // Not casting: draw nothing, except once when the map does not exist yet (a game that starts
      // at night): lit materials must always have a depth map to sample, or they do not draw.
      if (!casting && shadow.map !== null) {
        shadow.needsUpdate = false;
        bands[i].request = REQUEST_NONE;
        continue;
      }
      const texel = (settings.radii[i] * 2) / shadow.mapSize.x;
      const penumbraTexels = (BASE_PENUMBRA * softness * (1 + i * 0.6)) / texel;
      shadow.radius = Math.min(i === 0 ? 3.6 : 2.6, Math.max(1.1, penumbraTexels));
      if (bands[i].count > 1) {
        requestBand(i, camera, towardLight);
        continue;
      }
      const due = forceRefresh || (frame + i) % settings.intervals[i] === 0;
      if (!due) {
        shadow.needsUpdate = false;
        continue;
      }
      fitCascade(i, camera, towardLight);
      shadow.needsUpdate = true;
    }
    if (rig.cascadeCount === 0) {
      // Without shadows the light still needs a direction.
      key.position.copy(towardLight).multiplyScalar(100);
      key.target.position.set(0, 0, 0);
      key.updateMatrixWorld();
      key.target.updateMatrixWorld();
    }
    if (casting) {
      lastDirection.copy(towardLight);
      forceRefresh = false;
    }
  }

  /** Centres cascade `i`'s sphere ahead of the camera, on its texel grid, and aims its light. */
  function fitCascade(i, camera, towardLight) {
    const light = lights[i];
    const radius = settings.radii[i];
    const texel = (radius * 2) / light.shadow.mapSize.x;
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
  }

  /**
   * Asks the next shadow pass for the next band of banded cascade `i` (or for the whole map after
   * a cut, or when no complete map exists yet).
   */
  function requestBand(i, camera, towardLight) {
    const band = bands[i];
    const light = lights[i];
    const shadow = light.shadow;
    const radius = settings.radii[i];
    const size = shadow.mapSize.y;
    if (forceRefresh || band.front === null) {
      fitCascade(i, camera, towardLight);
      aimRows(shadow, radius, 0, size);
      shadow.updateMatrices(light);
      band.frontMatrix.copy(shadow.matrix);
      if (band.front) band.front.scissorTest = false;
      band.next = 0;
      band.request = REQUEST_FULL;
      shadow.needsUpdate = true;
      return;
    }
    if (band.next === 0) {
      // A new cycle: the light stays where it is now until the cycle's last band is drawn.
      fitCascade(i, camera, towardLight);
      aimRows(shadow, radius, 0, size);
      shadow.updateMatrices(light);
      band.cycleMatrix.copy(shadow.matrix);
    }
    if (band.back === null) band.back = cloneShadowTarget(band.front, light.name);
    const rowStart = Math.round((size * band.next) / band.count);
    const rowEnd = Math.round((size * (band.next + 1)) / band.count);
    aimRows(shadow, radius, rowStart, rowEnd);
    band.back.scissor.set(0, rowStart, shadow.mapSize.x, rowEnd - rowStart);
    band.back.scissorTest = true;
    band.request = REQUEST_BAND;
    shadow.needsUpdate = true;
  }

  /** After a shadow pass: advance banded cascade `i` and point its light at the front map. */
  function finishBand(i) {
    const band = bands[i];
    const shadow = lights[i].shadow;
    if (band.request !== REQUEST_NONE && !shadow.needsUpdate) {
      if (band.request === REQUEST_FULL) {
        band.front = shadow.map;
      } else if (band.next === band.count - 1) {
        const finished = band.back;
        band.back = band.front;
        band.front = finished;
        band.frontMatrix.copy(band.cycleMatrix);
        band.next = 0;
      } else {
        band.next += 1;
      }
      band.request = REQUEST_NONE;
    }
    if (band.front) shadow.map = band.front;
    shadow.matrix.copy(band.frontMatrix);
  }

  /** Frees cascade `i`'s back map and forgets its front (three.js owns the map in shadow.map). */
  function releaseBands(i) {
    const band = bands[i];
    const shadow = lights[i].shadow;
    if (band.back) {
      if (shadow.map === band.back) shadow.map = band.front;
      band.back.dispose();
      if (band.back.depthTexture) band.back.depthTexture.dispose();
    }
    band.back = null;
    band.front = null;
    band.next = 0;
    band.request = REQUEST_NONE;
  }

  /**
   * Makes the next update() re-render every cascade, including the far ones that normally wait
   * their turn. Call after the camera has jumped (a cut, a teleport, before a screenshot).
   */
  function invalidate() {
    forceRefresh = true;
  }

  /** Removes the lights from the scene, frees the shadow maps and unwraps the shadow pass. */
  function dispose() {
    if (shadowMaps.render === renderShadowMapsInBands) shadowMaps.render = renderShadowMaps;
    scene.remove(group);
    for (let i = 0; i < MAX_CASCADES; i += 1) {
      releaseBands(i);
      const light = lights[i];
      if (light.shadow.map) light.shadow.map.dispose();
      light.dispose();
    }
  }

  setQuality(quality);
  return rig;
}

/**
 * Points a cascade's shadow camera and viewport at the rows [rowStart, rowEnd) of its map, so a
 * band is drawn where it belongs and only what falls in it is culled in (instances of batched
 * meshes included, which three.js culls against the shadow camera). Rows 0 to the map's size
 * give the whole map.
 */
function aimRows(shadow, radius, rowStart, rowEnd) {
  const size = shadow.mapSize.y;
  const camera = shadow.camera;
  const bottom = -radius + (2 * radius * rowStart) / size;
  const top = -radius + (2 * radius * rowEnd) / size;
  if (camera.left !== -radius || camera.right !== radius || camera.bottom !== bottom || camera.top !== top) {
    camera.left = -radius;
    camera.right = radius;
    camera.bottom = bottom;
    camera.top = top;
    camera.updateProjectionMatrix();
  }
  // Map sizes are powers of two, so these fractions times the size give whole rows again.
  shadow.getViewport(0).set(0, rowStart / size, 1, (rowEnd - rowStart) / size);
}

/** A second shadow map like three.js's own `front` (same size, depth format and comparison). */
function cloneShadowTarget(front, name) {
  const target = front.clone();
  target.texture.name = `${name}.shadowMapBack`;
  if (front.depthTexture && target.depthTexture) {
    target.depthTexture.name = `${name}.shadowMapBack`;
    target.depthTexture.format = front.depthTexture.format;
    target.depthTexture.type = front.depthTexture.type;
    target.depthTexture.compareFunction = front.depthTexture.compareFunction;
    target.depthTexture.minFilter = front.depthTexture.minFilter;
    target.depthTexture.magFilter = front.depthTexture.magFilter;
  }
  return target;
}
