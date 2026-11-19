// The stage of a cinematic: one group at the scene's origin, turned by its heading, holding the
// scene's sets and props (model instances), its lights and its cast, so every position of a
// script is local to it. It finds a target by name ('letter', or 'office:door_l' for a node
// inside a set), moves and turns targets from where they stood, shows and hides them, and takes
// everything out of the world again. A model that is not loaded is left out without an error.
import * as THREE from 'three';

const local = new THREE.Vector3();

/**
 * Builds the stage.
 * @param {object} options
 * @param {import('../core/systems/gameContext.js').GameContext} options.context
 * @param {{x: number, y: number, z: number}} options.origin World metres.
 * @param {number} options.heading Radians about +Y.
 * @param {(x: number, z: number) => number} options.groundHeightAt World ground height.
 */
export function createCinematicStage({ context, origin, heading, groundHeightAt }) {
  const assets = context.assets;
  const group = new THREE.Group();
  group.name = 'cinematic-stage';
  group.position.set(origin.x, origin.y, origin.z);
  group.rotation.y = heading;
  group.updateMatrixWorld(true);
  (context.view?.layers?.dynamic ?? context.view?.scene)?.add(group);
  /** @type {Map<string, THREE.Object3D>} */
  const named = new Map();
  const lights = [];

  function toWorld(point, out = { x: 0, y: 0, z: 0 }) {
    local.set(point.x ?? 0, point.y ?? 0, point.z ?? 0).applyMatrix4(group.matrixWorld);
    out.x = local.x; out.y = local.y; out.z = local.z;
    return out;
  }

  /** The object a script names: a set, a prop, a light, or 'name:node' inside one. */
  function find(target) {
    if (typeof target !== 'string') return null;
    const [name, node] = target.split(':');
    const root = named.get(name) ?? null;
    if (!root || !node) return root;
    return root.getObjectByName(node) ?? null;
  }

  function addModel(spec) {
    if (!assets || !assets.has(spec.assetId)) return null;
    const instance = assets.instantiate(spec.assetId);
    instance.position.set(spec.position.x ?? 0, spec.position.y ?? 0, spec.position.z ?? 0);
    instance.rotation.y = spec.heading ?? 0;
    instance.traverse((node) => { if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; } });
    const parent = spec.parent ? find(spec.parent) : null;
    (parent ?? group).add(instance);
    if (spec.visible === false) instance.visible = false;
    named.set(spec.name, instance);
    return instance;
  }

  return {
    group,
    toWorld,
    find,
    /** The ground's height at a local point, in local metres. */
    groundY(x, z) {
      const world = toWorld({ x, y: 0, z });
      return groundHeightAt(world.x, world.z) - origin.y;
    },
    addSet(spec) { return addModel(spec); },
    addProp(spec) { return addModel(spec); },
    addLight(spec) {
      const light = spec.kind === 'spot'
        ? new THREE.SpotLight(spec.colour, spec.intensity, spec.range, spec.angle, 0.45, 1.6)
        : new THREE.PointLight(spec.colour, spec.intensity, spec.range, 1.6);
      light.name = `cinematic-light-${spec.name}`;
      const parent = (spec.parent ? find(spec.parent) : null) ?? group;
      light.position.set(spec.position.x, spec.position.y, spec.position.z);
      parent.add(light);
      if (light.isSpotLight) {
        const target = spec.target ?? { x: spec.position.x, y: 0, z: spec.position.z };
        light.target.position.set(target.x ?? 0, target.y ?? 0, target.z ?? 0);
        parent.add(light.target);
      }
      named.set(spec.name, light);
      lights.push(light);
      return light;
    },
    /** Where a target stands now: what a move starts from. */
    beginMove(target) {
      const object = find(target);
      return object ? { object, position: object.position.clone(), rotation: object.rotation.clone() } : null;
    },
    /** A move at progress k (0..1, eased by the caller). */
    applyMove(base, cue, k) {
      if (!base) return;
      const { object, position, rotation } = base;
      if (cue.translate) object.position.set(position.x + cue.translate.x * k, position.y + cue.translate.y * k, position.z + cue.translate.z * k);
      if (cue.rotate) object.rotation.set(rotation.x + cue.rotate.x * k, rotation.y + cue.rotate.y * k, rotation.z + cue.rotate.z * k);
    },
    show(target, visible) {
      const object = find(target);
      if (object) object.visible = visible;
      return Boolean(object);
    },
    dispose() {
      for (const light of lights) { light.target?.removeFromParent(); light.removeFromParent(); light.dispose?.(); }
      for (const object of named.values()) object.removeFromParent();
      named.clear();
      group.removeFromParent();
    },
  };
}
