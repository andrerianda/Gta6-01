// Wet streets: the mirror pass leaves people and small or flat things out of its picture, and the
// asphalt carries the distance to the nearest kerb for the standing water along the gutters.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./vendoredThreeHook.mjs', import.meta.url);
const THREE = await import('three');
const { createWetReflectionCulling, isLeftOutOfMirror } = await import('../../../game/src/world/streets/wetReflectionCulling.js');
const { createSurfaceGeometryBuffer, KERB_NEARNESS_ATTRIBUTE, KERB_REACH } = await import('../../../game/src/world/streets/surfaceGeometryBuffer.js');
const { kerbDistanceAcross } = await import('../../../game/src/world/streets/streetSectorBuilder.js');
const { WET_REFLECTION_SCALES, MIRROR_FAR, MIRROR_FRAME_INTERVAL, createWetStreetReflection } = await import('../../../game/src/world/streets/wetStreetReflection.js');

test('the mirror pass constructs before the first frame (no use before initialisation) and updates', () => {
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 9000);
  const mirror = createWetStreetReflection({ renderer: {}, camera, hidden: () => [] });
  assert.equal(mirror.object3d.name, 'wet-street-mirror');
  assert.equal(mirror.object3d.userData.stats, mirror.stats);
  assert.equal(mirror.stats.passes, 0);
  mirror.setQuality({ name: 'high' });
  assert.equal(mirror.scale, 0.25);
  mirror.update(1, 3.1);
  mirror.update(0, 3.1);
  mirror.setQuality({ name: 'low' });
  assert.equal(mirror.scale, 0);
  mirror.dispose();
});

const material = new THREE.MeshBasicMaterial();
const box = (w, h, d) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);

test('the mirror keeps buildings, lamps, car bodies and the sky; leaves out people and small or flat things', () => {
  assert.equal(isLeftOutOfMirror(box(20, 30, 20)), false, 'a building');
  assert.equal(isLeftOutOfMirror(box(0.3, 6, 0.3)), false, 'a lamp post');
  assert.equal(isLeftOutOfMirror(box(1.9, 1.4, 4.6)), false, 'a car body');
  assert.equal(isLeftOutOfMirror(box(0.6, 1.0, 0.6)), true, 'a bin');
  assert.equal(isLeftOutOfMirror(box(0.7, 0.7, 0.25)), true, 'a wheel');
  assert.equal(isLeftOutOfMirror(box(3, 0.004, 2)), true, 'a decal');
  const sky = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), material);
  sky.frustumCulled = false;
  assert.equal(isLeftOutOfMirror(sky), false, 'the sky dome (never culled) stays');
  const body = new THREE.SkinnedMesh(new THREE.BoxGeometry(0.5, 1.8, 0.3), material);
  body.frustumCulled = false;
  assert.equal(isLeftOutOfMirror(body), true, 'a person (never culled by its owner)');
  const bins = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 1, 0.6), material, 40);
  bins.frustumCulled = false;
  assert.equal(isLeftOutOfMirror(bins), true, 'a city-wide pool of bins');
  const lamps = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 6, 0.3), material, 40);
  lamps.frustumCulled = false;
  assert.equal(isLeftOutOfMirror(lamps), false, 'a city-wide pool of lamp posts');
  assert.equal(isLeftOutOfMirror(new THREE.Group()), false);
});

test('the leave-out list hides and restores each object, keeping its own visibility', () => {
  const scene = new THREE.Scene();
  const building = box(20, 30, 20);
  const bin = box(0.6, 1, 0.6);
  const hiddenDecal = box(2, 0.004, 2);
  hiddenDecal.visible = false;
  scene.add(building, bin, hiddenDecal);
  const culling = createWetReflectionCulling();
  culling.refresh(scene);
  assert.equal(culling.count, 2);
  culling.hide();
  assert.equal(bin.visible, false);
  assert.equal(building.visible, true);
  culling.restore();
  assert.equal(bin.visible, true);
  assert.equal(hiddenDecal.visible, false, 'an object hidden by its owner stays hidden');
  scene.remove(bin);
  culling.refresh(scene);
  assert.equal(culling.count, 1);
});

test('the mirror is cheap: a quarter-size picture at high, every second frame, out to 450 m', () => {
  assert.equal(WET_REFLECTION_SCALES.high, 0.25);
  assert.equal(WET_REFLECTION_SCALES.medium, undefined);
  assert.equal(MIRROR_FRAME_INTERVAL, 2);
  assert.ok(MIRROR_FAR <= 500);
});

test('kerb distance across a road: zero at the kerbs and at a raised median, largest mid-carriageway', () => {
  const plain = { halfWidth: 7, median: null };
  assert.equal(kerbDistanceAcross(plain, 7), 0);
  assert.equal(kerbDistanceAcross(plain, -7), 0);
  assert.equal(kerbDistanceAcross(plain, 0), 7);
  assert.equal(kerbDistanceAcross(plain, 5.5), 1.5);
  const avenue = { halfWidth: 12, median: [-1.5, 1.5] };
  assert.equal(kerbDistanceAcross(avenue, -1.5), 0);
  assert.equal(kerbDistanceAcross(avenue, 1.5), 0);
  assert.equal(kerbDistanceAcross(avenue, 4), 2.5);
  assert.equal(kerbDistanceAcross(avenue, -11), 1);
});

test('the asphalt buffer stores kerb nearness (1 at the kerb, 0 from KERB_REACH on and where unknown)', () => {
  const buffer = createSurfaceGeometryBuffer({ kerbDistance: true });
  const a = buffer.addVertex(0, 0, 0, 0, 0, 0);
  const b = buffer.addVertex(1, 0, 0, 0, 0, KERB_REACH / 2);
  const c = buffer.addVertex(0, 0, 1, 0, 0);
  buffer.addTriangleUp(a, b, c);
  const geometry = buffer.toGeometry();
  const nearness = geometry.getAttribute(KERB_NEARNESS_ATTRIBUTE);
  assert.deepEqual(Array.from(nearness.array), [1, 0.5, 0]);
  const plain = createSurfaceGeometryBuffer();
  const p = [plain.addVertex(0, 0, 0, 0, 0), plain.addVertex(1, 0, 0, 0, 0), plain.addVertex(0, 0, 1, 0, 0)];
  plain.addTriangleUp(...p);
  assert.equal(plain.toGeometry().getAttribute(KERB_NEARNESS_ATTRIBUTE), undefined, 'other surfaces carry no kerb channel');
});
