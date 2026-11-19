// The landing on the Norvast island's hidden strip as pure logic: where the aircraft is against
// the strip (worked out from its two thresholds), what a touchdown was worth (sink rate, speed
// against the aircraft's approach speed, metres off the centreline), and the tracker that turns a
// stream of samples into the stage's outcome: landed (with its grade), a touchdown harder than
// the gear takes, a touchdown off the strip, or a run off its end. Runs in Node.
import { alongAndOffset } from './takeoffWindow.js';

export const LANDING_RULES = Object.freeze({
  stopSpeed: 3,
  sideMargin: 3,
  gold: Object.freeze({ sink: 1.8, speedOver: 8, offset: 4 }),
  silver: Object.freeze({ sink: 3.2, speedOver: 18, offset: 9 }),
});

/**
 * Where a point is against the strip.
 * @param {{x0: number, z0: number, x1: number, z1: number, width: number}} strip End 0 is the landing threshold.
 * @returns {{along: number, offset: number, onStrip: boolean, offTheEnd: boolean, short: boolean}}
 */
export function stripPosition(strip, x, z, out = { along: 0, offset: 0, length: 0, heading: 0, onStrip: false, offTheEnd: false, short: false }) {
  alongAndOffset(strip, x, z, out);
  const half = (strip.width ?? 40) / 2 + LANDING_RULES.sideMargin;
  out.short = out.along < 0;
  out.offTheEnd = out.along > out.length;
  out.onStrip = !out.short && !out.offTheEnd && Math.abs(out.offset) <= half;
  return out;
}

/**
 * The grade of a touchdown that the aircraft survived on the strip.
 * @param {{sink: number, speed: number, approachSpeed: number, offset: number}} touch sink in m/s
 *   (positive down), speed and approachSpeed in m/s indicated, offset in metres from the centreline.
 * @returns {'gold' | 'silver' | 'bronze'}
 */
export function gradeLanding(touch) {
  const over = Math.abs(touch.speed - touch.approachSpeed);
  const within = (limit) => touch.sink <= limit.sink && over <= limit.speedOver && Math.abs(touch.offset) <= limit.offset;
  return within(LANDING_RULES.gold) ? 'gold' : within(LANDING_RULES.silver) ? 'silver' : 'bronze';
}

/**
 * Follows an approach. update(sample) returns null while it goes on, then once
 * { result: 'landed', grade, touch } | { result: 'bad_landing' } | { result: 'off_strip' }.
 * @param {object} strip The strip ({x0, z0, x1, z1, width}).
 * @param {{approachSpeed: number, touchdownLimit: number}} aircraft m/s indicated; hardest sink the gear takes.
 */
export function createLandingTracker(strip, aircraft) {
  const place = stripPosition(strip, 0, 0);
  const tracker = {
    touch: null,
    touchdowns: 0,
    result: null,
    place,
    update,
  };
  let wasOnGround = null;
  let lastSink = 0;

  function update(sample) {
    if (tracker.result) return null;
    stripPosition(strip, sample.x, sample.z, place);
    const touchedNow = wasOnGround === false && sample.onGround;
    if (sample.crashed || sample.impact > 0) return end({ result: 'bad_landing' });
    if (touchedNow) {
      const sink = Math.max(lastSink, sample.touchdownSink ?? 0);
      if (sink > aircraft.touchdownLimit) return end({ result: 'bad_landing', sink });
      if (!place.onStrip) return end({ result: 'off_strip', along: place.along, offset: place.offset });
      tracker.touchdowns += 1;
      if (!tracker.touch || sink > tracker.touch.sink) {
        tracker.touch = { sink, speed: sample.speed, approachSpeed: aircraft.approachSpeed, offset: tracker.touch ? tracker.touch.offset : place.offset, along: tracker.touch ? tracker.touch.along : place.along };
      }
    }
    if (sample.onGround && tracker.touch) {
      if (!place.onStrip) return end({ result: 'off_strip', along: place.along, offset: place.offset, ranOff: true });
      if (sample.groundSpeed < LANDING_RULES.stopSpeed) return end({ result: 'landed', grade: gradeLanding(tracker.touch), touch: tracker.touch });
    }
    if (!sample.onGround) lastSink = Math.max(0, -sample.verticalSpeed);
    wasOnGround = sample.onGround;
    return null;
  }

  function end(result) {
    tracker.result = result;
    return result;
  }

  return tracker;
}
