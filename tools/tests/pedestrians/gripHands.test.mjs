// Grip hands on crowd bodies: a rebuilt base carries the relaxed hands (hands_lod0..2) and two grip
// meshes (hand_r_grip, hand_l_grip) that must be hidden unless a weapon is held. The crowd merges a
// person's meshes into one draw per level; the grips must stay out of that merge (hidden, so they
// cost no draw) and the relaxed hands merge last, so cutting the draw range hides them while the
// run-time's gripHands shows the grips.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { register } from 'node:module';
import test from 'node:test';

register('../city-world/vendoredThreeHook.mjs', import.meta.url);
const THREE = await import('three');
const { sortBodyParts, planMerge, applyMerge, showMergedHands, handPartOf, GRIP_HAND_NODES } = await import('../../../game/src/pedestrians/pedestrianBodies.js');
const { createGripHands } = await import('../../../game/src/characters/rig/gripHands.js');

/** A skinned box sharing one skeleton, named and tagged with its level like the asset library does. */
function part(name, materials, skeleton, level, size = 0.1) {
  const geometry = new THREE.BoxGeometry(size, size, size);
  const count = geometry.getAttribute('position').count;
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(count * 4), 4));
  const weights = new Float32Array(count * 4);
  for (let i = 0; i < count; i += 1) weights[i * 4] = 1;
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  const mesh = new THREE.SkinnedMesh(geometry, materials[name.startsWith('hand') ? 'paint_skin' : name] || materials.paint_top);
  mesh.name = name;
  mesh.userData.lod = level;
  mesh.bind(skeleton);
  return mesh;
}

/** A person like the rebuilt bases: lod0/lod1 bodies of two roles, hands_lod0/1, two grips. */
function person() {
  const bone = new THREE.Bone();
  bone.name = 'hand_r';
  const skeleton = new THREE.Skeleton([bone]);
  const materials = {};
  for (const name of ['paint_skin', 'paint_top']) {
    materials[name] = new THREE.MeshStandardMaterial({ color: 0x886644 });
    materials[name].name = name;
  }
  const root = new THREE.Group();
  root.add(bone);
  for (const name of GRIP_HAND_NODES) {
    const grip = part(name, materials, skeleton, null);
    grip.userData.lod = null; // the grips have no level suffix
    root.add(grip);
  }
  for (let level = 0; level < 2; level += 1) {
    root.add(part(`hands_lod${level}`, materials, skeleton, level, 0.05));
    const body = new THREE.Group();
    body.name = `lod${level}`;
    body.userData.lod = level;
    body.add(part('paint_skin', materials, skeleton, level));
    body.add(part('paint_top', materials, skeleton, level));
    root.add(body);
  }
  return root;
}

test('grip hands stay out of the merge; relaxed hands merge last into each level', () => {
  const instance = person();
  const { found, hands, grips } = sortBodyParts(instance);
  assert.deepEqual(grips.map((g) => g.name).sort(), ['hand_l_grip', 'hand_r_grip']);
  assert.deepEqual(hands, [1, 1, 0]);
  for (const level of [0, 1]) {
    assert.equal(found[level].length, 3);
    assert.equal(found[level][2].name, `hands_lod${level}`, 'relaxed hands are the last part');
    assert.ok(found[level].every((mesh) => !GRIP_HAND_NODES.includes(mesh.name)));
  }
  const plan = planMerge(found[0], hands[0]);
  assert.ok(plan, 'level 0 merges');
  assert.equal(plan.members.length, 3);
  const box = new THREE.BoxGeometry(1, 1, 1).index.count;
  assert.equal(plan.merged.index.count, box * 3);
  assert.equal(plan.bodyCount, box * 2, 'the draw range without the hands');
  const merge = applyMerge(plan, found[0]);
  // The grips are still their own meshes in the person, not inside the merged draw.
  const names = [];
  instance.traverse((node) => { if (node.isMesh) names.push(node.name); });
  assert.ok(names.includes('hand_r_grip') && names.includes('hand_l_grip'));
  assert.ok(!names.includes('hands_lod0'), 'relaxed hands of level 0 are inside the merge');
  assert.equal(merge.mesh.geometry.drawRange.count, Infinity);
  showMergedHands(merge, false);
  assert.equal(merge.mesh.geometry.drawRange.count, box * 2);
  showMergedHands(merge, true);
  assert.equal(merge.mesh.geometry.drawRange.count, Infinity);
});

test('the run-time hides the unmerged grips by default and shows them for a weapon', () => {
  const instance = person();
  const { found, hands, grips } = sortBodyParts(instance);
  for (const level of [0, 1]) applyMerge(planMerge(found[level], hands[level]), found[level]);
  const gripHands = createGripHands(instance);
  assert.ok(gripHands.available, 'gripHands finds the grips after the merge');
  assert.ok(grips.every((g) => g.visible === false), 'hidden grips: no draw');
  gripHands.show(true);
  assert.ok(grips.every((g) => g.visible === true));
  gripHands.show(false);
  assert.ok(grips.every((g) => g.visible === false));
});

test('a base without merged hands keeps no hand range (old files are left alone)', () => {
  const instance = person();
  const { found } = sortBodyParts(instance);
  const plan = planMerge(found[0].slice(0, 2), 0);
  assert.equal(plan.bodyCount, null);
});

test('every shipped person names its hand nodes the way the crowd sorts them', () => {
  const dir = new URL('../../../game/assets/characters/', import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.glb'))) {
    const bytes = readFileSync(new URL(file, dir));
    const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    const meshNodes = json.nodes.filter((n) => n.mesh !== undefined);
    for (const node of meshNodes) {
      const fake = { name: node.name, parent: null };
      const expected = GRIP_HAND_NODES.includes(node.name) ? 'grip' : /^hands_lod\d$/.test(node.name) ? 'hands' : null;
      assert.equal(handPartOf(fake, null), expected, `${file} ${node.name}`);
    }
  }
});
