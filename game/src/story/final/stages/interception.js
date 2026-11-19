// Stage `interception` of POINT OF NO RETURN: the air guard is let loose. The Halcón pair is
// put in the air two kilometres behind the lead (AIR_DEFENCE_SCRAMBLE {reason: 'mission'}), joins
// on his wing and gives its first order; at that moment the overlay scene `flashback` plays once
// (the pair's orders and guns are held for its length), then the player has to lose them: the
// Manta Sombra low over the sea where their own radar loses it, the Garza Negra by outclimbing
// and outrunning them, either one by reaching the border 7000 m out where the pair turns back.
// The outcome is decided by flight/escapeTracker.js.
import { GAME_EVENTS } from '../../../core/events/gameEvents.js';
import { GAME_COMMANDS } from '../../../core/events/gameCommands.js';
import { WORLD_FLAGS } from '../../../core/state/worldFlags.js';
import { SEA_AND_AIRSPACE_CHART } from '../../../catalog/seaAndAirspaceChart.js';
import { ESCAPE_RULES, createInterceptionTracker } from '../flight/escapeTracker.js';
import {
  createFlightSample, createStageClock, createStageEars, distanceText, flagOf, hintFor, playCut, readFlightSample, setFlag, speak,
} from '../flight/stageSupport.js';

const START = Object.freeze({ x: -2600, z: -1200, y: 700, heading: 276 });
const FLASHBACK_HOLD = 40;
const AFTER_FLASHBACK_HOLD = 4;

/**
 * @param {object} rt The mission runtime (CONTRACT-S3, section D).
 */
export function createInterceptionStage(rt) {
  const sample = createFlightSample();
  const clock = createStageClock();
  const ears = createStageEars(rt);
  const chart = SEA_AND_AIRSPACE_CHART;
  const borderRadius = chart.airGuard?.borderRadius ?? ESCAPE_RULES.borderRadius;
  let tracker = null;
  let manta = true;
  let scrambled = false;
  let released = false;
  let flashback = 'waiting';
  let shotDown = false;
  let done = false;
  let hintKey = '';

  const guard = () => rt.context?.systems?.find?.('airDefence') ?? null;
  const command = (payload) => rt.context?.commands?.run?.(GAME_COMMANDS.AIR_DEFENCE_SCRAMBLE, payload);

  function showHint(key, text) {
    if (key === hintKey) return;
    hintKey = key;
    rt.hint?.(text);
  }

  function onRadio(message) {
    if (done || flashback !== 'waiting' || !message || message.lineId !== 'airGuard.order1') return;
    flashback = 'playing';
    command({ holdFire: FLASHBACK_HOLD });
    playCut(rt, 'flashback', { aircraftId: rt.data.aircraftId }).then(() => {
      flashback = 'over';
      if (done) return;
      command({ holdFire: AFTER_FLASHBACK_HOLD });
      rt.objective?.('Lose the interceptors');
    });
  }

  function chooseHint() {
    if (flashback === 'playing') return;
    if (sample.autopilot) {
      showHint('autopilot', 'P: autopilot off. You cannot evade on autopilot.');
      return;
    }
    const toBorder = Math.max(0, borderRadius - tracker.distance);
    const step = Math.ceil(toBorder / 500) * 500;
    if (manta) {
      const blind = flagOf(rt, WORLD_FLAGS.RADAR_TOWER_DESTROYED);
      showHint(`manta:${step}:${blind}`, blind
        ? `Get below ${ESCAPE_RULES.lowHeight} m and turn hard: without the tower they lose you in the sea clutter. Border in ${distanceText(step)}.`
        : `The tower still guides them. Stay low and run west: they turn back at the border, ${distanceText(step)}.`);
    } else {
      showHint(`garza:${step}`, hintFor(rt,
        `Hold Shift: full afterburner. Climb and run west, they cannot keep up. Border in ${distanceText(step)}.`,
        `Full afterburner, shallow climb, let the Mach build: they top out at Mach 1.8. Border in ${distanceText(step)}.`));
    }
  }

  function end(outcome) {
    done = true;
    rt.hint?.(null);
    command({ holdFire: 0 });
    if (outcome === 'shot_down') return rt.fail('shot_down');
    if (outcome === 'crashed') return rt.fail('crashed');
    if (outcome === 'turned_back') return rt.fail('turned_back');
    rt.notify?.(outcome === 'border' ? 'The border. They are turning back.' : 'They have lost you.');
    rt.objective?.('Clear');
    clock.at(2.5, () => rt.next());
    return null;
  }

  return {
    enter() {
      done = false;
      scrambled = false;
      released = false;
      shotDown = false;
      flashback = 'waiting';
      hintKey = '';
      manta = rt.data.aircraftId !== 'garza_negra';
      readFlightSample(rt, sample);
      if (!sample.valid || sample.onGround) rt.seatLeadInAircraft?.({ x: START.x, z: START.z, y: START.y, heading: START.heading, engineOn: true, view: 'cockpit' });
      setFlag(rt, WORLD_FLAGS.SEA_OPEN, true);
      setFlag(rt, WORLD_FLAGS.BASE_ALARM, true);
      tracker = createInterceptionTracker({ centre: chart.centre, borderRadius });
      ears.listen(GAME_EVENTS.RADIO_MESSAGE, onRadio);
      ears.listen(GAME_EVENTS.AIRCRAFT_SHOT_DOWN, (payload) => { if (!payload || payload.isPlayer !== false) shotDown = true; });
      rt.objective?.('Interceptors are coming');
      playCut(rt, 'cut_halcons', { aircraftId: rt.data.aircraftId }).then(() => {
        if (done) return;
        released = true;
        speak(rt, 'al_04');
      });
    },

    update(dt) {
      clock.update(dt);
      if (done) return;
      readFlightSample(rt, sample);
      if (!sample.valid) return;
      if (released && !scrambled) {
        setFlag(rt, WORLD_FLAGS.AIR_DEFENCE_OFF, false);
        if (!manta && rt.data.radarBlind) command({ groundGuidance: false });
        scrambled = command({ reason: 'mission' }) === true;
      }
      const stage = scrambled ? guard()?.stage ?? 'idle' : 'idle';
      const outcome = tracker.update({ stage, x: sample.x, z: sample.z, shotDown, crashed: sample.crashed }, dt);
      if (outcome) { end(outcome); return; }
      chooseHint();
    },

    exit() {
      done = true;
      clock.clear();
      ears.stopAll();
      command({ holdFire: 0 });
      rt.hint?.(null);
    },
  };
}
