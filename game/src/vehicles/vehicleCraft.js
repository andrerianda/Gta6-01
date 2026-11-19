// Boats and helicopters in the fleet: the physics craft for a catalog model (watercraft/Boat.js or
// aircraft/Helicopter.js, docs/PHYSICS.md), the driver's controls turned into its input
// (vehicleCraftControls.js), and its moving parts drawn from the physics state: main and tail
// rotors spinning (the blur discs replace the blades at speed), outboards swinging with the helm
// and their propellers turning, the helm's wheel. record.car IS the Boat or Helicopter, so the
// audio (rpm, throttle, rotorSpeed) and effects (wake, spray) read it like a car.
// The boat models stand with their origin on the waterline, the physics boat on its keel: the
// drawn root rides `lift` metres up the hull's own up axis, so every anchor (seats, wake, spray)
// is where the model has it.
import * as THREE from 'three';
import { findNode } from '../assets/index.js';
import { Boat, deriveBoatTuning } from '../physics/watercraft/Boat.js';
import { Helicopter, deriveHelicopterTuning } from '../physics/aircraft/Helicopter.js';
import { boatInputFrom, craftKindOf, helicopterControlsActive, helicopterInputFrom } from './vehicleCraftControls.js';

/** Anchors the craft models carry besides the cars' lamp anchors (effects and boarding). */
const CRAFT_ANCHORS = ['anchor_wake', 'anchor_spray_l', 'anchor_spray_r', 'anchor_board', 'anchor_searchlight', 'anchor_camera', 'anchor_door_driver'];
/** Rotor speed (0..1) above which the blur disc shows instead of the blades. */
const BLUR_FROM = 0.55;
/** Share of the blur discs' own opacity kept (the skyline picture's 0.55 still read as a plate in play). */
const BLUR_OPACITY = 0.6;
/** Outboard swing at full helm, radians. */
const OUTBOARD_SWING = 0.42;
const HELM_TURNS = 2.4;
const axisX = new THREE.Vector3(1, 0, 0);
const axisY = new THREE.Vector3(0, 1, 0);
const axisZ = new THREE.Vector3(0, 0, 1);
const turn = new THREE.Quaternion();
const lifted = new THREE.Vector3();
const hiddenBlades = new THREE.MeshBasicMaterial({ name: 'rotor_hidden', visible: false });
const tunings = new Map();

export { craftKindOf };

/**
 * Makes the physics craft for a catalog model.
 * @param {object} world The PhysicsWorld.
 * @param {object} entry The vehicleCatalog entry (a boat or a helicopter).
 * @param {{position: {x: number, y: number | null, z: number}, heading: number, parked: boolean}} plan From planVehicleSpawn.
 * @param {unknown} userRef The entity id.
 * @returns {Boat | Helicopter}
 */
export function createCraftBody(world, entry, plan, userRef) {
  const kind = craftKindOf(entry);
  if (!tunings.has(entry.id)) tunings.set(entry.id, kind === 'boat' ? deriveBoatTuning(entry) : deriveHelicopterTuning(entry));
  const tuning = tunings.get(entry.id);
  const { x, y, z } = plan.position;
  if (kind === 'boat') return new Boat(world, tuning, { x, z, heading: plan.heading, userRef });
  const airborne = y !== null && y !== undefined;
  return new Helicopter(world, tuning, { x, y: airborne ? y : undefined, z, heading: plan.heading, userRef, engineOn: airborne && !plan.parked });
}

/**
 * The craft's drawn parts, found once on its rig (after createVehicleRig).
 * @param {object} rig From createVehicleRig.
 * @param {object} entry The vehicleCatalog entry.
 * @returns {object} The craft record: kind, lift, rotors, outboards, propellers, helm.
 */
export function createCraftParts(rig, entry) {
  const kind = craftKindOf(entry);
  const near = rig.near;
  const part = (name) => {
    const node = findNode(near, name);
    return node ? { node, rest: node.quaternion.clone(), material: node.isMesh ? node.material : null } : null;
  };
  if (rig.asset) for (const name of CRAFT_ANCHORS) if (rig.asset.anchors[name]) rig.anchors[name] = rig.asset.anchors[name].position.clone();
  const craft = {
    kind,
    lift: kind === 'boat' ? entry.dimensions.draft ?? 0.5 : 0,
    rotorMain: part('rotor_main'), rotorMainBlur: part('rotor_main_blur'),
    rotorTail: part('rotor_tail'), rotorTailBlur: part('rotor_tail_blur'),
    outboards: [part('engine_l'), part('engine_r')].filter(Boolean),
    propellers: [part('propeller_l'), part('propeller_r')].filter(Boolean),
    helm: rig.steeringWheel ? { node: rig.steeringWheel, rest: rig.steeringWheel.quaternion.clone() } : null,
    propellerAngle: 0,
    blurred: null,
    input: { collective: 0, pitch: 0, roll: 0, yaw: 0, drive: 0, steer: 0 },
  };
  // The blur discs as loaded read as dark solid plates from above and cast a disc of shadow: a
  // fainter copy of their material, and no shadow.
  for (const disc of [craft.rotorMainBlur, craft.rotorTailBlur]) {
    if (!disc?.node.isMesh || !disc.node.material) continue;
    disc.node.castShadow = false;
    const faint = disc.node.material.clone();
    faint.transparent = true;
    faint.depthWrite = false;
    faint.opacity = (faint.opacity ?? 1) * BLUR_OPACITY;
    disc.node.material = faint;
  }
  showRotorBlur(craft, false);
  return craft;
}

