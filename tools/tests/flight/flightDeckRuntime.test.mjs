// The flight deck's runtime against a stand-in game context: it wakes when the lead takes an
// airplane's controls, reads the instruments once a frame, draws the HUD on its canvas, picks the
// HUD for the camera view, paints the cockpit panel through the injected surface, feeds the GPS
// waypoint to the autopilot once, flashes AP OFF after a disconnect, and puts everything away when
// he leaves. No browser: the document, canvas and systems are fakes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlightDeck } from '../../../game/src/flight/deck/flightDeckRuntime.js';
import { GAME_EVENTS } from '../../../game/src/core/events/gameEvents.js';
import { createRecordingContext, makeReadout } from './flightDeckTestKit.mjs';

function makeWorld(options = {}) {
  const handlers = new Map();
  const hudClasses = new Set();
  const canvases = [];
  const document = {
    createElement() {
      const canvas = { hidden: false, width: 0, height: 0, className: '', removed: false, ctx: createRecordingContext(), getContext() { return this.ctx; }, remove() { this.removed = true; } };
      canvases.push(canvas);
      return canvas;
    },
  };
  const hudRoot = { append() {}, classList: { add: (name) => hudClasses.add(name), remove: (name) => hudClasses.delete(name) } };
  const state = { rpm: 0.8, autopilotDisengaged: 0 };
  const routes = [];
  const airplane = {
    state, tuning: { retractableGear: true, flapNotches: [0, 15], kind: 'jet' },
    setAutopilotRoute(route) { routes.push(route); },
  };
  const entity = { id: 7, tags: new Set(['airplane']), position: { x: 0, y: 500, z: 0 }, data: { modelId: options.modelId ?? 'manta_sombra' } };
  const car = { id: 8, tags: new Set(), position: { x: 0, y: 0, z: 0 }, data: { modelId: 'suv' } };
  const world = {
    player: { vehicle: null }, followCamera: { flightView: 'chase' }, minimap: { waypoint: null, gps: null },
    painted: [], panels: [], routes, airplane, entity, canvases, hudClasses, readCount: 0,
  };
  const systems = {
    player: world.player, followCamera: world.followCamera, minimap: world.minimap,
    vehicles: { physicsOf: (id) => (id === 7 ? airplane : id === 8 ? { speed: 3 } : null), modelOf: (id) => (id === 7 ? { name: 'model' } : null) },
  };
  const catalog = {
    manta_sombra: { id: 'manta_sombra', flight: { kind: 'jet', cockpit: 'glass_four', retractableGear: true, flapNotches: [0, 15], stallSpeedClean: 44, neverExceedSpeed: 290 } },
    halcon: { id: 'halcon', flight: { kind: 'jet', cockpit: null, retractableGear: true, flapNotches: [0, 20] } },
  };
  world.context = {
    entities: { get: (id) => (id === 7 ? entity : id === 8 ? car : null) },
    events: { on(topic, handler) { handlers.set(topic, handler); return () => handlers.delete(topic); } },
    page: { document, element: () => hudRoot },
    systems: { find: (name) => systems[name] ?? null },
    content: { find: () => ({ VEHICLE_CATALOG: catalog }) },
    assets: { get: () => ({ extras: { panel_size: [2, 0.5] } }) },
    state: { simulates: true },
    view: { width: 1280, height: 720, camera: { fov: 60, position: { x: 0, y: 500, z: 30 } } },
  };
  world.instruments = {
    createInstrumentReadout: () => makeReadout(),
    readInstruments(plane, out) {
      world.readCount += 1;
      Object.assign(out, makeReadout(world.next ?? {}));
      return out;
    },
  };
  world.surface = (doc, model, kind, size, speeds) => {
    const panel = { kind, size, speeds, model, paints: 0, disposed: false, paint(readout, extra) { this.paints += 1; this.extra = extra; }, dispose() { this.disposed = true; } };
    world.panels.push(panel);
    return panel;
  };
  world.emit = (topic, payload) => handlers.get(topic)?.(payload);
  world.handlers = handlers;
  return world;
}

