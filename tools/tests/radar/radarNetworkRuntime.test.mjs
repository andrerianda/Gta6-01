// The radar network's runtime on a hand-made context: the tower tracks a Manta Sombra, the bomb
// run destroys the tower (flag, event, no guidance) and is refused out of the envelope or on a
// ship, the picket follows its flag, RADAR_EMITTER_RESTORE rebuilds the tower without reloading
// the bomb; and the deck's parts: the contact lists by source, the targeting screen, the panels.
import assert from 'node:assert/strict';
import test from 'node:test';
import { SEA_AND_AIRSPACE_CHART } from '../../../game/src/catalog/seaAndAirspaceChart.js';
import { GAME_COMMANDS } from '../../../game/src/core/events/gameCommands.js';
import { GAME_EVENTS } from '../../../game/src/core/events/gameEvents.js';
import { WORLD_FLAGS, createWorldFlags } from '../../../game/src/core/state/worldFlags.js';
import { paintAnalogJetPanel } from '../../../game/src/flight/deck/analogJetPanel.js';
import { paintGlassCockpitPanel } from '../../../game/src/flight/deck/glassCockpitPanel.js';
import { createRadarContactLists } from '../../../game/src/flight/deck/radarContactLists.js';
import { paintTargetingScreen } from '../../../game/src/flight/deck/targetingDisplay.js';
import { createRadarNetwork } from '../../../game/src/flight/radar/radarNetworkRuntime.js';
import { createRecordingContext, makeReadout } from '../flight/flightDeckTestKit.mjs';

const TOWER = SEA_AND_AIRSPACE_CHART.radarTower;

/** A context with one flown aircraft; returns the network, the aircraft's state and what was published. */
function stage({ model = 'manta_sombra', stageName = null, flagsSet = [] } = {}) {
  const listeners = new Map();
  const published = [];
  const events = {
    on(topic, handler) { (listeners.get(topic) ?? listeners.set(topic, []).get(topic)).push(handler); return () => {}; },
    emit(topic, payload) { published.push([topic, payload]); for (const handler of listeners.get(topic) ?? []) handler(payload); },
  };
  const flags = createWorldFlags({ emit: events.emit, topic: GAME_EVENTS.WORLD_FLAG_CHANGED, initial: flagsSet });
  const handlers = new Map();
  const effects = [];
  const commands = {
    has: (name) => name === GAME_COMMANDS.EFFECT_SPAWN || handlers.has(name),
    run: (name, payload) => (name === GAME_COMMANDS.EFFECT_SPAWN ? effects.push(payload) : handlers.get(name)(payload)),
    handle(name, handler) { handlers.set(name, handler); return () => handlers.delete(name); },
  };
  const plane = {
    position: { x: TOWER.x - 3000, y: 1500, z: TOWER.z }, tags: new Set(['airplane']), data: { modelId: model },
    state: { heading: Math.PI / 2, pitch: 0, roll: 0, mach: 0.6, skinTemperature: 5, onGround: false, gear: 0, afterburner: 0, groundSpeed: 200, verticalSpeed: 0 },
    tuning: { retractableGear: true }, body: null,
  };
  const blasts = [];
  const systemsByName = {
    player: { vehicle: 7 },
    vehicles: { physicsOf: () => plane },
    physics: { groundHeightAt: (x) => (x > -1900 ? 6 : -4), explode: (blast) => blasts.push(blast) },
    flightDeck: { hatchOpen: false },
  };
  const context = {
    events, flags, commands, launch: { stage: stageName }, input: null,
    entities: { get: (id) => (id === 7 ? plane : null) },
    systems: { find: (name) => systemsByName[name] ?? null },
  };
  const network = createRadarNetwork(context, SEA_AND_AIRSPACE_CHART, null);
  const advance = (seconds, each = null) => {
    for (let i = 0; i < Math.round(seconds * 60); i += 1) {
      plane.position.x += Math.sin(plane.state.heading) * plane.state.groundSpeed / 60;
      plane.position.z -= Math.cos(plane.state.heading) * plane.state.groundSpeed / 60;
      network.update(1 / 60);
      if (each) each();
    }
  };
  return { network, plane, published, flags, commands, effects, blasts, advance, systemsByName };
}

