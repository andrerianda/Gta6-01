// How a Halcón interceptor moves: a kinematic aircraft (no physics body) that turns by banking,
// climbs and sinks within its rates, keeps inside its speed envelope and ceiling, and, once close,
// holds a station beside another aircraft by matching its velocity. Pure: no imports, nothing
// allocated per step. Headings are compass radians (0 = north = -Z, clockwise); bank is positive
// to the right; forward is (sin h, -cos h) in (x, z).

const GRAVITY = 9.81;
const TWO_PI = Math.PI * 2;

/**
 * Creates the moving state of one interceptor.
 * @param {string} id Entity-like id ('air_guard_1').
 * @param {string} callsign Radio callsign.
 */
export function createInterceptorState(id, callsign) {
  return {
    id, callsign, x: 0, y: 0, z: 0, heading: 0, speed: 0, bank: 0, pitch: 0, verticalSpeed: 0,
    /** 'parked' | 'hold' | 'taxi' | 'lineup' | 'roll' | 'air' | 'wait' (about to appear airborne). */
    phase: 'parked', timer: 0, side: 0, pad: 0,
    /** 1 gear down .. 0 up; true while the afterburner is lit. */
    gear: 1, afterburner: false, stage: 'idle',
  };
}

/** The angle a - b wrapped to -pi..pi. */
export function angleDifference(a, b) {
  let d = (a - b) % TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  else if (d < -Math.PI) d += TWO_PI;
  return d;
}

/** The fastest the interceptor flies at a height (metres per second). */
export function maxSpeedAt(altitude, envelope) {
  const share = altitude <= 0 ? 0 : altitude >= envelope.bestAltitude ? 1 : altitude / envelope.bestAltitude;
  const mach = envelope.machAtSeaLevel + (envelope.machAtBest - envelope.machAtSeaLevel) * share;
  const sound = envelope.soundAtSeaLevel + (envelope.soundAtBest - envelope.soundAtSeaLevel) * share;
  return mach * sound;
}

/**
 * The place of a formation slot beside a leader: `offset` is { right, up, back } metres in his frame.
 * @param {{x: number, y: number, z: number, heading: number}} lead
 * @param {{right: number, up: number, back: number}} offset
 * @param {{x: number, y: number, z: number}} out
 */
export function formationSlot(lead, offset, out) {
  const sin = Math.sin(lead.heading);
  const cos = Math.cos(lead.heading);
  out.x = lead.x + cos * offset.right - sin * offset.back;
  out.z = lead.z + sin * offset.right + cos * offset.back;
  out.y = lead.y + offset.up;
  return out;
}

function approach(value, target, maxStep) {
  const d = target - value;
  return d > maxStep ? value + maxStep : d < -maxStep ? value - maxStep : target;
}

function finishStep(craft, envelope, dt) {
  if (craft.y > envelope.ceiling) {
    craft.y = envelope.ceiling;
    if (craft.verticalSpeed > 0) craft.verticalSpeed = 0;
  }
  const ratio = craft.speed > 1 ? craft.verticalSpeed / craft.speed : 0;
  craft.pitch = Math.asin(ratio > 0.9 ? 0.9 : ratio < -0.9 ? -0.9 : ratio);
  craft.gear = approach(craft.gear, 0, dt / 3);
  craft.afterburner = craft.speed > envelope.afterburnerFrom;
  if (craft.heading < 0) craft.heading += TWO_PI;
  else if (craft.heading >= TWO_PI) craft.heading -= TWO_PI;
}

/**
 * Flies towards a point: banks into the turn (the turn rate comes from the bank), changes speed
 * and height within the envelope.
 * @param {ReturnType<typeof createInterceptorState>} craft
 * @param {number} tx Target x. @param {number} ty Target height. @param {number} tz Target z.
 * @param {number} wishSpeed Metres per second (clamped to the envelope).
 * @param {number} dt Seconds.
 * @param {object} envelope AIR_GUARD_TUNING.envelope.
 */
export function steerTowards(craft, tx, ty, tz, wishSpeed, dt, envelope) {
  const top = maxSpeedAt(craft.y, envelope);
  const wish = wishSpeed > top ? top : wishSpeed < envelope.minSpeed ? envelope.minSpeed : wishSpeed;
  craft.speed = wish > craft.speed ? approach(craft.speed, wish, envelope.acceleration * dt) : approach(craft.speed, wish, envelope.deceleration * dt);
  const speed = craft.speed > 40 ? craft.speed : 40;

  const error = angleDifference(Math.atan2(tx - craft.x, -(tz - craft.z)), craft.heading);
  const n = envelope.maxLoadFactor;
  const maxRate = (GRAVITY * Math.sqrt(n * n - 1)) / speed;
  let wishRate = error * 1.4;
  if (wishRate > maxRate) wishRate = maxRate;
  else if (wishRate < -maxRate) wishRate = -maxRate;
  craft.bank = approach(craft.bank, Math.atan((speed * wishRate) / GRAVITY), envelope.rollRate * dt);
  craft.heading += ((GRAVITY * Math.tan(craft.bank)) / speed) * dt;

  let wishClimb = (ty - craft.y) * 0.4;
  const climbCap = Math.min(envelope.climbRate, speed * 0.5);
  const sinkCap = Math.min(envelope.sinkRate, speed * 0.6);
  if (wishClimb > climbCap) wishClimb = climbCap;
  else if (wishClimb < -sinkCap) wishClimb = -sinkCap;
  craft.verticalSpeed = approach(craft.verticalSpeed, wishClimb, 30 * dt);
  const level = Math.sqrt(Math.max(1, speed * speed - craft.verticalSpeed * craft.verticalSpeed));
  craft.x += Math.sin(craft.heading) * level * dt;
  craft.z -= Math.cos(craft.heading) * level * dt;
  craft.y += craft.verticalSpeed * dt;
  finishStep(craft, envelope, dt);
}

