// Stage `blind_radar` (checkpoint 3) of POINT OF NO RETURN: airborne west of the base with the
// alarm ringing, El Comprador asks for the coastal radar to go blind before the interceptors come.
// Manta Sombra: one guided bomb on the unmanned tower of Cabo Lejano (R targeting screen, U
// release; a miss reloads once after a wide circle, a second miss goes on with the radar alive).
// Garza Negra carries no bomb: it climbs above the radar's coverage (flight/escapeTracker.js, the
// climb gate), after which the air guard gets no ground guidance although the tower stands.
import { GAME_EVENTS } from '../../../core/events/gameEvents.js';
import { GAME_COMMANDS } from '../../../core/events/gameCommands.js';
import { WORLD_FLAGS } from '../../../core/state/worldFlags.js';
import { SEA_AND_AIRSPACE_CHART } from '../../../catalog/seaAndAirspaceChart.js';
import { createClimbGate } from '../flight/escapeTracker.js';
import {
  createFlightSample, createStageClock, createStageEars, distanceText, hintFor, playCut, readFlightSample, setFlag, speak,
} from '../flight/stageSupport.js';

const START = Object.freeze({ x: -2300, z: -1630, y: 600, heading: 276 });
const RELOAD_SECONDS = 18;
const RELOAD_DISTANCE = 3200;
const BOMB_HEIGHT = 1000;

/**
 * @param {object} rt The mission runtime (CONTRACT-S3, section D).
 */
