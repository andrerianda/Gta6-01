// The visible model of one vehicle and its moving parts: the Blender model from the asset
// library when its model is registered (else the temporary stand-in), painted per spawn, with
// a near level (lod0 with separate wheels, steering wheel, doors, windows, bumpers; its sun
// shadow cast by one merged caster) and two merged levels of one draw call each (lod1 middle,
// lod2 far; vehicleMergedLevels.js). Each frame it follows the physics body and turns the wheels
// (spin, steer, suspension travel) and the steering wheel; crashes dent the body, crack and drop
// windows and tear off bumpers. Hero cars get a deeper, glossier clear coat.
import * as THREE from 'three';
import { findNode, setPaint } from '../assets/index.js';
import { buildPlaceholderVehicle, placeholderPaintOf } from './placeholderVehicleModel.js';
import { dentVertices, windowStateAfter } from './vehicleDamage.js';
import { createMergedVehicleMesh, createVehicleShadowCaster, setMergedVehicleLook } from './vehicleMergedLevels.js';
import { createNearMerge } from './vehicleNearMerge.js';
import { vehicleModelIdOf } from './vehicleSpawning.js';
import { dayEnvironmentOf, trackVehicleMaterialsOf } from './vehicleNightReflections.js';
import { limitVehicleMatrixUpdates } from './vehicleMatrixUpdates.js';

const WHEEL_NAMES = ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'];
/** A two-wheeler's wheel nodes: front, rear. */
const BIKE_WHEEL_NAMES = ['wheel_f', 'wheel_r'];
const WINDOW_NAMES = ['window_front', 'window_rear', 'window_l', 'window_r'];
const LIGHT_ANCHORS = ['anchor_light_head_l', 'anchor_light_head_r', 'anchor_light_tail_l', 'anchor_light_tail_r', 'anchor_siren', 'anchor_exhaust_1'];
/** Catalog classes whose paint gets the hero clear coat. */
const HERO_CLASSES = new Set(['sports', 'super', 'luxury', 'muscle', 'classic']);
/** Steering wheel turns per road wheel turn. */
const STEERING_RATIO = 8;
/** Paint of a burnt-out wreck. */
export const CHARRED_PAINT = '#1d1b1a';
const crackedGlass = new THREE.MeshStandardMaterial({ name: 'glass_cracked', color: 0xb8c4c8, roughness: 0.55, metalness: 0.1, transparent: true, opacity: 0.88 });
const glossyAssets = new WeakSet();
const hub = { x: 0, y: 0, z: 0 };
const localPoint = new THREE.Vector3();
const localDirection = new THREE.Vector3();
const inverse = new THREE.Matrix4();
const spinQuaternion = new THREE.Quaternion();
const axisY = new THREE.Vector3(0, 1, 0);
const box = new THREE.Box3();

/**
 * Deepens the clear coat of a hero model's paint (the asset's own paint and every colour
 * variant already made from it; later variants are cloned from the tuned paint).
 * @param {object} asset The vehicle asset.
 */
function glossHeroPaint(asset) {
  if (glossyAssets.has(asset)) return;
  glossyAssets.add(asset);
  const tune = (material) => {
    if (!material?.isMeshPhysicalMaterial) return;
    material.clearcoat = 1;
    material.clearcoatRoughness = 0.012;
    material.roughness = Math.min(material.roughness, 0.55);
    // The day strength; vehicleNightReflections.js lowers it at night.
    material.userData.dayEnvIntensity = Math.max(dayEnvironmentOf(material), 1.35);
    material.envMapIntensity = material.userData.dayEnvIntensity;
    material.needsUpdate = true;
  };
  tune(asset.materials.get('paint'));
  for (const [key, material] of asset.variants) if (key.startsWith('paint/')) tune(material);
}

/**
 * Where the engine bay is in model space: under the middle of the hood when the model has one,
 * else a third of the way back from the nose at bonnet height.
 * @param {THREE.Object3D} near The lod0 instance (at the origin).
 * @param {object} entry The vehicleCatalog entry.
 * @returns {THREE.Vector3}
 */
function engineBayOf(near, entry) {
  const hood = findNode(near, 'hood');
  if (hood) {
    near.updateMatrixWorld(true);
    box.setFromObject(hood);
    if (!box.isEmpty()) return box.getCenter(new THREE.Vector3()).setY(Math.max(0.3, box.min.y - 0.12));
  }
  const { length, height } = entry.dimensions;
  return new THREE.Vector3(0, height * 0.55, -length * 0.5 + Math.min(0.9, length * 0.18));
}

