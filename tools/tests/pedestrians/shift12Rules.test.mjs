// Shift 12 rules of the crowd: a seated traffic driver is posed sitting at once, even when the
// crowd's camera does not see the car (no standing body through the roof in another camera);
// armed gang members carry a firearm, not a tire iron; nobody stands about in a driving lane
// (the carriageway test); a bench knocked away by a car loses its seats and its sitters.
import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

register('../city-world/vendoredThreeHook.mjs', import.meta.url);
const THREE = await import('three');
const { createSeatedDrivers } = await import('../../../game/src/pedestrians/seatedDrivers.js');
const { memberProfile } = await import('../../../game/src/pedestrians/turfCrews.js');
const { createCarriageway } = await import('../../../game/src/pedestrians/carriageway.js');
const { createBenchSeats } = await import('../../../game/src/pedestrians/crowdActivities.js');
const { dressForDistrict, dressedAlike, DISTRICT_PALETTES, DISTRICT_STYLE } = await import('../../../game/src/pedestrians/districtWardrobe.js');
const { CITY_DISTRICTS } = await import('../../../game/src/catalog/cityDistricts.js');
const { FACTION_MEMBERS, GANGS_AND_FACTIONS } = await import('../../../game/src/catalog/gangsAndFactions.js');
const { WEAPON_CATALOG } = await import('../../../game/src/catalog/weaponCatalog.js');

test('a driver seated where the crowd camera does not look is posed sitting at once', () => {
  const root = new THREE.Object3D();
  root.position.set(30, 0, 0);
  const anchors = { anchor_seat_driver: { position: new THREE.Vector3(-0.36, 0.52, 0.1), direction: { x: 0, z: -1 } }, anchor_door_driver: { position: new THREE.Vector3(-1.4, 0, -0.2) } };
  const car = { id: 7, position: root.position, heading: 0, radius: 2.4, data: { driverId: null }, tags: new Set() };
  const camera = new THREE.PerspectiveCamera();
  const context = {
    entities: { get: (id) => (id === 7 ? car : null) },
    view: { camera },
    systems: { find: (name) => (name === 'traffic' ? { nearCars(out) { out.length = 0; out.push(7); return out; } }
      : name === 'vehicles' ? { get: () => ({ rig: { root, asset: { anchors, extras: {} }, steeringWheel: null } }) } : null) },
  };
  const poses = [];
  const bodies = {
    acquire() {
      const walker = { state: { yaw: 0 }, transit: { kind: null }, seated: null, sit(where) { walker.seated = where ? where.kind : null; }, update() { poses.push(walker.seated); } };
      return { instance: new THREE.Object3D(), walker, input: { moveX: 0, moveZ: 0, facing: 0 }, scale: 1, pending: 0 };
    },
    release() {},
    animate() {},   // off screen: the crowd's animate never poses
  };
  // A frustum that sees nothing (the car is "off screen" for the crowd).
  const frustum = new THREE.Frustum();
  for (const plane of frustum.planes) plane.set(new THREE.Vector3(0, 1, 0), -1e6);
  const drivers = createSeatedDrivers({ context, bodies, frustum, time: 0, player: null }, {
    dressFor: () => ({ archetype: { id: 'office_worker' }, look: { height: 1.8, paints: {} }, assetId: 'pedestrian_test' }),
    onHauled() {},
  });
  drivers.update(0.016);
  assert.deepEqual(poses, ['driver'], 'posed once, in the sit');
  drivers.update(0.016);
  assert.equal(poses.length, 1, 'not again every frame off screen');
});

test('armed gang members carry a firearm; a member with only swung weapons keeps one', () => {
  const firearm = (id) => Boolean(WEAPON_CATALOG[id]) && !['unarmed', 'melee', 'thrown', 'heavy'].includes(WEAPON_CATALOG[id].class);
  let checked = 0;
  for (const faction of Object.values(GANGS_AND_FACTIONS)) {
    for (const memberId of faction.members || []) {
      const member = FACTION_MEMBERS[memberId];
      if (!member) continue;
      const profile = memberProfile(member, faction);
      if (member.weapons.some(firearm)) { assert.ok(firearm(profile.weapon), `${memberId} holds a firearm, not ${profile.weapon}`); checked += 1; }
      else if (profile.weapon) assert.notEqual(profile.weapon, 'fists');
    }
  }
  assert.ok(checked > 3);
  const profile = memberProfile({ id: 'x', name: 'x', appearance: {}, health: 100, weapons: ['tire_iron', 'baseball_bat'] }, { id: 'f' });
  assert.equal(profile.weapon, 'tire_iron');
});

