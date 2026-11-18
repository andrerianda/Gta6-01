// How a driver's controls ({throttle, brake, steer, handbrake, lift?}, the same object traffic,
// police and the player fill for a car) fly a helicopter or steer a boat of the physics library
// (watercraft/Boat.js, aircraft/Helicopter.js with its hover assist). Pure data, tested in Node.
//
// Boat: W ahead, S astern (after slowing), A/D steer.
// Helicopter (keyboard, hover assist): W flies forward, S slows down and, nearly stopped, sinks
// (full S on the ground lands it softly); A/D turn; Space climbs. A driver that has a dedicated
// up/down axis writes controls.lift (-1..1) and it wins over Space and S.

/** Which physics craft a vehicleCatalog entry is: 'boat', 'helicopter' or null (a road vehicle). */
export function craftKindOf(entry) {
  const flags = entry?.flags ?? [];
  if (entry?.class === 'boat' || flags.includes('watercraft')) return 'boat';
  if (entry?.class === 'helicopter') return 'helicopter';
  return null;
}

/** Forward speed (m/s) under which S on a helicopter sinks instead of slowing it. */
export const HELICOPTER_SINK_BELOW = 3;

/**
 * A boat's input from the controls.
 * @param {{throttle: number, brake: number, steer: number}} controls
 * @param {{drive: number, steer: number}} out The boat's input (written).
 * @returns {{drive: number, steer: number}}
 */
export function boatInputFrom(controls, out) {
  out.drive = clampUnit((controls.throttle || 0) - (controls.brake || 0));
  out.steer = clampUnit(controls.steer || 0);
  return out;
}

/**
 * A helicopter's input (hover assist) from the controls.
 * @param {{throttle: number, brake: number, steer: number, handbrake?: number, lift?: number}} controls
 * @param {number} speed Forward speed, m/s.
 * @param {{collective: number, pitch: number, roll: number, yaw: number}} out The helicopter's input (written).
 * @returns {{collective: number, pitch: number, roll: number, yaw: number}}
 */
export function helicopterInputFrom(controls, speed, out) {
  const forward = controls.throttle || 0;
  const back = controls.brake || 0;
  const sinking = back > 0 && forward <= 0 && speed < HELICOPTER_SINK_BELOW;
  out.pitch = sinking ? 0 : clampUnit(forward - back);
  out.yaw = clampUnit(controls.steer || 0);
  out.roll = 0;
  if (typeof controls.lift === 'number' && controls.lift !== 0) out.collective = clampUnit(controls.lift);
  else out.collective = clampUnit((controls.handbrake > 0 ? 1 : 0) - (sinking ? back : 0));
  return out;
}

/**
 * Whether a driver at the helicopter's controls asks for anything (starts a parked engine).
 * @param {{throttle: number, brake: number, steer: number, handbrake?: number, lift?: number}} controls
 * @returns {boolean}
 */
export function helicopterControlsActive(controls) {
  return (controls.throttle || 0) > 0 || (controls.handbrake || 0) > 0 || (controls.steer || 0) !== 0 || (typeof controls.lift === 'number' && controls.lift > 0);
}

function clampUnit(value) {
  return value > 1 ? 1 : value < -1 ? -1 : value;
}