export function createBlindRadarStage(rt) {
  const sample = createFlightSample();
  const clock = createStageClock();
  const ears = createStageEars(rt);
  const tower = SEA_AND_AIRSPACE_CHART.radarTower;
  let manta = true;
  let gate = null;
  let misses = 0;
  let accepted = false;
  let waitingReload = -1;
  let done = false;
  let hintKey = '';
  let shownStep = -1;

  const radar = () => rt.context?.systems?.find?.('radarNetwork') ?? null;

  function showHint(key, text) {
    if (key === hintKey) return;
    hintKey = key;
    rt.hint?.(text);
  }

  function finish(delay) {
    if (done) return;
    done = true;
    rt.hint?.(null);
    clock.at(delay, () => rt.next());
  }

  function onImpact(payload) {
    if (done) return;
    const hit = Boolean(payload && payload.hit);
    playCut(rt, 'cut_bomb', { hit, target: { x: tower.x, z: tower.z } });
    if (hit) return;
    misses += 1;
    if (misses >= 2) {
      rt.notify?.('Missed. The radar still sees you.');
      rt.data.radarBlind = false;
      finish(3);
      return;
    }
    rt.notify?.('Missed. Come round wide: one bomb left.');
    accepted = false;
    waitingReload = 0;
  }

  function onDestroyed(payload) {
    if (done || (payload && payload.kind && payload.kind !== 'tower')) return;
    rt.data.radarBlind = true;
    const seconds = speak(rt, 'br_04');
    rt.objective?.('The radar is blind');
    finish(seconds + 0.5);
  }

  function updateManta(dt) {
    const display = radar()?.display?.targeting ?? null;
    const range = Math.hypot(sample.x - tower.x, sample.z - tower.z);
    if (waitingReload >= 0) {
      waitingReload += dt;
      showHint('circle', 'Come round in a wide circle and line up on the tower again.');
      if (waitingReload >= RELOAD_SECONDS && range > RELOAD_DISTANCE) {
        waitingReload = -1;
        setFlag(rt, WORLD_FLAGS.GUIDED_BOMB_LOADED, true);
        rt.notify?.('Second bomb armed.');
      }
      return;
    }
    if (display && display.bombAway) {
      showHint('fall', 'Weapon away. Hold steady: the bomb steers itself.');
      return;
    }
    if (display && display.active && display.valid && !accepted) {
      accepted = true;
      speak(rt, 'br_02');
    }
    if (!display || !display.active) {
      showHint('target', hintFor(rt,
        `R: targeting screen. Fly at the tower above ${BOMB_HEIGHT} m, wings level.`,
        `R: targeting screen. Run in above ${BOMB_HEIGHT} m, wings level, steady height: the bomb has little authority.`));
    } else if (display.solution && display.solution.inEnvelope) {
      showHint('release', 'U: RELEASE NOW');
    } else {
      const reason = display.solution ? display.solution.reason : '';
      showHint(`wait:${reason}`, `Hold the run. U releases when the screen says RELEASE${reason && reason !== 'RELEASE' ? ` (now: ${reason})` : ''}.`);
    }
  }

  function updateGarza() {
    if (gate.update(sample.altitude)) {
      rt.data.radarBlind = true;
      rt.context?.commands?.run?.(GAME_COMMANDS.AIR_DEFENCE_SCRAMBLE, { groundGuidance: false });
      const seconds = speak(rt, 'br_g4');
      rt.objective?.('Above the radar');
      finish(seconds + 0.5);
      return;
    }
    const step = Math.ceil(gate.remaining / 250);
    if (step !== shownStep) {
      shownStep = step;
      hintKey = '';
      showHint(`climb:${step}`, hintFor(rt,
        `Hold Shift for full power and pull up steeply (S). ${distanceText(step * 250)} to climb. Circle: stay near the coast.`,
        `Afterburner, 40 degrees nose up, keep her above 250 knots. ${distanceText(step * 250)} to climb. Stay near the coast.`));
    }
  }

  return {
    enter() {
      done = false;
      misses = 0;
      accepted = false;
      waitingReload = -1;
      hintKey = '';
      shownStep = -1;
      manta = rt.data.aircraftId !== 'garza_negra';
      readFlightSample(rt, sample);
      if (!sample.valid || sample.onGround) {
        rt.seatLeadInAircraft?.({ x: START.x, z: START.z, y: START.y, heading: START.heading, engineOn: true, view: 'cockpit' });
        readFlightSample(rt, sample);
      }
      setFlag(rt, WORLD_FLAGS.BASE_ALARM, true);
      setFlag(rt, WORLD_FLAGS.BASE_OFFICER_ACCESS, false);
      setFlag(rt, WORLD_FLAGS.AIR_DEFENCE_OFF, true);
      setFlag(rt, WORLD_FLAGS.SEA_OPEN, true);
      rt.data.radarBlind = false;
      rt.context?.commands?.run?.(GAME_COMMANDS.AIR_DEFENCE_SCRAMBLE, { groundGuidance: true });
      let first;
      if (manta) {
        setFlag(rt, WORLD_FLAGS.GUIDED_BOMB_LOADED, true);
        first = speak(rt, 'br_01');
        rt.objective?.('Take the Cabo Lejano radar off the air', { x: tower.x, z: tower.z });
        ears.listen(GAME_EVENTS.GUIDED_BOMB_RELEASED, () => { if (!done) speak(rt, 'br_03'); });
        ears.listen(GAME_EVENTS.GUIDED_BOMB_IMPACT, onImpact);
        ears.listen(GAME_EVENTS.RADAR_EMITTER_DESTROYED, onDestroyed);
      } else {
        gate = createClimbGate({ startHeight: Math.min(sample.valid ? sample.altitude : START.y, START.y) });
        first = speak(rt, 'br_g1');
        rt.objective?.(`Climb above the radar's coverage: ${gate.gateHeight} m`);
      }
      clock.at(first + 6, () => { if (!done) speak(rt, 'al_03'); });
    },

    update(dt) {
      clock.update(dt);
      readFlightSample(rt, sample);
      if (!sample.valid) return;
      if (sample.crashed) {
        if (!done) { done = true; clock.clear(); rt.fail('crashed'); }
        return;
      }
      if (done) return;
      if (manta) updateManta(dt); else updateGarza();
    },

    exit() {
      done = true;
      clock.clear();
      ears.stopAll();
      rt.hint?.(null);
    },
  };
}
