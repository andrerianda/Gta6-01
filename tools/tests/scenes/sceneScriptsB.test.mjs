// The base and flight scenes of the final mission, built with fake tools (no browser): every
// scene gives a script for both aircraft, its cues lie inside its duration, it speaks only
// lines of the final arc, and each carries the beats the mission waits for.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FINAL_ARC_LINES, FINAL_MISSION } from '../../../game/src/catalog/finalArcScript.js';
import { BOARDING_SCENE } from '../../../game/src/story/scenes/boarding.js';
import { FLASHBACK_SCENE } from '../../../game/src/story/scenes/flashback.js';
import {
  CUT_BOMB_SCENE, CUT_HALCONS_SCENE, CUT_ISLAND_SCENE, CUT_TAKEOFF_SCENE, bindShots, framingDistance, localOf, orbitPlace, sunSide,
} from '../../../game/src/story/scenes/flightCuts.js';
import { HANGAR_REVEAL_SCENE } from '../../../game/src/story/scenes/hangarReveal.js';
import { TIME_SKIP_SCENE } from '../../../game/src/story/scenes/timeSkip.js';
import { WALK_OUT_SCENE, yawTo } from '../../../game/src/story/scenes/walkOut.js';

const AIRCRAFT = ['manta_sombra', 'garza_negra'];
const SCENES = [HANGAR_REVEAL_SCENE, WALK_OUT_SCENE, BOARDING_SCENE, CUT_TAKEOFF_SCENE, CUT_BOMB_SCENE, CUT_HALCONS_SCENE, CUT_ISLAND_SCENE,
  FLASHBACK_SCENE, TIME_SKIP_SCENE];
const CUTS = [CUT_TAKEOFF_SCENE, CUT_BOMB_SCENE, CUT_HALCONS_SCENE, CUT_ISLAND_SCENE];

function fakeTools(params, aircraft = () => null, systems = () => null) {
  return { context: { systems: { find: systems } }, params, secondsOf: () => 3, groundHeightAt: () => 0, toWorld: (p) => p, aircraft,
    lead: () => ({ x: 0, y: 0, z: 0, heading: 0 }) };
}

function build(scene, aircraftId, extra = {}) {
  const params = { aircraftId, ...extra };
  return scene.build(params, fakeTools(params));
}

const linesOf = (script) => script.cues.filter((cue) => cue.kind === 'line').sort((a, b) => a.t - b.t).map((cue) => cue.lineId);
const marksOf = (script) => script.cues.filter((cue) => cue.kind === 'mark').map((cue) => cue.name);
const allFinite = (value) => (typeof value === 'number' ? Number.isFinite(value)
  : value && typeof value === 'object' ? Object.values(value).every(allFinite) : true);

test('the ids are the ones the mission plays', () => {
  assert.deepEqual(SCENES.map((scene) => scene.id),
    ['hangar_reveal', 'walk_out', 'boarding', 'cut_takeoff', 'cut_bomb', 'cut_halcons', 'cut_island', 'flashback', 'time_skip']);
});

test('every scene builds for both aircraft, inside its duration, with known lines and finite frames', () => {
  for (const scene of SCENES) {
    for (const aircraftId of AIRCRAFT) {
      const script = build(scene, aircraftId);
      assert.ok(script && Array.isArray(script.cues) && script.cues.length > 0, `${scene.id} gives a script`);
      assert.ok(script.duration > 0, `${scene.id} has a length`);
      assert.equal(script.options.skippable, true, `${scene.id} can be skipped`);
      for (const cue of script.cues) {
        assert.ok(cue.t >= 0 && cue.t + cue.seconds <= script.duration + 1e-9, `${scene.id}: a ${cue.kind} cue inside the duration`);
        if (cue.kind === 'line') assert.ok(FINAL_ARC_LINES[cue.lineId], `${scene.id}: line ${cue.lineId} exists`);
        if (cue.kind === 'shot') assert.ok(allFinite(cue.from) && allFinite(cue.to), `${scene.id}: a finite shot`);
        if (cue.kind === 'firstPerson') assert.ok(allFinite(cue.path) && cue.path.length > 1, `${scene.id}: a finite path`);
      }
      assert.ok(allFinite(script.stage), `${scene.id}: a finite stage`);
    }
  }
  assert.ok(build(SCENES[0], undefined), 'a scene builds without an aircraft id');
  assert.ok(HANGAR_REVEAL_SCENE.build(undefined, undefined), 'and without params or tools');
});

