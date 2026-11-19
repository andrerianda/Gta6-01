// Derives everything the flight model needs from an aircraft's vehicleCatalog entry: the wing's
// lift curve and drag polar (the largest lift coefficients come straight from the catalog's stall
// speeds, so the aircraft stalls where the catalog says), the engines, the three wheels, the
// collision boxes, the inertia and the handling numbers. Pure data, tested in Node.
import { GRAVITY, SEA_LEVEL_DENSITY } from './standardAtmosphere.js';
import { alphaForLift } from './wingAerodynamics.js';

/**
 * The tuning of one fixed-wing aircraft.
 * @param {object} entry A vehicleCatalog entry of class 'airplane' (mass, dimensions, handling, flight).
 * @returns {object} The tuning: the catalog's flight numbers plus wing, engine, gear, boxes, inertia and handling.
 */
export function deriveAirplaneTuning(entry) {
  const flight = entry.flight;
  const size = entry.dimensions;
  const handling = entry.handling;
  const mass = entry.mass;
  const weight = mass * GRAVITY;
  const jet = flight.kind === 'jet';
  const span = flight.wingSpan;
  const area = flight.wingArea;
  const aspectRatio = (span * span) / area;
  const wing = deriveWingPolar(flight, weight, aspectRatio);
  const engine = deriveEngineSpec(flight);
  const layout = flight.layout;
  const clearance = size.groundClearance ?? size.height * 0.3;
  const centreOfMass = { x: 0, y: clearance + (size.height - clearance) * 0.25, z: 0 };
  const length = size.length;
  const fuselageWidth = Math.max(1.1, length * 0.085);
  const chord = flight.meanChord;
  const wingUp = layout.wingRoot?.up ?? clearance + (size.height - clearance) * 0.2;
  const wingForward = layout.wingRoot ? layout.wingRoot.forward - chord * 0.5 : 0;
  const rearReach = length * 0.3 - Math.abs(layout.gear.main.forward);
  const referenceSpeed = 1.6 * flight.stallSpeedClean;
  const trimSpeed = Math.min(flight.cruiseSpeed, 2.4 * flight.stallSpeedClean);
  const trimAlpha = alphaForLift(wing, weight / (0.5 * SEA_LEVEL_DENSITY * trimSpeed * trimSpeed * area), 0);
  const slowAlpha = alphaForLift(wing, weight / (0.5 * SEA_LEVEL_DENSITY * (1.2 * flight.stallSpeedClean) ** 2 * area), 0);
  const staticThrust = jet ? engine.maxThrust * engine.count : engine.staticThrust * engine.count;
  const pitchFrequency = clamp(9 / Math.sqrt(length), 1.3, 2.6);
  // The control moments are written as angular accelerations, so the pitch inertia decides how
  // hard the elevator pushes against the wheels: enough to lift the nose wheel at rotate speed
  // with a little over half the stick.
  const rotatePressure = (flight.rotateSpeed / referenceSpeed) ** 2;
  const rotateInertia = (1.5 * weight * Math.abs(layout.gear.main.forward))
    / (pitchFrequency * pitchFrequency * rotatePressure * 0.6 * (wing.criticalAlpha + 0.09 - trimAlpha));
  return {
    id: entry.id,
    kind: flight.kind,
    mass,
    length,
    span,
    height: size.height,
    wing,
    engine,
    gear: deriveLandingGear(flight, mass, handling, jet),
    centreOfMass,
    inertia: {
      x: Math.max((mass / 12) * (length * length * 0.5 + size.height * size.height), rotateInertia),
      y: (mass / 12) * (length * length * 0.5 + span * span * 0.5),
      z: (mass / 12) * (span * span * 0.5 + size.height * size.height),
    },
    // Collision boxes in model space (origin on the ground under the centre of mass, -Z forward).
    fuselage: { halfX: fuselageWidth * 0.5, halfY: (size.height * 0.72 - clearance) * 0.5, halfZ: length * 0.35, y: (size.height * 0.72 + clearance) * 0.5, z: -length * 0.05 },
    wingBox: { halfX: span * 0.46, halfY: 0.12, halfZ: chord * 0.3, y: wingUp, z: -wingForward },
    tail: layout.tail ? { halfX: 0.12, halfY: size.height * 0.2, halfZ: length * 0.08, y: size.height * 0.75, z: -layout.tail.forward - length * 0.04 } : null,
    // The catalog's numbers, as the HUD, the assists and the autopilot read them.
    stallSpeedClean: flight.stallSpeedClean,
    stallSpeedFlaps: flight.stallSpeedFlaps,
    cruiseSpeed: flight.cruiseSpeed,
    neverExceedSpeed: flight.neverExceedSpeed,
    rotateSpeed: flight.rotateSpeed,
    approachSpeed: flight.approachSpeed,
    climbSpeed: flight.climbSpeed ?? 1.45 * flight.stallSpeedClean,
    maxMach: flight.maxMach,
    serviceCeiling: flight.serviceCeiling,
    flapNotches: flight.flapNotches,
    flapTime: 2 + (flight.flapNotches.length - 1),
    retractableGear: Boolean(flight.retractableGear),
    gearTime: jet ? 6 : 4,
    autoThrottle: Boolean(flight.autoThrottle),
    climbRate: handling.climbRate,
    topSpeed: handling.topSpeed,
    // Handling: the control moments scale with dynamic pressure over the pressure at referenceSpeed.
    referencePressure: 0.5 * SEA_LEVEL_DENSITY * referenceSpeed * referenceSpeed,
    pitchFrequency,
    pitchDamping: 0.95,
    rollRate: clamp(14 / span, 0.3, 2.2),
    rollTime: 0.15 + span / 90,
    yawFrequency: clamp(6.5 / Math.sqrt(length), 1.0, 1.8),
    yawDamping: 0.7,
    rudderSlip: 0.2,
    dihedral: 1.4,
    trimAlpha,
    trimRange: Math.max(slowAlpha - trimAlpha, 0.03),
    trimRangeDown: Math.max(trimAlpha - alphaForLift(wing, weight / (0.5 * SEA_LEVEL_DENSITY * flight.neverExceedSpeed ** 2 * area), 0), 0.004),
    maxGroundPitch: Math.min(0.245, Math.atan((clearance - 0.1) / Math.max(rearReach, 1))),
    casualClimbAngle: clamp(Math.asin(Math.min(0.9, staticThrust / weight)) + 0.12, 0.2, 0.6),
    autopilotBank: 25 * Math.PI / 180,
    autopilotVerticalSpeed: handling.climbRate * 0.75,
    touchdownLimit: jet ? 5 : 3.5,
    skinTimeConstant: 14,
  };
}