const topics = (published, topic) => published.filter(([name]) => name === topic).map(([, payload]) => payload);

test('the tower tracks a Manta Sombra flown at it, then loses it when it goes low and far', () => {
  const { network, plane, published, advance } = stage();
  assert.equal(network.playerTrack.guidance, true);
  assert.deepEqual(network.emitters.map((e) => e.id), [TOWER.id]);
  advance(14); // two sweeps of six seconds and a little
  const track = network.playerTrack;
  assert.equal(track.tracked, true);
  assert.equal(track.emitterId, TOWER.id);
  assert.ok(track.quality >= 0.25 && track.signature > 0.02 && track.signature < 0.15, `nose-on signature ${track.signature}`);
  assert.equal(track.lockSeconds, 0, 'only a picket ship counts towards a lock');
  assert.deepEqual(topics(published, GAME_EVENTS.RADAR_TRACK_CHANGED).map((p) => p.tracked), [true]);
  assert.equal(network.display.vehicleId, 7);
  assert.equal(network.display.word, 'TRACKED');
  assert.equal(network.display.emitterCount, 1);
  assert.ok(Math.abs(network.display.emitters[0].bearingDegrees - 90) < 1);
  assert.ok(network.emitters[0].y > 34 && network.emitters[0].beamAzimuth >= 0);
  assert.ok(Math.abs(network.signatureOf(7) - track.signature) < 1e-9);
  assert.equal(network.signatureOf(99), 0);
  // Away to the west, low over the sea: out of reach, the track decays.
  plane.position.x = TOWER.x - 9000;
  plane.position.y = 60;
  plane.state.heading = (3 * Math.PI) / 2;
  advance(20);
  assert.equal(network.playerTrack.tracked, false);
  assert.deepEqual(topics(published, GAME_EVENTS.RADAR_TRACK_CHANGED).map((p) => p.tracked), [true, false]);
});

test('a bomb run destroys the tower: flag, event, wreck, no guidance, no track', () => {
  const { network, plane, published, flags, commands, effects, blasts, advance } = stage({ stageName: 'bomb' });
  assert.equal(flags.get(WORLD_FLAGS.GUIDED_BOMB_LOADED), true, 'the stage loads the bomb');
  advance(0.1);
  const targeting = network.display.targeting;
  assert.equal(targeting.active, true, 'the stage switches the targeting screen on');
  assert.equal(targeting.targetName, TOWER.name);
  assert.equal(targeting.valid, true);
  assert.equal(targeting.bombs, 1);
  assert.equal(targeting.terrain.size, 25);
  // 3 km out is short of the unguided range of about 3.5 km: wait for the cue.
  let waited = 0;
  while (!targeting.solution.inEnvelope && waited < 20) { advance(0.25); waited += 0.25; }
  assert.equal(targeting.solution.reason, 'RELEASE');
  assert.equal(network.bombRun.bayOpen, true, 'armed in the envelope: the bay is open');
  const quiet = network.playerTrack.signature;
  assert.ok(quiet > 0.3, `the open bay shows, got ${quiet}`);
  assert.equal(commands.run(GAME_COMMANDS.GUIDED_BOMB_RELEASE, {}), true);
  assert.equal(flags.get(WORLD_FLAGS.GUIDED_BOMB_LOADED), false, 'the one bomb is gone');
  assert.equal(commands.run(GAME_COMMANDS.GUIDED_BOMB_RELEASE, {}), false, 'there is no second bomb');
  assert.equal(topics(published, GAME_EVENTS.GUIDED_BOMB_RELEASED)[0].targetId, TOWER.id);
  advance(25);
  const impact = topics(published, GAME_EVENTS.GUIDED_BOMB_IMPACT)[0];
  assert.ok(impact && impact.hit && impact.missDistance < 10, JSON.stringify(impact));
  assert.equal(flags.get(WORLD_FLAGS.RADAR_TOWER_DESTROYED), true);
  const destroyed = topics(published, GAME_EVENTS.RADAR_EMITTER_DESTROYED);
  assert.equal(destroyed.length, 1);
  assert.equal(destroyed[0].emitterId, TOWER.id);
  assert.equal(destroyed[0].kind, 'tower');
  assert.equal(network.emitters[0].alive, false);
  assert.equal(network.playerTrack.guidance, false);
  assert.equal(network.playerTrack.tracked, false);
  assert.ok(effects.length >= 3 && effects.some((e) => e.scale >= 6), 'the largest blast');
  assert.equal(blasts.length, 1);
  // The retry rebuilds the tower and reloads nothing.
  commands.run(GAME_COMMANDS.RADAR_EMITTER_RESTORE, {});
  assert.equal(network.emitters[0].alive, true);
  assert.equal(network.playerTrack.guidance, true);
  assert.equal(flags.get(WORLD_FLAGS.RADAR_TOWER_DESTROYED), false);
  assert.equal(flags.get(WORLD_FLAGS.GUIDED_BOMB_LOADED), false);
  void plane;
});