test('hangar_reveal: black, sound first, both doors by their travel, hr_01, the title card, a white-gold end', () => {
  for (const aircraftId of AIRCRAFT) {
    const script = build(HANGAR_REVEAL_SCENE, aircraftId);
    assert.ok(script.startBlack);
    assert.ok(script.duration >= 36 && script.duration <= 44);
    assert.ok(script.stage.origin.y <= -80);
    assert.equal(script.sets[0].assetId, 'hangar_interior_set');
    assert.ok(script.props.some((prop) => prop.assetId === aircraftId));
    const moves = script.cues.filter((cue) => cue.kind === 'move');
    const left = moves.find((cue) => cue.target === 'hangar:door_l'), right = moves.find((cue) => cue.target === 'hangar:door_r');
    assert.equal(left.translate.x, -27.2);
    assert.equal(right.translate.x, 27.2);
    assert.ok(left.seconds >= 14 && left.ease === 'in' && left.t === right.t);
    const view = script.cues.find((cue) => cue.kind === 'firstPerson');
    assert.equal(view.visor, aircraftId === 'garza_negra' ? 'pressure' : 'helmet');
    assert.deepEqual(view.path[0].position, { x: 0, y: 1.7, z: 23 });
    const firstFade = script.cues.find((cue) => cue.kind === 'fade');
    const sounds = script.cues.filter((cue) => cue.kind === 'sound' && cue.action === 'start');
    for (const id of ['breath', 'hangar_hum']) assert.ok(sounds.find((cue) => cue.soundId === id).t < firstFade.t, `${id} before the picture`);
    assert.ok(sounds.some((cue) => cue.soundId === 'door_rumble' && cue.t === left.t));
    const notes = sounds.filter((cue) => cue.soundId === 'low_note').map((cue) => cue.volume);
    assert.ok(notes.length >= 3 && notes.every((volume, i) => i === 0 || volume > notes[i - 1]), 'the low note rises');
    assert.deepEqual(linesOf(script), ['hr_01']);
    assert.ok(script.cues.find((cue) => cue.kind === 'line').t > left.t + 6, 'hr_01 once the silhouette is clear');
    const card = script.cues.find((cue) => cue.kind === 'card');
    assert.equal(card.style, 'title');
    assert.equal(card.text, FINAL_MISSION.title);
    assert.ok(card.seconds >= 4 && card.t >= left.t + left.seconds);
    const lastFade = script.cues.filter((cue) => cue.kind === 'fade').pop();
    assert.ok(lastFade.to === 1 && lastFade.colour !== '#000000' && lastFade.colour);
    assert.equal(script.props.some((prop) => prop.assetId === 'tarpaulin_curtain'), aircraftId === 'garza_negra');
  }
});

