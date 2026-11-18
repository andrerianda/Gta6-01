// The police helicopter (MPD Air Support, model police_helicopter) at five stars: a scripted flyer
// (the physics has no aircraft), not a fleet vehicle. It comes in from behind the lead, holds
// station `trail` metres behind and `altitude` metres above the lead's predicted position, banks
// and pitches with its accelerations, spins its rotors (blur discs shown at speed), flashes its
// belly beacons, and after dark aims its searchlight at the lead: the searchlight node turns on
// its gimbal, a real spot light (atmosphere.addLight, importance 4) throws a bright disc on the
// lead and a soft additive cone mesh shows the beam in the air even on a clear night. While it
// flies it sees the lead from up to 110 m (sees()). When the stars drop below five it climbs away
// and is removed. Allocation-free per frame. Members: active, root, sees(lead), place(x, z),
// update(dt, lead, wanted), remove(), altitude, trail.
import * as THREE from 'three';
import { createSirenLights, releaseSirenLights, streetDarkness, updateSirenLights } from './sirenLights.js';
import { createSearchlightBeam } from './searchlightBeam.js';

const MODEL = 'police_helicopter';
const SIGHT = 110;
const MAX_SPEED = 46;
const ACCEL = 14;
const BEAM_HALF_ANGLE = 0.09;
const DOWN = new THREE.Vector3(0, -1, 0);

/**
 * Creates the helicopter controller (nothing is in the scene until it is called in).
 * @param {import('../core/systems/gameContext.js').GameContext} context
 * @returns {object} The controller.
 */