test('the deck sleeps on foot and in a car, and wakes in an airplane', () => {
  const world = makeWorld();
  const deck = createFlightDeck(world.context, world.instruments, world.surface);
  const canvas = world.canvases[0];
  assert.equal(canvas.hidden, true);
  deck.update(0.016);
  assert.equal(deck.active, false);
  assert.equal(deck.readout, null);
  world.player.vehicle = 8; // a car
  deck.update(0.016);
  assert.equal(deck.active, false);
  assert.equal(world.readCount, 0);
  world.player.vehicle = 7;
  deck.update(0.016);
  assert.equal(deck.active, true);
  assert.equal(world.readCount, 1, 'the instruments are read once a frame');
  assert.equal(canvas.hidden, false);
  assert.ok(world.hudClasses.has('is-flying'));
  assert.equal(canvas.width, 1280);
  assert.ok(canvas.ctx.texts.includes('KT'), 'the small speed / altitude readout');
  assert.ok(canvas.ctx.texts.includes('FT'));
  assert.equal(deck.hudMode, 'assisted', 'casual flying shows the clean ASSISTED screen');
  assert.equal(deck.screen.view, 'chase');
  world.next = { mode: 'realistic' };
  deck.update(0.016);
  assert.equal(deck.hudMode, 'simulation', 'the flight mode comes from the readout');
  world.next = null;
  // He gets out: the HUD goes, the panel's own material comes back.
  world.player.vehicle = null;
  deck.update(0.016);
  assert.equal(deck.active, false);
  assert.equal(canvas.hidden, true);
  assert.ok(!world.hudClasses.has('is-flying'));
  assert.equal(world.panels[0].disposed, true);
  deck.dispose();
  assert.equal(canvas.removed, true);
  assert.equal(world.handlers.size, 0);
});

test('the player may be an entity object or known only from the entered event', () => {
  const world = makeWorld();
  const deck = createFlightDeck(world.context, world.instruments, world.surface);
  world.player.vehicle = world.entity;
  deck.update(0.016);
  assert.equal(deck.active, true);
  world.player.vehicle = null;
  deck.update(0.016);
  assert.equal(deck.active, false);
  world.emit(GAME_EVENTS.VEHICLE_ENTERED, { vehicleId: 7, isPlayer: true, seat: 'driver' });
  deck.update(0.016);
  assert.equal(deck.active, true);
  world.emit(GAME_EVENTS.VEHICLE_EXITED, { vehicleId: 7, isPlayer: true });
  deck.update(0.016);
  assert.equal(deck.active, false);
});

test('without a cockpit model the cockpit view repaints the panel quad twenty times a second', () => {
  const world = makeWorld();
  const deck = createFlightDeck(world.context, world.instruments, world.surface);
  world.player.vehicle = 7;
  world.followCamera.flightView = 'cockpit';
  for (let i = 0; i < 60; i += 1) { deck.update(1 / 60); deck.lateUpdate(1 / 60); }
  assert.equal(deck.hudMode, 'assisted');
  assert.equal(deck.view, 'cockpit');
  assert.equal(deck.cockpitFraming, null);
  assert.equal(deck.cockpitShown, false);
  const panel = world.panels[0];
  assert.equal(panel.kind, 'glass_four');
  assert.deepEqual(panel.size, [2, 0.5]);
  assert.ok(Math.abs(panel.speeds.stallClean - 44 * 1.943844) < 1e-6);
  assert.ok(panel.paints >= 18 && panel.paints <= 22, `about 20 repaints in a second, got ${panel.paints}`);
  // From far outside the panel is left alone.
  world.followCamera.flightView = 'chase';
  world.context.view.camera.position.z = 200;
  const before = panel.paints;
  for (let i = 0; i < 60; i += 1) deck.update(1 / 60);
  assert.equal(panel.paints, before);
  // The view may also come by event when the camera has no flightView member.
  world.followCamera.flightView = undefined;
  world.emit(GAME_EVENTS.FLIGHT_VIEW_CHANGED ?? 'none', { view: 'outside' });
  if (GAME_EVENTS.FLIGHT_VIEW_CHANGED) assert.equal(deck.view, 'outside');
  // Radar contacts and the hatch reach the panel's extra data.
  deck.setContacts([{ bearingDegrees: 10, distanceNm: 5 }]);
  deck.setHatchOpen(true);
  world.followCamera.flightView = 'cockpit';
  for (let i = 0; i < 6; i += 1) deck.update(1 / 60);
  assert.equal(panel.extra.contacts.length, 1);
  assert.equal(panel.extra.hatchOpen, true);
});

