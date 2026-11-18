// Wet streets: the mirror pass leaves people and small or flat things out of its picture, and the
// asphalt carries the distance to the nearest kerb for the standing water along the gutters.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./vendoredThreeHook.mjs', import.meta.url);
const THREE = await import('three');
const { createWetReflectionSubjects, isMirrorSubject } = await import('../../../game/src/world/streets/wetReflectionSubjects.js');
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

const lit = (hex, intensity, name = 'lamp_main') => {
  const glow = new THREE.MeshStandardMaterial({ emissive: hex, emissiveIntensity: intensity });
  glow.name = name;
  return glow;
};
const pool = (name, mat, geometry = new THREE.BoxGeometry(0.3, 0.3, 0.3)) => {
  const mesh = new THREE.InstancedMesh(geometry, mat, 40);
  mesh.name = name;
  mesh.frustumCulled = false;
  return mesh;
};

test('the mirror draws glows, buildings, car bodies, sky and sea; not people, plants or street items', () => {
  assert.equal(isMirrorSubject(pool('set_street_lighting_lamp_arm_lod0', lit(0xffeccb, 6))), true, 'a lamp head (tiny, glowing)');
  assert.equal(isMirrorSubject(pool('set_street_lighting_lamp_arm_lod2', lit(0xffeccb, 6))), true, 'far lamp heads still glow down the street');
  assert.equal(isMirrorSubject(pool('set_traffic_control_traffic_signal_mast_lamp_red_on_lod1', lit(0xff4b38, 5, 'lamp_red_on'))), true, 'a lit signal');
  assert.equal(isMirrorSubject(pool('set_traffic_control_traffic_signal_mast_lamp_red_off_lod0', lit(0xff4b38, 0, 'lamp_red_off'))), false, 'a dark signal lamp');
  assert.equal(isMirrorSubject(pool('set_street_lighting_lamp_arm_lod0', material, new THREE.BoxGeometry(0.3, 6, 0.3))), false, 'the lamp pole');
  assert.equal(isMirrorSubject(pool('royal_palm_variant_a_lod0', material, new THREE.BoxGeometry(6, 12, 6))), false, 'palms');
  assert.equal(isMirrorSubject(pool('set_sidewalk_bus_shelter_lod1', material, new THREE.BoxGeometry(4, 2.6, 1.6))), false, 'a bus shelter body');
  const carMaterial = new THREE.MeshStandardMaterial();
  carMaterial.name = 'vehicle_instanced';
  const carBox = new THREE.BoxGeometry(1.9, 1.4, 4.6);
  assert.equal(isMirrorSubject(pool('family_sedan_merged_lod1_instances', carMaterial, carBox)), true, 'middle-distance cars');
  assert.equal(isMirrorSubject(pool('family_sedan_merged_lod2_instances', carMaterial, carBox)), false, 'far cars (far level)');
  assert.equal(isMirrorSubject(box(1.9, 1.4, 4.6), true), true, 'a near car body');
  assert.equal(isMirrorSubject(box(0.7, 0.7, 0.25), true), false, 'its wheel');
  assert.equal(isMirrorSubject(box(1.9, 1.4, 4.6), false), false, 'a big box that is no car');
  const buildings = new THREE.BatchedMesh(4, 64, 128, material);
  assert.equal(isMirrorSubject(buildings), true, 'the building batches');
  const shadowBoxes = new THREE.BatchedMesh(4, 64, 128, new THREE.MeshBasicMaterial({ colorWrite: false }));
  assert.equal(isMirrorSubject(shadowBoxes), false, 'shadow-only boxes');
  const sky = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), material);
  sky.frustumCulled = false;
  assert.equal(isMirrorSubject(sky), true, 'the sky dome (never culled)');
  assert.equal(isMirrorSubject(sky, false, true), false, 'never-culled things a person carries');
  const body = new THREE.SkinnedMesh(new THREE.BoxGeometry(0.5, 1.8, 0.3), material);
  body.frustumCulled = false;
  assert.equal(isMirrorSubject(body), false, 'a person');
  assert.equal(isMirrorSubject(new THREE.Group()), false);
});

test('the pass hides whole subtrees with nothing chosen and gives every object its state back', () => {
  const scene = new THREE.Scene();
  const light = new THREE.PointLight();
  const lights = new THREE.Group();
  lights.add(light);
  const items = new THREE.Group();
  const lampHeads = pool('set_street_lighting_lamp_arm_lod0', lit(0xffeccb, 6));
  const benches = pool('set_sidewalk_bench_slat_lod0', material);
  const palms = pool('royal_palm_variant_a_lod1', material);
  palms.visible = false;
  items.add(lampHeads, benches, palms);
  const crowd = new THREE.Group();
  crowd.add(new THREE.SkinnedMesh(new THREE.BoxGeometry(0.5, 1.8, 0.3), material), box(0.2, 0.2, 0.2));
  const car = new THREE.Group();
  car.name = 'vehicle_family_sedan';
  const carBody = box(1.9, 1.4, 4.6);
  const wheel = box(0.7, 0.7, 0.25);
  carBody.add(wheel);
  const tailLamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.05), lit(0xff2000, 2, 'lamp_tail'));
  const interior = box(1.0, 0.6, 1.6);
  car.add(carBody, tailLamp, interior);
  // A drawn thing that is not chosen, with a chosen thing under it: masked, not hidden.
  const kiosk = box(0.8, 2, 0.8);
  const kioskSign = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.02), lit(0xffffff, 1.5, 'shop_sign'));
  kiosk.add(kioskSign);
  scene.add(lights, items, crowd, car, kiosk);

  const subjects = createWetReflectionSubjects();
  subjects.refresh(scene);
  assert.equal(subjects.subjects, 4, 'lamp heads, car body, tail lamp, kiosk sign');
  subjects.hide();
  assert.equal(crowd.visible, false, 'the whole crowd in one');
  assert.equal(benches.visible, false);
  assert.equal(palms.visible, false);
  assert.equal(wheel.visible, false);
  assert.equal(interior.visible, false);
  for (const kept of [lights, light, items, lampHeads, car, carBody, tailLamp, kiosk, kioskSign]) assert.equal(kept.visible, true);
  assert.equal(kiosk.layers.mask, 0, 'the kiosk itself is not drawn, its sign is');
  assert.equal(subjects.pruned, 5);
  subjects.restore();
  for (const back of [crowd, benches, wheel, interior]) assert.equal(back.visible, true);
  assert.equal(palms.visible, false, 'an object hidden by its owner stays hidden');
  assert.equal(kiosk.layers.mask, 1);
  assert.equal(subjects.changed(), false);
  // A pool grown since (old mesh out, new one appended) or a new person: refresh before the pass.
  benches.removeFromParent();
  items.add(pool('set_sidewalk_bench_slat_lod0', material));
  assert.equal(subjects.changed(), true, 'a grown pool under a kept parent');
  subjects.refresh(scene);
  assert.equal(subjects.changed(), false);
  crowd.add(box(0.5, 1.8, 0.3));
  assert.equal(subjects.changed(), false, 'under a hidden subtree nothing new can draw');
  scene.remove(crowd);
  assert.equal(subjects.changed(), true);
  subjects.refresh(scene);
  assert.equal(subjects.pruned, 4);
});

test('the mirror is cheap: a quarter-size picture at high, every third frame, out to 450 m', () => {
  assert.equal(WET_REFLECTION_SCALES.high, 0.25);
  assert.equal(WET_REFLECTION_SCALES.medium, undefined);
  assert.equal(MIRROR_FRAME_INTERVAL, 3);
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