/**
 * The wing's coefficients from the catalog's flight block.
 * @param {object} flight entry.flight.
 * @param {number} weight Newtons.
 * @param {number} aspectRatio
 * @returns {import('./wingAerodynamics.js').WingPolar}
 */
export function deriveWingPolar(flight, weight, aspectRatio) {
  const jet = flight.kind === 'jet';
  const area = flight.wingArea;
  const pressureAt = (speed) => 0.5 * SEA_LEVEL_DENSITY * speed * speed;
  const clMaxClean = weight / (pressureAt(flight.stallSpeedClean) * area);
  const clMaxFlaps = weight / (pressureAt(flight.stallSpeedFlaps) * area);
  // Helmbold's slope for a finite wing; slender deltas keep more lift than it says (vortex lift).
  const liftSlope = Math.max((2 * Math.PI * aspectRatio) / (2 + Math.sqrt(4 + aspectRatio * aspectRatio)), 3.3);
  const cl0 = flight.zeroAlphaLift ?? (jet ? 0.06 : 0.25);
  const inducedFactor = 1 / (Math.PI * (flight.oswald ?? 0.8) * aspectRatio);
  return {
    area,
    span: flight.wingSpan,
    aspectRatio,
    liftSlope,
    cl0,
    clMaxClean,
    flapLift: Math.max(0, clMaxFlaps - clMaxClean),
    criticalAlpha: (clMaxClean - cl0) / liftSlope,
    negativeAlpha: -(0.7 * clMaxClean + cl0) / liftSlope,
    cd0: flight.zeroLiftDrag ?? (jet ? 0.014 : 0.035),
    cdGear: flight.retractableGear ? flight.gearDrag ?? 0.012 : 0,
    cdFlaps: flight.flapDrag ?? (jet ? 0.02 : 0.03),
    inducedFactor,
    inducedFactorSupersonic: flight.supersonicInducedFactor ?? inducedFactor * 1.6,
    criticalMach: flight.criticalMach ?? (jet ? 0.85 : 0.6),
    waveRise: flight.waveRise ?? 1.5,
    wavePlateau: flight.wavePlateau ?? 0.8,
    sideForceSlope: 0.9,
  };
}

