// Shift 9: the port terminal (set_port), the quay cranes and apron, the beach (set_beach), the
// shop fronts (set_commerce), the ground cover, the sector obstacle index and the pools' tinted
// instances, checked against the real city plan (seed 1).
import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

register('../city-world/vendoredThreeHook.mjs', import.meta.url);
const THREE = await import('three');
const { createSeededRandom, deriveSeed } = await import('../../../game/src/core/random/seededRandom.js');
const { generateCityPlan } = await import('../../../game/src/world/plan/cityPlanGenerator.js');
const { PROP_SET_OBJECTS } = await import('../../../game/src/assets/registry/props.js');
const { LEISURE_SET_OBJECTS } = await import('../../../game/src/assets/registry/leisure.js');
const port = await import('../../../game/src/world/props/portTerminalLayout.js');
const { layOutBeach } = await import('../../../game/src/world/props/beachLayout.js');
const { layOutShopFronts } = await import('../../../game/src/world/props/shopFrontLayout.js');
const { layOutGroundCover } = await import('../../../game/src/world/vegetation/groundCoverLayout.js');
const { createObstacleIndex } = await import('../../../game/src/world/props/obstacleIndex.js');
const { createStreetItemPools } = await import('../../../game/src/world/props/streetItemPools.js');
const { buildSectorClutter } = await import('../../../game/src/world/props/sectorClutterDressing.js');

const plan = generateCityPlan(createSeededRandom(deriveSeed(1, 'cityPlan')));
const onRoad = port.carriagewayTest(plan);
const terminal = plan.lots.find((lot) => lot.landmarkKind === 'container_terminal');
const quay = plan.specialAreas.find((area) => area.kind === 'quay');
const apron = layOutQuayApron();
function layOutQuayApron() {
  return port.layOutQuayApron(quay, { onRoad, isWater: (x, z) => plan.isWaterAt(x, z), craneSites: port.craneSitesOf(plan.lots) });
}

test('the container terminal: stack blocks with aisles, boxes on top in line colours, sheds at the back', (t) => {
  const items = port.layOutContainerTerminal(terminal).filter((item) => !item.fence && item.assetId === 'set_port');
  const stacks = items.filter((item) => item.object === 'container_stack');
  t.diagnostic(`${items.length} set_port items, ${stacks.length} stack modules`);
  assert.ok(stacks.length >= 12);
  for (const item of items) assert.ok(PROP_SET_OBJECTS.set_port[item.object], `${item.object} is a set_port object`);
  // Modules of different blocks keep an aisle; modules of one block touch but never overlap.
  for (let i = 0; i < stacks.length; i += 1) {
    for (let j = i + 1; j < stacks.length; j += 1) {
      const gap = Math.hypot(stacks[i].x - stacks[j].x, stacks[i].z - stacks[j].z);
      assert.ok(gap > 7.2, `stack modules ${i} and ${j} overlap (${gap.toFixed(2)} m)`);
    }
  }
  const tops = items.filter((item) => item.object === 'container_40' && item.y > 0);
  assert.ok(tops.length > 4, 'single boxes on top of the stacks');
  for (const top of tops) assert.ok(Math.abs(top.y - 3 * port.CONTAINER_TIER) < 1e-6, 'a top box rests on the third tier');
  for (const box of items.filter((item) => item.object.startsWith('container_') && item.object !== 'container_stack')) {
    assert.ok(port.LINE_COLOURS.includes(box.tint), 'every single box carries a line colour');
  }
  assert.ok(items.filter((item) => item.object === 'steel_shed_end').length === 2, 'a shed run closed at both ends');
});

test('quay cranes stand on the quay, legs off the road and out of the water; the apron row too', (t) => {
  const cranes = apron.filter((item) => item.object === 'quay_crane');
  t.diagnostic(`${cranes.length} cranes, ${apron.length} apron items`);
  assert.ok(cranes.length >= 3, 'at least three cranes at the terminal');
  for (const crane of cranes) {
    const c = Math.cos(crane.rotationY);
    const s = Math.sin(crane.rotationY);
    for (const [lx, lz] of port.CRANE_LEGS) {
      const x = crane.x + c * lx + s * lz;
      const z = crane.z - s * lx + c * lz;
      assert.ok(!onRoad(x, z), 'a crane leg off the carriageway');
      assert.ok(!plan.isWaterAt(x, z), 'a crane leg on land');
    }
    // The boom (-Z) reaches over the water.
    assert.ok(plan.isWaterAt(crane.x - s * 40, crane.z - c * 40), 'the boom over the water');
    assert.ok(crane.mounted && crane.legs.length === 4);
  }
  for (let i = 1; i < cranes.length; i += 1) assert.ok(Math.hypot(cranes[i].x - cranes[i - 1].x, cranes[i].z - cranes[i - 1].z) > 30);
  for (const item of apron.filter((each) => each.object !== 'quay_crane')) assert.ok(!onRoad(item.x, item.z) && !plan.isWaterAt(item.x, item.z));
});

