// The visible model of one vehicle and its moving parts: the Blender model from the asset
// library when its model is registered (else the temporary stand-in), painted per spawn, with
// a near level (lod0 with separate wheels, steering wheel, windows, bumpers) and a far level
// (one merged mesh). Each frame it follows the physics body and turns the wheels (spin, steer,
// suspension travel) and the steering wheel; crashes dent the body, crack and drop windows and
// tear off bumpers.
import * as THREE from 'three';
import { findNode, setPaint } from '../assets/index.js';
import { buildPlaceholderVehicle } from './placeholderVehicleModel.js';
import { dentVertices, windowStateAfter } from './vehicleDamage.js';

const WHEEL_NAMES = ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'];
const WINDOW_NAMES = ['window_front', 'window_rear', 'window_l', 'window_r'];
const LIGHT_ANCHORS = ['anchor_light_head_l', 'anchor_light_head_r', 'anchor_light_tail_l', 'anchor_light_tail_r'];
/** Steering wheel turns per road wheel turn. */
const STEERING_RATIO = 8;
const crackedGlass = new THREE.MeshStandardMaterial({ name: 'glass_cracked', color: 0xb8c4c8, roughness: 0.55, metalness: 0.1, transparent: true, opacity: 0.88 });
const charredPaint = new THREE.MeshStandardMaterial({ name: 'paint_charred', color: 0x1d1b1a, roughness: 0.95, metalness: 0 });
const hub = { x: 0, y: 0, z: 0 };
const localPoint = new THREE.Vector3();
const localDirection = new THREE.Vector3();
const inverse = new THREE.Matrix4();
const spinQuaternion = new THREE.Quaternion();
const axisY = new THREE.Vector3(0, 1, 0);

/**
 * Builds the model of one vehicle.
 * @param {object} assets The asset library (context.assets), or null.
 * @param {object} entry The vehicleCatalog entry.
 * @param {string} colour The paint.
 * @param {{x: number, y: number, z: number, radius: number}[]} wheels Hub positions in model space.
 * @returns {object} The rig: root, near, far, wheels, steeringWheel, windows, bumpers, body,
 *   anchors (light anchors in model space), asset (null for the stand-in).
 */
export function createVehicleRig(assets, entry, colour, wheels) {
  const root = new THREE.Group();
  root.name = `vehicle_${entry.id}`;
  let near = null;
  let far = null;
  let asset = null;
  const anchors = {};
  if (assets && typeof assets.has === 'function' && assets.has(entry.id)) {
    asset = assets.get(entry.id);
    near = asset.instantiate({ lod: 0 });
    setPaint(near, colour);
    if (asset.lodCount > 1) {
      far = asset.instantiate({ lod: Math.min(2, asset.lodCount - 1) });
      setPaint(far, colour);
    }
    for (const name of LIGHT_ANCHORS) if (asset.anchors[name]) anchors[name] = asset.anchors[name].position.clone();
  } else {
    const built = buildPlaceholderVehicle(entry, colour, wheels);
    near = built.root;
    Object.assign(anchors, built.anchors);
  }
  root.add(near);
  if (far) {
    far.visible = false;
    root.add(far);
  }
  const wheelNodes = WHEEL_NAMES.map((name) => findNode(near, name));
  const rest = wheelNodes.map((node) => (node ? node.position.clone() : null));
  const restQuaternions = wheelNodes.map((node) => (node ? node.quaternion.clone() : null));
  const steeringWheel = findNode(near, 'steering_wheel');
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
  near.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = node.castShadow || node.name === 'lod0';
    }
  });
  return {
    root, near, far, asset, anchors, wheels: wheelNodes, rest, restQuaternions,
    steeringWheel, steeringRest: steeringWheel ? steeringWheel.quaternion.clone() : null,
    windows, bumpers: { front: findNode(near, 'bumper_f'), rear: findNode(near, 'bumper_r') },
    body: findNode(near, 'lod0'), paint: findNode(near, 'lod0')?.material ?? null, dentable: null, level: 0,
  };
}

/**
 * Turns the wheels and the steering wheel from the physics state (near level only).
 * @param {object} rig From createVehicleRig.
 * @param {import('../physics/vehicles/Vehicle.js').Vehicle} car The physics vehicle.
 */