test('an aircraft without a cockpit gets the screen HUD in every view, no panel and no cockpit model', () => {
  const world = makeWorld({ modelId: 'halcon' });
  const cockpits = makeCockpits(world);
  const deck = createFlightDeck(world.context, world.instruments, world.surface, cockpits);
  world.player.vehicle = 7;
  world.followCamera.flightView = 'cockpit';
  deck.update(0.016);
  deck.lateUpdate(0.016);
  assert.equal(deck.hudMode, 'assisted');
  assert.equal(world.panels.length, 0);
  assert.deepEqual(cockpits.requests, []);
  assert.equal(deck.screen.hasCombiner, false);
});

/** Stand-in cockpit models (cockpitModel.js createCockpitModels): records what the deck asks of them. */
function makeCockpits(world, options = {}) {
  const cockpits = {
    requests: [], released: [], attached: [], loaded: options.loaded ?? true, failed: false,
    has: (id) => id === 'manta_sombra' && !cockpits.failed,
    ready: (id) => id === 'manta_sombra' && cockpits.loaded,
    request(id) { cockpits.requests.push(id); return Promise.resolve(true); },
    release(id) { cockpits.released.push(id); },
    attach(id, root, kind, speeds) {
      const model = {
        id, kind, speeds, shown: false, shows: [], displayPaints: 0, combinerPaints: 0, updates: [], disposed: false,
        hasCombiner: options.hasCombiner ?? true, hasDisplays: true,
        framing: { eye: { x: -0.5, y: 4, z: -6 }, fovDegrees: 62, gazeRadians: -0.05 },
        instance: { parent: root },
        setShown(on) { this.shown = on; this.shows.push(on); },
        paintDisplays(readout, extra) { this.displayPaints += 1; this.extra = extra; },
        paintCombiner(readout, hud) { this.combinerPaints += 1; this.hud = { ...hud }; },
        update(dt, readout, input) { this.updates.push(input); },
        dispose() { this.disposed = true; this.shown = false; },
      };
      cockpits.attached.push(model);
      return model;
    },
    dispose() { cockpits.disposedAll = true; },
  };
  return cockpits;
}

/** A drawn root for the stand-in aircraft: at the entity's place, level, heading north. */
function giveRoot(world) {
  const root = { name: 'model', position: { x: 0, y: 500, z: 0 }, quaternion: { x: 0, y: 0, z: 0, w: 1 } };
  world.context.systems.find('vehicles').modelOf = (id) => (id === 7 ? root : null);
  return root;
}

