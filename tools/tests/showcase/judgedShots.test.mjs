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
  assert.deepEqual(shots.map(sceneOf), ['cover-golden-hour', 'rocket-strike-hierro', 'dusk-phone-call', 'heist-over-the-city']);
  assert.deepEqual(shots.map((shot) => shot.name), ['1-cover-chase-helicopter.jpg', '2-rocket-strike-hierro.jpg', '3-dusk-phone-call.jpg', '4-heist-over-the-city.jpg']);
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
  for (const name of [...SHOWCASE_DIRECTOR_SCENES, 'dusk-on-foot', 'city-map', 'manta-cockpit-dawn', 'manta-cockpit-apron', 'manta-exterior-cut']) {
    assert.ok(registered.has(name), `${name} has no scene`);
  }
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
  // A theft, not a fight (the owner's rule): the stage's targeting hint is put away, the pair's guns held.
  assert.match(cockpit, /mission\.rt\?\.hint\?\.\(null\)/);
  assert.match(cockpit, /holdFire: \d+/);
  assert.doesNotMatch(cockpit, /GUIDED_BOMB|TARGETING|MISSILE|LOCK_ON/);
  // An escape, not an intercept: the pair is held far back on the trail, out of the glass, and the
  // objective is the owner's getaway wording, not the stage's radar-tower objective.
  assert.match(cockpit, /behind: (\d{4})/);
  assert.ok(Number(/behind: (\d{4})/.exec(cockpit)[1]) >= 1500);
  assert.doesNotMatch(cockpit, /showUno|UNO_DISTANCE/);
  assert.match(cockpit, /OBJECTIVE = 'Steal the bomber and lose the air patrol'/);
  assert.match(cockpit, /mission\.rt\?\.objective\?\.\(OBJECTIVE\)/);
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

test('picture 4, the heist over the city: an escape from the hunters, never a fight', () => {
  const heist = read('game/src/showcase/heistOverTheCity.js');
  // The real mission (checkpoint 3, in the air) with the stolen Manta Sombra.
  assert.match(heist, /startFinalArc\(game, \{ checkpoint: 3, aircraftId: AIRCRAFT/);
  assert.match(heist, /const AIRCRAFT = 'manta_sombra';/);
  // The objective reads as a getaway.
  const objective = /const OBJECTIVE = '([^']+)';/.exec(heist)[1];
  assert.equal(objective, 'Lose the air patrol');
  assert.match(heist, /mission\.rt\?\.objective\?\.\(OBJECTIVE\)/);
  assert.match(heist, /mission\.rt\?\.hint\?\.\(null\)/);
  // The radio line on screen: Halcón Uno, red (the hunters), ordering it down; a voiced line of the script.
  const lineId = /const RADIO_LINE = '([^']+)';/.exec(heist)[1];
  const line = FINAL_ARC_LINES[lineId];
  assert.ok(line, `${lineId} is a line of the script`);
  assert.equal(FINAL_ARC_SPEAKERS[line.speaker].name, 'Halcón Uno');
  assert.equal(line.tone ?? FINAL_ARC_SPEAKERS[line.speaker].tone, 'red');
  assert.match(line.text, /follow us/i);
  assert.match(heist, /STORY_LINE_SPEAK, \{ lineId: RADIO_LINE, hold: true \}/);
  // Nothing armed or fired: the guns held, the bomb put away, no weapon or firing word on screen.
  assert.match(heist, /holdFire: HOLD_FIRE/);
  assert.ok(Number(/const HOLD_FIRE = (\d+);/.exec(heist)[1]) >= 60);
  assert.match(heist, /flags\.set\(WORLD_FLAGS\.GUIDED_BOMB_LOADED, false\)/);
  const shown = [objective, line.text, FINAL_ARC_SPEAKERS[line.speaker].name].join(' ');
  assert.doesNotMatch(shown, /weapon|missile|bomb|fire|shoot|shot|target|lock|kill|attack|engag|strike|destroy/i);
  assert.doesNotMatch(heist, /warningShots|GUIDED_BOMB_RELEASE|TARGETING|MISSILE|LOCK_ON|cut_bomb/);
  // The view chosen explicitly (flights start in the cockpit), then its own exterior camera held.
  assert.match(heist, /const FLIGHT_VIEW = 'chase';/);
  assert.match(heist, /setFlightView\?\.\(FLIGHT_VIEW\)/);
  assert.match(heist, /GAME_COMMANDS\.CAMERA_CUT_TO/);
  // Pursued by the pair beside and behind it, with wanted stars; no police helicopter, no searchlight,
  // and the pair's burner out (no tail glow that reads as a fight).
  assert.match(heist, /AIR_DEFENCE_SCRAMBLE, \{ reason: 'mission' \}/);
  assert.doesNotMatch(heist, /forceHelicopter = true|searchlight|\.place\(/);
  assert.match(heist, /forceHelicopter = false/);
  assert.match(heist, /jet\.afterburner = false/);
  assert.match(heist, /WANTED_SET_LEVEL/);
  // Over the city, low among the towers, at sunset: the sun at or just under the horizon (19:30),
  // in the lamps' hour, and not picture 3's blue hour on the street.
  assert.match(heist, /key: 'gran_via_marazul'/);
  assert.doesNotMatch(heist, /dawnHours/);
  assert.match(heist, /hours: sunsetHours\(query\)/);
  const sunset = Number(/const SUNSET_HOURS = ([\d.]+);/.exec(heist)[1]);
  assert.ok(sunset >= 19.45 && sunset <= 19.7, `sunset hour ${sunset}`);
});

test('no word the HUD shows in the final mission\'s flight reads as combat', async () => {
  const { airWantedWord } = await import('../../../game/src/flight/defence/airWantedLevel.js');
  const words = ['scramble', 'intercept', 'formate', 'order', 'escort', 'warningShots', 'fire', 'searching', 'returning', 'idle']
    .map((stage) => airWantedWord(stage, 3));
  for (const word of words) assert.doesNotMatch(word, /WEAPON|LETHAL|INTERCEPT\b|FIRE|SHOOT|KILL|ENGAGE/);
  for (const id of ['blind_radar', 'interception']) assert.doesNotMatch(finalStage(id).objective, /interceptor|bomb|blind|destroy|attack/i);
  assert.equal(finalStage('interception').objective, 'Lose the air patrol');
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