test('the carriageway: in the lane between the kerbs, not on the pavement or past the road', () => {
  // A road along +x from (0, 0) to (100, 0), 7 m centre to kerb.
  const way = createCarriageway([{ points: [0, 0, 50, 0, 100, 0], halfWidth: 7 }]);
  assert.equal(way.contains(30, 0), true, 'centre line');
  assert.equal(way.contains(60, -5), true, 'a lane');
  assert.equal(way.contains(60, 6.9), false, 'the gutter is forgiven');
  assert.equal(way.contains(60, 8.5), false, 'the pavement');
  assert.equal(way.contains(160, 0), false, 'past the road');
  assert.equal(createCarriageway().contains(0, 0), false, 'no plan: nowhere');
});

test('passers-by wear their district palette, never like a neighbour; uniforms and gangs keep theirs', () => {
  let s = 5;
  const random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const near = [];
  let inPalette = 0;
  for (let i = 0; i < 10; i += 1) {
    const look = { paints: { paint_jacket: '#111111', paint_top: '#222222', paint_bottom: '#333333' } };
    dressForDistrict({ id: 'office_worker' }, look, 'pedestrian_casual_m', 'puerto_tamarindo', random, near);
    if (DISTRICT_PALETTES.port.tops.includes(look.paints.paint_jacket)) inPalette += 1;
    assert.ok(!near.some((other) => dressedAlike({ assetId: 'pedestrian_casual_m', look }, other)), 'not the twin of a neighbour');
    assert.notEqual(look.paints.paint_jacket, look.paints.paint_top, 'a layered outfit stays layered');
    near.push({ assetId: 'pedestrian_casual_m', look });
  }
  assert.ok(inPalette >= 5, 'most wear the port palette');
  const crew = { paints: { paint_jacket: '#123456', paint_top: '#123456', paint_bottom: '#654321' } };
  dressForDistrict({ id: 'm', factionId: 'los_remaches' }, crew, 'a', 'puerto_tamarindo', random, []);
  assert.equal(crew.paints.paint_jacket, '#123456', 'gang colours kept');
  for (const id of Object.keys(CITY_DISTRICTS)) assert.ok(DISTRICT_PALETTES[DISTRICT_STYLE[id]], `${id} has a palette`);
});

test('a bench knocked away loses its seats: its sitter stands, nobody sits there again', () => {
  const seats = [{ x: 4, y: 0.45, z: 2, heading: 0, object: 'bench_slat' }, { x: 4.55, y: 0.45, z: 2, heading: 0, object: 'bench_slat' }, { x: 20, y: 0.45, z: 2, heading: 0, object: 'bench_slat' }];
  const city = { groundHeightAt: () => 0, seatsNear: (x, z, r, out = []) => { out.length = 0; for (const s of seats) if (Math.hypot(s.x - x, s.z - z) <= r) out.push(s); return out; } };
  const benches = createBenchSeats(city);
  const seat = benches.freeNear(4, 2, 3);
  benches.take(seat, 1);
  assert.equal(benches.stillThere(seat), true);
  assert.equal(benches.knockAt(4.3, 2.4), 2, 'both seats of the knocked bench');
  assert.equal(benches.stillThere(seat), false, 'the sitter stands up');
  assert.equal(benches.freeNear(4, 2, 3), null, 'nobody sits on the knocked bench');
  assert.equal(benches.freeNear(20, 2, 3).x, 20, 'the next bench is still there');
  seats[2].knocked = true;   // a dressing that publishes the knocked state itself
  assert.equal(benches.freeNear(20, 2, 3), null);
});
