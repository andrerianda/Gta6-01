// The flight cameras (player/aircraftCameras.js) against a stand-in game context: every flight
// starts in the cockpit, an old saved 'chase' is not read, a view asked for by the launch or a
// scene (&flightview, setView) holds for that flight, C cycles cockpit > chase > outside, leaving
// the aircraft brings the next flight back to the cockpit, the cockpit view waits outside on the
// chase framing while the cockpit model is still loading, and the chase camera sits near enough
// that the wings fill the share of the screen asked for, clear of the tail, for each aircraft.
// aircraftCameras.js imports three.js by its bare name (the page's import map): mapped here to the vendored copy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

const threeUrl = new URL('../../../game/vendor/three/three.module.min.js', import.meta.url).href;
register(`data:text/javascript,${encodeURIComponent(`export async function resolve(s, c, n) { return s === 'three' ? { url: ${JSON.stringify(threeUrl)}, shortCircuit: true } : n(s, c); }`)}`);
const THREE = await import('three');
const {
  CHASE_FRAMING, DEFAULT_FLIGHT_VIEW, FLIGHT_FRAMING, FLIGHT_VIEWS, chaseDistanceOf, chaseLiftOf, createAircraftCameras,
} = await import('../../../game/src/player/aircraftCameras.js');
const { GAME_EVENTS } = await import('../../../game/src/core/events/gameEvents.js');
const { VEHICLE_CATALOG } = await import('../../../game/src/catalog/vehicleCatalog.js');

/** The drawn models' bounds (lod0, aircraft frame: nose to -z, origin on the wheels' plane), metres. */
const MODEL_BOUNDS = Object.freeze({
  manta_sombra: { tailZ: 9.6, topY: 4.54, halfSpan: 23 },
  garza_negra: { tailZ: 13.48, topY: 5.4, halfSpan: 8.24 },
  gaviota_t2: { tailZ: 4.3, topY: 2.65, halfSpan: 4.34 },
});

function makeWorld({ modelId = 'manta_sombra', pending = false, saved = 'chase' } = {}) {
  const entry = VEHICLE_CATALOG[modelId];
  const root = new THREE.Object3D();
  root.position.set(100, 600, -200);
  root.updateMatrixWorld();
  const emitted = [];
  const deck = { active: true, cockpitFraming: null, pending, asked: [], cockpitPendingFor(id) { deck.asked.push(id); return deck.pending; } };
  const record = {
    rig: { root }, entry, craft: { boarding: { eye: new THREE.Vector3(-0.5, 4, -6.3) } },
    car: { state: { airspeed: entry.flight.cruiseSpeed }, tuning: { cruiseSpeed: entry.flight.cruiseSpeed } },
  };
  const systems = { vehicles: { get: (id) => (id === 7 ? record : null) }, flightDeck: deck, openWorldCity: null };
  const context = {
    systems: { find: (name) => systems[name] ?? null },
    events: { emit: (topic, payload) => emitted.push({ topic, ...payload }) },
    settings: { get: (key) => (key === 'flightView' || key === 'gameplay.flightView' ? saved : undefined) },
  };
  const camera = new THREE.PerspectiveCamera(58, 1280 / 800, 0.1, 6000);
  const vehicle = { id: 7, tags: new Set(['airplane']), data: { modelId, speed: entry.flight.cruiseSpeed } };
  const look = { lookX: 0, lookY: 0, sensitivity: 0.0022, invertY: false };
  const out = { near: 0.1 };
  const cameras = createAircraftCameras(context);
  const frame = (dt = 1 / 60) => { assert.equal(cameras.frame(camera, vehicle, look, dt, 58, out), true); return cameras.active; };
  return { cameras, camera, root, deck, emitted, entry, frame, out };
}

test('every flight starts in the cockpit, whatever an old version saved', () => {
  assert.equal(DEFAULT_FLIGHT_VIEW, 'cockpit');
  const world = makeWorld({ saved: 'chase' });
  assert.equal(world.cameras.active, null, 'not flying yet');
  assert.equal(world.frame(), 'cockpit');
  assert.equal(world.cameras.view, 'cockpit');
  assert.deepEqual(world.emitted.map((each) => [each.topic, each.view]), [[GAME_EVENTS.FLIGHT_VIEW_CHANGED, 'cockpit']]);
  // At the pilot's eye (the boarding eye without a model), with the cockpit's small near plane.
  const eye = new THREE.Vector3(-0.5, 4, -6.3).add(world.root.position);
  assert.ok(world.camera.position.distanceTo(eye) < 1e-6);
  assert.equal(world.out.near, FLIGHT_FRAMING.cockpitNear);
});

test('a view asked for through setView (&flightview, a scene) holds for that flight only', () => {
  const world = makeWorld();
  assert.equal(world.cameras.setView('chase'), true, 'asked for before boarding, as the launch does');
  assert.equal(world.cameras.setView('upside'), false);
  assert.equal(world.frame(), 'chase');
  world.frame();
  assert.equal(world.cameras.active, 'chase');
  world.cameras.release(world.camera);
  assert.equal(world.cameras.active, null);
  assert.equal(world.emitted.at(-1).view, null, 'leaving is announced as no view');
  assert.equal(world.frame(), 'cockpit', 'the next flight starts in the cockpit again');
  // A scene may ask mid-flight too (the showcase's manta-cockpit-dawn).
  world.cameras.setView('outside');
  assert.equal(world.frame(), 'outside');
});