test('walk_out: first person through the visor all the way, the crew, the salute returned, the covers, the mark', () => {
  for (const aircraftId of AIRCRAFT) {
    const script = build(WALK_OUT_SCENE, aircraftId);
    assert.equal(script.options.hideLead, true);
    assert.equal(script.options.letterbox, false);
    assert.equal(script.cues.filter((cue) => cue.kind === 'shot').length, 0, 'no outside shot');
    const view = script.cues.find((cue) => cue.kind === 'firstPerson');
    assert.ok(view.visor === 'helmet' || view.visor === 'pressure');
    assert.ok(view.t === 0 && view.seconds >= script.duration - 0.01);
    assert.equal(script.actors.filter((actor) => actor.archetypeId === 'base_ground_crew').length, 3);
    assert.equal(script.actors.filter((actor) => actor.archetypeId === 'base_officer').length, 1);
    const salute = script.cues.find((cue) => cue.kind === 'act' && cue.actor === 'officer' && cue.gesture === 'salute');
    const arm = script.cues.find((cue) => cue.kind === 'arm');
    assert.equal(arm.gesture, 'salute');
    assert.ok(arm.t >= salute.t && arm.t - salute.t < 2);
    assert.deepEqual(linesOf(script), ['wo_01', 'wo_02']);
    for (const node of ['cover_nose', 'cover_intake_l', 'cover_intake_r']) {
      assert.ok(script.cues.some((cue) => cue.kind === 'show' && cue.target === `covers:${node}` && cue.visible === false), `${node} comes off`);
    }
    assert.equal(script.cues.filter((cue) => cue.kind === 'sound' && cue.soundId === 'cloth_pull').length, 3);
    assert.ok(script.cues.filter((cue) => cue.kind === 'act' && cue.gesture === 'pull').length >= 3);
    assert.deepEqual(marksOf(script), ['walked_out']);
    assert.ok(script.end.leadAt && script.end.leadAt.world === false);
    assert.ok(script.clock.hours > 5.7 && script.clock.hours < 6);
    assert.ok(script.props.some((prop) => prop.assetId === aircraftId), 'its own aircraft while the world has none');
  }
  // On the real aircraft the stage is its place and no second model is brought.
  const params = { aircraftId: 'manta_sombra' };
  const drawn = { visible: true, parent: {}, position: { x: 10, y: 0.2, z: 20 } };
  const real = WALK_OUT_SCENE.build(params, fakeTools(params, () => ({ root: drawn, position: { x: 10, y: 0.2, z: 20 }, heading: 1, vehicleId: 7 })));
  assert.deepEqual(real.stage, { origin: { x: 10, y: 0.2, z: 20 }, heading: 1 });
  assert.ok(!real.props.some((prop) => prop.assetId === 'manta_sombra'));
  // An aircraft that has a place but no drawn model: the scene stands there and brings its own.
  const unseen = WALK_OUT_SCENE.build(params, fakeTools(params, () => ({ root: null, position: { x: 10, y: 0.2, z: 20 }, heading: 1, vehicleId: 7 })));
  assert.deepEqual(unseen.stage.origin, { x: 10, y: 0.2, z: 20 });
  assert.ok(unseen.props.some((prop) => prop.assetId === 'manta_sombra'));
});

test('boarding: the chief and Dez in order, then the cut inside, the throttle hand, the mark', () => {
  const manta = build(BOARDING_SCENE, 'manta_sombra'), garza = build(BOARDING_SCENE, 'garza_negra');
  assert.deepEqual(linesOf(manta), ['bd_01', 'bd_02', 'bd_03']);
  assert.deepEqual(linesOf(garza), ['bd_g1', 'bd_g2', 'bd_03']);
  assert.ok(garza.props.some((prop) => prop.assetId === 'suit_cooler'));
  for (const script of [manta, garza]) {
    const views = script.cues.filter((cue) => cue.kind === 'firstPerson');
    assert.equal(views.length, 2);
    assert.ok(views[1].path[0].position.y > 2.5, 'the second view sits in the cockpit');
    const arm = script.cues.filter((cue) => cue.kind === 'arm').pop();
    assert.equal(arm.gesture, 'throttle');
    assert.ok(arm.t >= views[1].t);
    assert.deepEqual(marksOf(script), ['boarded']);
    assert.ok(script.duration >= 15 && script.duration <= 26);
  }
  assert.equal(manta.cues.find((cue) => cue.kind === 'firstPerson').visor, 'helmet');
  assert.equal(garza.cues.find((cue) => cue.kind === 'firstPerson').visor, 'pressure');
  // The glance to the empty seat: the Manta's second view turns its head and comes back.
  const yaws = manta.cues.filter((cue) => cue.kind === 'firstPerson')[1].path.map((point) => point.yaw);
  assert.ok(Math.max(...yaws.map(Math.abs)) > 0.6 && yaws[yaws.length - 1] === 0);
});

