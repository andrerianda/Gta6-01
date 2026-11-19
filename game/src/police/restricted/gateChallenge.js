// The challenge at the gate and the officer switch as one small state machine: 'outside',
// 'challenged' (inside the gate's radius without access: a countdown with two spoken warnings,
// kept with a few metres of hysteresis so the edge does not flicker, and recovering slowly once
// he has left, so stepping out and in again does not buy a fresh eight seconds), 'trespassing'
// (the countdown ran out, or he is inside the ring by any way) and 'cleared' (inside as the
// expected officer). An offence while cleared (a drawn weapon, someone hurt) revokes the
// clearance for this visit. Pure (Node-tested).

/** The numbers of the challenge. */
export const GATE_CHALLENGE = Object.freeze({
  /** Seconds from the first warning to trespass. */
  seconds: 8,
  /** Seconds left when the last warning is spoken. */
  lastWarningAt: 4,
  /** Metres beyond the challenge radius before a challenged lead counts as gone. */
  hysteresis: 5,
  /** Seconds of countdown given back per second away from the gate. */
  recoverRate: 0.4,
  /** Metres outside the ring before a trespasser counts as out again. */
  exitMargin: 30,
});

/** The guard's lines, in order. */
export const GATE_LINES = Object.freeze({
  first: Object.freeze({ lineId: 'gate_turn_around', text: 'Restricted area. Turn around.' }),
  last: Object.freeze({ lineId: 'gate_last_warning', text: 'Last warning. Leave now.' }),
  welcome: Object.freeze({ lineId: 'gate_officer_pass', text: 'Good morning, Lieutenant. Go ahead.' }),
  alarm: Object.freeze({ lineId: 'gate_intruder', text: 'Intruder on the base! All posts, weapons free!' }),
});

/**
 * A fresh challenge state.
 * @returns {{state: 'outside'|'challenged'|'trespassing'|'cleared', countdown: number, warnings: number,
 *   line: 'first'|'last'|null, revoked: boolean, trespassed: boolean, reason: string|null}}
 */
export function createGateChallenge() {
  return { state: 'outside', countdown: GATE_CHALLENGE.seconds, warnings: 0, line: null, revoked: false, trespassed: false, reason: null };
}

/**
 * Whether the lead passes as the expected officer now.
 * @param {boolean} accessFlag The world flag base.officerAccess.
 * @param {{revoked: boolean}} challenge
 */
export function hasOfficerAccess(accessFlag, challenge) {
  return Boolean(accessFlag) && !challenge.revoked;
}

/**
 * Advances the challenge by dt seconds.
 * @param {ReturnType<typeof createGateChallenge>} s Changed in place.
 * @param {{inside: boolean, ringDistance: number, gateDistance: number, challengeRadius: number, access: boolean,
 *   offence: boolean, present: boolean, wanted: number}} input inside: in the ring and its height band;
 *   ringDistance: metres outside the ring (0 inside); offence: a weapon drawn or someone hurt this
 *   step; present: within reach of the base; wanted: the stars.
 * @param {number} dt
 * @returns {string} The state. `s.line` names a warning to speak this step ('first' | 'last'), else null.
 */
export function stepGateChallenge(s, input, dt) {
  s.line = null;
  const atGate = input.gateDistance < input.challengeRadius;
  // Far away with no stars: the visit is over, a revoked clearance and the guards' grudge with it.
  if (!input.present && input.wanted <= 0) { s.revoked = false; s.trespassed = false; }
  if (hasOfficerAccess(input.access, s)) {
    if (input.offence && (input.inside || atGate)) {
      s.revoked = true;
      s.reason = 'clearance_revoked';
    } else {
      s.state = input.inside ? 'cleared' : 'outside';
      s.countdown = GATE_CHALLENGE.seconds;
      s.warnings = 0;
      s.reason = null;
      return s.state;
    }
  }
  if (input.inside) {
    if (s.state !== 'trespassing') s.reason = s.revoked ? 'clearance_revoked' : 'entered';
    s.state = 'trespassing';
    s.trespassed = true;
    return s.state;
  }
  if (s.state === 'trespassing') {
    // Out of the ring: he is gone once well clear of it and of the gate.
    if (input.ringDistance > GATE_CHALLENGE.exitMargin && input.gateDistance > input.challengeRadius + GATE_CHALLENGE.hysteresis) {
      s.state = 'outside';
      s.warnings = 0;
      s.countdown = GATE_CHALLENGE.seconds;
    }
    return s.state;
  }
  if (s.state === 'cleared') s.state = 'outside';
  const held = s.state === 'challenged' && input.gateDistance < input.challengeRadius + GATE_CHALLENGE.hysteresis;
  if (atGate || held) {
    if (s.state !== 'challenged') {
      s.state = 'challenged';
      // A first warning for a fresh countdown; one already half spent goes on from where it was.
      if (s.countdown > GATE_CHALLENGE.lastWarningAt) { s.warnings = 1; s.line = 'first'; }
      else { s.warnings = 2; s.line = 'last'; }
    }
    s.countdown -= dt;
    if (s.warnings < 2 && s.countdown <= GATE_CHALLENGE.lastWarningAt) { s.warnings = 2; s.line = 'last'; }
    if (s.countdown <= 0 || (s.revoked && input.offence) || (input.offence && s.warnings > 0)) {
      s.countdown = 0;
      s.state = 'trespassing';
      s.trespassed = true;
      s.reason = input.offence ? 'weapon_at_gate' : 'ignored_warning';
    }
    return s.state;
  }
  s.state = 'outside';
  s.countdown = Math.min(GATE_CHALLENGE.seconds, s.countdown + dt * GATE_CHALLENGE.recoverRate);
  if (s.countdown >= GATE_CHALLENGE.seconds) s.warnings = 0;
  return s.state;
}
