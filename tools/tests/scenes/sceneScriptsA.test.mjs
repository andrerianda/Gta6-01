// The five story scenes of the garage and the island (midnight_call, the_decision, new_face,
// handover, epilogue): each builds a script with fake tools; cues, lines, the locked betrayal,
// the closing card and the room's walls are checked without a browser.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FINAL_ARC_LINES, FINAL_CREDITS, FINAL_MISSION } from '../../../game/src/catalog/finalArcScript.js';
import { ACTOR_GESTURES, CUE_KINDS } from '../../../game/src/cinematics/sceneScript.js';
import { EPILOGUE_SCENE } from '../../../game/src/story/scenes/epilogue.js';
import { HANDOVER_SCENE } from '../../../game/src/story/scenes/handover.js';
import { MIDNIGHT_CALL_SCENE } from '../../../game/src/story/scenes/midnightCall.js';
import { NEW_FACE_SCENE } from '../../../game/src/story/scenes/newFace.js';
import { THE_DECISION_SCENE } from '../../../game/src/story/scenes/theDecision.js';

const SCENES = [MIDNIGHT_CALL_SCENE, THE_DECISION_SCENE, NEW_FACE_SCENE, HANDOVER_SCENE, EPILOGUE_SCENE];
const GARAGE = [MIDNIGHT_CALL_SCENE, THE_DECISION_SCENE, NEW_FACE_SCENE, EPILOGUE_SCENE];
const SECONDS = { midnight_call: [35, 60], the_decision: [22, 42], new_face: [22, 42], handover: [34, 60], epilogue: [65, 130] }; // with 3 s lines; the real headlines are longer
const SOUNDS = ['breath', 'hangar_hum', 'door_rumble', 'low_note', 'gunshot_far', 'phone_ring', 'phone_buzz', 'phone_pickup', 'phone_hangup',
  'cockpit_alarm', 'wind_surf', 'rain_roof', 'tape_seal', 'cloth_pull', 'heartbeat', 'tinnitus'];
const ROOM = { x: 3.5, yMin: 0, yMax: 3, z: 2.75, margin: 0.3 };

function fakeTools(extra = {}) {
  return { context: null, params: {}, secondsOf: () => 3, groundHeightAt: () => 0, toWorld: (p) => p, aircraft: () => null,
    lead: () => ({ x: 0, y: 0, z: 0, heading: 0 }), ...extra };
}
const build = (scene, params = {}, extra = {}) => scene.build(params, fakeTools({ params, ...extra }));
const linesOf = (script) => script.cues.filter((cue) => cue.kind === 'line').sort((a, b) => a.t - b.t || a.order - b.order);
const cueOf = (script, test_) => script.cues.find(test_);

test('every scene has its id and builds a script whose cues lie within its duration', () => {
  assert.deepEqual(SCENES.map((scene) => scene.id), ['midnight_call', 'the_decision', 'new_face', 'handover', 'epilogue']);
  for (const scene of SCENES) {
    const script = build(scene);
    assert.ok(Array.isArray(script.cues) && script.cues.length > 8, scene.id);
    assert.equal(script.options.skippable, true, scene.id);
    assert.ok(script.startBlack, `${scene.id} opens on black`);
    for (const cue of script.cues) {
      assert.ok(CUE_KINDS.includes(cue.kind), `${scene.id}: ${cue.kind}`);
      assert.ok(Number.isFinite(cue.t) && cue.t >= 0 && cue.t + cue.seconds <= script.duration + 1e-6, `${scene.id}: ${cue.kind} at ${cue.t}`);
      if (cue.kind === 'act' && cue.gesture) assert.ok(ACTOR_GESTURES.includes(cue.gesture));
      if (cue.kind === 'sound') assert.ok(SOUNDS.includes(cue.soundId), `${scene.id}: sound ${cue.soundId}`);
      if (cue.kind === 'act') assert.ok(script.actors.some((actor) => actor.name === cue.actor), `${scene.id}: actor ${cue.actor}`);
    }
    const [least, most] = SECONDS[scene.id];
    assert.ok(script.duration >= least && script.duration <= most, `${scene.id} lasts ${script.duration.toFixed(1)} s`);
  }
});

test('the scenes build with empty or missing params and with long lines', () => {
  for (const scene of SCENES) {
    assert.ok(scene.build(undefined, fakeTools()).cues.length > 0, scene.id);
    const slow = build(scene, {}, { secondsOf: () => 9 });
    for (const cue of slow.cues) assert.ok(cue.t + cue.seconds <= slow.duration + 1e-6, scene.id);
  }
});

