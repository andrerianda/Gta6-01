// Stage `takeoff_window` (checkpoint 2) of POINT OF NO RETURN: the lead sits in the stolen
// aircraft on its stand with the engines running and three minutes on the clock. The tower runs
// its radio (tw_01..tw_09), the objective walks a line of taxi points from the stand along the
// parallel taxiway to the east threshold of runway 27, the hints teach the controls, and the
// window (flight/takeoffWindow.js) decides: airborne above 30 m in time (the takeoff is graded,
// the alarm goes off behind him, the exterior cut `cut_takeoff` plays, the tower and Coronel
// Vargas call) or the clock running out on the ground (trucks on the runway, mission failed).
import { WORLD_FLAGS } from '../../../core/state/worldFlags.js';
import { FINAL_MISSION } from '../../../catalog/finalArcScript.js';
import { PUNTA_GARZA_AIR_BASE, puntaGarzaToWorld } from '../../../catalog/puntaGarzaAirBase.js';
import { alongAndOffset, createTakeoffWindow } from '../flight/takeoffWindow.js';
import { createFlightSample, createStageClock, hintFor, playCut, readFlightSample, setFlag, speak } from '../flight/stageSupport.js';

const KNOTS = 1.943844;
const STANDS = Object.freeze({
  manta_sombra: Object.freeze({ x: -1469, z: -1376, heading: 6 }),
  garza_negra: Object.freeze({ x: -1406, z: -1359, heading: 6 }),
});
const TAXI_REACH = 28;

/** Runway 27 as its two ends in world metres (end 0 = the east threshold). */
function runway27() {
  const plan = PUNTA_GARZA_AIR_BASE.runway;
  const from = puntaGarzaToWorld(plan.from[0], plan.from[1]);
  const to = puntaGarzaToWorld(plan.to[0], plan.to[1]);
  return { x0: from.x, z0: from.z, x1: to.x, z1: to.z, width: plan.width };
}

/** The taxi line: stand, onto the parallel taxiway, east along it, the east link, the line-up point. */
function taxiLine(stand, runway) {
  const ways = PUNTA_GARZA_AIR_BASE.taxiways;
  const parallel = ways.find((way) => way.id === 'taxi_parallel').line;
  const link = ways.find((way) => way.id === 'taxi_link_east').line;
  const a = puntaGarzaToWorld(parallel[0][0], parallel[0][1]);
  const b = puntaGarzaToWorld(parallel[1][0], parallel[1][1]);
  const place = alongAndOffset({ x0: a.x, z0: a.z, x1: b.x, z1: b.z }, stand.x, stand.z);
  const ux = (b.x - a.x) / place.length;
  const uz = (b.z - a.z) / place.length;
  const join = { x: a.x + ux * place.along, z: a.z + uz * place.along };
  const corner = puntaGarzaToWorld(link[0][0], link[0][1]);
  const length = Math.hypot(runway.x1 - runway.x0, runway.z1 - runway.z0);
  const lineUp = { x: runway.x0 + ((runway.x1 - runway.x0) / length) * 45, z: runway.z0 + ((runway.z1 - runway.z0) / length) * 45 };
  return [join, corner, lineUp];
}

/**
 * @param {object} rt The mission runtime (CONTRACT-S3, section D).
 */
