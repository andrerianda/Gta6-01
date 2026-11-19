// The working part of the open sea system (render/openSea.js loads it): every frame, once the
// camera of the frame is final, it gives the camera the planes the view from the air needs (far
// plane out to the sea's horizon, a near plane that keeps depth precision on the far sea) and
// places the cloud layer seen from above. It also answers the questions the owners of far
// objects ask: how deep in the haze is something at this distance, and what colour is that haze.
//
// The sea itself, its horizon cut, the sinking and darkening sky and the thinning haze are drawn
// by the atmosphere (water/, sky/, postfx/atmosphereResolvePass.js), all from one record of the
// camera's height: atmosphere.altitude, made by seaHorizonMaths.js.

import { CAMERA_FAR_METRES } from '../../core/renderer/rendererBootstrap.js';
import { createCloudDeckFromAbove } from './cloudDeckFromAbove.js';
import {
  farPlaneMetres, hazeAmount, horizonDropRadians, nearPlaneMetres, seaReachMetres,
} from './seaHorizonMaths.js';

/**
 * Creates the open sea's runtime.
 * @param {import('../../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {{
 *   farPlane: number,
 *   hazeAmountAt: (distance: number, cameraHeight?: number) => number,
 *   hazeColourAt: (distance: number, out: {r: number, g: number, b: number}) => {r: number, g: number, b: number},
 *   horizonDropRadians: (cameraHeight: number) => number,
 *   seaLevelAt: (x: number, z: number) => number,
 *   dispose: () => void,
 * }}
 */
export function createOpenSeaRuntime(context) {
  const camera = context.view.camera;
  const atmosphere = context.atmosphere;
  const pipeline = context.systems.find('worldRenderPipeline');
  const deck = atmosphere && atmosphere.skyUniforms ? createCloudDeckFromAbove(atmosphere.skyUniforms) : null;
  // In the atmosphere's own group, which the water-depth capture leaves out.
  if (deck) (atmosphere.group ?? context.view.scene).add(deck.mesh);
  /** @type {{minX: number, maxX: number, minZ: number, maxZ: number} | null} */
  let extent = null;
  /** @type {any} */
  let city = null;

  const runtime = {
    /** The far plane in force, metres. */
    farPlane: camera.far,
    hazeAmountAt,
    hazeColourAt,
    horizonDropRadians,
    seaLevelAt: () => 0,
    dispose,
  };

  const removeHook = pipeline && typeof pipeline.addFrameHook === 'function' ? pipeline.addFrameHook(beforeDraw) : null;

  /** Runs after the camera systems, just before the frame is drawn. */
  function beforeDraw() {
    const x = camera.position.x;
    const y = camera.position.y;
    const z = camera.position.z;
    if (!extent) findCity();
    const outside = extent !== null && (x < extent.minX || x > extent.maxX || z < extent.minZ || z > extent.maxZ);

    // ---- the camera's planes ----
    const far = farPlaneMetres(y, outside, CAMERA_FAR_METRES);
    let ground = 0;
    if (!outside && city && typeof city.groundHeightAt === 'function') {
      const height = city.groundHeightAt(x, z);
      if (Number.isFinite(height) && height > 0) ground = height;
    }
    const near = nearPlaneMetres(camera.near, y - ground);
    if (Math.abs(camera.far - far) > 1 || Math.abs(camera.near - near) > 0.001) {
      camera.far = far;
      camera.near = near;
      camera.updateProjectionMatrix();
    }
    runtime.farPlane = far;

    // ---- the clouds below the camera ----
    if (deck) {
      const look = atmosphere.altitude;
      const reach = Math.min(far * 0.96, Math.max(30000, 1.05 * seaReachMetres(y)));
      deck.update(camera, look ? cloudsFromAboveAt(y, look) : 0, reach, look ? look.horizonSine : 0);
    }
  }

  /** The atmosphere's record is one frame old when the hook runs: good enough for a fade. */
  function cloudsFromAboveAt(height, look) {
    return Math.abs(look.height - height) < 2000 ? look.cloudsFromAbove : 0;
  }

  function findCity() {
    city = context.systems.find('openWorldCity');
    const frame = city && city.plan ? city.plan.frame : null;
    if (frame && frame.extent) extent = frame.extent;
  }

  /**
   * How much of an object at sea level is lost in the haze: 0 clear .. 1 gone. Objects drawn in
   * the scene already get exactly this haze from the picture's haze pass; use the number to fade
   * a model in or out, to dim its lamps, or for anything drawn outside that pass.
   * @param {number} distance Metres from the camera.
   * @param {number} [cameraHeight] Camera height in metres; the camera's own when omitted.
   */
  function hazeAmountAt(distance, cameraHeight) {
    const state = atmosphere ? atmosphere.state : null;
    const density = state && state.fogDensity > 0 ? state.fogDensity : 0.0004;
    const scale = state && state.fogHeight > 0 ? state.fogHeight : 260;
    return hazeAmount(distance, Number.isFinite(cameraHeight) ? cameraHeight : camera.position.y, density, scale);
  }

  /**
   * The colour of the haze far objects fade into (linear scene radiance, the horizon's colour
   * of the hour and weather), written into `out`.
   * @param {number} distance Metres from the camera (the colour does not depend on it today).
   * @param {{r: number, g: number, b: number}} out Receives the colour.
   */
  function hazeColourAt(distance, out) {
    const colour = atmosphere && atmosphere.state ? atmosphere.state.fogColor : null;
    out.r = colour ? colour.r : 0.56;
    out.g = colour ? colour.g : 0.69;
    out.b = colour ? colour.b : 0.84;
    return out;
  }

  function dispose() {
    if (removeHook) removeHook();
    if (deck) {
      if (deck.mesh.parent) deck.mesh.parent.remove(deck.mesh);
      deck.dispose();
    }
    if (Math.abs(camera.far - CAMERA_FAR_METRES) > 1) {
      camera.far = CAMERA_FAR_METRES;
      camera.updateProjectionMatrix();
    }
  }

  return runtime;
}
