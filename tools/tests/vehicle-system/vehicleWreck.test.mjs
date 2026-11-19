// The staged wreck (vehicleWreckStaging.js): options with defaults and clamps, scorched paint,
// the crumpled front's dent plan in model space, and the whole staging applied to a stand-in rig
// (front pushed in, glass broken, a door ajar, the bumper gone, the paint darkened).
import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

register('../city-world/vendoredThreeHook.mjs', import.meta.url);
const THREE = await import('three');
const {
  WRECK_DEFAULTS, resolveWreckOptions, scorchedPaint, wreckDentPlan, wreckGlassPlan, stageVehicleWreck,
} = await import('../../../game/src/vehicles/vehicleWreckStaging.js');
const { createVehicleRig, CHARRED_PAINT } = await import('../../../game/src/vehicles/vehicleModelRig.js');
const { createVehicleDoors } = await import('../../../game/src/vehicles/vehicleLightsAndDoors.js');
const { wheelPlacementsOf } = await import('../../../game/src/vehicles/vehicleSpawning.js');
const { MAX_DENT } = await import('../../../game/src/vehicles/vehicleDamage.js');
const { VEHICLE_CATALOG } = await import('../../../game/src/catalog/vehicleCatalog.js');

const cruiser = VEHICLE_CATALOG.police_cruiser;

test('wreck options: defaults filled, numbers clamped, bad names fall back', () => {
  const o = resolveWreckOptions();
  assert.equal(o.front, WRECK_DEFAULTS.front);
  assert.equal(o.burning, true);
  assert.equal(o.burnSeconds, Infinity);
  const odd = resolveWreckOptions({ front: 4, scorch: -1, doorAmount: 'x', corner: 'roof', glass: 'melted', door: 'roof', fire: 99, burnSeconds: 12 });
  assert.equal(odd.front, 1);
  assert.equal(odd.scorch, 0);
  assert.equal(odd.doorAmount, WRECK_DEFAULTS.doorAmount);
  assert.equal(odd.corner, 'left');
  assert.equal(odd.glass, 'mixed');
  assert.equal(odd.door, 'driver');
  assert.equal(odd.fire, 3);
  assert.equal(odd.burnSeconds, 12);
  assert.equal(resolveWreckOptions({ door: null }).door, null);
  assert.equal(resolveWreckOptions({ burning: false }).burning, false);
});

test('scorched paint runs from the paint to char', () => {
  assert.equal(scorchedPaint('#ffffff', 0), '#ffffff');
  assert.equal(scorchedPaint('#ffffff', 1), CHARRED_PAINT);
  const half = parseInt(scorchedPaint('#ffffff', 0.5).slice(1, 3), 16);
  assert.ok(half > 0x1d && half < 0xff, `half way (${half})`);
  assert.match(scorchedPaint('not a colour', 0.5), /^#[0-9a-f]{6}$/);
});

test('crumpled front: dents at the nose and the corner that hit, pushed into the car, capped', () => {
  const size = cruiser.dimensions;
  const left = wreckDentPlan(size, 1, 'left');
  assert.equal(left.length, 3);
  for (const dent of left) {
    assert.ok(dent.point.z < -size.length * 0.2, 'in the front half');
    assert.ok(dent.depth > 0 && dent.depth <= MAX_DENT);
    assert.ok(Math.abs(Math.hypot(dent.direction.x, dent.direction.y, dent.direction.z) - 1) < 1e-9);
  }
  assert.ok(left[0].direction.z > 0.9, 'the nose is pushed back into the car (+Z)');
  assert.ok(left[2].point.x < 0 && left[2].direction.x > 0, 'the left corner is pushed in towards the middle');
  assert.ok(left[1].direction.y > 0, 'the hood buckles up');
  const right = wreckDentPlan(size, 1, 'right');
  assert.ok(right[2].point.x > 0 && right[2].direction.x < 0);
  assert.equal(wreckDentPlan(size, 1, 'centre').length, 2);
  assert.deepEqual(wreckDentPlan(size, 0, 'left'), []);
  assert.equal(wreckGlassPlan('mixed').window_l, 2);
  assert.equal(wreckGlassPlan('mixed').window_front, 1);
});

test('staging a wreck on a rig: front pushed in, glass broken, door ajar, bumper off, paint scorched', () => {
  const wheels = wheelPlacementsOf(cruiser, null);
  const rig = createVehicleRig(null, cruiser, '#f4f4f2', wheels);
  // The stand-in has no windows or doors: give it a windscreen, a side window and a driver's door.
  const glass = new THREE.MeshStandardMaterial({ name: 'glass' });
  for (const [name, x, z] of [['window_front', 0, -0.6], ['window_l', -0.85, 0.2]]) {
    const node = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.4), glass);
    node.name = name;
    node.position.set(x, 1.2, z);
    rig.near.add(node);
    rig.windows[name] = { node, state: 0, centre: node.position.clone(), original: glass };
  }
  const door = new THREE.Group();
  door.name = 'door_fl';
  rig.near.add(door);
  const doors = createVehicleDoors(rig);
  const body = rig.dentables[0].mesh;
  const before = Float32Array.from(body.geometry.attributes.position.array);
  const shown = stageVehicleWreck(rig, doors, cruiser, '#f4f4f2', resolveWreckOptions({ corner: 'left', doorAmount: 0.4, scorch: 0.6 }));
  const after = body.geometry.attributes.position.array;
  let movedFront = 0;
  let movedRear = 0;
  for (let i = 0; i < after.length; i += 3) {
    const moved = Math.hypot(after[i] - before[i], after[i + 1] - before[i + 1], after[i + 2] - before[i + 2]);
    if (moved > 1e-4) {
      if (before[i + 2] < 0) movedFront += 1;
      else movedRear += 1;
    }
    assert.ok(moved <= MAX_DENT + 1e-6, 'never past the dent cap');
  }
  assert.ok(movedFront > 0, 'the front moved');
  assert.equal(movedRear, 0, 'the rear did not');
  assert.equal(rig.windows.window_front.state, 1);
  assert.equal(rig.windows.window_l.state, 2);
  assert.equal(rig.windows.window_l.node.visible, false);
  assert.equal(shown.cracked, 1);
  assert.equal(shown.shattered, 1);
  assert.equal(doors.fl.target, 0.4);
  assert.equal(shown.bumper, true);
  assert.equal(rig.bumpers.front.visible, false);
  assert.equal(shown.paint, scorchedPaint('#f4f4f2', 0.6));
  assert.notEqual(shown.paint, '#f4f4f2');
});