test('every line is spoken by id, exists in the script of the arc and belongs to its own scene, in order', () => {
  const expected = {
    midnight_call: ['mc_01', 'mc_02', 'mc_03', 'mc_04'],
    the_decision: ['td_01', 'td_02', 'td_03', 'td_04'],
    new_face: ['nf_01', 'nf_02', 'nf_03', 'nf_04'],
    handover: ['hv_01', 'hv_02', 'hv_03', 'hv_04'],
    epilogue: ['ep_01', 'ep_02', 'ep_03', 'ep_04'],
  };
  for (const scene of SCENES) {
    const lines = linesOf(build(scene));
    for (const cue of lines) {
      assert.ok(FINAL_ARC_LINES[cue.lineId], `${scene.id}: ${cue.lineId}`);
      assert.equal(FINAL_ARC_LINES[cue.lineId].scene, scene.id);
      assert.equal(cue.channel, FINAL_ARC_LINES[cue.lineId].channel, `${cue.lineId} on its own channel`);
    }
    assert.deepEqual(lines.map((cue) => cue.lineId), expected[scene.id]);
    for (let i = 1; i < lines.length; i += 1) assert.ok(lines[i].t >= lines[i - 1].t + lines[i - 1].seconds, `${scene.id}: ${lines[i].lineId} waits for the line before it`);
  }
});

test('the garage scenes stand on a hidden stage and keep every camera inside the room', () => {
  for (const scene of GARAGE) {
    const script = build(scene, {}, { groundHeightAt: () => 12, lead: () => ({ x: 100, y: 12, z: -40, heading: 1 }) });
    assert.deepEqual(script.stage.origin, { x: 100, y: -48, z: -40 }, scene.id);
    assert.equal(script.stage.heading, 0);
    assert.ok(script.sets.some((set) => set.assetId === 'garage_office_set'), scene.id);
    assert.ok(script.lights.length > 0, `${scene.id} brings its own light`);
    assert.equal(script.options.hideLead, true);
    const shots = script.cues.filter((cue) => cue.kind === 'shot');
    assert.ok(shots.length >= 4, scene.id);
    for (const shot of shots) {
      for (const view of [shot.from, shot.to].filter(Boolean)) {
        const p = view.position;
        assert.ok(Math.abs(p.x) <= ROOM.x - ROOM.margin && Math.abs(p.z) <= ROOM.z - ROOM.margin && p.y >= ROOM.yMin + ROOM.margin && p.y <= ROOM.yMax - ROOM.margin,
          `${scene.id}: camera at ${p.x}, ${p.y}, ${p.z}`);
        assert.ok(Math.abs(view.target.x) <= ROOM.x + 0.01 && Math.abs(view.target.z) <= ROOM.z + 0.1, `${scene.id}: target`);
        assert.ok(view.fov >= 18 && view.fov <= 45);
      }
      if (shot.to) { // every moving shot moves slowly
        const d = Math.hypot(shot.to.position.x - shot.from.position.x, shot.to.position.y - shot.from.position.y, shot.to.position.z - shot.from.position.z);
        assert.ok(d / shot.seconds < 0.35, `${scene.id}: a camera at ${(d / shot.seconds).toFixed(2)} m/s`);
      }
    }
    for (const light of script.lights.filter((entry) => !['street', 'door'].includes(entry.name))) {
      assert.ok(Math.abs(light.position.x) < ROOM.x && Math.abs(light.position.z) < ROOM.z && light.position.y < ROOM.yMax, `${scene.id}: light ${light.name}`);
    }
    for (const actor of script.actors) assert.ok(Number.isFinite(actor.position.y), `${scene.id}: ${actor.name} stands on the stage's floor, not the city's ground`);
  }
});

test('midnight_call: rain, the letter and the photograph, the phone rings and Dez hangs up without answering', () => {
  const script = build(MIDNIGHT_CALL_SCENE);
  assert.equal(script.clock.weather, 'rain');
  assert.ok(script.clock.hours < 1);
  assert.ok(script.props.some((prop) => prop.assetId === 'foreclosure_letter' && prop.parent === 'office:anchor_letter'));
  assert.ok(script.props.some((prop) => prop.assetId === 'framed_pilot_photo' && prop.parent === 'office:anchor_photo'));
  assert.ok(script.actors.some((actor) => actor.characterId === 'dez_tolliver' && actor.pose === 'sit'));
  const ring = cueOf(script, (cue) => cue.kind === 'phone' && cue.action === 'ring');
  const hangUp = cueOf(script, (cue) => cue.kind === 'phone' && cue.action === 'end');
  const lines = linesOf(script);
  assert.equal(ring.callerId, 'el_comprador');
  assert.equal(ring.callerName, 'Unknown number');
  assert.ok(ring.t < lines[0].t && script.cues.some((cue) => cue.kind === 'waitFor' && cue.token === `phone:${ring.callId}`));
  assert.ok(hangUp.t >= lines[3].t + lines[3].seconds + 3, 'a long beat before he hangs up');
  const rain = script.cues.filter((cue) => cue.kind === 'sound' && cue.soundId === 'rain_roof');
  assert.deepEqual(rain.map((cue) => cue.action), ['start', 'stop']);
});

