// The instanced batches of distant and parked cars merge each traffic model's far level part by
// material (game/src/traffic/sameMaterialMerge.js). Draco quantises every part on its own, so the
// same attribute can come as Float32 in one part and normalised Uint16 in another (uv1 in the
// rebuilt sports_coupe): three.js then logs a console error and drops the part. Here every far-car
// source among the built models is merged from its file's accessors (the array types the game's
// loader decodes into) with no console error, and mixed parts keep their values.
import assert from 'node:assert/strict';
import { readdirSync, existsSync } from 'node:fs';
import { register } from 'node:module';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

register('../city-world/vendoredThreeHook.mjs', import.meta.url);
const THREE = await import('three');
const { mergeSameMaterialParts } = await import('../../../game/src/traffic/sameMaterialMerge.js');
const { DISTANT_LEVEL } = await import('../../../game/src/traffic/distantTrafficBatches.js');
const { VEHICLE_CATALOG } = await import('../../../game/src/catalog/vehicleCatalog.js');
const { isAnchorName, isColliderName, lodLevelOf } = await import('../../../game/src/assets/contract.js');
const { readGlb } = await import('../assets/glbFile.mjs');

const ASSETS = fileURLToPath(new URL('../../../game/assets/', import.meta.url));
const ARRAYS = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const SIZES = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const NAMES = { POSITION: 'position', NORMAL: 'normal', TANGENT: 'tangent', TEXCOORD_0: 'uv', TEXCOORD_1: 'uv1', COLOR_0: 'color' };

function fileOf(modelId) {
  for (const folder of readdirSync(ASSETS)) {
    const path = `${ASSETS}${folder}/${modelId}.glb`;
    if (existsSync(path)) return path;
  }
  return null;
}

// The far level's mesh primitives grouped as distantTrafficBatches groups them (by material,
// head lamps and other lamps apart, lens glass left out), as geometries of the decoded types.
function farLevelGroups(json) {
  // A node's level is its own name's or the nearest named ancestor's (lod groups hold the parts).
  const parent = new Map();
  json.nodes.forEach((node, index) => (node.children ?? []).forEach((child) => parent.set(child, index)));
  const levelOf = (index) => {
    for (let at = index; at !== undefined; at = parent.get(at)) {
      const level = lodLevelOf(json.nodes[at].name ?? '');
      if (level !== null) return level;
    }
    return null;
  };
  const levels = json.nodes.map((node, index) => levelOf(index)).filter((level) => level !== null);
  const level = Math.min(DISTANT_LEVEL, levels.length ? Math.max(...levels) : 0);
  const groups = new Map();
  for (const [index, node] of json.nodes.entries()) {
    const name = node.name ?? '';
    if (node.mesh === undefined || isAnchorName(name) || isColliderName(name)) continue;
    const nodeLevel = levelOf(index);
    if (nodeLevel !== null && nodeLevel !== level) continue;
    for (const primitive of json.meshes[node.mesh].primitives) {
      const material = json.materials?.[primitive.material]?.name ?? '';
      const key = material === 'lamp_head' ? 'lamp_front' : material.startsWith('lamp_') ? 'lamp_rear' : material === 'glass_lens' ? null : material;
      if (!key) continue;
      const geometry = new THREE.BufferGeometry();
      for (const [semantic, index] of Object.entries(primitive.attributes)) {
        const accessor = json.accessors[index];
        if (!NAMES[semantic]) continue;
        const size = SIZES[accessor.type];
        geometry.setAttribute(NAMES[semantic], new THREE.BufferAttribute(new ARRAYS[accessor.componentType](accessor.count * size), size, accessor.normalized === true));
      }
      if (primitive.indices !== undefined) {
        const accessor = json.accessors[primitive.indices];
        geometry.setIndex(new THREE.BufferAttribute(new ARRAYS[accessor.componentType](accessor.count), 1));
      }
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(geometry);
    }
  }
  return groups;
}

test('every built traffic model merges its far level by material without a console error', async () => {
  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args.join(' '));
  let merged = 0;
  try {
    for (const [modelId, entry] of Object.entries(VEHICLE_CATALOG)) {
      if (!entry.spawn?.traffic) continue;
      const path = fileOf(modelId);
      if (!path) continue;
      const { json } = await readGlb(path);
      for (const [key, parts] of farLevelGroups(json)) {
        if (parts.length < 2) continue;
        const geometry = mergeSameMaterialParts(parts);
        assert.ok(geometry, `${modelId} ${key}: merged`);
        merged += 1;
      }
    }
  } finally {
    console.error = original;
  }
  assert.deepEqual(errors, []);
  assert.ok(merged > 0, 'some model has parts to merge');
});

test('parts whose uv1 came as Float32 and as normalised Uint16 merge, keeping the values', () => {
  const part = (uv1) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    geometry.setAttribute('uv1', uv1);
    geometry.setIndex([0, 1, 2]);
    return geometry;
  };
  const a = part(new THREE.BufferAttribute(new Float32Array([0.25, 0.5, 0, 0, 1, 1]), 2));
  const b = part(new THREE.BufferAttribute(new Uint16Array([65535, 0, 0, 65535, 32768, 32768]), 2, true));
  const merged = mergeSameMaterialParts([a, b]);
  assert.ok(merged);
  const uv1 = merged.attributes.uv1;
  assert.ok(uv1.array instanceof Float32Array);
  assert.equal(uv1.count, 6);
  assert.equal(uv1.getX(0), 0.25);
  assert.ok(Math.abs(uv1.getX(3) - 1) < 1e-6 && Math.abs(uv1.getY(4) - 1) < 1e-6);
});
