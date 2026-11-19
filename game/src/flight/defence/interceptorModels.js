// The two Halcón interceptors as drawn: instances of session 1's `halcon` model from the asset
// library (a plain dart stands in until the model is loaded), posed each frame from the patrol's
// kinematic state: heading, pitch from the climb, bank from the turn, gear legs folding by the
// model's `gear_retract` extra, beacon and strobe lamps, and the afterburner lamp when fast.
// They are not fleet vehicles and have no physics body.
import * as THREE from 'three';

const MODEL_ID = 'halcon';
const BLENDER_AXES = Object.freeze({ x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 0, -1), z: new THREE.Vector3(0, 1, 0) });
const LAMPS = ['lamp_beacon', 'lamp_strobe', 'lamp_landing', 'lamp_burner'];
const GEAR = ['gear_nose', 'gear_l', 'gear_r'];
const turn = new THREE.Quaternion();

/**
 * Creates the pair's bodies.
 * @param {import('../../core/systems/gameContext.js').GameContext} context
 * @param {number} count How many interceptors.
 * @returns {{ready: boolean, load: () => void, pose: (index: number, craft: object, visible: boolean, deltaSeconds: number) => void,
 *   noseOf: (index: number, out: {x: number, y: number, z: number}) => object, dispose: () => void}}
 */
export function createInterceptorModels(context, count) {
  const scene = context.view?.scene ?? null;
  const bodies = [];
  let loading = false;
  let clock = 0;

  function standIn() {
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color: 0x6f7a80, roughness: 0.6, metalness: 0.3 });
    const hull = new THREE.Mesh(new THREE.ConeGeometry(1.1, 15, 8), material);
    hull.rotation.x = -Math.PI / 2;
    hull.position.y = 2;
    const wing = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.2, 4), material);
    wing.position.set(0, 2, 2.5);
    group.add(hull, wing);
    return group;
  }

  function build(asset) {
    const root = new THREE.Group();
    root.name = 'air_guard_interceptor';
    root.rotation.order = 'YXZ';
    root.visible = false;
    const model = asset ? asset.instantiate({ lod: 0 }) : standIn();
    root.add(model);
    const body = { root, asset, gear: [], lamps: {}, lit: {}, folded: -1 };
    if (asset) {
      const retract = asset.extras?.gear_retract ?? {};
      for (const name of GEAR) {
        const node = model.getObjectByName(name);
        const spec = retract[name];
        const letter = Array.isArray(spec) ? spec[0] : spec?.axis;
        const degrees = Array.isArray(spec) ? spec[1] : spec?.degrees;
        if (node && BLENDER_AXES[letter]) body.gear.push({ node, rest: node.quaternion.clone(), axis: BLENDER_AXES[letter], angle: THREE.MathUtils.degToRad(Number(degrees) || 0) });
      }
      for (const name of LAMPS) { body.lamps[name] = []; body.lit[name] = null; }
      model.traverse((node) => { if (node.isMesh && body.lamps[node.material?.name]) body.lamps[node.material.name].push(node); });
    }
    scene?.add(root);
    return body;
  }

  function setLamp(body, name, on) {
    if (!body.asset || body.lit[name] === on || !body.lamps[name]) return;
    body.lit[name] = on;
    const list = body.lamps[name];
    for (let i = 0; i < list.length; i += 1) list[i].material = body.asset.lampMaterial(name, on);
  }

  function rebuild(asset) {
    for (const body of bodies.splice(0)) body.root.removeFromParent();
    for (let i = 0; i < count; i += 1) bodies.push(build(asset));
  }

  const models = {
    /** True once the real model is in use. */
    ready: false,

    /** Asks the asset library for the Halcón (once); until it arrives the stand-in flies. */
    load() {
      if (loading || models.ready) return;
      loading = true;
      const assets = context.assets;
      if (bodies.length === 0) rebuild(null);
      if (!assets || !assets.registry || !assets.registry[MODEL_ID]) return;
      const use = () => {
        try {
          if (!assets.has(MODEL_ID)) return;
          rebuild(assets.get(MODEL_ID));
          models.ready = true;
        } catch (error) {
          context.log?.warn?.(`air guard: the Halcón model could not be used: ${error instanceof Error ? error.message : error}`);
        }
      };
      if (assets.has(MODEL_ID)) use();
      else Promise.resolve(assets.load([MODEL_ID])).then(use, () => { /* the stand-in flies */ });
    },

    /** Puts one interceptor where its state says, or hides it. */
    pose(index, craft, visible, deltaSeconds) {
      const body = bodies[index];
      if (!body) return;
      if (index === 0) clock += deltaSeconds;
      body.root.visible = visible;
      if (!visible) return;
      body.root.position.set(craft.x, craft.y, craft.z);
      body.root.rotation.set(craft.pitch, -craft.heading, -craft.bank);
      const folded = 1 - craft.gear;
      if (folded !== body.folded) {
        body.folded = folded;
        const t = folded * folded * (3 - 2 * folded);
        for (let i = 0; i < body.gear.length; i += 1) {
          const leg = body.gear[i];
          turn.setFromAxisAngle(leg.axis, leg.angle * t);
          leg.node.quaternion.copy(leg.rest).multiply(turn);
          leg.node.visible = folded < 0.98;
        }
      }
      const running = craft.phase !== 'parked';
      const phase = (clock + index * 0.37) % 1.4;
      setLamp(body, 'lamp_beacon', running && phase < 0.16);
      setLamp(body, 'lamp_strobe', craft.phase === 'air' && (phase > 0.7 && phase < 0.76));
      setLamp(body, 'lamp_landing', running && folded < 0.1);
      setLamp(body, 'lamp_burner', Boolean(craft.afterburner));
    },

    /** The world place of an interceptor's gun muzzle (beside the nose). */
    noseOf(index, out) {
      const craft = bodies[index]?.root;
      if (!craft) return out;
      const heading = -craft.rotation.y;
      out.x = craft.position.x + Math.sin(heading) * 7;
      out.y = craft.position.y + 1.6;
      out.z = craft.position.z - Math.cos(heading) * 7;
      return out;
    },

    dispose() {
      for (const body of bodies.splice(0)) body.root.removeFromParent();
    },
  };
  return models;
}
