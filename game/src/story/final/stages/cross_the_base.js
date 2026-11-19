// The walk across Base Aérea Punta Garza to hangar two, as "Lt. Osorio": a marked way of a few
// points from the gate to the Manta Sombra's hangar, the COVER bar (suspicionMeter.js) live in
// the HUD, the crew's salutes to return (G), and half way the old sergeant who squints at him:
// "Lieutenant Osorio... I thought you were taller", with three answers on keys 1 / 2 / 3 and 8 s
// to give one. Running draws one warning; a blown cover or a drawn weapon fails the mission.
import { GAME_EVENTS } from '../../../core/events/gameEvents.js';
import { WORLD_FLAGS } from '../../../core/state/worldFlags.js';
import { SERGEANT_CHOICES } from '../../../catalog/finalArcScript.js';
import { createSuspicionMeter } from '../suspicionMeter.js';
import { FINAL_PLACES } from '../finalCheckpoints.js';
import { ON_FOOT_RULES, readLead, keepOfficerPace } from './gate.js';

/** The marked way: the gate, the service road, the apron's edge, the hangar door. */
export const WAY_TO_HANGAR_TWO = Object.freeze([
  { x: -1408.5, z: -948 }, { x: -1404.5, z: -1000 }, { x: -1408, z: -1110 }, { x: -1424, z: -1245 }, { x: -1452, z: -1330 }, { x: -1469, z: -1362 },
]);
/** The sergeant steps in once the lead is this far north (half way). */
const SERGEANT_Z = -1185;
const ANSWER_SECONDS = 8;
const ARRIVE_RANGE = 12;
const SALUTE_REPEAT_SECONDS = 25;

/** Metres from a point to the marked way. */
export function distanceToWay(x, z, way = WAY_TO_HANGAR_TWO) {
  let best = Infinity;
  for (let i = 0; i < way.length - 1; i += 1) {
    const a = way[i], b = way[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)));
  }
  return best;
}

/**
 * @param {object} rt The mission runtime's `rt`.
 */
