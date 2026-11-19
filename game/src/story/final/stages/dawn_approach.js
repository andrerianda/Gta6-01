// Stage `dawn_approach` (checkpoint 5) of POINT OF NO RETURN: 06:30, three hours later. The
// aircraft is six kilometres out on the extended centreline of the Norvast island's hidden strip
// at 700 m, the island a dot in the haze ahead. The hints give the gates of the approach (height
// and speed by distance, gear, flaps), the exterior cut `cut_island` plays at 2.5 km, and the
// landing is followed by flight/landingGrading.js: stopped on the strip is success with a grade;
// harder than the gear takes is 'bad_landing'; off the strip or off its end is 'off_strip'.
import { WORLD_FLAGS } from '../../../core/state/worldFlags.js';
import { NORVAST_ISLAND_SHAPE } from '../../../world/island/norvastIslandShape.js';
import { createLandingTracker } from '../flight/landingGrading.js';
import { createFlightSample, createStageClock, hintFor, playCut, readFlightSample, setFlag, speak } from '../flight/stageSupport.js';

const KNOTS = 1.943844;
const CLOCK_HOURS = 6.5;
const START_DISTANCE = 6000;
const START_HEIGHT = 700;
const START_SPEED_FACTOR = 1.55;
const GREETING_DISTANCE = 3000;
const CUT_DISTANCE = 2500;
const AWAY_DISTANCE = 9000;
const AWAY_SECONDS = 20;
/** The approach gates: metres to the threshold and metres above the sea to be at there. */
const GATES = Object.freeze([
  Object.freeze({ distance: 3000, height: 300 }),
  Object.freeze({ distance: 1500, height: 140 }),
  Object.freeze({ distance: 500, height: 55 }),
]);

/**
 * @param {object} rt The mission runtime (CONTRACT-S3, section D).
 */
export function createDawnApproachStage(rt) {
  const sample = createFlightSample();
  const clock = createStageClock();
  const strip = NORVAST_ISLAND_SHAPE.strip;
  const centre = { x: (strip.x0 + strip.x1) / 2, z: (strip.z0 + strip.z1) / 2 };
  let tracker = null;
  let approachKnots = 0;
  let flaps = false;
  let greeted = false;
  let cut = false;
  let away = 0;
  let done = false;
  let hintKey = '';

  function showHint(key, text) {
    if (key === hintKey) return;
    hintKey = key;
    rt.hint?.(text);
  }

  function chooseHint(distance) {
    if (away >= AWAY_SECONDS) {
      showHint('away', 'The island is behind you. Turn back to heading 285 and find the strip.');
      return;
    }
    if (sample.onGround) {
      showHint('ground', 'B: brakes. Ctrl: throttle to idle. Q / E: stay on the centreline.');
      return;
    }
    const flapWord = flaps ? '   X: flaps' : '';
    if (distance > GATES[0].distance) {
      showHint('far', hintFor(rt,
        `Heading 285 to the island. Ctrl: ease the throttle. Be at ${GATES[0].height} m and ${approachKnots + 30} knots three kilometres out.`,
        `Heading 285. Throttle back, trim for ${approachKnots + 30} knots; ${GATES[0].height} m at three kilometres. No auto-throttle to save you.`));
    } else if (distance > GATES[1].distance) {
      showHint('gear', `G: gear down${flapWord}   Slow to ${approachKnots} knots. ${GATES[1].height} m at 1.5 km.`);
    } else if (distance > GATES[2].distance) {
      showHint('final', `Hold ${approachKnots} knots on the centreline between the cliffs. ${GATES[2].height} m at 500 m. Gear down (G).`);
    } else {
      showHint('flare', hintFor(rt,
        'Over the threshold: throttle to idle (Ctrl), ease the stick back (S) and let her settle.',
        'Over the threshold: idle, flare gently, hold her off. Do not drop her on the gear.'));
    }
  }

  function finish(result) {
    done = true;
    rt.hint?.(null);
    if (result.result === 'landed') {
      rt.data.landingGrade = result.grade;
      rt.notify?.(`Landing: ${result.grade}`);
      rt.objective?.('Down');
      clock.at(2, () => rt.next());
    } else rt.fail(result.result);
  }

  return {
    enter() {
      done = false;
      greeted = false;
      cut = false;
      away = 0;
      hintKey = '';
      rt.setClock?.(CLOCK_HOURS);
      setFlag(rt, WORLD_FLAGS.SEA_OPEN, true);
      setFlag(rt, WORLD_FLAGS.AIR_DEFENCE_OFF, true);
      setFlag(rt, WORLD_FLAGS.NAVY_PICKET_ACTIVE, false);
      const ux = (strip.x1 - strip.x0) / strip.length;
      const uz = (strip.z1 - strip.z0) / strip.length;
      const approach = rt.data.aircraftId === 'garza_negra' ? 82 : 62;
      rt.seatLeadInAircraft?.({
        x: strip.x0 - ux * START_DISTANCE, z: strip.z0 - uz * START_DISTANCE, y: START_HEIGHT, heading: strip.heading,
        speed: approach * START_SPEED_FACTOR, engineOn: true, view: 'cockpit',
      });
      readFlightSample(rt, sample);
      const tuning = sample.car?.tuning ?? null;
      const approachSpeed = tuning?.approachSpeed ?? approach;
      approachKnots = Math.round((approachSpeed * KNOTS) / 5) * 5;
      flaps = (tuning?.flapNotches?.length ?? 1) > 1;
      tracker = createLandingTracker(strip, { approachSpeed, touchdownLimit: tuning?.touchdownLimit ?? 5 });
      rt.objective?.('Land on the hidden strip of the Norvast island', { x: strip.x0, z: strip.z0 });
      clock.at(4, () => { if (!done) speak(rt, 'da_01'); });
    },

    update(dt) {
      clock.update(dt);
      if (done) return;
      readFlightSample(rt, sample);
      if (!sample.valid) return;
      const distance = Math.hypot(sample.x - strip.x0, sample.z - strip.z0);
      if (!greeted && distance < GREETING_DISTANCE) {
        greeted = true;
        speak(rt, 'da_02');
      }
      if (!cut && distance < CUT_DISTANCE && !sample.onGround) {
        cut = true;
        playCut(rt, 'cut_island', { aircraftId: rt.data.aircraftId });
      }
      const result = tracker.update(sample);
      if (result) { finish(result); return; }
      away = Math.hypot(sample.x - centre.x, sample.z - centre.z) > AWAY_DISTANCE ? away + dt : 0;
      chooseHint(tracker.place.along < 0 ? distance : 0);
    },

    exit() {
      done = true;
      clock.clear();
      rt.hint?.(null);
    },
  };
}