/**
 * Builds the model of one vehicle.
 * @param {object} assets The asset library (context.assets), or null.
 * @param {object} entry The vehicleCatalog entry.
 * @param {string} colour The paint.
 * @param {{x: number, y: number, z: number, radius: number}[]} wheels Hub positions in model space.
 * @returns {object} The rig: root, near, mid, far (merged meshes or null), shadowCaster, wheels,
 *   steeringWheel, windows, bumpers, anchors (model space: lights, siren, exhaust, engine_bay),
 *   asset (null for the stand-in), look (paint, lamps and sirens of the merged levels).
 */
export function createVehicleRig(assets, entry, colour, wheels) {
  const root = new THREE.Group();
  root.name = `vehicle_${entry.id}`;
  let near = null;
  let mid = null;
  let far = null;
  let shadowCaster = null;
  let asset = null;
  const anchors = {};
  const modelId = vehicleModelIdOf(entry, assets);
  if (modelId) {
    asset = assets.get(modelId);
    if (HERO_CLASSES.has(entry.class)) glossHeroPaint(asset);
    near = asset.instantiate({ lod: 0 });
    setPaint(near, colour);
    if (asset.lodCount > 1) {
      near.traverse((node) => { if (node.isMesh) node.castShadow = false; });
      shadowCaster = createVehicleShadowCaster(asset);
      mid = createMergedVehicleMesh(asset, 1, colour, true);
      far = createMergedVehicleMesh(asset, 2, colour, false);
    }
    for (const name of LIGHT_ANCHORS) if (asset.anchors[name]) anchors[name] = asset.anchors[name].position.clone();
  } else {
    const built = buildPlaceholderVehicle(entry, colour, wheels);
    near = built.root;
    Object.assign(anchors, built.anchors);
  }
  anchors.engine_bay = engineBayOf(near, entry);
  root.add(near);
  for (const part of [shadowCaster, mid, far]) if (part) root.add(part);
  if (mid) mid.visible = false;
  if (far) far.visible = false;
  const wheelNodes = (wheels.length === 2 ? BIKE_WHEEL_NAMES : WHEEL_NAMES).map((name) => findNode(near, name));
  const rest = wheelNodes.map((node) => (node ? node.position.clone() : null));
  const restQuaternions = wheelNodes.map((node) => (node ? node.quaternion.clone() : null));
  const steeringWheel = findNode(near, 'steering_wheel');
  // A motorcycle's front fork (an empty on the raked steering axis carrying the front wheel).
  const fork = wheels.length === 2 ? findNode(near, 'fork') : null;
  const windows = {};
  for (const name of WINDOW_NAMES) {
    const node = findNode(near, name);
    if (!node) continue;
    const centre = node.position.clone();
    if (node.isMesh) {
      if (!node.geometry.boundingSphere) node.geometry.computeBoundingSphere();
      centre.add(node.geometry.boundingSphere.center);
    }
    windows[name] = { node, state: 0, centre, original: node.isMesh ? node.material : null };
  }
  const body = findNode(near, 'lod0');
  const rig = {
    root, near, mid, far, shadowCaster, asset, anchors, wheels: wheelNodes, rest, restQuaternions,
    steeringWheel, steeringRest: steeringWheel ? steeringWheel.quaternion.clone() : null,
    fork, forkRest: fork ? fork.quaternion.clone() : null,
    windows, bumpers: { front: findNode(near, 'bumper_f'), rear: findNode(near, 'bumper_r') },
    dentables: body ? collectDentables(body) : [], paint: body?.material ?? null, level: 0,
    look: { colour, lamps: false, sirens: 0 },
    /** The paint shown now (a respray, scorching or char), for the merged levels. */
    paintColour: colour,
    /** True once dented, glass broken, a bumper lost or charred: the near level shows its parts. */
    damaged: false,
    nearMerge: null,
  };
  // After the dentables: the near level in a handful of draws (vehicleNearMerge.js).
  if (asset && asset.lodCount > 1) rig.nearMerge = createNearMerge(rig, colour);
  // Every material of the car reflects the sky less at night (QA: light cars glowed like lamps).
  trackVehicleMaterialsOf(root);
  // Static parts stop recomputing their matrices; hidden parts skip them (vehicleMatrixUpdates.js).
  limitVehicleMatrixUpdates(rig);
  return rig;
}

/**
 * The meshes a crash may dent: the body shell and its panels (doors, hood, trunk, bumpers),
 * not the wheels, glass or steering wheel. Their geometry is cloned on the first dent.
 * @param {THREE.Object3D} body The lod0 node.
 * @returns {{mesh: THREE.Mesh, original: Float32Array | null}[]}
 */