/**
 * The engines from the catalog's flight block.
 * @param {object} flight entry.flight.
 * @returns {import('./engineThrust.js').EngineSpec}
 */
export function deriveEngineSpec(flight) {
  const jet = flight.kind === 'jet';
  const power = flight.enginePower ?? 0;
  const disc = Math.PI * ((flight.layout.propeller?.diameter ?? 1.8) / 2) ** 2;
  const burner = Boolean(flight.afterburner);
  return {
    kind: jet ? 'jet' : 'piston',
    count: flight.engines ?? 1,
    power,
    // Momentum theory for a propeller standing still, with what a fixed-pitch blade loses.
    staticThrust: 0.7 * Math.cbrt(2 * SEA_LEVEL_DENSITY * disc * power * power),
    propEfficiency: flight.propEfficiency ?? 0.82,
    maxThrust: flight.engineThrust ?? 0,
    afterburner: burner,
    dryShare: flight.dryThrustShare ?? 0.62,
    ramLinear: flight.ramLinear ?? (burner ? -0.2 : -0.5),
    ramSquare: flight.ramSquare ?? (burner ? 0.32 : 0.2),
    ramCap: flight.ramCap ?? (burner ? 3.2 : 1),
    maxMach: flight.maxMach,
    ceiling: flight.serviceCeiling,
    idle: jet ? 0.25 : 0.2,
    spoolUpTime: jet ? 3 : 0.8,
    spoolDownTime: jet ? 2.2 : 0.6,
  };
}

/**
 * The three wheels from the catalog's layout: where each one touches (model space), its spring and
 * damper sized for its share of the weight, and the tyre's grip.
 * @param {object} flight entry.flight.
 * @param {number} mass Kilograms.
 * @param {{braking: number, grip: number}} handling entry.handling.
 * @param {boolean} jet
 * @returns {import('./landingGear.js').LandingGearSpec}
 */
export function deriveLandingGear(flight, mass, handling, jet) {
  const gear = flight.layout.gear;
  const ahead = gear.nose.forward;
  const behind = -gear.main.forward;
  const base = ahead + behind;
  const sag = jet ? 0.16 : 0.07;
  const weight = mass * GRAVITY;
  const noseLoad = (weight * behind) / base;
  const mainLoad = (weight * ahead) / base / 2;
  const wheel = (x, forward, load, steers, brakes) => ({
    x, z: -forward, load, stiffness: load / sag,
    damping: 2 * 0.75 * Math.sqrt((load / sag) * (load / GRAVITY)),
    steers, brakes,
  });
  return {
    sag,
    travel: sag * 2.6,
    wheels: [
      wheel(0, ahead, noseLoad, true, false),
      wheel(-gear.main.right, -behind, mainLoad, false, true),
      wheel(gear.main.right, -behind, mainLoad, false, true),
    ],
    rollingFriction: 0.018,
    brakeFriction: clamp(handling.braking / GRAVITY, 0.25, 0.7) * 1.25,
    sideFriction: 0.85,
    maxSteer: 0.6,
    steerFadeSpeed: jet ? 22 : 10,
  };
}

function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}
