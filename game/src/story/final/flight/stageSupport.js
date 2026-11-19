// What the five flying stages of POINT OF NO RETURN share: one reading of the mission aircraft
// per frame (place, speeds, attitude, in the units the pure modules under this folder take), the
// wording of the control hints by flight mode, calls on the mission runtime that must never throw
// (a line, a scene or a cut that does not exist yet simply resolves), and listening to game
// events for as long as a stage runs.

const DEGREES = 180 / Math.PI;

/** A fresh sample record. */
export function createFlightSample() {
  return {
    valid: false, x: 0, y: 0, z: 0, heading: 0, speed: 0, groundSpeed: 0, mach: 0, height: 0, altitude: 0,
    verticalSpeed: 0, pitch: 0, roll: 0, onGround: true, crashed: false, impact: 0, autopilot: false, car: null,
  };
}

/**
 * Reads the mission aircraft into `out`. valid is false while there is none.
 * @param {object} rt The mission runtime.
 */
export function readFlightSample(rt, out) {
  const craft = typeof rt.aircraft === 'function' ? rt.aircraft() : null;
  const car = craft ? craft.car : null;
  const state = car ? car.state : null;
  out.valid = Boolean(state);
  out.car = car;
  if (!state) return out;
  const place = craft.root?.position ?? car.body?.position ?? craft.entity?.position;
  out.x = place.x;
  out.y = place.y;
  out.z = place.z;
  out.heading = state.heading;
  out.speed = state.indicatedAirspeed;
  out.groundSpeed = state.groundSpeed;
  out.mach = state.mach;
  out.height = state.radarAltitude;
  out.altitude = state.altitude;
  out.verticalSpeed = state.verticalSpeed;
  out.pitch = state.pitch;
  out.roll = state.roll;
  out.onGround = state.onGround;
  out.crashed = state.crashed === true || (craft.entity?.data?.health ?? 1) <= 0;
  out.impact = state.impact || 0;
  out.autopilot = Boolean(car.autopilot && car.autopilot.engaged);
  return out;
}

/** True in SIMULATION ('realistic'), false in ASSISTED ('casual'). */
export function isSimulation(rt) {
  return rt.data?.flightMode === 'realistic';
}

/** The hint for the mode the player chose. */
export function hintFor(rt, assisted, simulation) {
  return isSimulation(rt) ? simulation : assisted;
}

/** Speaks a line; 0 seconds when the voice system is not there. */
export function speak(rt, lineId, options) {
  try {
    const seconds = rt.speak?.(lineId, options);
    return typeof seconds === 'number' && seconds > 0 ? seconds : 3;
  } catch {
    return 0;
  }
}

/** Plays a scene or an exterior cut; resolves at once when it does not exist. */
export function playCut(rt, sceneId, params) {
  try {
    const playing = rt.playScene?.(sceneId, params);
    return playing && typeof playing.then === 'function' ? playing.then((r) => r ?? { skipped: true }, () => ({ skipped: true })) : Promise.resolve({ skipped: true });
  } catch {
    return Promise.resolve({ skipped: true });
  }
}

/** Sets a world flag when the flags exist. */
export function setFlag(rt, name, value) {
  const flags = rt.flags ?? rt.context?.flags;
  if (flags && typeof flags.set === 'function' && flags.get(name) !== value) flags.set(name, value);
}

/** Reads a world flag. */
export function flagOf(rt, name) {
  const flags = rt.flags ?? rt.context?.flags;
  return Boolean(flags && flags.get?.(name) === true);
}

/**
 * Subscriptions that end with the stage: listen(topic, handler), stopAll().
 * @param {object} rt
 */
export function createStageEars(rt) {
  const stops = [];
  return {
    listen(topic, handler) {
      const events = rt.context?.events;
      if (!topic || !events || typeof events.on !== 'function') return;
      const stop = events.on(topic, handler);
      if (typeof stop === 'function') stops.push(stop);
    },
    stopAll() {
      for (const stop of stops.splice(0)) stop();
    },
  };
}

/** A small set of one-shot timers in game time, driven by the stage's update. */
export function createStageClock() {
  const due = [];
  const clock = {
    time: 0,
    at(seconds, fn) { due.push({ at: clock.time + seconds, fn }); },
    update(dt) {
      clock.time += dt;
      for (let i = due.length - 1; i >= 0; i -= 1) {
        if (due[i].at <= clock.time) {
          const { fn } = due[i];
          due.splice(i, 1);
          fn();
        }
      }
    },
    clear() { due.length = 0; },
  };
  return clock;
}

/** Degrees, rounded, 1..360, for a compass heading in radians. */
export function compassDegrees(radians) {
  const d = Math.round(((radians * DEGREES) % 360 + 360) % 360);
  return d === 0 ? 360 : d;
}

/** "3.4 KM" or "850 M". */
export function distanceText(metres) {
  return metres >= 1000 ? `${(metres / 1000).toFixed(1)} KM` : `${Math.round(metres / 10) * 10} M`;
}