function collectDentables(body) {
  const found = [];
  const visit = (node) => {
    if (/^(wheel_|window_|steering|lamp_)/.test(node.name)) return;
    if (node.isMesh) found.push({ mesh: node, original: null });
    for (const child of node.children) visit(child);
  };
  visit(body);
  return found;
}

/**
 * Turns the wheels and the steering wheel from the physics state (near level only).
 * @param {object} rig From createVehicleRig.
 * @param {import('../physics/vehicles/Vehicle.js').Vehicle} car The physics vehicle.
 */
export function poseVehicleRig(rig, car) {
  for (let i = 0; i < rig.wheels.length; i += 1) {
    const node = rig.wheels[i];
    if (!node || !car.tuning.wheels[i]) continue;
    car.wheelHubPosition(i, hub);
    node.position.set(rig.rest[i].x, rig.rest[i].y + (hub.y - car.tuning.wheels[i].y), rig.rest[i].z);
    // A bike's front wheel hangs in its fork, which steers about the raked axis (the fork's own
    // Y); the wheel only rolls. A car's wheel steers about the model's vertical itself.
    const steer = i === 0 && rig.fork ? 0 : car.wheelSteer[i];
    // Roll about the model's X (forward roll is negative about +X for a car facing -Z), then the
    // wheel's own rest orientation (mirrored wheels too).
    node.rotation.set(-car.wheelSpin[i], -steer, 0, 'YXZ');
    node.quaternion.multiply(rig.restQuaternions[i]);
  }
  if (rig.fork) {
    spinQuaternion.setFromAxisAngle(axisY, -(car.wheelSteer[0] ?? 0));
    rig.fork.quaternion.copy(rig.forkRest).multiply(spinQuaternion);
  }
  if (rig.steeringWheel) {
    spinQuaternion.setFromAxisAngle(axisY, -car.steerAngle * STEERING_RATIO);
    rig.steeringWheel.quaternion.copy(rig.steeringRest).multiply(spinQuaternion);
  }
}

/**
 * Shows one level: 0 near (every part, the merged shadow caster), 1 middle (merged lod1),
 * 2 far (merged lod2). A model without merged levels shows its near level throughout.
 * @param {object} rig From createVehicleRig.
 * @param {number} level 0, 1 or 2.
 */
export function showVehicleLevel(rig, level) {
  if (rig.level === level) return;
  rig.level = level;
  if (!rig.far) return;
  rig.near.visible = level === 0;
  rig.shadowCaster.visible = level === 0;
  // The merged levels are drawn by the instanced batches (vehicleInstancedLevels.js); their nodes
  // in the rig only carry the pose and stay hidden.
  rig.mid.visible = false;
  rig.far.visible = false;
}

/**
 * Sets what the merged levels show: paint, head and tail lamps, siren halves (bit 1 a, bit 2 b).
 * Only swaps materials when something changed, so it is cheap to call every frame.
 * @param {object} rig From createVehicleRig.
 * @param {string} colour The paint.
 * @param {boolean} lamps Head and tail lamps lit.
 * @param {number} sirens Siren bits.
 */
export function setVehicleRigLook(rig, colour, lamps, sirens) {
  const look = rig.look;
  if (look.colour === colour && look.lamps === lamps && look.sirens === sirens) return;
  look.colour = colour;
  look.lamps = lamps;
  look.sirens = sirens;
  if (!rig.asset) return;
  for (const mesh of [rig.mid, rig.far]) if (mesh) setMergedVehicleLook(mesh, rig.asset, colour, lamps, sirens);
}

/**
 * Paints the whole model (every level) in one colour: a respray, a repair or charring.
 * @param {object} rig From createVehicleRig.
 * @param {string} colour The paint.
 */
export function paintVehicleRig(rig, colour) {
  if (rig.asset) setPaint(rig.near, colour);
  else rig.near.traverse((node) => { if (node.isMesh && node.material?.userData?.role === 'paint') node.material = placeholderPaintOf(colour); });
  trackVehicleMaterialsOf(rig.near);
  rig.paintColour = colour;
  setVehicleRigLook(rig, colour, rig.look.lamps, rig.look.sirens);
}

/**
 * Shows a crash on the model: dents the body around the impact, cracks or shatters nearby
 * windows, and drops a bumper when asked.
 * @param {object} rig From createVehicleRig.
 * @param {{x: number, y: number, z: number}} worldPoint The impact point.
 * @param {{x: number, y: number, z: number}} worldNormal Unit direction the car was pushed (into the body).
 * @param {number} damage Health points the crash took.
 * @param {number} depth Dent depth at the centre, metres.
 * @returns {{cracked: number, shattered: number}} Windows this crash cracked and shattered.
 */
