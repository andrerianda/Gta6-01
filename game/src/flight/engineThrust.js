// Thrust from the throttle. A piston engine turns a propeller: its power falls with the air's
// density, and the thrust is power over speed, capped by what the propeller can pull standing
// still. A jet's thrust falls with density, changes with the Mach number (a turbofan loses, an
// afterburning turbojet gains from ram pressure) and, where the engine has one, an afterburner
// stage lights over the last tenth of the throttle. Engines spool up and down with a lag.
// Pure numbers, no imports.

/**
 * The thrust of all engines together, newtons.
 * @param {EngineSpec} engine From deriveEngineSpec (airplaneTuning.js).
 * @param {number} spool Engine speed, 0 (stopped) .. 1 (full), from advanceEngineSpool.
 * @param {number} airspeed True airspeed along the nose, m/s.
 * @param {number} mach
 * @param {number} densityRatio Air density over the sea-level density.
 * @param {number} altitude Metres above sea level (thrust fades above the service ceiling).
 * @returns {number}
 */
export function engineThrust(engine, spool, airspeed, mach, densityRatio, altitude) {
  const power = enginePowerShare(engine, spool);
  if (power <= 0) return 0;
  const thin = 1 - smooth(engine.ceiling, engine.ceiling + 1500, altitude);
  if (engine.kind === 'piston') {
    // Gagg and Farrar: a normally aspirated engine loses power a little faster than the density falls.
    const lapse = Math.max(0, densityRatio - (1 - densityRatio) / 7.55);
    const shaft = engine.power * engine.count * lapse * (0.04 + 0.96 * power);
    const standing = engine.staticThrust * engine.count * Math.cbrt(densityRatio) * (0.06 + 0.94 * power);
    const moving = (engine.propEfficiency * shaft) / Math.max(airspeed, 1);
    return thin / Math.sqrt(1 / (standing * standing) + 1 / (moving * moving));
  }
  let stage = 0.04 + 0.96 * power;
  if (engine.afterburner) {
    stage = power <= AFTERBURNER_FROM
      ? engine.dryShare * (0.04 + 0.96 * power / AFTERBURNER_FROM)
      : engine.dryShare + (1 - engine.dryShare) * (power - AFTERBURNER_FROM) / (1 - AFTERBURNER_FROM);
  }
  let ram = 1 + engine.ramLinear * mach + engine.ramSquare * mach * mach;
  if (ram < 0.45) ram = 0.45;
  if (ram > engine.ramCap) ram = engine.ramCap;
  ram *= 1 - 0.85 * smooth(engine.maxMach, engine.maxMach + 0.3, mach);
  return engine.maxThrust * engine.count * stage * Math.pow(densityRatio, 0.75) * ram * thin;
}

/** The share of the throttle above which an afterburner is lit. */
export const AFTERBURNER_FROM = 0.9;

/**
 * Power asked of the engine, 0 (idle or stopped) .. 1, from its speed.
 * @param {EngineSpec} engine
 * @param {number} spool 0..1.
 * @returns {number}
 */
export function enginePowerShare(engine, spool) {
  const power = (spool - engine.idle) / (1 - engine.idle);
  return power < 0 ? 0 : power > 1 ? 1 : power;
}

/**
 * How far the afterburner is lit, 0..1.
 * @param {EngineSpec} engine
 * @param {number} spool 0..1.
 * @returns {number}
 */
export function afterburnerShare(engine, spool) {
  if (!engine.afterburner) return 0;
  const power = enginePowerShare(engine, spool);
  return power <= AFTERBURNER_FROM ? 0 : (power - AFTERBURNER_FROM) / (1 - AFTERBURNER_FROM);
}

/**
 * Moves the engine speed towards what the throttle asks for.
 * @param {EngineSpec} engine
 * @param {number} spool Engine speed now, 0..1.
 * @param {number} throttle The lever, 0..1.
 * @param {boolean} running False: the engine runs down to a stop.
 * @param {number} dt Seconds.
 * @returns {number} The new engine speed.
 */
export function advanceEngineSpool(engine, spool, throttle, running, dt) {
  const lever = throttle < 0 ? 0 : throttle > 1 ? 1 : throttle;
  const target = running ? engine.idle + (1 - engine.idle) * lever : 0;
  const time = target > spool ? engine.spoolUpTime : engine.spoolDownTime;
  const next = spool + (target - spool) * Math.min(1, (dt * 3) / time);
  return Math.abs(target - next) < 0.0005 ? target : next;
}

function smooth(low, high, value) {
  const t = value <= low ? 0 : value >= high ? 1 : (value - low) / (high - low);
  return t * t * (3 - 2 * t);
}

/**
 * The engines of one aircraft.
 * @typedef {object} EngineSpec
 * @property {'piston' | 'jet'} kind
 * @property {number} count How many engines.
 * @property {number} power Shaft power of one piston engine at sea level, watts.
 * @property {number} staticThrust Standing thrust of one propeller at sea level, newtons.
 * @property {number} propEfficiency
 * @property {number} maxThrust Sea-level static thrust of one jet engine (afterburner lit when it has one), newtons.
 * @property {boolean} afterburner
 * @property {number} dryShare Share of maxThrust without the afterburner.
 * @property {number} ramLinear Thrust change per Mach.
 * @property {number} ramSquare Thrust change per Mach squared.
 * @property {number} ramCap The most the Mach number may multiply the thrust by.
 * @property {number} maxMach The engine chokes above it.
 * @property {number} ceiling Metres above sea level where the thrust starts to fade out.
 * @property {number} idle Engine speed at idle, 0..1.
 * @property {number} spoolUpTime Seconds from idle to (95 percent of) full.
 * @property {number} spoolDownTime
 */
