// Engine sound profiles: what each vehicleCatalog `engine.sound` name sounds like, and the pure
// maths that turns the physics rpm and throttle into synthesis targets. Pure, no WebAudio.
//
// The model: one oscillator runs at the engine-cycle frequency (rpm / 120, one four-stroke
// cycle) with a PeriodicWave whose harmonic k is loud when k is a multiple of the cylinder
// count (the firing order: rpm / 120 * cylinders) and whose other orders carry the profile's
// unevenness (cross-plane V8 burble, V-twin thump, diesel knock). A low-pass that opens with
// throttle and rpm gives load; filtered noise gives intake and exhaust roar; a lope at the cycle
// rate gives the idle its character. The physics rpm (every car idles at 900 and redlines at
// 6800) is mapped onto the profile's own range, so a truck diesel tops out near 2800 rpm and a
// sportbike screams to 12000.

/** The rpm range every physics vehicle reports (game/src/physics/vehicles/vehicleTuning.js). */
export const PHYSICS_RPM = Object.freeze({ idle: 900, redline: 6800 });

/**
 * Profiles keyed by the catalog's engine sound names. Fields: cylinders; idleRpm/redlineRpm;
 * unevenness (0 smooth .. 1 lumpy: weight of the non-firing orders); tilt (how fast the firing
 * harmonics fall off; lower is brighter); brightness (filter opening with load); noise (intake
 * and exhaust roar); rasp (an extra edge at 1.5x firing under load); lope (idle amplitude
 * wobble); drive (waveshaper distortion 0..1); diesel (clatter on the noise); gain.
 */
export const ENGINE_PROFILES = Object.freeze({
  buzzy_four: profile(4, 850, 6600, 0.10, 1.05, 1.2, 0.22, 0.35, 0.05, 0.15, 0, 0.75),
  smooth_four: profile(4, 750, 6400, 0.06, 1.25, 0.8, 0.16, 0.12, 0.03, 0.05, 0, 0.7),
  screaming_four: profile(4, 1300, 12500, 0.08, 0.95, 1.5, 0.3, 0.5, 0.04, 0.3, 0, 0.8),
  smooth_six: profile(6, 700, 6800, 0.05, 1.2, 0.9, 0.18, 0.15, 0.03, 0.05, 0, 0.75),
  snarling_six: profile(6, 900, 7800, 0.14, 0.95, 1.4, 0.26, 0.45, 0.06, 0.35, 0, 0.85),
  gruff_six: profile(6, 650, 5600, 0.18, 1.1, 0.9, 0.26, 0.3, 0.08, 0.25, 0, 0.85),
  rumbling_eight: profile(8, 700, 6200, 0.38, 1.1, 1.0, 0.24, 0.3, 0.16, 0.3, 0, 0.95),
  burbling_eight: profile(8, 600, 5200, 0.55, 1.15, 0.85, 0.22, 0.25, 0.24, 0.35, 0, 1.0),
  gruff_eight: profile(8, 650, 5800, 0.42, 1.1, 0.9, 0.3, 0.35, 0.18, 0.4, 0, 0.95),
  wailing_twelve: profile(12, 950, 8800, 0.04, 0.85, 1.6, 0.2, 0.4, 0.02, 0.2, 0, 0.85),
  diesel_four: profile(4, 650, 3800, 0.2, 1.2, 0.7, 0.34, 0.15, 0.1, 0.2, 0.7, 0.85),
  diesel_six: profile(6, 550, 2800, 0.22, 1.25, 0.65, 0.4, 0.15, 0.12, 0.25, 0.9, 0.95),
  thumping_twin: profile(2, 1000, 8500, 0.65, 1.0, 1.1, 0.24, 0.3, 0.3, 0.35, 0, 0.85),
  outboard_twin: profile(2, 900, 6000, 0.35, 0.9, 1.3, 0.3, 0.4, 0.1, 0.3, 0, 0.75),
  turbine_single: profile(1, 3000, 9000, 0.02, 0.6, 1.0, 0.6, 0.2, 0.0, 0.0, 0, 0.6),
  turbine_twin: profile(2, 3000, 9000, 0.02, 0.6, 1.0, 0.6, 0.2, 0.0, 0.0, 0, 0.65),
  // Fixed-wing aircraft are voiced by aircraftVoices.js; these serve the engine-start foley only.
  prop_flat_four: profile(4, 700, 2700, 0.3, 1.1, 0.9, 0.3, 0.2, 0.12, 0.25, 0, 0.9),
  jet_turbofan: profile(1, 3000, 9000, 0.02, 0.6, 1.0, 0.7, 0.2, 0.0, 0.0, 0, 0.6),
  jet_afterburner: profile(1, 3200, 9600, 0.02, 0.55, 1.1, 0.75, 0.25, 0.0, 0.0, 0, 0.65),
});