test('the beach: parasol rows on the sand, loungers feet to the sea, towers, bars, nets', async (t) => {
  const promenade = plan.specialAreas.find((area) => area.kind === 'promenade');
  const pier = plan.specialAreas.find((area) => area.kind === 'pier');
  const { insideQuad } = await import('../../../game/src/world/props/streetClutterLayout.js');
  const items = layOutBeach(promenade, plan, { avoid: (x, z) => insideQuad(pier.ring, x, z, -4) });
  assert.ok(!items.some((item) => insideQuad(pier.ring, item.x, item.z, -4)), 'nothing under the pier');
  const count = (object) => items.filter((item) => item.object === object).length;
  t.diagnostic(`parasols ${count('parasol_open')}+${count('parasol_closed')}, loungers ${count('lounger') + count('lounger_towel')}, towers ${count('lifeguard_tower')}, bars ${count('beach_bar_kiosk')}, nets ${count('volleyball_net')}`);
  assert.ok(count('parasol_open') > 100 && count('lounger') > 100);
  assert.ok(count('lifeguard_tower') >= 2 && count('beach_bar_kiosk') >= 5 && count('volleyball_net') >= 1);
  for (const item of items) {
    assert.ok(LEISURE_SET_OBJECTS.set_beach[item.object], `${item.object} is a set_beach object`);
    assert.equal(plan.surfaceAt(item.x, item.z), 'sand', `${item.object} on the sand`);
  }
  for (const lounger of items.filter((item) => item.object.startsWith('lounger'))) {
    const feetX = lounger.x - Math.sin(lounger.rotationY) * 2;
    const feetZ = lounger.z - Math.cos(lounger.rotationY) * 2;
    assert.ok(plan.shoreDistanceAt(feetX, feetZ) < plan.shoreDistanceAt(lounger.x, lounger.z), 'feet towards the water');
  }
});

test('shop fronts: awnings at the lintel tinted per shop, furniture out on the pavement', () => {
  const fronts = Array.from({ length: 80 }, (_, i) => ({ x: i * 6, y: 2, z: 0, nx: 0, nz: -1, width: 4 + (i % 4), district: i % 2 ? 'centro' : 'playa_dorada', key: i * 7919 }));
  const items = layOutShopFronts(fronts);
  const awnings = items.filter((item) => item.object === 'awning_shop');
  assert.ok(awnings.length > 40, 'most shops wear an awning');
  assert.ok(items.some((item) => item.object === 'cafe_set') && items.some((item) => item.object === 'aframe_board'));
  for (const item of items) {
    assert.ok(PROP_SET_OBJECTS.set_commerce[item.object], `${item.object} is a set_commerce object`);
    assert.ok(item.z <= 0.001, 'on the street side of the wall');
    assert.equal(item.base, 2);
  }
  for (const awning of awnings) {
    assert.ok(awning.mounted && awning.tint && awning.y > 0.2, 'an awning hangs on the wall at the lintel, tinted');
    // Object -Z out of the wall (the wall's normal is -Z here): no turn.
    assert.ok(Math.abs(Math.sin(awning.rotationY)) < 1e-9 && Math.cos(awning.rotationY) > 0);
  }
});

test('ground cover: cover in every pit, weeds where the wear puts kerb weeds', () => {
  const plants = [{ x: 0, z: 0, pit: { rotationY: 0 } }, { x: 5, z: 0, pit: { rotationY: 0 } }, { x: 9, z: 3 }];
  const wear = [{ object: 'weeds_kerb', x: 1, z: 2, rotationY: 0.3 }, { object: 'oil_stain_small', x: 2, z: 2, rotationY: 0 }, { object: 'weeds_large', x: 3, z: 4, rotationY: 1, base: 2.5 }];
  const items = layOutGroundCover({ plants, wear, lamps: [{ x: 20, z: 0 }], districtAt: () => 'barrio_hierro' });
  assert.equal(items.filter((item) => item.object === 'variant_d').length, 2, 'one cover patch per pit');
  assert.equal(items.filter((item) => item.object === 'variant_a').length, 2, 'kerb and wall-foot weeds');
  assert.ok(items.every((item) => item.assetId === 'ground_cover' && item.kind === 'cover' && item.mounted));
  assert.equal(items.find((item) => item.object === 'variant_a' && item.base === 2.5)?.x, 3);
});