test('the_decision: the seal goes on after the tape sounds; Dez asks "When?" on the phone', () => {
  const script = build(THE_DECISION_SCENE);
  const seal = script.props.find((prop) => prop.assetId === 'bank_seal_notice');
  assert.equal(seal.visible, false);
  assert.equal(seal.parent, 'office:anchor_seal');
  const tape = cueOf(script, (cue) => cue.kind === 'sound' && cue.soundId === 'tape_seal');
  const shown = cueOf(script, (cue) => cue.kind === 'show' && cue.target === 'seal' && cue.visible);
  const lines = linesOf(script);
  assert.ok(tape.t > lines[1].t && shown.t >= tape.t && shown.t < lines[2].t);
  const ear = cueOf(script, (cue) => cue.kind === 'act' && cue.gesture === 'phone_ear');
  assert.ok(ear.t <= lines[2].t);
  const cut = script.cues.filter((cue) => cue.kind === 'fade' && cue.to === 1).pop();
  assert.ok(cut.seconds === 0 && cut.t >= lines[3].t + lines[3].seconds + 1.5, 'a hold on his face, then a cut to black');
  assert.ok(script.clock.hours > 7 && script.clock.hours < 10);
});

test('new_face: the pass, the uniform and La Notaria', () => {
  const script = build(NEW_FACE_SCENE);
  assert.ok(script.actors.some((actor) => actor.characterId === 'ximena_robles'));
  assert.ok(script.props.some((prop) => prop.assetId === 'forged_pass_card'));
  assert.ok(script.props.some((prop) => prop.assetId === 'uniform_on_hanger' && prop.parent === 'office:anchor_hanger'));
  assert.ok(!script.cues.some((cue) => cue.kind === 'phone'), 'the insider\'s call is the mission\'s own stage');
});

