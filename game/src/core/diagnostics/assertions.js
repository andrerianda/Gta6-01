// Assertion helpers that vanish in normal play: each check is a single flag test unless
// development checks were switched on (the debug object and automation switch them on). Use them
// for contracts between systems; never for conditions the player can cause.
//
//   assert(lane !== undefined, () => `vehicle ${id} has no lane`);
//   assertFinite(speed, 'speed');

/**
 * Fails with a message when a condition does not hold and development checks are on.
 * @param {unknown} condition What must be truthy.
 * @param {string | (() => string)} [message] The failure text, or a function that builds it
 *   (so that formatting costs nothing when the check passes or checks are off).
 */
export function assert(condition, message) {
  if (!checksEnabled || condition) return;
  throw new Error(`assertion failed: ${typeof message === 'function' ? message() : message ?? 'no message'}`);
}

/**
 * Fails when a value is not a finite number and development checks are on.
 * @param {unknown} value The value to check.
 * @param {string} name What the value is, for the message.
 */
export function assertFinite(value, name) {
  if (!checksEnabled || (typeof value === 'number' && Number.isFinite(value))) return;
  throw new Error(`assertion failed: ${name} is ${String(value)}, not a finite number`);
}

/**
 * Fails when a value is null or undefined and development checks are on.
 * @param {unknown} value The value to check.
 * @param {string} name What the value is, for the message.
 */
export function assertDefined(value, name) {
  if (!checksEnabled || (value !== null && value !== undefined)) return;
  throw new Error(`assertion failed: ${name} is ${String(value)}`);
}

/**
 * Switches development checks on or off.
 * @param {boolean} enabled
 */
export function setDevelopmentChecks(enabled) {
  checksEnabled = Boolean(enabled);
}

/** @returns {boolean} Whether development checks are on. */
export function developmentChecksEnabled() {
  return checksEnabled;
}

/** Off in normal play; the checks above then cost one flag test each. */
let checksEnabled = false;