export function createTakeoffWindowStage(rt) {
  const sample = createFlightSample();
  const clock = createStageClock();
  const runway = runway27();
  let window = null;
  let route = [];
  let routeIndex = 0;
  let shownSeconds = -1;
  let hintKey = '';
  let rotateKnots = 0;
  let ended = false;
  let flaps = false;
  let gone = false;

  function showHint(key, text) {
    if (key === hintKey) return;
    hintKey = key;
    rt.hint?.(text);
  }

  function chooseHint() {
    const sim = 'SIMULATION';
    if (!window.linedUp && !window.rolling) {
      if (window.elapsed < 14) {
        showHint('throttle', hintFor(rt,
          'ASSISTED  Shift: throttle up   Ctrl: throttle down   B: wheel brakes',
          `${sim}  Shift / Ctrl: throttle lever   B: wheel brakes   nothing trims or steadies her for you`));
      } else {
        showHint('taxi', hintFor(rt,
          'Taxi slowly along the line.   Q / E: steer on the ground   B: brakes',
          'Taxi below 30 knots.   Q / E: nosewheel and rudder   B: brakes'));
      }
      return;
    }
    if (sample.onGround) {
      const flapWord = flaps ? '   X: flaps for takeoff' : '';
      showHint('roll', hintFor(rt,
        `Hold Shift for full power. At ${rotateKnots} knots ease the stick back (S).   Q / E: keep the centreline${flapWord}`,
        `Full power. Rotate at ${rotateKnots} knots: S, gently, about ten degrees.   Q / E: rudder   T + W / S: trim${flapWord}`));
      return;
    }
    showHint('climb', hintFor(rt,
      'G: gear up   W / S: nose down / up   A / D: roll',
      'G: gear up   Hold ten degrees nose up; trim with T + W / S'));
  }

  function advanceRoute() {
    if (routeIndex >= route.length) return;
    const point = route[routeIndex];
    if (Math.hypot(sample.x - point.x, sample.z - point.z) < TAXI_REACH || window.linedUp) {
      routeIndex = window.linedUp ? route.length : routeIndex + 1;
      const next = route[routeIndex] ?? null;
      if (next) rt.objective?.(routeIndex === route.length - 1 ? 'Line up on runway 27' : 'Taxi to runway 27', next);
      else rt.objective?.('Take off from runway 27 before the window closes', { x: runway.x1, z: runway.z1 });
    }
  }

  function succeed() {
    ended = true;
    rt.data.takeoffGrade = window.grade;
    rt.timer?.(null);
    rt.hint?.(null);
    setFlag(rt, WORLD_FLAGS.BASE_ALARM, true);
    setFlag(rt, WORLD_FLAGS.AIR_DEFENCE_OFF, true);
    setFlag(rt, WORLD_FLAGS.BASE_OFFICER_ACCESS, false);
    rt.setStoryState?.({ alarm: true });
    rt.notify?.(`Takeoff: ${window.grade}`);
    playCut(rt, 'cut_takeoff', { aircraftId: rt.data.aircraftId }).then(() => {
      if (gone) return;
      const first = speak(rt, 'al_01');
      clock.at(first + 0.6, () => {
        const second = speak(rt, 'al_02');
        clock.at(second + 0.4, () => rt.next());
      });
    });
  }

  function closeWindow() {
    ended = true;
    rt.timer?.(0);
    rt.hint?.(null);
    speak(rt, 'tw_fail');
    setFlag(rt, WORLD_FLAGS.BASE_ALARM, true);
    rt.setStoryState?.({ alarm: true });
    rt.objective?.('The window has closed');
    clock.at(4, () => rt.fail('window_closed'));
  }

  return {
    enter() {
      ended = false;
      gone = false;
      const stand = STANDS[rt.data.aircraftId] ?? STANDS.manta_sombra;
      if (!rt.aircraft?.()) rt.seatLeadInAircraft?.({ x: stand.x, z: stand.z, heading: stand.heading, engineOn: true, view: 'cockpit' });
      setFlag(rt, WORLD_FLAGS.BASE_OFFICER_ACCESS, true);
      readFlightSample(rt, sample);
      const tuning = sample.car?.tuning ?? null;
      const rotateSpeed = tuning?.rotateSpeed ?? 60;
      rotateKnots = Math.round((rotateSpeed * KNOTS) / 5) * 5;
      flaps = (tuning?.flapNotches?.length ?? 1) > 1;
      window = createTakeoffWindow({ seconds: FINAL_MISSION.takeoffWindowSeconds, runway, rotateSpeed });
      route = taxiLine(sample.valid ? sample : stand, runway);
      routeIndex = 0;
      shownSeconds = -1;
      hintKey = '';
      rt.objective?.('Taxi to runway 27', route[0]);
      rt.timer?.(window.left);
    },

    update(dt) {
      clock.update(dt);
      if (ended || !window) return;
      readFlightSample(rt, sample);
      if (!sample.valid) return;
      const events = window.update(sample, dt);
      for (let i = 0; i < events.length; i += 1) {
        const event = events[i];
        if (event.startsWith('tw_')) speak(rt, event);
        else if (event === 'success') return succeed();
        else if (event === 'timeout') return closeWindow();
        else if (event === 'crashed') { ended = true; rt.timer?.(null); return rt.fail('crashed'); }
      }
      const seconds = Math.ceil(window.left);
      if (seconds !== shownSeconds) {
        shownSeconds = seconds;
        rt.timer?.(seconds);
      }
      advanceRoute();
      chooseHint();
    },

    exit() {
      ended = true;
      gone = true;
      clock.clear();
      rt.timer?.(null);
      rt.hint?.(null);
    },
  };
}