export function createPoliceHelicopter(context) {
  // Looked up when first needed: the model may finish loading after the dispatch starts.
  let asset = null;
  const hasModel = () => {
    if (!asset && context.assets?.has?.(MODEL)) asset = context.assets.get(MODEL);
    return asset !== null;
  };
  const city = context.systems.find('openWorldCity');
  const parent = context.view?.layers?.dynamic ?? context.view?.scene ?? null;
  const velocity = new THREE.Vector3();
  const aim = new THREE.Vector3();
  const lens = new THREE.Vector3();
  const beam = new THREE.Vector3();
  const desired = new THREE.Vector3();
  let root = null;
  let parts = null;
  let siren = null;
  let spot = null;
  let cone = null;
  let leaving = 0;
  let yaw = 0;
  let bank = 0;
  let pitch = 0;
  let spin = 0;
  /** True until the beam has been on the lead once: a placed helicopter aims at once. */
  let aimFresh = true;

  const heli = { active: false, root: null, altitude: 34, trail: 18, leaving: false };

  function groundAt(x, z, fallback) {
    const y = city?.groundHeightAt?.(x, z);
    return Number.isFinite(y) ? y : fallback;
  }

  function build() {
    root = asset.createLOD();
    const find = (name) => root.getObjectByName(name) ?? null;
    parts = { rotor: find('rotor_main'), rotorBlur: find('rotor_main_blur'), tail: find('rotor_tail'), tailBlur: find('rotor_tail_blur'), light: find('searchlight'), lens: find('anchor_searchlight') };
    // At speed only the blur discs show: hide the blades' own meshes, keep their blur children.
    const hidden = new THREE.MeshBasicMaterial({ visible: false });
    if (parts.rotor?.isMesh) parts.rotor.material = hidden;
    if (parts.tail?.isMesh) parts.tail.material = hidden;
    // A fainter main disc: at night the asset's grey blur reads as a solid saucer against the sky.
    if (parts.rotorBlur?.isMesh && parts.rotorBlur.material) {
      parts.rotorBlur.material = parts.rotorBlur.material.clone();
      parts.rotorBlur.material.opacity *= 0.45;
      parts.rotorBlur.material.transparent = true;
    }
    const lampMeshes = [];
    root.traverse((node) => { if (node.isMesh && node.material?.name === 'lamp_searchlight') lampMeshes.push(node); });
    parts.lamps = lampMeshes;
    siren = createSirenLights({ near: root, far: null, asset, anchors: {}, root }, 0.3, { lights: false });
    // The beam in the air: an open cone, apex at the lens, bright at the top and fading down.
    cone = createSearchlightBeam(0xfff2dc);
    parts.lampOn = [asset.lampMaterial('lamp_searchlight', false), asset.lampMaterial('lamp_searchlight', true)];
  }

  /**
   * Brings the helicopter into the scene at once over (x, z) (showcase pictures; it otherwise comes
   * in 150 m behind the lead).
   */
  heli.place = function place(x, z, y = 0, heading = 0) {
    if (!hasModel() || !parent) return false;
    if (!root) build();
    if (!root.parent) parent.add(root, cone);
    root.position.set(x, groundAt(x, z, y) + heli.altitude, z);
    aim.set(x, root.position.y - heli.altitude, z);
    yaw = heading;
    velocity.set(0, 0, 0);
    aimFresh = true;
    leaving = 0;
    heli.leaving = false;
    heli.active = true;
    heli.root = root;
    return true;
  };

  heli.sees = function sees(lead) {
    if (!heli.active || heli.leaving) return false;
    return Math.hypot(root.position.x - lead.x, root.position.z - lead.z) < SIGHT;
  };

  heli.remove = function remove() {
    if (root) root.removeFromParent();
    if (cone) cone.removeFromParent();
    if (spot) context.atmosphere?.removeLight(spot);
    if (siren) releaseSirenLights(siren, context.atmosphere);
    spot = null;
    heli.active = false;
    heli.leaving = false;
    heli.root = null;
  };

  function aimSearchlight(lead, dt, night, atmosphere) {
    const on = night > 0.25 && !heli.leaving;
    const lamp = parts.lampOn[on ? 1 : 0];
    for (let i = 0; i < parts.lamps.length; i += 1) parts.lamps[i].material = lamp;
    cone.visible = on;
    if (!on) {
      if (spot) spot.intensity = 0;
      return;
    }
    // A hand-held sweep: the beam trails the lead a little and wanders by a metre.
    const k = aimFresh ? 1 : 1 - Math.exp(-dt * 5);
    aimFresh = false;
    const t = context.clock?.elapsed ?? performance.now() / 1000;
    aim.x += (lead.x + lead.vx * 0.15 + Math.sin(t * 0.9) * 0.9 - aim.x) * k;
    aim.y += (lead.y - aim.y) * k;
    aim.z += (lead.z + lead.vz * 0.15 + Math.cos(t * 0.7) * 0.9 - aim.z) * k;
    root.updateMatrixWorld(true);
    if (parts.light) {
      parts.light.lookAt(aim);
      parts.light.rotateY(Math.PI);
      parts.light.updateMatrixWorld(true);
    }
    if (parts.lens) parts.lens.getWorldPosition(lens);
    else lens.copy(root.position);
    beam.subVectors(aim, lens);
    const length = Math.max(1, beam.length());
    beam.divideScalar(length);
    if (!spot && typeof atmosphere?.addLight === 'function') {
      spot = atmosphere.addLight({
        kind: 'spot', position: [0, 0, 0], direction: [0, -1, 0], color: 0xfff4e0, intensity: 0, range: 120, angle: BEAM_HALF_ANGLE,
        penumbra: 0.35, importance: 4, glow: 2.2, glowSize: 0.9, beam: 1, pool: false, nightOnly: false,
      });
    }
    if (spot) {
      spot.position.copy(lens);
      spot.direction.copy(beam);
      spot.intensity = 26000 * Math.min(1, night * 1.5);
      spot.range = length + 25;
      spot.groundY = lead.y;
    }
    const radius = Math.tan(BEAM_HALF_ANGLE) * length;
    cone.position.copy(lens);
    cone.quaternion.setFromUnitVectors(DOWN, beam);
    cone.scale.set(radius, length, radius);
    cone.material.uniforms.strength.value = 0.2 * Math.min(1, night * 1.4);
  }

  /**
   * One frame of flight.
   * @param {number} dt
   * @param {{x, y, z, vx, vz, yaw}} lead The lead as the dispatch reads it.
   * @param {boolean} wanted True while the helicopter is called for (five stars).
   */
  heli.update = function update(dt, lead, wanted) {
    if (!parent || dt <= 0 || !(heli.active || (wanted && hasModel()))) return;
    if (wanted && !heli.active) {
      // Comes in 150 m behind the lead, already at height.
      heli.place(lead.x + Math.sin(lead.yaw) * 150, lead.z + Math.cos(lead.yaw) * 150, lead.y, lead.yaw);
      aim.set(lead.x, lead.y, lead.z);
    }
    if (!heli.active) return;
    if (!wanted && !heli.leaving) heli.leaving = true;
    if (heli.leaving) {
      leaving += dt;
      if (leaving > 14) {
        heli.remove();
        return;
      }
    }
    const p = root.position;
    // Station: behind the lead's predicted position (or climbing away when leaving).
    const speed = Math.hypot(lead.vx, lead.vz);
    const bx = speed > 2 ? -lead.vx / speed : Math.sin(lead.yaw);
    const bz = speed > 2 ? -lead.vz / speed : Math.cos(lead.yaw);
    if (heli.leaving) desired.set(p.x - bx * 60, groundAt(p.x, p.z, lead.y) + heli.altitude + 40, p.z - bz * 60);
    else desired.set(lead.x + lead.vx * 1.2 + bx * heli.trail, groundAt(lead.x, lead.z, lead.y) + heli.altitude, lead.z + lead.vz * 1.2 + bz * heli.trail);
    // Steer the velocity toward what reaching the station needs, limited in speed and acceleration.
    const dx = desired.x - p.x;
    const dy = desired.y - p.y;
    const dz = desired.z - p.z;
    const distance = Math.hypot(dx, dz);
    const want = Math.min(MAX_SPEED, distance * 0.9 + speed * 0.9);
    const wx = distance > 0.01 ? (dx / distance) * want : 0;
    const wz = distance > 0.01 ? (dz / distance) * want : 0;
    const ax = THREE.MathUtils.clamp((wx - velocity.x) * 2, -ACCEL, ACCEL);
    const az = THREE.MathUtils.clamp((wz - velocity.z) * 2, -ACCEL, ACCEL);
    velocity.x += ax * dt;
    velocity.z += az * dt;
    velocity.y += (THREE.MathUtils.clamp(dy * 0.8, -8, 8) - velocity.y) * Math.min(1, dt * 2);
    p.addScaledVector(velocity, dt);
    // Face the way it flies when fast, the lead when hovering; bank into turns, nose down to fly.
    const flat = Math.hypot(velocity.x, velocity.z);
    const face = flat > 8 ? Math.atan2(-velocity.x, -velocity.z) : Math.atan2(-(lead.x - p.x), -(lead.z - p.z));
    let turn = face - yaw;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    yaw += turn * Math.min(1, dt * 1.6);
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const forwardAccel = ax * fx + az * fz;
    const sideAccel = ax * -fz + az * fx;
    pitch += ((-flat / MAX_SPEED) * 0.2 - forwardAccel * 0.012 - pitch) * Math.min(1, dt * 3);
    bank += ((-sideAccel * 0.025) - bank) * Math.min(1, dt * 3);
    root.rotation.set(pitch, yaw, bank, 'YXZ');
    spin += dt;
    if (parts.rotor) parts.rotor.rotation.y = -spin * 2.2;
    if (parts.tail) parts.tail.rotation.x = spin * 3.1;
    const atmosphere = context.atmosphere;
    updateSirenLights(siren, dt, !heli.leaving, atmosphere, false, false);
    aimSearchlight(lead, dt, streetDarkness(context), atmosphere);
  };

  return heli;
}
