// The lead's health and armour, and going down: DAMAGE_DEALT aimed at the lead (armour soaks
// first), PLAYER_HEAL, being wasted (health at zero, or kill()) or busted (bust(), called by the
// police), the down screen in slow motion (FLATLINED / CUFFED, downScreen.js), the fade to black,
// and the respawn at the nearest hospital or police station, healed. The hospital bill and the
// fine travel in PLAYER_WASTED {hospitalBill} and PLAYER_BUSTED {fine}; the economy takes them
// (the player never spends the money itself). Emits PLAYER_HEALTH_CHANGED, PLAYER_WASTED,
// PLAYER_BUSTED and PLAYER_RESPAWNED, and enters the `wasted` and `busted` states (the engine
// slows time there; the timeline counts real seconds).
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { GAME_EVENTS } from '../core/events/gameEvents.js';
import { BUSTED_RULES, WASTED_RULES } from '../catalog/wantedLevels.js';
import { createDownScreen } from './downScreen.js';

/** The lead's health when full, and the most armour. */
export const FULL_HEALTH = 100;
export const FULL_ARMOUR = 100;

/** The going-down timeline in real seconds, and the arrest speeds (m/s). */
export const DOWN_TIMELINE = Object.freeze({ title: 3, fadeOut: 0.8, black: 0.35, fadeIn: 1, onFootArrest: 1, vehicleArrest: 2 });

/**
 * Splits a hit between armour and health (armour soaks first).
 * @returns {{health: number, armour: number, taken: number}}
 */
export function absorbDamage(health, armour, amount) {
  const hit = Math.max(0, amount);
  const soaked = Math.min(armour, hit);
  const left = Math.max(0, health - (hit - soaked));
  return { health: left, armour: armour - soaked, taken: health - left };
}

/**
 * The nearest landmark of a kind to a point, or null.
 * @param {Array<{kind: string, x: number, z: number}>} landmarks
 */
export function nearestLandmark(landmarks, kind, x, z) {
  let best = null, bestDistance = Infinity;
  for (const landmark of landmarks || []) {
    if (landmark.kind !== kind) continue;
    const d = Math.hypot(landmark.x - x, landmark.z - z);
    if (d < bestDistance) { best = landmark; bestDistance = d; }
  }
  return best;
}

/** Metres from a lot's entrance (the back of its pavement) towards the street where the lead stands. */
export const RESPAWN_STEP = 1.5;

/**
 * Where the lead comes back outside a landmark: on the pavement in front of it, a step from its
 * entrance towards the street, facing the street. frontX / frontZ are the unit direction the lot
 * faces (docs/CITY_PLAN.md), never a position. Without an entrance: from the lot's centre out
 * along the front direction by `fallbackDepth`.
 * @param {{x: number, z: number, frontX?: number, frontZ?: number, entrance?: {x: number, z: number}}} landmark
 * @returns {{x: number, z: number, heading: number}} heading is a yaw (three.js rotation.y).
 */
export function respawnPoint(landmark, fallbackDepth = 18) {
  let fx = landmark.frontX ?? 0, fz = landmark.frontZ ?? 1;
  const length = Math.hypot(fx, fz) || 1;
  fx /= length; fz /= length;
  const from = landmark.entrance ?? { x: landmark.x + fx * fallbackDepth, z: landmark.z + fz * fallbackDepth };
  return { x: from.x + fx * RESPAWN_STEP, z: from.z + fz * RESPAWN_STEP, heading: Math.atan2(-fx, -fz) };
}

/** The hospital bill or the fine for a cash amount (percent, then clamped). */
export function chargeFor(cash, rules, percentKey, minKey, maxKey) {
  return Math.round(Math.min(rules[maxKey], Math.max(rules[minKey], (Math.max(0, cash) * rules[percentKey]) / 100)));
}

/**
 * Where the down timeline is after `seconds` real seconds.
 * @returns {{title: number, black: number, respawn: boolean, done: boolean}} title and black 0..1.
 */
export function downPhase(seconds, timeline = DOWN_TIMELINE) {
  const fadeStart = timeline.title, blackAt = fadeStart + timeline.fadeOut, upAt = blackAt + timeline.black;
  const end = upAt + timeline.fadeIn;
  const title = seconds < 0.25 ? seconds / 0.25 : seconds < blackAt ? 1 : 0;
  let black = 0;
  if (seconds >= fadeStart && seconds < blackAt) black = (seconds - fadeStart) / timeline.fadeOut;
  else if (seconds >= blackAt && seconds < upAt) black = 1;
  else if (seconds >= upAt && seconds < end) black = 1 - (seconds - upAt) / timeline.fadeIn;
  return { title, black, respawn: seconds >= upAt, done: seconds >= end };
}

/**
 * Creates the lead's vitals.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 * @param {{entity: {id: any, data: {health: number, armour: number}}, lead: {seat: object, movement: object, figure: object, teleport: Function}}} parts
 */
