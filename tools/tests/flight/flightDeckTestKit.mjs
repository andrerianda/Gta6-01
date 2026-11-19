// Shared by the flight deck tests: a hand-made instrument readout with every field of the contract
// (flightInstruments.js createInstrumentReadout), and a stand-in Canvas 2D context that records the
// calls made on it, so the painters run in Node.

/** A readout in steady cruise; pass overrides for the case under test. */
export function makeReadout(overrides = {}) {
  const { autopilot, ...rest } = overrides;
  return {
    airspeedKnots: 105, groundSpeedKnots: 108, altitudeFeet: 3200, radarAltitudeFeet: 2400, verticalSpeedFpm: 0, headingDegrees: 90,
    pitchDegrees: 2, rollDegrees: 0, turnNeedle: 0, slipBall: 0, mach: 0.16, alphaDegrees: 3, loadFactor: 1, throttlePercent: 70,
    rpmPercent: 85, afterburner: false, flapsDegrees: 0, flapNotch: 0, gearDown: true, gearInTransit: false, trimPercent: 5,
    fuelPercent: 80, brake: false, stallWarning: false, stalled: false, overspeed: false, stallSpeedKnots: 48, rotateSpeedKnots: 54,
    neverExceedKnots: 159, maxMach: 0.25, skinTemperatureC: 12, outsideTemperatureC: 9, engineTemperatureC: 90, mode: 'casual',
    onGround: false,
    autopilot: {
      engaged: false, lateral: null, vertical: null, autoThrottle: false, headingDegrees: 90, altitudeFeet: 3200, verticalSpeedFpm: 0,
      speedKnots: 105, routeDistanceNm: null, ...autopilot,
    },
    ...rest,
  };
}

/** The extreme readouts no painter may throw on. */
export const EXTREME_READOUTS = Object.freeze({
  machThree: () => makeReadout({
    mach: 3.2, airspeedKnots: 420, groundSpeedKnots: 1850, altitudeFeet: 80000, radarAltitudeFeet: 8200, skinTemperatureC: 330,
    maxMach: 3.2, neverExceedKnots: 1900, stallSpeedKnots: 117, throttlePercent: 100, rpmPercent: 100, afterburner: true, gearDown: false,
    engineTemperatureC: 880, overspeed: true, autopilot: { engaged: true, lateral: 'NAV', vertical: 'ALT', autoThrottle: true, altitudeFeet: 80000, speedKnots: 420, routeDistanceNm: 312.4 },
  }),
  inverted: () => makeReadout({ rollDegrees: 180, pitchDegrees: -85, verticalSpeedFpm: -30000, alphaDegrees: 28, loadFactor: -3, stalled: true, stallWarning: true, turnNeedle: -1, slipBall: 1 }),
  parked: () => makeReadout({
    airspeedKnots: 0, groundSpeedKnots: 0, altitudeFeet: 12, radarAltitudeFeet: 0, pitchDegrees: 0, mach: 0, throttlePercent: 0, rpmPercent: 0,
    fuelPercent: 100, onGround: true, brake: true, engineTemperatureC: 20, loadFactor: 1, alphaDegrees: 0,
  }),
  broken: () => makeReadout({ airspeedKnots: NaN, altitudeFeet: NaN, headingDegrees: NaN, pitchDegrees: NaN, rollDegrees: NaN, mach: NaN, verticalSpeedFpm: NaN, turnNeedle: NaN, slipBall: NaN, trimPercent: NaN, loadFactor: NaN }),
});

/**
 * A recording stand-in for CanvasRenderingContext2D: every method is callable, properties can be
 * set, and `calls` lists [name, ...args]; `texts` the strings drawn.
 */
export function createRecordingContext() {
  const calls = [];
  const texts = [];
  const target = { calls, texts, canvas: { width: 1024, height: 512 } };
  return new Proxy(target, {
    get(object, key) {
      if (key in object) return object[key];
      if (typeof key !== 'string') return undefined;
      return (...args) => {
        calls.push([key, ...args]);
        if (key === 'fillText' || key === 'strokeText') texts.push(String(args[0]));
        for (const arg of args) {
          if (typeof arg === 'number' && !Number.isFinite(arg)) throw new Error(`${key} called with a non-finite number`);
        }
        return key === 'measureText' ? { width: 10 } : undefined;
      };
    },
    set(object, key, value) {
      object[key] = value;
      return true;
    },
  });
}