test('the release is refused out of the envelope, without a bomb, in another aircraft and on a ship', () => {
  const far = stage({ stageName: 'bomb' });
  far.plane.position.x = TOWER.x - 7000;
  far.advance(0.2);
  assert.equal(far.network.display.targeting.solution.reason, 'TOO FAR');
  assert.equal(far.network.releaseBomb(), false);
  assert.equal(far.flags.get(WORLD_FLAGS.GUIDED_BOMB_LOADED), true, 'the bomb stays in the bay');
  assert.equal(far.network.bombRun.bayOpen, false);

  const empty = stage();
  empty.plane.position.x = TOWER.x - 3500;
  empty.advance(0.2);
  assert.equal(empty.network.releaseBomb(), false, 'free roam: no bomb loaded');
  assert.equal(empty.network.display.targeting.active, false);

  const jet = stage({ model: 'garza_negra', stageName: 'bomb' });
  jet.plane.position.x = TOWER.x - 3500;
  jet.advance(0.2);
  assert.equal(jet.network.releaseBomb(), false);
  assert.equal(jet.network.display.targeting.active, false);

  // Over the picket: the nearest emitter ahead is a ship; it is designated but may not be bombed.
  const ship = SEA_AND_AIRSPACE_CHART.navyPicket[0];
  const sea = stage({ stageName: 'bomb', flagsSet: [WORLD_FLAGS.NAVY_PICKET_ACTIVE] });
  sea.plane.position.x = ship.x - 1500;
  sea.plane.position.z = ship.z;
  sea.advance(0.2);
  const targeting = sea.network.display.targeting;
  assert.equal(targeting.targetName, ship.name);
  assert.equal(targeting.valid, false);
  assert.equal(sea.network.releaseBomb(), false);
  assert.equal(sea.flags.get(WORLD_FLAGS.GUIDED_BOMB_LOADED), true);
  assert.equal(sea.network.bombRun.bayOpen, false);
});

test('the picket follows its flag, steams, and a held ship track counts the lock seconds', () => {
  const { network, plane, flags, advance } = stage({ model: 'gaviota_t2' });
  assert.equal(network.emitters.length, 1);
  flags.set(WORLD_FLAGS.NAVY_PICKET_ACTIVE, true);
  assert.deepEqual(network.emitters.map((e) => e.kind), ['tower', 'ship', 'ship', 'ship']);
  const ship = network.emitters[1];
  // A conventional aircraft circling slowly a kilometre from the first ship is held.
  plane.state.groundSpeed = 0;
  plane.position.x = ship.x + 900;
  plane.position.z = ship.z;
  plane.position.y = 600;
  const from = { x: ship.x, z: ship.z };
  advance(40);
  assert.ok(Math.hypot(ship.x - from.x, ship.z - from.z) > 50, 'the ship steams');
  assert.equal(network.playerTrack.tracked, true);
  assert.ok(network.playerTrack.lockSeconds > 15, `lock seconds ${network.playerTrack.lockSeconds}`);
  assert.equal(network.display.emitterCount, 4);
  flags.set(WORLD_FLAGS.NAVY_PICKET_ACTIVE, false);
  advance(0.1);
  assert.equal(network.emitters.length, 1);
  assert.equal(network.playerTrack.lockSeconds, 0);
  // A mission that sets the flag itself also kills the tower's guidance.
  flags.set(WORLD_FLAGS.RADAR_TOWER_DESTROYED, true);
  assert.equal(network.playerTrack.guidance, false);
  assert.equal(network.emitters[0].alive, false);
});

