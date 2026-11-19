// The pictures of shots.json: each is a showcase scene the director registers, in the director's
// order, with the query the capture tools open; the scenes of the final arc drive the real mission
// (its own start command, stages, radio line and cut) and the phone can be posed for a still.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseLaunchOptions } from '../../../game/src/core/boot/launchOptions.js';
import { SHOWCASE_NAME_PATTERN } from '../../../game/src/core/automation/showcaseSceneRegistry.js';
import { FINAL_ARC_LINES, FINAL_ARC_SPEAKERS } from '../../../game/src/catalog/finalArcScript.js';
import { FINAL_CHECKPOINTS, finalStage } from '../../../game/src/story/final/finalMissionStages.js';
import { SHOWCASE_DIRECTOR_SCENES, createShowcaseDirectorSystem } from '../../../game/src/showcase/showcaseDirector.js';

const root = new URL('../../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const shots = JSON.parse(read('shots.json'));
const sceneOf = (shot) => parseLaunchOptions(shot.query).shot;

test('shots.json lists the director\'s scenes in order, each as ?shot=<name>&seed=1&quality=cinematic', () => {
  assert.deepEqual(shots.map(sceneOf), [...SHOWCASE_DIRECTOR_SCENES]);
  assert.deepEqual(shots.map(sceneOf), ['cover-golden-hour', 'rocket-strike-hierro', 'dusk-phone-call', 'manta-cockpit-dawn', 'manta-exterior-cut']);
  shots.forEach((shot, index) => {
    const options = parseLaunchOptions(shot.query);
    assert.equal(shot.query, `?shot=${options.shot}&seed=1&quality=cinematic`);
    assert.ok(SHOWCASE_NAME_PATTERN.test(options.shot));
    assert.equal(options.seed, 1);
    assert.equal(options.quality, 'cinematic');
    assert.match(shot.name, new RegExp(`^${index + 1}-[a-z0-9-]+\\.jpg$`), 'numbered, so the first by name is the cover');
  });
  assert.equal(new Set(shots.map((shot) => shot.name)).size, shots.length);
});

test('every scene of the list, and the ones kept loadable, is registered by a scene file', () => {
  const director = read('game/src/showcase/showcaseDirector.js');
  const files = [...director.matchAll(/import\('\.\/([A-Za-z]+\.js)'\)/g)].map((match) => match[1]);
  const registered = new Set();
  for (const file of files) {
    for (const match of read(`game/src/showcase/${file}`).matchAll(/^\s*name: '([a-z0-9-]+)',$/gm)) registered.add(match[1]);
  }
  for (const name of [...SHOWCASE_DIRECTOR_SCENES, 'dusk-on-foot', 'city-map']) assert.ok(registered.has(name), `${name} has no scene`);
  assert.equal(typeof createShowcaseDirectorSystem, 'function');
});

test('the scenes of the final arc start the real mission and show its own lines', () => {
  const cockpit = read('game/src/showcase/mantaCockpitDawn.js');
  const exterior = read('game/src/showcase/mantaExteriorCut.js');
  const dusk = read('game/src/showcase/duskOnFoot.js');
  const staging = read('game/src/showcase/finalArcStaging.js');
  assert.match(staging, /GAME_COMMANDS\.FINAL_MISSION_START/);
  // The cockpit: checkpoint 3 (airborne, the radar stage), the red order of the base commander.
  assert.match(cockpit, /checkpoint: 3/);
  assert.equal(FINAL_CHECKPOINTS[3], 'blind_radar');
  const line = /RADIO_LINE = '([a-z0-9_]+)'/.exec(cockpit)[1];
  assert.equal(FINAL_ARC_LINES[line].text, 'Osorio Three-Seven, return to base immediately. That is an order.');
  assert.equal(FINAL_ARC_SPEAKERS[FINAL_ARC_LINES[line].speaker].name, 'Coronel Vargas');
  assert.equal(FINAL_ARC_SPEAKERS[FINAL_ARC_LINES[line].speaker].tone, 'red');
  assert.doesNotMatch(cockpit, /\.fov\s*=|camera\.position\.set|CAMERA_CUT_TO/, 'the cockpit view is the flight camera\'s own');
  // The exterior: checkpoint 2 (the takeoff window) and the mission's own cut.
  assert.match(exterior, /checkpoint: 2/);
  assert.equal(FINAL_CHECKPOINTS[2], 'takeoff_window');
  assert.match(exterior, /play\('cut_takeoff'/);
  // The dusk call: the prologue's last stage rings the phone itself.
  assert.match(dusk, /stage: 'insider_call'/);
  assert.equal(finalStage('insider_call').kind, 'call');
  assert.equal(FINAL_ARC_LINES.ic_01.text, 'The gate opens at 05:40, Lieutenant. Do not be late.');
  assert.equal(FINAL_ARC_SPEAKERS.mayor_quiroga.name, 'Maj. Quiroga');
});

test('the handset can be posed for a still, and rises whole into the frame', () => {
  const view = read('game/src/ui/call/callScreenView.js');
  assert.match(view, /\.incoming-call\.is-posed [^{]+\{\s*animation-play-state: paused/);
  assert.match(view, /\.incoming-call \{[^}]*bottom: \d/, 'the risen handset stands above the bottom edge');
  assert.match(read('game/src/ui/call/incomingCallRuntime.js'), /pose\(\) \{ screen\.root\.classList\.add\('is-instant', 'is-posed'\); \}/);
  assert.match(read('game/src/ui/incomingCalls.js'), /pose\(\) \{ runtime\?\.pose\(\); \}/);
});

test('the owner\'s cockpit captures: the launch options place an aircraft at dawn in either mode', () => {
  const garza = parseLaunchOptions('?autostart=1&seed=1&quality=cinematic&aircraft=garza_negra&air=420&at=-4500,-1900&hdg=126&flightview=cockpit&time=6.85');
  assert.deepEqual([garza.aircraft, garza.air, garza.flightView, garza.heading, garza.at, garza.timeOfDay], ['garza_negra', 420, 'cockpit', 126, { x: -4500, z: -1900 }, 6.85]);
  const manta = parseLaunchOptions('?autostart=1&aircraft=manta_sombra&air=420&flightview=cockpit&flightmode=realistic&time=06:51');
  assert.equal(manta.flightMode, 'realistic');
  assert.ok(Math.abs(manta.timeOfDay - 6.85) < 1e-9);
});