test('the exterior cuts are short, lettered, and follow the live aircraft', () => {
  for (const scene of CUTS) {
    for (const aircraftId of AIRCRAFT) {
      const script = build(scene, aircraftId);
      assert.ok(script.duration >= 4 && script.duration <= 7, `${scene.id} is ${script.duration} s`);
      assert.equal(script.options.letterbox, true);
      assert.equal(script.cues.filter((cue) => cue.kind === 'shot').length, 1);
      assert.equal(script.end.leadAt, null);
    }
  }
  // cut_bomb looks at the tower it is given.
  const bomb = CUT_BOMB_SCENE.build({ hit: true, target: { x: 100, z: 200 } }, fakeTools({}));
  assert.deepEqual(bomb.stage.origin, { x: 100, y: 0, z: 200 });
  assert.ok(bomb.cues[0].shake > CUT_BOMB_SCENE.build({ hit: false }, fakeTools({})).cues[0].shake);

  // A live aircraft: every cut's camera rides with it.
  const craft = { root: null, position: { x: 0, y: 5, z: 0 }, heading: 0, vehicleId: 3 };
  const params = { aircraftId: 'manta_sombra' };
  const pair = [{ x: 30, y: 105, z: 0 }, { x: -30, y: 105, z: 0 }, { x: 9000, y: 0, z: 0 }];
  const tools = fakeTools(params, () => craft, (id) => (id === 'airDefence' ? { interceptors: pair } : null));
  const takeoff = CUT_TAKEOFF_SCENE.build(params, tools);
  const shot = takeoff.cues[0];
  craft.position = { x: 0, y: 25, z: -200 };
  assert.deepEqual(shot.attach(tools), { x: 0, y: 25, z: -200, heading: 0 }, 'the camera ship rides with the aircraft');
  // The front view: ahead of the wing (-z), above the runway although the aircraft is only 5 m up, on a long lens.
  assert.ok(shot.from.position.z < -30 && shot.from.position.y >= 2.5 - 5 && shot.to.position.z < -30);
  assert.ok(shot.from.fov >= 25 && shot.from.fov <= 35 && shot.to.fov >= 25 && shot.to.fov <= 35);
  const rear = CUT_TAKEOFF_SCENE.build({ ...params, view: 'rear' }, tools).cues[0];
  assert.ok(rear.from.position.z > 30 && rear.from.position.y > shot.from.position.y, 'the rear view stands behind and higher');

  craft.position = { x: 0, y: 100, z: 0 };
  const halcons = CUT_HALCONS_SCENE.build(params, tools);
  const anchor = halcons.cues[0].attach(tools);
  assert.deepEqual(anchor, { x: 0, y: 100, z: 0, heading: 0 });
  assert.ok(Math.abs(halcons.cues[0].from.target.x) < 1e-9 && halcons.cues[0].from.target.y > 1, 'the look leans to the pair, not to the far one');

  const island = CUT_ISLAND_SCENE.build(params, tools);
  island.cues[0].attach(tools);
  const view = island.cues[0];
  assert.ok(view.from.target.x < -9000 && view.from.position.x > 30 && view.from.position.y > 0, 'behind the aircraft, looking at the island');

  assert.equal(CUT_TAKEOFF_SCENE.build(params, fakeTools(params, () => { throw new Error('no fleet'); })).cues.length, 1);
});