export function showVehicleCrash(rig, worldPoint, worldNormal, damage, depth) {
  rig.damaged = true;
  // updateWorldMatrix, not updateMatrixWorld: hidden parts skip the latter (vehicleMatrixUpdates.js).
  rig.root.updateWorldMatrix(true, true);
  const radius = 0.55 + depth * 3;
  for (let i = 0; depth > 0.004 && i < rig.dentables.length; i += 1) {
    const dentable = rig.dentables[i];
    const mesh = dentable.mesh;
    inverse.copy(mesh.matrixWorld).invert();
    localPoint.set(worldPoint.x, worldPoint.y, worldPoint.z).applyMatrix4(inverse);
    if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
    const sphere = mesh.geometry.boundingSphere;
    if (localPoint.distanceTo(sphere.center) > sphere.radius + radius) continue;
    const geometry = mesh.geometry;
    if (!dentable.original) {
      mesh.geometry = geometry.clone();
      dentable.original = Float32Array.from(geometry.attributes.position.array);
      dentable.originalNormals = geometry.attributes.normal ? Float32Array.from(geometry.attributes.normal.array) : null;
    }
    localDirection.set(worldNormal.x, worldNormal.y, worldNormal.z).transformDirection(inverse);
    const positions = mesh.geometry.attributes.position;
    const normals = mesh.geometry.attributes.normal ?? null;
    if (dentVertices(positions.array, dentable.original, localPoint, localDirection, radius, depth, normals ? normals.array : null) > 0) {
      positions.needsUpdate = true;
      if (normals) normals.needsUpdate = true;
      mesh.geometry.computeBoundingSphere();
    }
  }
  inverse.copy(rig.near.matrixWorld).invert();
  localPoint.set(worldPoint.x, worldPoint.y, worldPoint.z).applyMatrix4(inverse);
  const broken = { cracked: 0, shattered: 0 };
  for (const name in rig.windows) {
    const pane = rig.windows[name];
    const state = windowStateAfter(pane.state, localPoint.distanceTo(pane.centre), damage);
    if (setVehicleWindowState(rig, name, state)) broken[state === 2 ? 'shattered' : 'cracked'] += 1;
  }
  return broken;
}

/**
 * Sets one window: 0 whole, 1 cracked (frosted, cracked glass), 2 shattered (gone). A window
 * only gets worse this way; repairVehicleRig puts the glass back.
 * @param {object} rig From createVehicleRig.
 * @param {string} name 'window_front' | 'window_rear' | 'window_l' | 'window_r'.
 * @param {number} state 0, 1 or 2.
 * @returns {boolean} True when the window changed.
 */
export function setVehicleWindowState(rig, name, state) {
  const pane = rig.windows[name];
  if (!pane || state <= pane.state) return false;
  pane.state = state;
  rig.damaged = true;
  if (state === 2) pane.node.visible = false;
  else if (pane.original) pane.node.material = crackedGlass;
  return true;
}

/**
 * Undoes every crash on the model: body shape, glass, bumpers and paint.
 * @param {object} rig From createVehicleRig.
 * @param {string} colour The paint to put back.
 */
export function repairVehicleRig(rig, colour) {
  for (const dentable of rig.dentables) {
    if (!dentable.original) continue;
    const { position: positions, normal: normals } = dentable.mesh.geometry.attributes;
    positions.array.set(dentable.original);
    positions.needsUpdate = true;
    if (normals && dentable.originalNormals) {
      normals.array.set(dentable.originalNormals);
      normals.needsUpdate = true;
    }
  }
  for (const name in rig.windows) {
    const pane = rig.windows[name];
    pane.state = 0;
    pane.node.visible = true;
    if (pane.original) pane.node.material = pane.original;
  }
  if (rig.bumpers.front) rig.bumpers.front.visible = true;
  if (rig.bumpers.rear) rig.bumpers.rear.visible = true;
  paintVehicleRig(rig, colour);
  rig.damaged = false;
}

/**
 * Tears a bumper off the model (it is hidden; the effects system may throw debris).
 * @param {object} rig From createVehicleRig.
 * @param {'front' | 'rear'} which The bumper.
 * @returns {boolean} True when there was one to drop.
 */
export function dropVehicleBumper(rig, which) {
  const node = rig.bumpers[which];
  if (!node || !node.visible) return false;
  node.visible = false;
  rig.damaged = true;
  return true;
}

/**
 * Chars the paint of a wreck (every level).
 * @param {object} rig From createVehicleRig.
 */
export function charVehicleRig(rig) {
  paintVehicleRig(rig, CHARRED_PAINT);
  rig.damaged = true;
}