/**
 * Holds a station: flies the leader's velocity plus a closing velocity towards the slot, inside
 * the speed envelope (a leader faster than the Halcón leaves it behind), and matches his heading
 * and bank once close.
 * @param {ReturnType<typeof createInterceptorState>} craft
 * @param {{x: number, y: number, z: number}} slot Where to be.
 * @param {{vx: number, vy: number, vz: number, heading: number, roll: number}} lead The leader's motion.
 * @param {number} dt Seconds.
 * @param {object} envelope AIR_GUARD_TUNING.envelope.
 * @param {object} formation AIR_GUARD_TUNING.formation.
 * @returns {number} Metres from the slot after the step.
 */
export function keepStation(craft, slot, lead, dt, envelope, formation) {
  const ex = slot.x - craft.x;
  const ey = slot.y - craft.y;
  const ez = slot.z - craft.z;
  const error = Math.sqrt(ex * ex + ey * ey + ez * ez);
  let closing = error / formation.stationSeconds;
  if (closing > formation.closureSpeed) closing = formation.closureSpeed;
  const scale = error > 1e-6 ? closing / error : 0;
  let vx = lead.vx + ex * scale;
  let vy = lead.vy + ey * scale;
  let vz = lead.vz + ez * scale;
  const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
  const top = maxSpeedAt(craft.y, envelope);
  if (speed > top) {
    const cut = top / speed;
    vx *= cut;
    vy *= cut;
    vz *= cut;
  }
  craft.x += vx * dt;
  craft.y += vy * dt;
  craft.z += vz * dt;
  craft.speed = speed > top ? top : speed;
  craft.verticalSpeed = vy;
  const close = error < 150;
  const level = Math.sqrt(vx * vx + vz * vz);
  const wishHeading = close || level < 5 ? lead.heading : Math.atan2(vx, -vz);
  const turn = angleDifference(wishHeading, craft.heading);
  const blend = 1 - Math.exp(-dt * 2.5);
  craft.heading += turn * blend;
  const wishBank = close ? lead.roll : Math.max(-1.2, Math.min(1.2, turn * 1.5));
  craft.bank = approach(craft.bank, wishBank > 1.4 ? 1.4 : wishBank < -1.4 ? -1.4 : wishBank, envelope.rollRate * dt);
  finishStep(craft, envelope, dt);
  return Math.sqrt((slot.x - craft.x) ** 2 + (slot.y - craft.y) ** 2 + (slot.z - craft.z) ** 2);
}

/**
 * One step of the take-off from an alert pad: hold, taxi straight ahead to the runway's centre
 * line, turn onto the runway heading, roll, and lift off at the rotate speed.
 * @param {ReturnType<typeof createInterceptorState>} craft
 * @param {{x0: number, z0: number, x1: number, z1: number, y: number, heading: number}} runway Heading in radians.
 * @param {number} dt Seconds.
 * @param {object} scramble AIR_GUARD_TUNING.scramble.
 * @returns {boolean} True on the step the craft leaves the ground.
 */
export function takeOffStep(craft, runway, dt, scramble) {
  craft.y = runway.y;
  craft.bank = craft.pitch = craft.verticalSpeed = 0;
  craft.gear = 1;
  if (craft.phase === 'hold') {
    craft.timer -= dt;
    if (craft.timer <= 0) craft.phase = 'taxi';
    return false;
  }
  if (craft.phase === 'taxi' || craft.phase === 'lineup') {
    const length = Math.hypot(runway.x1 - runway.x0, runway.z1 - runway.z0) || 1;
    const ux = (runway.x1 - runway.x0) / length;
    const uz = (runway.z1 - runway.z0) / length;
    const lateral = (craft.x - runway.x0) * uz - (craft.z - runway.z0) * ux;
    if (craft.phase === 'taxi') {
      if (craft.side === 0) craft.side = lateral >= 0 ? 1 : -1;
      craft.speed = approach(craft.speed, scramble.taxiSpeed, 4 * dt);
      if (lateral * craft.side <= craft.speed / 0.9) craft.phase = 'lineup';
    } else {
      craft.speed = approach(craft.speed, 8, 8 * dt);
      const turn = angleDifference(runway.heading, craft.heading);
      craft.heading += approach(0, turn, 0.9 * dt);
      if (Math.abs(turn) < 0.03) {
        craft.heading = runway.heading;
        craft.phase = 'roll';
      }
    }
  } else if (craft.phase === 'roll') {
    craft.speed += scramble.rollAcceleration * dt;
    craft.afterburner = true;
    if (craft.speed >= scramble.rotateSpeed) {
      craft.phase = 'air';
      craft.verticalSpeed = 4;
      craft.y += 0.5;
      return true;
    }
  }
  craft.x += Math.sin(craft.heading) * craft.speed * dt;
  craft.z -= Math.cos(craft.heading) * craft.speed * dt;
  return false;
}
