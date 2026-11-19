// Stage `stealth_test` (checkpoint 4) of POINT OF NO RETURN: El Comprador's last door. Three navy
// picket ships lie across the way to the island. Manta Sombra: slip low between their sweeps with
// the signature meter (painted is fine; tracked for more than 6 s draws the hail st_03, a lock
// st_04 and five seconds later a missile). Garza Negra: it cannot hide, so it must cross the line
// above the gate Mach before the lock completes. 900 m beyond the line unlocked: st_05, a heading,
// and on to the time skip. The rules are flight/picketTest.js.
import { WORLD_FLAGS } from '../../../core/state/worldFlags.js';
import { SEA_AND_AIRSPACE_CHART } from '../../../catalog/seaAndAirspaceChart.js';
import { PICKET_RULES, beyondPicketLine, createPicketTest } from '../flight/picketTest.js';
import { createFlightSample, createStageClock, hintFor, readFlightSample, setFlag, speak } from '../flight/stageSupport.js';

const START = Object.freeze({ x: -4300, z: -1900, heading: 270 });
const START_HEIGHT = Object.freeze({ manta_sombra: 250, garza_negra: 900 });
const START_SPEED = Object.freeze({ manta_sombra: 170, garza_negra: 300 });
const NEED_ROOM = 1100;
const LOW_HEIGHT = 60;
const ONWARD_HEADING = 285;

/**
 * @param {object} rt The mission runtime (CONTRACT-S3, section D).
 */
export function createStealthTestStage(rt) {
  const sample = createFlightSample();
  const clock = createStageClock();
  const chart = SEA_AND_AIRSPACE_CHART;
  const ships = chart.navyPicket;
  const probe = { tracked: false, lockSeconds: 0, x: 0, z: 0, mach: 0 };
  let test = null;
  let manta = true;
  let done = false;
  let briefed = false;
  let hintKey = '';

  const radar = () => rt.context?.systems?.find?.('radarNetwork') ?? null;

  function showHint(key, text) {
    if (key === hintKey) return;
    hintKey = key;
    rt.hint?.(text);
  }

  function gapBeyond() {
    // The middle of the widest water, pushed beyond the line: between the first two ships.
    const mx = (ships[0].x + ships[1].x) / 2;
    const mz = (ships[0].z + ships[1].z) / 2;
    const out = Math.hypot(mx - chart.centre.x, mz - chart.centre.z) || 1;
    const reach = PICKET_RULES.passBeyond + 300;
    return { x: mx + ((mx - chart.centre.x) / out) * reach, z: mz + ((mz - chart.centre.z) / out) * reach };
  }

  function chooseHint(track) {
    if (!briefed) return;
    if (manta) {
      if (test.locked) showHint('locked', 'MISSILE LOCK: break the track. Down to the wave tops, turn away.');
      else if (track.tracked) showHint('tracked', 'TRACKED: lower, wings level, gear up. Break their track.');
      else showHint('low', hintFor(rt,
        `Stay below ${LOW_HEIGHT} m, wings level, between the ships. Watch the signature meter on the right display.`,
        `Below ${LOW_HEIGHT} m, wings level, bays shut, between the ships. A bank shows them your whole planform.`));
    } else {
      const mach = Math.floor(sample.mach * 10) / 10;
      const gate = PICKET_RULES.speed.gateMach;
      if (test.locked) showHint(`glock:${mach}`, `MISSILE LOCK building. Faster: Mach ${mach.toFixed(1)} of ${gate}.`);
      else showHint(`mach:${mach}`, `Hold Shift: cross the picket line above Mach ${gate}. Now Mach ${mach.toFixed(1)}. Descend a little to gain speed.`);
    }
  }

  function pass() {
    done = true;
    rt.hint?.(null);
    const seconds = speak(rt, 'st_05');
    const heading = (ONWARD_HEADING * Math.PI) / 180;
    rt.objective?.(`Fly heading ${ONWARD_HEADING}`, { x: sample.x + Math.sin(heading) * 4000, z: sample.z - Math.cos(heading) * 4000 });
    clock.at(seconds + 1.5, () => rt.next());
  }

  return {
    enter() {
      done = false;
      briefed = false;
      hintKey = '';
      manta = rt.data.aircraftId !== 'garza_negra';
      const id = manta ? 'manta_sombra' : 'garza_negra';
      readFlightSample(rt, sample);
      const room = sample.valid ? -beyondPicketLine(ships, chart.centre, sample.x, sample.z) : -1;
      if (!sample.valid || sample.onGround || room < NEED_ROOM) {
        rt.seatLeadInAircraft?.({ x: START.x, z: START.z, y: START_HEIGHT[id], heading: START.heading, speed: START_SPEED[id], engineOn: true, view: 'cockpit' });
      }
      setFlag(rt, WORLD_FLAGS.SEA_OPEN, true);
      setFlag(rt, WORLD_FLAGS.AIR_DEFENCE_OFF, true);
      setFlag(rt, WORLD_FLAGS.NAVY_PICKET_ACTIVE, true);
      test = createPicketTest({ mode: manta ? 'stealth' : 'speed', ships, centre: chart.centre });
      rt.objective?.(manta ? 'Slip past the navy picket unseen' : 'Outrun the navy picket\'s missile lock', gapBeyond());
      const first = speak(rt, 'st_01');
      clock.at(first + 0.5, () => {
        if (done) return;
        speak(rt, manta ? 'st_02' : 'st_g2');
        briefed = true;
      });
    },

    update(dt) {
      clock.update(dt);
      if (done) return;
      readFlightSample(rt, sample);
      if (!sample.valid) return;
      if (sample.crashed) { done = true; clock.clear(); rt.fail('crashed'); return; }
      const track = radar()?.playerTrack ?? probe;
      probe.tracked = Boolean(track.tracked);
      probe.lockSeconds = track.lockSeconds || 0;
      probe.x = sample.x;
      probe.z = sample.z;
      probe.mach = sample.mach;
      const events = test.update(probe, dt);
      for (let i = 0; i < events.length; i += 1) {
        const event = events[i];
        if (event === 'hail') speak(rt, 'st_03');
        else if (event === 'lock') speak(rt, 'st_04');
        else if (event === 'lock_broken') rt.notify?.('Lock broken.');
        else if (event === 'missile') {
          done = true;
          rt.hint?.(null);
          rt.notify?.('Missile launch!');
          clock.at(1.5, () => rt.fail('missile'));
          return;
        } else if (event === 'passed') { pass(); return; }
      }
      chooseHint(probe);
    },

    exit() {
      done = true;
      clock.clear();
      rt.hint?.(null);
    },
  };
}