test('the cuts frame the aircraft: 35 to 60 % of the width on a long lens, the camera on the sun\'s side', () => {
  const halfWidth = (fov) => Math.tan((fov * Math.PI) / 360) * 1.6;
  for (const [aircraftId, span, length] of [['manta_sombra', 46, 21], ['garza_negra', 16.4, 32]]) {
    // Seen from dead ahead the span fills the asked share; from abeam the length does.
    assert.ok(Math.abs(span / (2 * framingDistance(aircraftId, 0, 30, 0.45) * halfWidth(30)) - 0.45) < 1e-9);
    assert.ok(Math.abs(length / (2 * framingDistance(aircraftId, 90, 28, 0.5) * halfWidth(28)) - 0.5) < 1e-9);
    for (const scene of [CUT_TAKEOFF_SCENE, CUT_HALCONS_SCENE]) {
      const craft = { root: null, position: { x: 0, y: 300, z: 0 }, heading: 0, vehicleId: 3 };
      for (const view of ['front', 'rear']) {
        const shot = scene.build({ aircraftId, view }, fakeTools({ aircraftId }, () => craft)).cues[0];
        for (const end of [shot.from, shot.to]) {
          assert.ok(end.fov >= 25 && end.fov <= 35, `${scene.id} lens ${end.fov}`);
          const bearing = Math.atan2(end.position.x, -end.position.z);
          const across = Math.abs(Math.cos(bearing)) * span, along = Math.abs(Math.sin(bearing)) * length;
          const width = Math.max(across, along) + 0.25 * Math.min(across, along);
          const share = width / (2 * Math.hypot(end.position.x, end.position.y, end.position.z) * halfWidth(end.fov));
          assert.ok(share >= 0.35 && share <= 0.6, `${scene.id} ${aircraftId} ${view}: ${share.toFixed(2)} of the width`);
          assert.ok(end.position.y > 0, 'above the wing line');
        }
      }
    }
  }
  const front = orbitPlace(0, 0, 10), right = orbitPlace(90, 0, 10), above = orbitPlace(180, 90, 10);
  assert.ok(Math.abs(front.z + 10) < 1e-9 && Math.abs(right.x - 10) < 1e-9 && Math.abs(above.y - 10) < 1e-9);
  // The sun in the east, the aircraft heading north (its right is east) or south: the camera goes to the sun's side.
  const sunny = (heading) => sunSide({ context: { atmosphere: { state: { sunDirection: { x: 1, y: 0.1, z: 0 } } } } }, { heading });
  assert.equal(sunny(0), 1);
  assert.equal(sunny(Math.PI), -1);
  assert.equal(sunSide({}, { heading: 0 }), 1);
  const craft = { root: null, position: { x: 0, y: 300, z: 0 }, heading: Math.PI, vehicleId: 3 };
  const tools = { ...fakeTools({}, () => craft), context: { systems: { find: () => null }, atmosphere: { state: { sunDirection: { x: 1, y: 0.1, z: 0 } } } } };
  assert.ok(CUT_TAKEOFF_SCENE.build({ aircraftId: 'manta_sombra' }, tools).cues[0].from.position.x < 0, 'on the left when the sun is on the left');
});

test('the helpers: stage-local offsets and first-person yaw', () => {
  const local = localOf({ x: 10, y: 2, z: 10, heading: Math.PI / 2 }, { x: 0, y: 5, z: 10 });
  assert.ok(Math.abs(local.x) < 1e-9 && Math.abs(local.z + 10) < 1e-9 && local.y === 3, 'heading 90 degrees faces -X');
  assert.ok(Math.abs(yawTo({ x: 0, z: 0 }, { x: 0, z: -5 })) < 1e-9);
  assert.ok(Math.abs(yawTo({ x: 0, z: 0 }, { x: -5, z: 0 }) - Math.PI / 2) < 1e-9);
  const attach = () => null;
  attach.cue = null;
  const script = bindShots({ cues: [{ kind: 'shot', attach }, { kind: 'shot', attach: () => null }, { kind: 'line' }] });
  assert.equal(attach.cue, script.cues[0]);
});

