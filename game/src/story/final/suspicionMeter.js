// The cover of "Lt. Osorio" on the walk across Base Aérea Punta Garza: one number, 0 to 100, that
// rises when Dez stops behaving like an officer on his own base and falls slowly while he walks
// calmly. At 100 the cover is blown. Pure: the stage cross_the_base.js feeds it what the lead does.
// Tested in tools/tests/finalmission/.
//
//   const meter = createSuspicionMeter();
//   meter.update(dt, { speed, sprinting, airborne, offPath, nearGuard, weaponDrawn });
//   meter.salute(crewId);  meter.returnSalute();  meter.bump();  meter.sergeant('schedule');
//   meter.value; meter.level; meter.cause; meter.exposed; meter.failReason;
import { SERGEANT_CHOICES } from '../../catalog/finalArcScript.js';

/** The numbers of the meter (per second unless said otherwise). */
export const SUSPICION_RULES = Object.freeze({
  watched: 30, suspect: 60, exposed: 100,
  /** Faster than this on foot is running, m/s (a walk is 1.65, a run 4.3, a sprint 6.9). */
  runSpeed: 2.6,
  running: 16, sprinting: 30,
  /** One jump. */
  jump: 12,
  /** Further than this from the marked way to hangar two, metres. */
  offPathMetres: 25, offPath: 7,
  /** Standing still this long next to a guard, seconds, then per second. */
  lingerSeconds: 6, lingering: 5,
  /** A salute not returned within this long, seconds. */
  saluteSeconds: 3, ignoredSalute: 14, returnedSalute: -6,
  bump: 15,
  /** Walking calmly. */
  calm: -2.5,
  /** No answer to the sergeant in time. */
  noAnswer: 20,
});

/**
 * The level of a suspicion value.
 * @param {number} value 0..100.
 * @returns {'calm' | 'watched' | 'suspect' | 'exposed'}
 */
export function suspicionLevel(value) {
  if (value >= SUSPICION_RULES.exposed) return 'exposed';
  if (value >= SUSPICION_RULES.suspect) return 'suspect';
  if (value >= SUSPICION_RULES.watched) return 'watched';
  return 'calm';
}

/**
 * Creates the meter.
 * @param {{value?: number}} [options]
 */
export function createSuspicionMeter(options = {}) {
  const R = SUSPICION_RULES;
  let value = clamp(options.value ?? 0);
  let cause = null;
  let failReason = null;
  let still = 0;
  let wasAirborne = false;
  /** Salutes waiting to be returned: seconds left of each. */
  const salutes = [];

  function add(amount, why) {
    if (failReason) return;
    value = clamp(value + amount);
    if (amount > 0) cause = why;
    if (value >= R.exposed) failReason = why === 'weapon' ? 'weapon_drawn' : 'exposed';
  }

  const meter = {
    get value() { return value; },
    get level() { return suspicionLevel(value); },
    /** What raised it last: 'running' | 'sprinting' | 'jumping' | 'offPath' | 'lingering' | 'salute' | 'bump' | 'sergeant' | 'weapon' | null. */
    get cause() { return cause; },
    get exposed() { return failReason !== null; },
    /** 'exposed' or 'weapon_drawn' once the cover is blown, else null. */
    get failReason() { return failReason; },
    /** Whether a salute waits to be returned. */
    get salutePending() { return salutes.length > 0; },

    /**
     * One step of the walk.
     * @param {number} dt Seconds.
     * @param {{speed?: number, sprinting?: boolean, airborne?: boolean, offPath?: number, nearGuard?: boolean, weaponDrawn?: boolean}} lead
     */
    update(dt, lead = {}) {
      if (failReason) return meter;
      if (lead.weaponDrawn) { cause = 'weapon'; value = R.exposed; failReason = 'weapon_drawn'; return meter; }
      const speed = lead.speed ?? 0;
      let calm = true;
      if (lead.airborne && !wasAirborne) { add(R.jump, 'jumping'); calm = false; }
      wasAirborne = Boolean(lead.airborne);
      if (lead.sprinting && speed > R.runSpeed) { add(R.sprinting * dt, 'sprinting'); calm = false; }
      else if (speed > R.runSpeed) { add(R.running * dt, 'running'); calm = false; }
      if ((lead.offPath ?? 0) > R.offPathMetres) { add(R.offPath * dt, 'offPath'); calm = false; }
      if (lead.nearGuard && speed < 0.3) {
        still += dt;
        if (still > R.lingerSeconds) { add(R.lingering * dt, 'lingering'); calm = false; }
      } else still = 0;
      for (let i = salutes.length - 1; i >= 0; i -= 1) {
        salutes[i] -= dt;
        if (salutes[i] <= 0) { salutes.splice(i, 1); add(R.ignoredSalute, 'salute'); calm = false; }
      }
      if (calm && speed > 0.3 && !failReason) value = clamp(value + R.calm * dt);
      return meter;
    },

    /** Someone salutes the lead: he has saluteSeconds to return it. */
    salute() { if (!failReason && salutes.length < 3) salutes.push(R.saluteSeconds); },
    /** The lead returns the oldest waiting salute. @returns {boolean} Whether one was waiting. */
    returnSalute() {
      if (failReason || !salutes.length) return false;
      salutes.shift();
      value = clamp(value + R.returnedSalute);
      return true;
    },
    /** The lead walked into someone. */
    bump() { add(R.bump, 'bump'); },
    /**
     * The answer to the old sergeant: a SERGEANT_CHOICES id, or null for no answer in time.
     * @returns {number} The change applied.
     */
    sergeant(choiceId) {
      const choice = SERGEANT_CHOICES.find((each) => each.id === choiceId);
      const amount = choice ? choice.suspicion : R.noAnswer;
      if (amount > 0) add(amount, 'sergeant'); else if (!failReason) value = clamp(value + amount);
      return amount;
    },
  };
  return meter;
}

function clamp(value) {
  return Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
}