export function poseVehicleRig(rig, car) {
  for (let i = 0; i < 4; i += 1) {
    const node = rig.wheels[i];
    if (!node) continue;
    car.wheelHubPosition(i, hub);
    node.position.set(rig.rest[i].x, rig.rest[i].y + (hub.y - car.tuning.wheels[i].y), rig.rest[i].z);
    node.rotation.set(-car.wheelSpin[i], -car.wheelSteer[i], 0, 'YXZ');
    node.quaternion.premultiply(rig.restQuaternions[i]);
  }
  if (rig.steeringWheel) {
    spinQuaternion.setFromAxisAngle(axisY, -car.steerAngle * STEERING_RATIO);
    rig.steeringWheel.quaternion.copy(rig.steeringRest).multiply(spinQuaternion);
  }
}

/**
 * Shows one level: 0 near (all parts), 1 far (the merged mesh, when the model has one).
 * @param {object} rig From createVehicleRig.
 * @param {number} level 0 or 1.
 */
export function showVehicleLevel(rig, level) {
  if (rig.level === level) return;
  rig.level = level;
  if (!rig.far) return;
  rig.near.visible = level === 0;
  rig.far.visible = level !== 0;
}

/**
 * Shows a crash on the model: dents the body around the impact, cracks or shatters nearby
 * windows, and drops a bumper when asked.
 * @param {object} rig From createVehicleRig.
 * @param {{x: number, y: number, z: number}} worldPoint The impact point.
 * @param {{x: number, y: number, z: number}} worldNormal Unit direction the car was pushed (into the body).
 * @param {number} damage Health points the crash took.
 * @param {number} depth Dent depth at the centre, metres.
 */
export function showVehicleCrash(rig, worldPoint, worldNormal, damage, depth) {
  rig.root.updateMatrixWorld(true);
  const body = rig.body;
  if (body && body.isMesh && depth > 0.004) {
    if (!rig.dentable) {
      body.geometry = body.geometry.clone();
      rig.dentable = Float32Array.from(body.geometry.attributes.position.array);
    }
    inverse.copy(body.matrixWorld).invert();
    localPoint.set(worldPoint.x, worldPoint.y, worldPoint.z).applyMatrix4(inverse);
    localDirection.set(worldNormal.x, worldNormal.y, worldNormal.z).transformDirection(inverse);
    const positions = body.geometry.attributes.position;
    if (dentVertices(positions.array, rig.dentable, localPoint, localDirection, 0.55 + depth * 3, depth) > 0) {
      positions.needsUpdate = true;
      body.geometry.computeVertexNormals();
    }
  }
  inverse.copy(rig.near.matrixWorld).invert();
  localPoint.set(worldPoint.x, worldPoint.y, worldPoint.z).applyMatrix4(inverse);
  for (const name in rig.windows) {
    const pane = rig.windows[name];
    const state = windowStateAfter(pane.state, localPoint.distanceTo(pane.centre), damage);
    if (state === pane.state) continue;
    pane.state = state;
    if (state === 2) pane.node.visible = false;
    else if (pane.original) pane.node.material = crackedGlass;
  }
}

/**
 * Undoes every crash on the model: body shape, glass, bumpers and paint.
 * @param {object} rig From createVehicleRig.
 * @param {string} colour The paint to put back.
 */
export function repairVehicleRig(rig, colour) {
  if (rig.dentable) {
    const positions = rig.body.geometry.attributes.position;
    positions.array.set(rig.dentable);
    positions.needsUpdate = true;
    rig.body.geometry.computeVertexNormals();
  }
  for (const name in rig.windows) {
    const pane = rig.windows[name];
    pane.state = 0;
    pane.node.visible = true;
    if (pane.original) pane.node.material = pane.original;
  }
  if (rig.bumpers.front) rig.bumpers.front.visible = true;
  if (rig.bumpers.rear) rig.bumpers.rear.visible = true;
  for (const level of [rig.near, rig.far]) {
    if (!level) continue;
    if (rig.asset) setPaint(level, colour);
    else level.traverse((node) => { if (node.isMesh && node.material === charredPaint) node.material = rig.paint; });
  }
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
  return true;
}

/**
 * Chars the paint of a wreck (both levels).
 * @param {object} rig From createVehicleRig.
 */
export function charVehicleRig(rig) {
  for (const level of [rig.near, rig.far]) {
    if (!level) continue;
    if (rig.asset) setPaint(level, '#1d1b1a');
    else level.traverse((node) => { if (node.isMesh && node.material?.name === 'paint') node.material = charredPaint; });
  }
}