test('C cycles cockpit, chase, outside and back; leaving resets to the cockpit', () => {
  assert.deepEqual([...FLIGHT_VIEWS], ['cockpit', 'chase', 'outside']);
  const world = makeWorld();
  const seen = [world.frame()];
  for (let i = 0; i < 3; i += 1) { world.cameras.cycle(); seen.push(world.frame()); }
  assert.deepEqual(seen, ['cockpit', 'chase', 'outside', 'cockpit']);
  world.cameras.cycle();
  assert.equal(world.frame(), 'chase');
  world.cameras.release(world.camera);
  assert.equal(world.cameras.view, 'cockpit');
  assert.equal(world.frame(), 'cockpit');
});

test('while the cockpit model loads the cockpit view waits outside on the chase framing', () => {
  const world = makeWorld({ pending: true });
  assert.equal(world.frame(), 'chase', 'shown (and announced) as chase: no cockpit without its model');
  assert.equal(world.cameras.view, 'cockpit', 'still the chosen view');
  assert.deepEqual(world.deck.asked.slice(0, 1), [7], 'asked for the flown aircraft');
  const behind = world.camera.position.clone().sub(world.root.position);
  assert.ok(behind.z > 20 && behind.y > 5, `placed behind and above, got ${behind.toArray().map((v) => v.toFixed(1))}`);
  assert.ok(world.out.near >= 0.3, 'the chase near plane, not the cockpit one');
  world.deck.pending = false;
  assert.equal(world.frame(), 'cockpit', 'in at once when the model is on');
  assert.deepEqual(world.emitted.map((each) => each.view), ['chase', 'cockpit']);
  // A chase or outside view never asks.
  const other = makeWorld({ pending: true });
  other.cameras.setView('outside');
  assert.equal(other.frame(), 'outside');
});

/** The share of the screen's width the wings fill, and the camera's place in the aircraft's frame. */
function chaseFraming(modelId) {
  const world = makeWorld({ modelId });
  world.cameras.setView('chase');
  world.root.quaternion.setFromEuler(new THREE.Euler(0, 0.7, 0, 'YXZ')); // any heading
  world.root.updateMatrixWorld();
  world.frame(0);
  world.camera.updateMatrixWorld();
  const { width } = world.entry.dimensions;
  const lift = chaseLiftOf(world.entry.dimensions);
  const tips = [-width / 2, width / 2].map((x) => new THREE.Vector3(x, lift, 0).applyMatrix4(world.root.matrixWorld).project(world.camera));
  const local = world.root.worldToLocal(world.camera.position.clone());
  return { share: Math.abs(tips[1].x - tips[0].x) / 2, local, near: world.out.near, fov: world.camera.fov };
}

test('the chase camera: the Manta fills 40-55 % of the width, every aircraft clear of its tail', () => {
  const distances = {};
  for (const modelId of Object.keys(MODEL_BOUNDS)) {
    const { share, local, near, fov } = chaseFraming(modelId);
    const bounds = MODEL_BOUNDS[modelId];
    const distance = chaseDistanceOf(VEHICLE_CATALOG[modelId].dimensions);
    distances[modelId] = distance;
    assert.ok(Math.abs(fov - CHASE_FRAMING.fov) < 1e-6, 'measured at cruise, where the lens is widest');
    // The camera sits behind the tail by more than a few metres and above the fin's top.
    assert.ok(local.z - bounds.tailZ > Math.max(4, 10 * near), `${modelId}: ${(local.z - bounds.tailZ).toFixed(1)} m behind the tail`);
    assert.ok(local.y > bounds.topY, `${modelId}: ${local.y.toFixed(1)} m up, the fin's top at ${bounds.topY}`);
    // Never inside the model however the mouse swings it (100 degrees each way) or the orbit turns.
    assert.ok(distance > Math.hypot(bounds.halfSpan, bounds.tailZ) + 1, `${modelId}: the orbit clears the wingtips`);
    if (modelId === 'garza_negra') {
      assert.ok(share > 0.22 && share < 0.4, `the long jet: kept back by its length, share ${share.toFixed(3)}`);
    } else {
      assert.ok(Math.abs(share - CHASE_FRAMING.share) < 0.03, `${modelId}: the wings fill ${(share * 100).toFixed(1)} % of the width`);
    }
    if (modelId === 'manta_sombra') assert.ok(share >= 0.4 && share <= 0.55);
  }
  // Nearer than before this session (59.8, 46.5 and 18.9 m), each by its own size.
  assert.ok(distances.manta_sombra > 40 && distances.manta_sombra < 52, `manta ${distances.manta_sombra}`);
  assert.ok(distances.garza_negra > 25 && distances.garza_negra < 32, `garza ${distances.garza_negra}`);
  assert.ok(distances.gaviota_t2 > 7.5 && distances.gaviota_t2 < 11, `gaviota ${distances.gaviota_t2}`);
  // The same from the formula alone: the span over the visible width at the chase depth.
  const halfWidth = Math.tan((CHASE_FRAMING.fov * Math.PI) / 360) * CHASE_FRAMING.aspect;
  const manta = VEHICLE_CATALOG.manta_sombra.dimensions;
  const depth = Math.hypot(FLIGHT_FRAMING.chaseHeight, 1) * chaseDistanceOf(manta);
  assert.ok(Math.abs(manta.width / (2 * halfWidth * depth) - CHASE_FRAMING.share) < 0.02);
});

test('the chase camera holds still on a steady aircraft (no jitter from its spring)', () => {
  const world = makeWorld();
  world.cameras.setView('chase');
  world.frame(0);
  const first = world.camera.position.clone();
  const turn = world.camera.quaternion.clone();
  for (let i = 0; i < 120; i += 1) world.frame(1 / 60);
  assert.ok(world.camera.position.distanceTo(first) < 1e-6);
  assert.ok(Math.abs(world.camera.quaternion.dot(turn)) > 1 - 1e-9);
});