test('the cockpit model: fetched on boarding, shown only with the camera at the eye, painted and lit there', () => {
  const world = makeWorld();
  const cockpits = makeCockpits(world, { loaded: false });
  const root = giveRoot(world);
  world.airplane.input = { pitch: 0.5, roll: -1, throttle: 0.8 };
  const deck = createFlightDeck(world.context, world.instruments, world.surface, cockpits);
  world.player.vehicle = 7;
  world.followCamera.flightView = 'cockpit';
  deck.update(1 / 60);
  deck.lateUpdate(1 / 60);
  assert.deepEqual(cockpits.requests, ['manta_sombra'], 'the model is asked for when the lead boards');
  assert.equal(cockpits.attached.length, 0, 'still loading: the panel quad serves');
  assert.equal(deck.cockpitFraming, null);
  assert.equal(deck.screen.hasCombiner, false);
  assert.ok(world.panels[0].paints >= 1);
  // The file arrives.
  cockpits.loaded = true;
  const camera = world.context.view.camera.position;
  camera.x = root.position.x - 0.5; camera.y = root.position.y + 4; camera.z = root.position.z - 6; // at the eye
  const quadPaints = world.panels[0].paints;
  for (let i = 0; i < 60; i += 1) { deck.update(1 / 60); deck.lateUpdate(1 / 60); }
  const model = cockpits.attached[0];
  assert.ok(model, 'attached once in memory');
  assert.equal(model.kind, 'glass_four');
  assert.ok(Math.abs(model.speeds.stallClean - 44 * 1.943844) < 1e-6);
  assert.equal(model.shown, true);
  assert.equal(deck.cockpitShown, true);
  assert.deepEqual(deck.cockpitFraming, model.framing);
  assert.ok(model.displayPaints >= 18 && model.displayPaints <= 22, `faces at about 20 Hz, got ${model.displayPaints}`);
  assert.ok(model.combinerPaints >= 59, 'the combiner is repainted every frame for the ladder');
  assert.ok(world.panels[0].paints <= quadPaints + 1, 'the hidden panel quad is left alone once the model shows');
  assert.equal(model.updates.at(-1), world.airplane.input, 'the controls follow the aircraft input');
  const screen = deck.screen;
  assert.equal(screen.hasCombiner, true);
  assert.equal(screen.view, 'cockpit');
  assert.equal(screen.mode, 'assisted');
  assert.equal(model.hud.view, 'cockpit');
  assert.equal(model.hud.jet, true);
  // A scene holds the camera outside while the view still says cockpit: the model rests.
  camera.z = root.position.z + 40;
  deck.update(1 / 60);
  deck.lateUpdate(1 / 60);
  assert.equal(model.shown, false);
  deck.update(1 / 60);
  assert.equal(deck.screen.hasCombiner, false);
  camera.z = root.position.z - 6;
  deck.lateUpdate(1 / 60);
  assert.equal(model.shown, true);
  // Another view: hidden; the quad is painted again from near by.
  world.followCamera.flightView = 'chase';
  camera.z = root.position.z + 8;
  for (let i = 0; i < 30; i += 1) { deck.update(1 / 60); deck.lateUpdate(1 / 60); }
  assert.equal(model.shown, false);
  assert.ok(world.panels[0].paints > quadPaints);
  // He gets out: the model leaves the aircraft and its memory is freed.
  world.player.vehicle = null;
  deck.update(1 / 60);
  assert.equal(model.disposed, true);
  assert.deepEqual(cockpits.released, ['manta_sombra']);
  assert.doesNotThrow(() => deck.lateUpdate(1 / 60));
  deck.dispose();
  assert.equal(cockpits.disposedAll, true);
});

test('a cockpit model that fails to load or to attach leaves the panel quad in charge', () => {
  const world = makeWorld();
  const cockpits = makeCockpits(world);
  giveRoot(world);
  cockpits.attach = () => null;
  const deck = createFlightDeck(world.context, world.instruments, world.surface, cockpits);
  world.player.vehicle = 7;
  world.followCamera.flightView = 'cockpit';
  for (let i = 0; i < 30; i += 1) { deck.update(1 / 60); assert.doesNotThrow(() => deck.lateUpdate(1 / 60)); }
  assert.equal(deck.cockpitShown, false);
  assert.ok(world.panels[0].paints >= 8);
  // And one that failed while loading.
  const other = makeWorld();
  const failing = makeCockpits(other, { loaded: false });
  const second = createFlightDeck(other.context, other.instruments, other.surface, failing);
  other.player.vehicle = 7;
  second.update(1 / 60);
  failing.failed = true;
  for (let i = 0; i < 10; i += 1) { second.update(1 / 60); second.lateUpdate(1 / 60); }
  assert.equal(failing.attached.length, 0);
  assert.equal(second.active, true);
});

test('a loading cockpit model is background work until it is on the aircraft (a screenshot waits for it)', () => {
  const world = makeWorld();
  const cockpits = makeCockpits(world, { loaded: false });
  giveRoot(world);
  const work = { begun: [], finished: 0, begin(label) { work.begun.push(label); return () => { work.finished += 1; }; } };
  world.context.work = work;
  const deck = createFlightDeck(world.context, world.instruments, world.surface, cockpits);
  world.player.vehicle = 7;
  deck.update(1 / 60);
  assert.equal(work.begun.length, 1);
  assert.match(work.begun[0], /manta_sombra/);
  assert.equal(work.finished, 0);
  cockpits.loaded = true;
  deck.update(1 / 60);
  assert.equal(work.finished, 1, 'attached: nothing is loading any more');
  world.player.vehicle = null;
  deck.update(1 / 60);
  assert.equal(work.finished, 1, 'reported once');
  // Leaving before it arrived also ends the wait; so does a load that takes too long.
  cockpits.loaded = false;
  world.player.vehicle = 7;
  deck.update(1 / 60);
  world.player.vehicle = null;
  deck.update(1 / 60);
  assert.equal(work.finished, 2);
  world.player.vehicle = 7;
  for (let i = 0; i < 25 * 20; i += 1) deck.update(1 / 20);
  assert.equal(work.finished, 3);
  assert.equal(deck.active, true);
});