test('handover: the locked betrayal, word for word and in order, the slow close and the shot in full black', () => {
  for (const params of [{}, { aircraftId: 'craft' }]) {
    for (const craft of [null, { root: null, position: { x: -9529.5, y: 19, z: -3442.1 }, heading: 0.4, vehicleId: 'craft' }, { root: null, position: { x: -9600, y: 19, z: -3400 }, heading: 0, vehicleId: 'craft' }]) {
      const script = build(HANDOVER_SCENE, params, { aircraft: () => craft });
      const lines = linesOf(script);
      assert.deepEqual(lines.map((cue) => cue.lineId), ['hv_01', 'hv_02', 'hv_03', 'hv_04']);
      assert.deepEqual(lines.map((cue) => FINAL_ARC_LINES[cue.lineId].text),
        ['You flew beautifully, Captain.', 'Then we\'re done.', 'We are.', 'We needed the aircraft. Not the witness.']);
      const last = lines[3];
      const betrayed = cueOf(script, (cue) => cue.kind === 'mark' && cue.name === 'betrayed');
      const shotMark = cueOf(script, (cue) => cue.kind === 'mark' && cue.name === 'shot');
      const gun = script.cues.filter((cue) => cue.kind === 'sound' && cue.soundId === 'gunshot_far');
      const close = script.cues.filter((cue) => cue.kind === 'fade' && cue.to === 1);
      assert.ok(betrayed.essential && shotMark.essential);
      assert.ok(betrayed.t <= last.t && betrayed.order < last.order && betrayed.t > lines[2].t + lines[2].seconds, 'betrayed just before hv_04');
      assert.ok(last.t - betrayed.t < 1);
      assert.ok(lines[3].t - (lines[2].t + lines[2].seconds) >= 2, 'a beat of only wind before he turns away');
      assert.equal(close.length, 1);
      assert.ok(close[0].t >= last.t + last.seconds, 'the veil closes after the line');
      assert.ok(close[0].seconds >= 3.5 && close[0].seconds <= 5);
      assert.equal(gun.length, 1, 'one shot');
      assert.ok(gun[0].t >= close[0].t + close[0].seconds + 1, 'a full second of black before the shot');
      assert.equal(shotMark.t, gun[0].t);
      // Nothing but wind and surf from the close on; then the wind fades and three seconds of silence.
      const wind = script.cues.filter((cue) => cue.kind === 'sound' && cue.soundId === 'wind_surf');
      assert.deepEqual(wind.map((cue) => cue.action), ['start', 'stop']);
      assert.ok(wind[1].t > gun[0].t + 3 && wind[1].fadeSeconds >= 1.5);
      assert.ok(script.duration >= wind[1].t + wind[1].fadeSeconds + 3 - 1e-6);
      const late = script.cues.filter((cue) => cue.t >= close[0].t && ['sound', 'line', 'phone', 'card', 'shot', 'act'].includes(cue.kind));
      assert.deepEqual(late.map((cue) => cue.soundId).sort(), ['gunshot_far', 'wind_surf']);
      assert.equal(script.end.keepBlack, true);
      assert.equal(script.end.leadAt, null);
      // The cast and the stage.
      assert.equal(script.actors.filter((actor) => actor.archetypeId === 'norvast_soldier').length, 2);
      assert.ok(script.props.some((prop) => prop.assetId === 'payment_case'));
      assert.ok(script.cues.some((cue) => cue.kind === 'act' && cue.actor === 'comprador' && cue.gesture === 'turn_away'));
      assert.ok(script.cues.some((cue) => cue.kind === 'act' && cue.actor === 'dez' && cue.gesture === 'take'));
      assert.ok(script.clock.hours > 6 && script.clock.hours < 7);
      assert.ok(Number.isFinite(script.stage.heading) && Math.abs(script.stage.origin.y - 18) < 1e-9);
      const usedCraft = params.aircraftId ? craft : null;
      if (usedCraft) { // the aircraft lies on the stage's -Z and the men never stand in it
        const dx = usedCraft.position.x - script.stage.origin.x, dz = usedCraft.position.z - script.stage.origin.z;
        const h = script.stage.heading, lx = dx * Math.cos(h) - dz * Math.sin(h), lz = dx * Math.sin(h) + dz * Math.cos(h);
        assert.ok(Math.abs(lx) < 1e-6 && lz <= -16, `aircraft at local ${lx.toFixed(2)}, ${lz.toFixed(2)}`);
      } else {
        assert.ok(Math.abs(script.stage.origin.x + 9529.5) < 1e-9 && Math.abs(script.stage.origin.z + 3442.1) < 1e-9);
      }
    }
  }
});

test('epilogue: the news over black, the empty sealed office, the closing card and the credits', () => {
  const script = build(EPILOGUE_SCENE);
  const lines = linesOf(script);
  const open = cueOf(script, (cue) => cue.kind === 'fade' && cue.to === 0);
  assert.ok(open.t >= lines[0].t + lines[0].seconds, 'the first headline is heard on black');
  assert.equal(script.actors.length, 0, 'the office is empty');
  assert.ok(script.props.some((prop) => prop.assetId === 'bank_seal_notice' && prop.visible));
  assert.ok(!script.props.some((prop) => prop.assetId === 'foreclosure_letter'), 'the desk is bare');
  const cards = script.cues.filter((cue) => cue.kind === 'card');
  assert.deepEqual(cards.map((cue) => cue.style), ['closing', 'credits']);
  assert.equal(cards[0].text, FINAL_MISSION.closingCard);
  assert.equal(cards[0].text, 'Some men fall once and learn to walk. Dez Tolliver fell twice, and took the world with him.');
  assert.ok(cards[0].seconds >= 8 && cards[0].seconds <= 10);
  assert.equal(cards[1].lines, FINAL_CREDITS);
  assert.ok(cards[1].seconds >= 20 && cards[1].t >= cards[0].t + cards[0].seconds);
  const black = script.cues.filter((cue) => cue.kind === 'fade' && cue.to === 1).pop();
  assert.ok(black.t >= lines[3].t + lines[3].seconds && cards[0].t >= black.t + black.seconds, 'the card stands on black');
  const done = cueOf(script, (cue) => cue.kind === 'mark' && cue.name === 'credits_done');
  assert.ok(done.essential && done.t >= cards[1].t + cards[1].seconds);
  const note = script.cues.filter((cue) => cue.kind === 'sound' && cue.soundId === 'low_note');
  assert.deepEqual(note.map((cue) => cue.action), ['start', 'stop']);
  assert.ok(note[0].volume <= 0.4 && note[0].t >= cards[1].t - 0.01);
  assert.equal(script.end.keepBlack, false);
  assert.equal(script.end.leadAt, null, 'the lead stays where he is');
});