test('flashback: an overlay without a picture, the four memories, silence, then his own voice and the mark', () => {
  const script = build(FLASHBACK_SCENE, 'manta_sombra');
  assert.equal(script.cues.filter((cue) => cue.kind === 'shot' || cue.kind === 'firstPerson').length, 0, 'the flight camera stays');
  assert.equal(script.options.letterbox, false);
  assert.equal(script.sets.length + script.props.length + script.actors.length, 0, 'nothing is shown');
  assert.deepEqual(linesOf(script), ['fb_01', 'fb_02', 'fb_03', 'fb_04', 'fb_05']);
  const line = (id) => script.cues.find((cue) => cue.kind === 'line' && cue.lineId === id);
  for (const id of ['fb_01', 'fb_02', 'fb_03', 'fb_04']) assert.equal(line(id).channel, 'memory');
  assert.equal(line('fb_05').channel, 'helmet');
  const sound = (id, action) => script.cues.find((cue) => cue.kind === 'sound' && cue.soundId === id && cue.action === action);
  const fourthEnds = line('fb_04').t + line('fb_04').seconds;
  assert.ok(sound('cockpit_alarm', 'start').t < line('fb_01').t && sound('heartbeat', 'start'));
  assert.ok(Math.abs(sound('cockpit_alarm', 'stop').t - fourthEnds) < 0.01, 'the alarm stops with the last memory');
  assert.ok(Math.abs(sound('tinnitus', 'start').t - fourthEnds) < 0.01);
  assert.ok(line('fb_05').t - fourthEnds >= 2, 'two seconds of silence');
  const fades = script.cues.filter((cue) => cue.kind === 'fade');
  assert.ok(fades[0].to === 1 && /^rgba\(/.test(fades[0].colour), 'the picture drains behind a veil that lets it through');
  assert.equal(fades[fades.length - 1].to, 0);
  assert.ok(fades[fades.length - 1].t < line('fb_05').t, 'the colour returns before he speaks');
  assert.deepEqual(marksOf(script), ['flashback_done']);
  assert.ok(script.cues.find((cue) => cue.kind === 'mark').t >= line('fb_05').t + line('fb_05').seconds);
  assert.ok(script.duration <= 22);
});

test('time_skip: the pull-away, the radio, black, the card, the mark behind it, the fade back in', () => {
  for (const aircraftId of AIRCRAFT) {
    const script = build(TIME_SKIP_SCENE, aircraftId);
    assert.ok(script.duration >= 20 && script.duration <= 24);
    const shots = script.cues.filter((cue) => cue.kind === 'shot');
    assert.ok(shots.length >= 3 && shots[0].t > 0, 'it opens on the cockpit view');
    assert.ok(shots.every((shot) => typeof shot.attach === 'function'));
    const away = shots[1];
    assert.ok(away.to.position.y > 400 && away.seconds >= 8);
    assert.deepEqual(linesOf(script), ['ts_01']);
    const said = script.cues.find((cue) => cue.kind === 'line');
    assert.ok(said.channel === 'radio' && said.t >= away.t && said.t < away.t + away.seconds);
    const card = script.cues.find((cue) => cue.kind === 'card');
    assert.equal(card.style, 'time');
    assert.equal(card.text, FINAL_MISSION.timeSkipCard);
    assert.equal(card.seconds, 4);
    const fades = script.cues.filter((cue) => cue.kind === 'fade');
    assert.ok(fades[0].to === 1 && fades[0].t + fades[0].seconds <= card.t);
    const mark = script.cues.find((cue) => cue.kind === 'mark');
    assert.equal(mark.name, 'time_skipped');
    assert.ok(mark.t > card.t && mark.t < card.t + card.seconds && mark.essential);
    assert.ok(fades[1].to === 0 && fades[1].t >= card.t + card.seconds && fades[1].t > mark.t);
    assert.equal(script.end.keepBlack, false);
  }
});