/** Engine profile for a catalog sound name; unknown names fall back by cylinder hint. */
export function engineProfileFor(soundName) {
  if (soundName && ENGINE_PROFILES[soundName]) return ENGINE_PROFILES[soundName];
  if (soundName && /eight/.test(soundName)) return ENGINE_PROFILES.rumbling_eight;
  if (soundName && /six/.test(soundName)) return ENGINE_PROFILES.smooth_six;
  return ENGINE_PROFILES.smooth_four;
}

/**
 * Harmonic weights for the profile's PeriodicWave (index 0 is the DC term, left at zero).
 * @param {object} engine A profile of ENGINE_PROFILES.
 * @param {number} [count] Number of harmonics.
 * @returns {{real: Float32Array, imag: Float32Array}}
 */
export function engineHarmonics(engine, count = 64) {
  const real = new Float32Array(count + 1);
  const imag = new Float32Array(count + 1);
  const cylinders = engine.cylinders;
  for (let k = 1; k <= count; k += 1) {
    const order = k / cylinders;
    let amplitude;
    if (k % cylinders === 0) {
      amplitude = 1 / Math.pow(order, engine.tilt);
    } else {
      // Non-firing orders: the irregularity of real combustion, strongest near the half orders.
      const half = (2 * k) % cylinders === 0 ? 1.6 : 1;
      amplitude = engine.unevenness * half * (0.45 + 0.55 * hash01(k * 7 + cylinders * 13)) / Math.pow(order + 0.5, engine.tilt);
    }
    // Alternate phases so the summed wave does not spike (keeps the peak level sane).
    const phase = hash01(k * 31 + 5) * Math.PI * 2;
    real[k] = amplitude * Math.cos(phase);
    imag[k] = amplitude * Math.sin(phase);
  }
  return { real, imag };
}

/**
 * Synthesis targets for one engine at one moment. Writes into `out` (no allocation).
 * @param {object} engine Profile.
 * @param {number} physicsRpm The physics vehicle's rpm.
 * @param {number} throttle 0..1 (absolute drive input).
 * @param {object} out Receives cycleHz, firingHz, rpm, load, gain, cutoffHz, noiseGain, noiseHz, raspGain, lopeDepth.
 * @returns {object} out
 */
export function engineTargets(engine, physicsRpm, throttle, out) {
  const span = PHYSICS_RPM.redline - PHYSICS_RPM.idle;
  const n = clamp((physicsRpm - PHYSICS_RPM.idle) / span, 0, 1.05);
  const load = clamp(Math.abs(throttle), 0, 1);
  const rpm = engine.idleRpm + n * (engine.redlineRpm - engine.idleRpm);
  out.rpm = rpm;
  out.load = load;
  out.cycleHz = rpm / 120;
  out.firingHz = out.cycleHz * engine.cylinders;
  out.gain = engine.gain * (0.32 + 0.33 * n + 0.35 * load) * (load < 0.05 && n > 0.2 ? 0.75 : 1);
  out.cutoffHz = Math.min(16000, 260 + out.firingHz * (2.2 + engine.brightness * (1.2 * n + 3.2 * load)));
  out.noiseGain = engine.noise * (0.12 + 0.88 * load) * (0.35 + 0.65 * n);
  out.noiseHz = Math.min(9000, 380 + out.firingHz * 2.6);
  out.raspGain = engine.rasp * load * (0.25 + 0.75 * n);
  out.lopeDepth = engine.lope * (1 - Math.min(n * 2.5, 1)) + engine.lope * 0.3 * (load < 0.05 ? n : 0);
  return out;
}

/** Doppler pitch factor for a source closing at `closingSpeed` m/s (positive = approaching). */
export function dopplerFactor(closingSpeed, speedOfSound = 343) {
  const v = clamp(closingSpeed, -0.5 * speedOfSound, 0.5 * speedOfSound);
  return speedOfSound / (speedOfSound - v);
}

function profile(cylinders, idleRpm, redlineRpm, unevenness, tilt, brightness, noise, rasp, lope, drive, diesel, gain) {
  return Object.freeze({ cylinders, idleRpm, redlineRpm, unevenness, tilt, brightness, noise, rasp, lope, drive, diesel, gain });
}

function hash01(n) {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