test('the launch flags for an aircraft in the cockpit view fetch its cockpit model at once', () => {
  const world = makeWorld();
  const cockpits = makeCockpits(world);
  world.context.launch = { aircraft: 'manta_sombra', flightView: 'cockpit' };
  createFlightDeck(world.context, world.instruments, world.surface, cockpits);
  assert.deepEqual(cockpits.requests, ['manta_sombra']);
});

test('the waypoint becomes the autopilot route, once', () => {
  const world = makeWorld();
  const deck = createFlightDeck(world.context, world.instruments, world.surface);
  world.player.vehicle = 7;
  for (let i = 0; i < 90; i += 1) deck.update(1 / 60);
  assert.equal(world.routes.length, 0, 'no waypoint, no route');
  world.minimap.waypoint = { x: 3000, y: 0, z: -4000 };
  for (let i = 0; i < 90; i += 1) deck.update(1 / 60);
  assert.equal(world.routes.length, 1);
  assert.deepEqual(world.routes[0], [{ x: 3000, z: -4000 }]);
  // A road route to it replaces the direct leg; then it holds.
  world.minimap.gps = { waypointRoute: { points: new Float32Array([0, 0, 3000, 0, 3000, -4000]), count: 3 }, objectiveRoute: { points: new Float32Array(2), count: 0 } };
  for (let i = 0; i < 180; i += 1) deck.update(1 / 60);
  assert.equal(world.routes.length, 2);
  assert.deepEqual(world.routes[1].at(-1), { x: 3000, z: -4000 });
  // Cleared: the autopilot is told so.
  world.minimap.waypoint = null;
  world.minimap.gps = null;
  for (let i = 0; i < 60; i += 1) deck.update(1 / 60);
  assert.equal(world.routes.at(-1), null);
});

test('AP OFF flashes after the autopilot lets go, and the HUD hides while the game is paused', () => {
  const world = makeWorld();
  const deck = createFlightDeck(world.context, world.instruments, world.surface);
  const canvas = world.canvases[0];
  world.player.vehicle = 7;
  deck.update(0.016);
  assert.ok(!canvas.ctx.texts.includes('AP OFF'));
  world.airplane.state.autopilotDisengaged = 1;
  deck.update(0.016);
  assert.ok(canvas.ctx.texts.includes('AP OFF'));
  world.next = { stallWarning: true };
  deck.update(0.016);
  assert.ok(canvas.ctx.texts.includes('STALL'));
  world.context.state.simulates = false;
  deck.update(0.016);
  assert.equal(canvas.hidden, true);
  world.context.state.simulates = true;
  deck.update(0.016);
  assert.equal(canvas.hidden, false);
});

test('an aircraft whose model is not loaded (the placeholder) still gets its HUD and a default panel size', () => {
  const world = makeWorld();
  world.context.assets = { has: () => false, get: () => { throw new Error('asset is not loaded'); } };
  const deck = createFlightDeck(world.context, world.instruments, world.surface);
  world.player.vehicle = 7;
  assert.doesNotThrow(() => deck.update(0.016));
  assert.equal(deck.active, true);
  assert.equal(world.panels[0].size, undefined);
});

test('without the vehicles system or a flight state the deck stays dark', () => {
  const world = makeWorld();
  world.context.systems.find = () => null;
  const deck = createFlightDeck(world.context, world.instruments, null);
  world.emit(GAME_EVENTS.VEHICLE_ENTERED, { vehicleId: 7, isPlayer: true });
  assert.doesNotThrow(() => deck.update(0.016));
  assert.equal(deck.active, false);
});
