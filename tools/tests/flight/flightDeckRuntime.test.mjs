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
  assert.ok(canvas.ctx.texts.includes('ASSISTED'));
  assert.ok(canvas.ctx.texts.includes('GEAR DN'));
  assert.equal(deck.hudMode, 'full');
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

test('the cockpit view shows the combiner HUD and repaints the panel twenty times a second', () => {
  const world = makeWorld();
  const deck = createFlightDeck(world.context, world.instruments, world.surface);
  world.player.vehicle = 7;
  world.followCamera.flightView = 'cockpit';
  for (let i = 0; i < 60; i += 1) deck.update(1 / 60);
  assert.equal(deck.hudMode, 'combiner');
  assert.equal(deck.view, 'cockpit');
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
  assert.equal(deck.hudMode, 'full');
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

test('an aircraft without a cockpit gets the full HUD in every view and no panel', () => {
  const world = makeWorld({ modelId: 'halcon' });
  const deck = createFlightDeck(world.context, world.instruments, world.surface);
  world.player.vehicle = 7;
  world.followCamera.flightView = 'cockpit';
  deck.update(0.016);
  assert.equal(deck.hudMode, 'full');
  assert.equal(world.panels.length, 0);
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