test('the contact lists: one per source, merged; the one-argument call still works', () => {
  const lists = createRadarContactLists();
  const merged = lists.merged;
  assert.equal(lists.set([{ bearingDegrees: 10, distanceNm: 5 }]), merged);
  assert.equal(merged.length, 1);
  lists.set([{ bearingDegrees: 80, distanceNm: 3, hostile: true }, { bearingDegrees: 85, distanceNm: 3.2, hostile: true }], 'airGuard');
  lists.set([{ bearingDegrees: 200, distanceNm: 9, hostile: false }], 'radar');
  assert.equal(merged.length, 4);
  assert.deepEqual(lists.sources(), ['default', 'airGuard', 'radar']);
  lists.set([{ bearingDegrees: 81, distanceNm: 2.5, hostile: true }], 'airGuard');
  assert.deepEqual(merged.map((c) => c.bearingDegrees), [10, 81, 200]);
  lists.set(null, 'airGuard');
  lists.set(undefined);
  assert.deepEqual(merged.map((c) => c.bearingDegrees), [200]);
  lists.clear();
  assert.equal(merged.length, 0);
});

test('the cockpit: the signature display, the targeting screen and the warning lamp paint from the network', () => {
  const { network, advance } = stage({ stageName: 'bomb' });
  advance(14);
  const display = network.display;
  const layout = { width: 2048, height: 512, trace: {} };
  const ctx = createRecordingContext();
  paintGlassCockpitPanel(ctx, makeReadout({ headingDegrees: 90, gearDown: false }), layout, { position: { x: 0, z: 0 }, contacts: [], timeSeconds: 3.1, radar: display });
  assert.equal(layout.trace.signature, display.signature);
  assert.equal(layout.trace.radarEmitters, 1);
  assert.equal(layout.trace.radarTracked, 1);
  assert.ok(layout.trace.targetingSegments > 100, `the relief of the cape is drawn, got ${layout.trace.targetingSegments}`);
  assert.ok(Math.abs(layout.trace.targetingRange - display.targeting.solution.range) < 1e-6);
  assert.ok(ctx.texts.includes('TRACKED') && ctx.texts.includes('RADAR TRACKED') && ctx.texts.includes('RADAR CABO LEJANO'));
  assert.ok(ctx.texts.some((text) => text.startsWith('RNG ')));
  // The screen alone, with nothing designated and with a bomb on its way.
  const bare = createRecordingContext();
  const data = { ...display.targeting, target: null, terrain: null, bombs: 0 };
  assert.doesNotThrow(() => paintTargetingScreen(bare, data, 0, 0, 300, 300, null));
  assert.ok(bare.texts.includes('NO BOMB') && bare.texts.includes('NO TARGET'));
  const away = createRecordingContext();
  paintTargetingScreen(away, { ...display.targeting, bombAway: true, timeToImpact: 9.4, bomb: { x: TOWER.x - 800, y: 700, z: TOWER.z } }, 0, 0, 300, 300, null);
  assert.ok(away.texts.includes('BOMB AWAY') && away.texts.includes('TTI 9 S'));
  // The Garza Negra's lamp.
  const analog = { width: 1024, height: 512, trace: {} };
  paintAnalogJetPanel(createRecordingContext(), makeReadout(), analog, { radar: display });
  assert.equal(analog.trace.radarWarning, 1);
  paintAnalogJetPanel(createRecordingContext(), makeReadout(), analog);
  assert.equal(analog.trace.radarWarning, 0);
});