/**
 * One fixed step of a driven (or abandoned) craft: the controls into its input.
 * @param {object} craft From createCraftParts.
 * @param {object} controls The vehicle's controls.
 * @param {Boat | Helicopter} body The physics craft.
 * @param {boolean} hasDriver Someone sits at the controls.
 */
export function driveCraft(craft, controls, body, hasDriver) {
  if (craft.kind === 'boat') {
    boatInputFrom(controls, body.input);
    // Shift 14 (the lead at the helm of a boat moored at the quay: full throttle, 0.01 m/s): a
    // boat at rest against the quay or the bottom falls asleep and its thrust went to a sleeping
    // body. The helm wakes it, as a car's Vehicle.beforeStep wakes on drive.
    if ((body.input.drive !== 0 || body.input.steer !== 0) && body.body && body.body.asleep) body.body.wake();
    return;
  }
  if (hasDriver && !body.engineOn && helicopterControlsActive(controls)) body.engineOn = true;
  helicopterInputFrom(controls, body.speed, body.input);
}

/** A wrecked craft: no drive; a helicopter's engine dies and it falls. */
export function holdCraft(craft, body) {
  if (craft.kind === 'boat') {
    body.input.drive = 0;
    body.input.steer = 0;
    return;
  }
  body.engineOn = false;
  body.clearTarget();
  body.input.collective = body.input.pitch = body.input.roll = body.input.yaw = 0;
}

/** Someone took the controls: a helicopter's engine starts (the rotor spins up over 4 s). */
export function boardCraft(craft, body) {
  if (craft.kind === 'helicopter') body.engineOn = true;
}

/** The pilot got out: on (or just over) the ground the engine stops; in the air it hovers on. */
export function leaveCraft(craft, body) {
  if (craft.kind === 'helicopter' && body.altitude < 1.2) body.engineOn = false;
}

/**
 * Raises the drawn root from the physics origin to the model's origin (boats: the waterline).
 * @param {object} craft From createCraftParts.
 * @param {THREE.Object3D} root The rig root, its pose just set from the body.
 */
export function liftCraftRoot(craft, root) {
  if (!craft.lift) return;
  lifted.set(0, craft.lift, 0).applyQuaternion(root.quaternion);
  root.position.add(lifted);
}

/**
 * Turns the rotors, outboards, propellers and helm from the physics state (near level).
 * @param {object} craft From createCraftParts.
 * @param {Boat | Helicopter} body The physics craft.
 * @param {number} dt Frame seconds.
 */
export function poseCraftRig(craft, body, dt) {
  if (craft.kind === 'helicopter') {
    const blur = body.rotorSpeed > BLUR_FROM;
    showRotorBlur(craft, blur);
    // The blades turn at the rotor's angle; the blur discs only drift slowly.
    const angle = blur ? body.rotorAngle * 0.04 : body.rotorAngle;
    spin(craft.rotorMain, axisY, -angle);
    spin(craft.rotorTail, axisX, angle * 4.3);
    return;
  }
  const steer = body.input.steer;
  for (const outboard of craft.outboards) spin(outboard, axisY, steer * OUTBOARD_SWING);
  craft.propellerAngle = (craft.propellerAngle + (body.propellerWet ? body.rpm : 0) * 0.08 * dt * Math.sign(body.input.drive || 1)) % (Math.PI * 2);
  for (const propeller of craft.propellers) spin(propeller, axisZ, craft.propellerAngle);
  if (craft.helm) spin(craft.helm, axisY, -steer * HELM_TURNS);
}

function spin(part, axis, angle) {
  if (!part) return;
  turn.setFromAxisAngle(axis, angle);
  part.node.quaternion.copy(part.rest).multiply(turn);
}

function showRotorBlur(craft, blur) {
  if (craft.blurred === blur) return;
  craft.blurred = blur;
  for (const [blades, disc] of [[craft.rotorMain, craft.rotorMainBlur], [craft.rotorTail, craft.rotorTailBlur]]) {
    if (blades?.material) blades.node.material = blur ? hiddenBlades : blades.material;
    if (disc) disc.node.visible = blur;
  }
}
