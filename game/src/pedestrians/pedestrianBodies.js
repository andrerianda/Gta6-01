// The crowd's bodies: one skinned character instance per person, painted from the person's
// look through the paint roles (paint_skin, paint_hair, paint_top, paint_bottom, paint_shoes,
// paint_jacket), scaled to their height, posed by the character run-time's locomotion
// controller, and kept cheap: a pool reuses instances (repainted, never rebuilt), the level of
// detail switches by distance (lod0 near, lod1, lod2 far), far people are posed every second or
// fourth frame, people off screen are not posed at all (their walk state still steps, so they
// come back on screen mid-stride), and only near people cast shadows.
import { setPaint } from '../assets/index.js';
import { createLocomotionController } from '../characters/controller/locomotionController.js';
import { stepLocomotionState } from '../characters/controller/locomotionState.js';

/** Distances (m) where a body changes level of detail. */
export const BODY_LOD_DISTANCES = Object.freeze([14, 34]);
/** Bodies within this distance cast shadows. */
const SHADOW_DISTANCE = 26;
const PAINT_ROLES = ['paint_skin', 'paint_hair', 'paint_jacket', 'paint_top', 'paint_bottom', 'paint_shoes'];

/** The level of detail of a mesh node: its own userData.lod or its nearest ancestor's. */
function levelOf(node) {
  for (let at = node; at; at = at.parent) {
    if (typeof at.userData.lod === 'number') return at.userData.lod;
  }
  return 0;
}

/**
 * Creates the pool of crowd bodies.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 * @param {THREE.Object3D} layer Where bodies are added (context.view.layers.dynamic).
 */
export function createPedestrianBodies(context, layer) {
  /** Free bodies by asset id. */
  const free = new Map();
  let created = 0;

  function build(assetId) {
    const asset = context.assets.get(assetId);
    const instance = context.assets.instantiate(assetId, { lod: 'all' });
    instance.name = `pedestrian-${assetId}-${created}`;
    created += 1;
    instance.rotation.order = 'YXZ';
    const levels = [[], [], []];
    instance.traverse((node) => {
      if (!node.isMesh) return;
      const level = Math.min(2, levelOf(node));
      levels[level].push(node);
      node.receiveShadow = true;
    });
    if (levels[1].length === 0) levels[1] = levels[0];
    if (levels[2].length === 0) levels[2] = levels[1];
    const stature = asset && asset.extras ? asset.extras.height || 1.8 : 1.8;
    const walker = createLocomotionController(instance, { stature, seed: created * 13 });
    const body = { assetId, instance, walker, levels, stature, scale: 1, level: -1, shadows: null, frame: 0, input: walker.input };
    layer.add(instance);
    return body;
  }

  function showLevel(body, level, shadows) {
    if (body.level === level && body.shadows === shadows) return;
    for (let i = 0; i < 3; i += 1) {
      const meshes = body.levels[i];
      for (let j = 0; j < meshes.length; j += 1) {
        meshes[j].visible = i === level;
        meshes[j].castShadow = shadows && i === level;
      }
    }
    body.level = level;
    body.shadows = shadows;
  }

  return {
    /** How many instances exist (in use and free). */
    get created() { return created; },

    /**
     * A body for a person.
     * @param {string} assetId A registered character asset.
     * @param {{height: number, paints: Record<string, string>}} look
     * @param {number} yaw
     */
    acquire(assetId, look, yaw) {
      const list = free.get(assetId);
      const body = list && list.length ? list.pop() : build(assetId);
      for (const role of PAINT_ROLES) if (look.paints[role]) setPaint(body.instance, look.paints[role], role);
      body.scale = Math.max(0.85, Math.min(1.12, look.height / body.stature));
      body.instance.scale.setScalar(body.scale);
      body.instance.rotation.set(0, yaw, 0);
      body.instance.visible = true;
      body.walker.reset(yaw);
      body.level = -1;
      return body;
    },

    /** Returns a body to the pool. */
    release(body) {
      body.instance.visible = false;
      body.instance.rotation.x = 0;
      if (!free.has(body.assetId)) free.set(body.assetId, []);
      free.get(body.assetId).push(body);
    },

    /**
     * Steps a body's walk and poses it for this frame.
     * @param {object} body
     * @param {number} dt Seconds.
     * @param {number} distance From the camera, metres.
     * @param {boolean} onScreen In the camera's view.
     * @param {boolean} posed False while the person lies down (no walking pose).
     */
    animate(body, dt, distance, onScreen, posed) {
      body.frame += 1;
      const level = distance < BODY_LOD_DISTANCES[0] ? 0 : distance < BODY_LOD_DISTANCES[1] ? 1 : 2;
      showLevel(body, level, distance < SHADOW_DISTANCE);
      const every = distance < 30 ? 1 : distance < 60 ? 2 : 4;
      body.pending = (body.pending || 0) + dt;
      if (!posed) {
        body.pending = 0;
        return;
      }
      if (onScreen && body.frame % every === 0) {
        body.walker.update(body.pending, body.input);
        body.pending = 0;
      } else if (!onScreen || body.pending > 0.25) {
        // Off screen (or far between poses): keep the walk state stepping without posing.
        stepLocomotionState(body.walker.state, body.pending, body.input);
        body.instance.rotation.y = body.walker.state.yaw;
        body.pending = 0;
      }
    },
  };
}