export function createLeadVitals(context, { entity, lead }) {
  const screen = context.page && context.page.document ? createDownScreen(context.page.document) : null;
  const stops = [];
  const run = { down: null, seconds: 0, respawned: false, rules: null };
  const random = typeof context.random === 'function' ? context.random('player') : null;
  const pick = (lines) => lines[Math.min(lines.length - 1, Math.floor((random ? random.next() : 0) * lines.length))];

  function changed(delta, cause) {
    const data = entity.data;
    context.events.emit(GAME_EVENTS.PLAYER_HEALTH_CHANGED, { health: data.health, armour: data.armour, delta, cause });
  }

  function cashNow() {
    const economy = context.systems.find('economy');
    return economy && typeof economy.cash === 'number' ? economy.cash : 0;
  }

  function position() {
    const s = lead.movement.state;
    return { x: s.x, y: s.y, z: s.z };
  }

  /** Starts going down: out of the car, the gesture, the state, the event, the screen. */
  function goDown(kind, payload) {
    if (run.down) return false;
    if (lead.seat.vehicle || lead.seat.phase) lead.seat.exit(true, true);
    run.down = kind; run.seconds = 0; run.respawned = false;
    run.rules = kind === 'wasted' ? WASTED_RULES : BUSTED_RULES;
    lead.figure.setGesture(kind === 'busted', kind === 'wasted');
    if (context.state.is('playing') || context.state.is('phoneOpen')) context.state.enter(kind, payload);
    context.events.emit(kind === 'wasted' ? GAME_EVENTS.PLAYER_WASTED : GAME_EVENTS.PLAYER_BUSTED, payload);
    if (screen) screen.show(kind, pick(run.rules.lines));
    return true;
  }

  function kill(cause = 'unknown', killerId = null) {
    const bill = chargeFor(cashNow(), WASTED_RULES, 'billPercentOfCash', 'billMinimum', 'billMaximum');
    if (entity.data.health > 0) { const before = entity.data.health; entity.data.health = 0; changed(-before, cause); }
    return goDown('wasted', { cause, killerId, position: position(), hospitalBill: bill });
  }

  function damage(amount, { cause = 'damage', attackerId = null } = {}) {
    if (run.down || !(amount > 0)) return 0;
    const data = entity.data;
    const after = absorbDamage(data.health, data.armour, amount);
    data.health = after.health; data.armour = after.armour;
    changed(-after.taken, cause);
    if (data.health <= 0) kill(cause, attackerId);
    return after.taken;
  }

  function bust({ officerId = null } = {}) {
    if (run.down) return false;
    const fine = chargeFor(cashNow(), BUSTED_RULES, 'finePercentOfCash', 'fineMinimum', 'fineMaximum');
    return goDown('busted', { position: position(), fine, weaponsTaken: BUSTED_RULES.losesAmmunition, officerId });
  }

  /** Healed, out of the gesture, standing at the nearest hospital or police station. */
  function respawn() {
    const kind = run.down;
    const city = context.systems.find('openWorldCity');
    const here = position();
    const spot = nearestLandmark(city && city.plan ? city.plan.landmarks : null, kind === 'wasted' ? 'hospital' : 'police_station', here.x, here.z);
    entity.data.health = FULL_HEALTH;
    if (run.rules.losesArmor) entity.data.armour = 0;
    changed(FULL_HEALTH, 'respawn');
    lead.figure.setGesture(false, false);
    if (spot) {
      const at = respawnPoint(spot);
      lead.teleport({ position: { x: at.x, z: at.z }, heading: at.heading });
    }
    run.respawned = true;
    if (context.state.is(kind)) context.state.enter('playing');
    context.events.emit(GAME_EVENTS.PLAYER_RESPAWNED, { position: position(), after: kind });
  }

  /** Per frame with game seconds (slowed while down); the timeline counts real seconds. */
  function update(dt) {
    if (!run.down) return;
    const scale = context.state && typeof context.state.timeScale === 'number' && context.state.timeScale > 0.05 ? context.state.timeScale : 1;
    run.seconds += dt / (context.state.is(run.down) ? scale : 1);
    const phase = downPhase(run.seconds);
    if (phase.respawn && !run.respawned) respawn();
    if (screen) screen.set(phase.title, phase.black);
    if (phase.done) { run.down = null; if (screen) screen.hide(); }
  }

  stops.push(context.commands.handle(GAME_COMMANDS.PLAYER_HEAL, ({ health = FULL_HEALTH, armour } = {}) => {
    const data = entity.data;
    const before = data.health;
    data.health = Math.min(FULL_HEALTH, Math.max(0, health));
    if (typeof armour === 'number') data.armour = Math.min(FULL_ARMOUR, Math.max(0, armour));
    changed(data.health - before, 'heal');
  }));
  const onDamage = (hit) => {
    if (hit && hit.targetId === entity.id) damage(hit.amount, { cause: hit.kind || hit.weaponId || 'damage', attackerId: hit.attackerId ?? null });
  };
  context.events.on(GAME_EVENTS.DAMAGE_DEALT, onDamage);
  stops.push(() => context.events.off(GAME_EVENTS.DAMAGE_DEALT, onDamage));

  return {
    damage, kill, bust, update,
    /** 'wasted', 'busted' or null (the camera's downed shot reads it). */
    get down() { return run.down; },
    /** On foot slower than 1 m/s, or in a vehicle slower than 2 m/s, and not already down. */
    get arrestable() {
      if (run.down) return false;
      const vehicle = lead.seat.vehicle;
      if (vehicle) return Math.abs(vehicle.data && vehicle.data.speed || 0) < DOWN_TIMELINE.vehicleArrest;
      return lead.movement.state.groundSpeed < DOWN_TIMELINE.onFootArrest;
    },
    dispose() {
      for (const stop of stops) if (typeof stop === 'function') stop();
      if (screen) screen.dispose();
    },
  };
}