test('the obstacle index answers as a full scan does', () => {
  const index = createObstacleIndex();
  const random = createSeededRandom(7);
  const all = [];
  const handles = [];
  for (let sector = 0; sector < 6; sector += 1) {
    const circles = Array.from({ length: 400 }, () => ({ x: sector * 200 + random.next() * 200, z: random.next() * 200, radius: 0.2 + random.next() * 3 }));
    all.push(circles);
    handles.push(index.add(circles));
  }
  const out = [];
  for (let q = 0; q < 200; q += 1) {
    const x = random.next() * 1300 - 50;
    const z = random.next() * 300 - 50;
    const radius = random.next() * 40;
    index.near(x, z, radius, out);
    const expected = all.flat().filter((c) => (c.x - x) ** 2 + (c.z - z) ** 2 <= (radius + c.radius) ** 2);
    assert.equal(out.length, expected.length);
    for (const circle of expected) assert.ok(out.includes(circle));
  }
  handles[0].dispose();
  assert.equal(index.count(), 2000);
});

test('a model with two levels draws its far items from the level-1 pool (no duplicate draw)', () => {
  const scene = new THREE.Group();
  for (const level of [0, 1]) {
    const node = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    node.name = `lounger_lod${level}`;
    scene.add(node);
  }
  const assets = { has: () => true, get: () => ({ scene }) };
  // clutterLarge: level 0 to 28 m, 1 to 70 m, 2 to 200 m; the model stops at level 1.
  const xs = [5, 50, 150];
  const matrices = new Float32Array(xs.length * 16);
  xs.forEach((x, i) => new THREE.Matrix4().makeTranslation(x, 0, 0).toArray(matrices, i * 16));
  const pools = createStreetItemPools(assets, {});
  pools.addSector([{ source: { assetId: 'set_beach', object: 'lounger' }, kind: 'clutterLarge', matrices, count: xs.length }]);
  pools.update(0, 0);
  const drawn = Object.entries(pools.poolCounts()).filter(([, count]) => count > 0).map(([key, count]) => `${key}:${count}`).sort();
  assert.deepEqual(drawn, ['set_beach_lounger_lod0:1', 'set_beach_lounger_lod1:2']);
  pools.dispose();
});

test('tinted instances: paint parts take each instance colour, other parts do not', () => {
  const scene = new THREE.Group();
  const holder = new THREE.Group();
  holder.name = 'container_40';
  scene.add(holder);
  for (const level of [0, 1, 2]) {
    const node = new THREE.Group();
    node.name = `container_40_lod${level}`;
    holder.add(node);
    const paint = new THREE.MeshStandardMaterial({ name: 'paint', color: 0x4d1209 });
    paint.userData.role = 'paint';
    node.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), paint), new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ name: 'atlas' })));
  }
  const assets = { has: () => true, get: () => ({ scene }) };
  const red = [0.5, 0.04, 0.03];
  const blue = [0.04, 0.12, 0.32];
  const items = [red, blue].map((tint, i) => ({ assetId: 'set_port', object: 'container_40', x: i * 13, z: 0, rotationY: 0, kind: 'portYard', halfX: 6, halfZ: 1.2, tint, base: 0 }));
  const built = buildSectorClutter(items, { assets, heightAt: () => 0 });
  assert.equal(built.instances.length, 1, 'one instanced group for every tinted box');
  assert.equal(built.colliders.length, 2);
  const pools = createStreetItemPools(assets, {});
  pools.addSector(built.instances);
  pools.update(0, 0);
  const meshes = pools.batches().filter((each) => each.instances > 0).map((each) => each.mesh);
  assert.equal(meshes.length, 2, 'two materials, one draw each, both boxes in them');
  const painted = meshes.find((mesh) => mesh.material.name === 'paint_tinted');
  assert.ok(painted, 'the paint part has its own batch');
  assert.deepEqual([...painted.material.color.toArray()], [1, 1, 1], 'over a white base');
  const colour = new THREE.Color();
  const colours = [0, 1].map((id) => painted.getColorAt(id, colour).toArray().map((v) => +v.toFixed(3)));
  assert.ok(colours.some((c) => c[0] === 0.5) && colours.some((c) => c[2] === 0.32), 'each box its own line colour');
  const atlas = meshes.find((mesh) => mesh.material.name === 'atlas');
  assert.equal(atlas._colorsTexture ?? null, null, 'the frame keeps its own colour');
  pools.dispose();
});
