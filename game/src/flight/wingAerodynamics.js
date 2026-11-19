// The wing's coefficients: lift against the angle of attack (a straight slope, a stall break past
// the critical angle, then the low plateau of separated flow that fades into a flat plate), and
// the drag polar (parasitic drag with its transonic rise, gear and flaps, plus the induced drag
// CL^2 / (pi e AR), plus the drag of separated flow in a stall). Flaps raise the whole lift curve.
// Angles are radians. Pure numbers, no imports.

/**
 * The lift coefficient at an angle of attack.
 * @param {WingPolar} wing From deriveWingPolar (airplaneTuning.js).
 * @param {number} alpha Angle of attack, radians.
 * @param {number} flaps Flap travel, 0 (up) .. 1 (the last notch).
 * @returns {number}
 */
export function liftCoefficient(wing, alpha, flaps) {
  const zeroLift = wing.cl0 + flaps * wing.flapLift;
  const critical = wing.criticalAlpha;
  if (alpha > critical) return separatedLift(wing.clMaxClean + flaps * wing.flapLift, alpha, alpha - critical);
  const negative = wing.negativeAlpha;
  if (alpha < negative) return -separatedLift(-(zeroLift + wing.liftSlope * negative), -alpha, negative - alpha);
  return zeroLift + wing.liftSlope * alpha;
}

/** Lift past the stall: `peak` at the break, 62 percent of it a few degrees on, a flat plate far beyond. */
function separatedLift(peak, alpha, past) {
  const broken = peak * (1 - 0.38 * smooth(0, 0.09, past));
  const plate = 1.05 * Math.sin(2 * alpha);
  const far = smooth(0.09, 0.5, past);
  return broken * (1 - far) + plate * far;
}

/**
 * The angle of attack that gives a lift coefficient on the straight part of the curve (clamped
 * to the stall angles), for trim and the assists.
 * @param {WingPolar} wing
 * @param {number} lift The lift coefficient wanted.
 * @param {number} flaps 0..1.
 * @returns {number} Radians.
 */
export function alphaForLift(wing, lift, flaps) {
  const alpha = (lift - wing.cl0 - flaps * wing.flapLift) / wing.liftSlope;
  return alpha > wing.criticalAlpha ? wing.criticalAlpha : alpha < wing.negativeAlpha ? wing.negativeAlpha : alpha;
}

/**
 * The largest lift coefficient with the flaps where they are.
 * @param {WingPolar} wing
 * @param {number} flaps 0..1.
 * @returns {number}
 */
export function maxLiftCoefficient(wing, flaps) {
  return wing.clMaxClean + flaps * wing.flapLift;
}

/**
 * The drag coefficient.
 * @param {WingPolar} wing
 * @param {number} lift The lift coefficient now.
 * @param {number} alpha Angle of attack, radians (for the separated-flow drag).
 * @param {number} mach
 * @param {number} flaps 0..1.
 * @param {number} gear 0 (up) .. 1 (down).
 * @param {number} groundEffect 0 (free air) .. 1 (wheels on the runway): the ground cuts the induced drag.
 * @returns {number}
 */
export function dragCoefficient(wing, lift, alpha, mach, flaps, gear, groundEffect) {
  const supersonic = smooth(0.9, 1.4, mach);
  const inducedFactor = wing.inducedFactor + (wing.inducedFactorSupersonic - wing.inducedFactor) * supersonic;
  const past = alpha > wing.criticalAlpha ? alpha - wing.criticalAlpha : alpha < wing.negativeAlpha ? wing.negativeAlpha - alpha : 0;
  const sine = Math.sin(alpha);
  return wing.cd0 * waveDragFactor(wing, mach) + wing.cdGear * gear + wing.cdFlaps * flaps
    + inducedFactor * lift * lift * (1 - 0.45 * groundEffect)
    + 1.3 * sine * sine * smooth(0, 0.12, past);
}

/**
 * How much the parasitic drag grows with the Mach number: 1 below the critical Mach number, a peak
 * just past Mach 1, a lower supersonic plateau.
 * @param {WingPolar} wing
 * @param {number} mach
 * @returns {number}
 */
export function waveDragFactor(wing, mach) {
  if (mach <= wing.criticalMach) return 1;
  return 1 + wing.waveRise * smooth(wing.criticalMach, 1.08, mach) - (wing.waveRise - wing.wavePlateau) * smooth(1.15, 2.4, mach);
}

/**
 * The side-force coefficient from sideslip (the fuselage and fin pushed sideways through the air).
 * @param {WingPolar} wing
 * @param {number} slip Sideslip angle, radians (+ when the air comes from the right).
 * @returns {number} Along the right wing (negative: pushed left).
 */
export function sideForceCoefficient(wing, slip) {
  const limited = slip > 0.5 ? 0.5 : slip < -0.5 ? -0.5 : slip;
  return -wing.sideForceSlope * limited;
}

/** Hermite step from 0 at `low` to 1 at `high`. */
function smooth(low, high, value) {
  const t = value <= low ? 0 : value >= high ? 1 : (value - low) / (high - low);
  return t * t * (3 - 2 * t);
}

/**
 * The coefficients of one aircraft's wing.
 * @typedef {object} WingPolar
 * @property {number} area Square metres.
 * @property {number} span Metres.
 * @property {number} aspectRatio
 * @property {number} liftSlope Per radian.
 * @property {number} cl0 Lift coefficient at zero angle of attack, flaps up.
 * @property {number} clMaxClean
 * @property {number} flapLift What full flaps add to the lift coefficient.
 * @property {number} criticalAlpha The stall angle, radians.
 * @property {number} negativeAlpha The inverted stall angle, radians (negative).
 * @property {number} cd0 Parasitic drag, clean, subsonic.
 * @property {number} cdGear Added by the gear when down.
 * @property {number} cdFlaps Added by full flaps.
 * @property {number} inducedFactor 1 / (pi e AR).
 * @property {number} inducedFactorSupersonic
 * @property {number} criticalMach Where the drag rise starts.
 * @property {number} waveRise Share of cd0 added at the transonic peak.
 * @property {number} wavePlateau Share of cd0 that stays supersonic.
 * @property {number} sideForceSlope Per radian of sideslip.
 */