export function createCrossTheBaseStage(rt) {
  const { context } = rt;
  const door = WAY_TO_HANGAR_TWO[WAY_TO_HANGAR_TWO.length - 1];
  let meter = createSuspicionMeter();
  let phase = 'walk';
  let sergeantDone = false;
  let warnedRunning = false;
  let shown = { value: -1, level: '' };
  let now = 0;
  let bumpAt = -10;
  let saluteKey = false;
  let talk = null;
  let answerLeft = 0;
  const saluted = new Map();

  const onKey = (event) => { if (event.code === 'KeyG' && !event.repeat) saluteKey = true; };

  function publish(force = false) {
    const value = Math.round(meter.value);
    if (!force && value === shown.value && meter.level === shown.level) return;
    shown = { value, level: meter.level };
    rt.data.suspicion = value;
    rt.ui.setCover(value, meter.level);
    context.events.emit(GAME_EVENTS.FINAL_MISSION_SUSPICION_CHANGED, { suspicion: value, level: meter.level, cause: meter.cause });
  }

  let holding = false;
  function holdStill(on) {
    if (on === holding) return;
    holding = on;
    if (typeof context.input.setContext === 'function') context.input.setContext(on ? 'cutscene' : 'onFoot');
  }

  function sergeant() {
    phase = 'sergeant';
    sergeantDone = true;
    holdStill(true);
    rt.after(rt.speak('sg_01') + 0.2, () => {
      phase = 'answer';
      answerLeft = ANSWER_SECONDS;
      talk = rt.ui.openTalk(answer);
    });
  }

  function answer(choiceId) {
    if (phase !== 'answer') return;
    phase = 'reply';
    rt.ui.closeTalk();
    talk = null;
    const choice = SERGEANT_CHOICES.find((each) => each.id === choiceId) ?? null;
    rt.data.sergeantAnswer = choice ? choice.id : 'none';
    const reply = () => {
      meter.sergeant(choice ? choice.id : null);
      publish(true);
      rt.after(rt.speak(choice ? choice.reply : 'sg_b_r') + 0.2, () => { holdStill(false); if (phase === 'reply') phase = 'walk'; });
    };
    if (choice) rt.after(rt.speak(choice.say) + 0.25, reply); else reply();
  }

  function blown() {
    phase = 'blown';
    rt.ui.closeTalk();
    holdStill(false);
    const reason = meter.failReason ?? 'exposed';
    if (reason === 'weapon_drawn') { rt.fail(reason); return; }
    rt.after(rt.speak('su_02') + 0.3, () => rt.fail(reason));
  }

  return {
    enter() {
      meter = createSuspicionMeter({ value: 0 });
      phase = 'walk'; sergeantDone = false; warnedRunning = false; now = 0; saluted.clear();
      // A cold start (a URL, a debug jump): through the gate already, pass shown.
      const lead = readLead(context);
      if (!rt.flags.get(WORLD_FLAGS.BASE_OFFICER_ACCESS) || !lead || Math.hypot(lead.x - FINAL_PLACES.gate.x, lead.z - FINAL_PLACES.gate.z) > 60) {
        rt.flags.set(WORLD_FLAGS.BASE_OFFICER_ACCESS, true);
        rt.setClock(5 + 40 / 60, 'clear');
        rt.leadOnFoot({ x: WAY_TO_HANGAR_TWO[1].x, z: WAY_TO_HANGAR_TWO[1].z - 4, heading: 0 });
      }
      const base = context.systems.find('airBase');
      const stand = base?.layout?.stands?.find((each) => each.model === 'manta_sombra');
      const area = context.systems.find('restrictedArea');
      if (stand?.id && typeof area?.setExpectedStand === 'function') area.setExpectedStand(stand.id);
      rt.objective('Walk to hangar two. Do not run. Return salutes.', { x: door.x, z: door.z });
      rt.hint(ON_FOOT_RULES);
      window.addEventListener('keydown', onKey);
      publish(true);
    },

    update(dt) {
      now += dt;
      const lead = readLead(context);
      if (!lead || phase === 'blown') return;
      keepOfficerPace(context);
      if (phase === 'answer') {
        answerLeft -= dt;
        talk?.setTimeLeft(answerLeft / ANSWER_SECONDS);
        if (answerLeft <= 0) answer(null);
      }
      const returning = saluteKey || context.input.pressed('interact');
      saluteKey = false;
      if (returning && meter.returnSalute()) publish(true);
      rt.ui.setPrompt(meter.salutePending ? 'G' : null, meter.salutePending ? 'Return salute' : null);
      if (phase === 'walk') {
        const people = context.systems.find('restrictedArea')?.people ?? [];
        let nearGuard = false;
        for (const person of people) {
          const d = Math.hypot(person.x - lead.x, person.z - lead.z);
          if (person.role === 'guard' && d < 4) nearGuard = true;
          if (d < 0.8 && now - bumpAt > 3) { bumpAt = now; meter.bump(); }
        }
        // (Set down by a cut, the lead settles onto the ground for a moment: that is not a jump.)
        meter.update(dt, { ...lead, airborne: lead.airborne && now > 1.5, offPath: distanceToWay(lead.x, lead.z), nearGuard });
      } else if (lead.weaponDrawn) meter.update(dt, { weaponDrawn: true });
      publish();
      if (meter.exposed) { blown(); return; }
      if (!warnedRunning && (meter.cause === 'running' || meter.cause === 'sprinting')) { warnedRunning = true; rt.speak('su_01'); }
      if (phase !== 'walk') return;
      if (!sergeantDone && lead.z < SERGEANT_Z) { sergeant(); return; }
      if (Math.hypot(lead.x - door.x, lead.z - door.z) < ARRIVE_RANGE) { phase = 'arrived'; rt.next(); }
    },

    onEvent(topic, payload) {
      if (topic === GAME_EVENTS.BASE_CREW_SALUTED && phase === 'walk') {
        const last = saluted.get(payload?.crewId);
        if (last !== undefined && now - last < SALUTE_REPEAT_SECONDS) return;
        saluted.set(payload?.crewId, now);
        meter.salute();
      } else if (topic === GAME_EVENTS.RESTRICTED_AREA_CHANGED && payload?.state === 'trespassing' && phase !== 'blown') {
        rt.fail('exposed');
      }
    },

    exit() {
      window.removeEventListener('keydown', onKey);
      rt.ui.closeTalk();
      rt.ui.setCover(null);
      rt.ui.setPrompt(null, null);
      holdStill(false);
      keepOfficerPace(context, false);
    },
  };
}
