// What a fixed-wing aircraft sounds like, as numbers: the pure maps from the flight state (engine
// spool, throttle, thrust, afterburner, airspeed, stall warning, buffet, gear and flap travel) to
// the synthesis targets aircraftVoices.js glides its oscillators, filters and gains to. A piston
// propeller is an engine drone at the firing frequency under the beat of the blades; a jet is a
// whine that follows the spool over a broad roar that follows the thrust, with a crackling layer
// when the afterburner is lit. Pure: no WebAudio, tested in Node.

/** Which voice a catalog engine sound name gets: 'propeller', 'jet' or null (not an aircraft). */
export function aircraftVoiceKindOf(soundName) {
  if (soundName === 'prop_flat_four') return 'propeller';
  if (soundName === 'jet_turbofan' || soundName === 'jet_afterburner') return 'jet';
  return null;
}

/** Propeller blades, and the propeller's speed at full power, revolutions per minute. */
export const PROPELLER = Object.freeze({ blades: 2, idleRpm: 700, fullRpm: 2700 });

/** Thresholds of the warnings that have a sound. */
export const AIRCRAFT_WARNING_SOUNDS = Object.freeze({
  stallHornFrom: 0.15,       // state.stallWarning above this sounds the horn
  buffetFrom: 0.05,
  pullUpBelow: 760,          // metres of radar altitude
  pullUpSink: -5,            // m/s; gentler descents never warn
  pullUpSeconds: 7,          // time to the ground at the present sink rate
  touchdownSpeed: 12,        // m/s over the ground for the tyres to chirp
  jetHornPulseHz: 4,
});

const clamp01 = (value) => (value > 0 ? (value < 1 ? value : 1) : 0);

/**
 * A piston propeller's targets.
 * @param {number} spool Engine speed 0..1 (state.rpm).
 * @param {number} throttle 0..1 actual.
 * @param {{idleHz: number, redlineHz: number}} sound The catalog's VEHICLE_ENGINE_SOUNDS entry.
 * @param {{engineHz: number, bladeHz: number, engineGain: number, bladeGain: number, cutoff: number}} out
 */
export function propellerSoundTargets(spool, throttle, sound, out) {
  const s = clamp01(spool);
  const load = clamp01(throttle);
  out.engineHz = sound.idleHz + (sound.redlineHz - sound.idleHz) * s;
  const rpm = PROPELLER.idleRpm + (PROPELLER.fullRpm - PROPELLER.idleRpm) * s;
  out.bladeHz = (rpm / 60) * PROPELLER.blades;
  const running = s > 0.02 ? 1 : 0;
  out.engineGain = running * (0.22 + 0.4 * s + 0.2 * load);
  out.bladeGain = running * (0.12 + 0.5 * s * s);
  out.cutoff = 500 + 2600 * (0.3 * s + 0.7 * load);
  return out;
}

/**
 * A jet's targets.
 * @param {number} spool Engine speed 0..1 (state.rpm).
 * @param {number} thrustShare Thrust as a share of the dry maximum, 0..1 (more with the burner).
 * @param {number} afterburner 0..1.
 * @param {{idleHz: number, redlineHz: number}} sound The catalog's VEHICLE_ENGINE_SOUNDS entry.
 * @param {{whineHz: number, whineGain: number, roarGain: number, roarCutoff: number, burnerGain: number}} out
 */
export function jetSoundTargets(spool, thrustShare, afterburner, sound, out) {
  const s = clamp01(spool);
  const thrust = clamp01(thrustShare);
  const burner = clamp01(afterburner);
  // The compressor's whine is a few harmonics above the catalog's base pitch.
  out.whineHz = (sound.idleHz + (sound.redlineHz - sound.idleHz) * s) * 4;
  out.whineGain = s > 0.02 ? 0.05 + 0.1 * s * (1 - 0.5 * thrust) : 0;
  out.roarGain = s > 0.02 ? 0.1 + 0.75 * thrust * thrust + 0.25 * burner : 0;
  out.roarCutoff = 260 + 1900 * thrust + 900 * burner;
  out.burnerGain = 0.9 * burner;
  return out;
}

/**
 * The wind over the airframe.
 * @param {number} indicatedAirspeed m/s.
 * @param {boolean} inCockpit The cockpit view is active (the wind is close and loud; the engines muffled).
 * @param {{gain: number, cutoff: number}} out
 */
export function windSoundTargets(indicatedAirspeed, inCockpit, out) {
  const v = indicatedAirspeed > 0 ? indicatedAirspeed : 0;
  const share = clamp01(v / 160);
  out.gain = (inCockpit ? 0.55 : 0.3) * Math.sqrt(share) * clamp01(v / 12);
  out.cutoff = 350 + 2600 * share;
  return out;
}

/**
 * The stall-warning horn: a steady reed in the trainer, a pulsed tone in the jets.
 * @param {number} stallWarning state.stallWarning, 0..1.
 * @param {'propeller' | 'jet'} kind
 * @param {boolean} onGround No horn on the ground.
 * @param {{gain: number, hz: number, pulseHz: number}} out pulseHz 0 = steady.
 */
export function stallHornTargets(stallWarning, kind, onGround, out) {
  const on = !onGround && stallWarning > AIRCRAFT_WARNING_SOUNDS.stallHornFrom;
  out.gain = on ? 0.16 + 0.1 * clamp01(stallWarning) : 0;
  out.hz = kind === 'jet' ? 880 : 410 + 40 * clamp01(stallWarning);
  out.pulseHz = kind === 'jet' ? AIRCRAFT_WARNING_SOUNDS.jetHornPulseHz : 0;
  return out;
}

/**
 * Whether the ground-proximity tone sounds.
 * @param {{radarAltitude: number, verticalSpeed: number, onGround: boolean}} state The Airplane's state.
 * @returns {boolean}
 */
export function pullUpToneOn(state) {
  const L = AIRCRAFT_WARNING_SOUNDS;
  if (state.onGround || !(state.verticalSpeed < L.pullUpSink) || !(state.radarAltitude < L.pullUpBelow)) return false;
  return state.radarAltitude / -state.verticalSpeed < L.pullUpSeconds;
}

/**
 * How hard the tyres chirp on a touchdown: 0 (none) .. 1.
 * @param {number} wheelsBefore state.wheelsOnGround last time.
 * @param {number} wheelsNow
 * @param {number} groundSpeed m/s.
 * @returns {number}
 */
export function touchdownChirp(wheelsBefore, wheelsNow, groundSpeed) {
  if (!(wheelsNow > wheelsBefore) || !(groundSpeed > AIRCRAFT_WARNING_SOUNDS.touchdownSpeed)) return 0;
  return clamp01(0.35 + groundSpeed / 90);
}

/**
 * Whether a motor runs: the gear or the flaps moved since the last reading.
 * @param {number} before 0..1 travel last time.
 * @param {number} now
 * @returns {boolean}
 */
export function motorRunning(before, now) {
  return Math.abs(now - before) > 0.0005;
}
