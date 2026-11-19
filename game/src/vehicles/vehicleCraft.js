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
import { Airplane, deriveAirplaneTuning } from '../physics/aircraft/Airplane.js';
import { createAirplaneParts, poseAirplaneRig } from './airplaneCraft.js';
import { airplaneInputFrom, boatInputFrom, craftKindOf, helicopterControlsActive, helicopterInputFrom } from './vehicleCraftControls.js';

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
  if (!tunings.has(entry.id)) {
    tunings.set(entry.id, kind === 'boat' ? deriveBoatTuning(entry) : kind === 'airplane' ? deriveAirplaneTuning(entry) : deriveHelicopterTuning(entry));
  }
  const tuning = tunings.get(entry.id);
  const { x, y, z } = plan.position;
  if (kind === 'airplane') {
    // Parked on its wheels with the engine off, or (a spawn with a height) in flight at `speed`.
    const flying = y !== null && y !== undefined;
    return new Airplane(world, tuning, {
      x, y: flying ? y : undefined, z, heading: plan.heading, userRef,
      speed: flying ? plan.airspeed ?? undefined : undefined, engineOn: flying,
    });
  }
  if (kind === 'boat') {
    const out = mooringOffset(world, tuning, x, z, plan.heading);
    return new Boat(world, tuning, { x: x + Math.sin(plan.heading) * out, z: z - Math.cos(plan.heading) * out, heading: plan.heading, userRef });
  }
  const airborne = y !== null && y !== undefined;
  return new Helicopter(world, tuning, { x, y: airborne ? y : undefined, z, heading: plan.heading, userRef, engineOn: airborne && !plan.parked });
}

/** Water a boat is moored in under its propeller, metres beyond its draft (it floats clear). */
export const MOORING_DEPTH = 0.1;

/**
 * Shift 14 (boat probe: a speedboat moored stern-to a beach, as missionWorld.waterSpotNear puts
 * one 5 m off the shore, ran full throttle at 0.01 m/s: hull aground, propeller dry; that beach
 * shelves 0.035 m a metre): how far along its bow (metres, at most 30) a boat spawned at x, z
 * must lie for the water at its propeller to be deeper than its draft and MOORING_DEPTH, so it
 * floats and gets under way.
 * @param {{ground: {heightAt: (x: number, z: number) => number}, waterHeightAt?: Function, time?: number}} world
 * @param {{draft: number, propeller: {z: number}}} tuning From deriveBoatTuning.
 * @param {number} x
 * @param {number} z
 * @param {number} heading Compass heading of the bow (0 = -Z, clockwise from above).
 * @returns {number}
 */
export function mooringOffset(world, tuning, x, z, heading) {
  const ground = world && world.ground;
  if (!ground || typeof ground.heightAt !== 'function' || !tuning.propeller) return 0;
  const fx = Math.sin(heading), fz = -Math.cos(heading), aft = tuning.propeller.z;
  for (let out = 0; out <= 30; out += 0.5) {
    const px = x + fx * (out - aft), pz = z + fz * (out - aft);
    const water = typeof world.waterHeightAt === 'function' ? world.waterHeightAt(px, pz, world.time ?? 0) : 0;
    if (water - ground.heightAt(px, pz) >= tuning.draft + MOORING_DEPTH) return out;
  }
  return 0;
}

/**
 * The craft's drawn parts, found once on its rig (after createVehicleRig).
 * @param {object} rig From createVehicleRig.
 * @param {object} entry The vehicleCatalog entry.
 * @returns {object} The craft record: kind, lift, rotors, outboards, propellers, helm.
 */
export function createCraftParts(rig, entry) {
  const kind = craftKindOf(entry);
  if (kind === 'airplane') {
    if (rig.asset) for (const name of CRAFT_ANCHORS) if (rig.asset.anchors[name]) rig.anchors[name] = rig.asset.anchors[name].position.clone();
    return createAirplaneParts(rig, entry);
  }
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
    return;
  }
  if (craft.kind === 'airplane') {
    // An aircraft left in the air flies on with its lever where it was; on the ground it is braked.
    const abandonedAloft = !hasDriver && body.state && body.state.onGround === false;
    if (!abandonedAloft) airplaneInputFrom(controls, body.input, hasDriver);
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
  if (craft.kind === 'airplane') {
    body.engineOn = false;
    if (body.autopilot?.engaged) body.disengageAutopilot?.();
    body.input.pitch = body.input.roll = body.input.yaw = body.input.throttle = 0;
    body.input.brake = 1;
    return;
  }
  body.engineOn = false;
  body.clearTarget();
  body.input.collective = body.input.pitch = body.input.roll = body.input.yaw = 0;
}

/** Someone took the controls: a helicopter's engine starts (the rotor spins up over 4 s). */
export function boardCraft(craft, body) {
  if (craft.kind === 'helicopter' || craft.kind === 'airplane') body.engineOn = true;
}

/** The pilot got out: on (or just over) the ground the engine stops; in the air it hovers on. */
export function leaveCraft(craft, body) {
  if (craft.kind === 'helicopter' && body.altitude < 1.2) body.engineOn = false;
  if (craft.kind === 'airplane' && (!body.state || body.state.onGround !== false)) {
    body.engineOn = false;
    body.disengageAutopilot?.();
  }
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
export function poseCraftRig(craft, body, dt, hasPilot = false) {
  if (craft.kind === 'airplane') {
    poseAirplaneRig(craft, body, dt, hasPilot);
    return;
  }
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
