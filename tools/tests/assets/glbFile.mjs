// A small binary glTF reader for the asset tests (Node standard library only): parses the
// container, checks its structure and measures what the tests compare against the registry.
import { readFile } from 'node:fs/promises';
import { colliderShapeOf, isAnchorName, isColliderName, lodLevelOf } from '../../../game/src/assets/contract.js';

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

/**
 * Reads and parses a .glb file.
 * @param {string} path The file to read.
 * @returns {Promise<{ bytes: number, version: number, declaredLength: number, json: object,
 *   binaryLength: number }>} The parsed container.
 */
export async function readGlb(path) {
  const data = await readFile(path);
  if (data.length < 20) throw new Error(`${path}: too short to be a binary glTF file`);
  if (data.readUInt32LE(0) !== GLB_MAGIC) throw new Error(`${path}: missing the "glTF" magic number`);
  const version = data.readUInt32LE(4);
  const declaredLength = data.readUInt32LE(8);
  let offset = 12;
  let json = null;
  let binaryLength = 0;
  while (offset + 8 <= data.length) {
    const chunkLength = data.readUInt32LE(offset);
    const chunkType = data.readUInt32LE(offset + 4);
    const chunk = data.subarray(offset + 8, offset + 8 + chunkLength);
    if (chunkType === CHUNK_JSON) json = JSON.parse(chunk.toString('utf8'));
    else if (chunkType === CHUNK_BIN) binaryLength = chunkLength;
    offset += 8 + chunkLength + ((4 - (chunkLength % 4)) % 4);
  }
  if (!json) throw new Error(`${path}: no JSON chunk`);
  return { bytes: data.length, version, declaredLength, json, binaryLength };
}

/**
 * Measures a parsed glTF the way the asset pipeline's report does: triangles and draw calls per
 * level of detail (collision proxies left out) and the names the game relies on.
 * @param {object} gltf The glTF JSON.
 * @returns {{ lods: { triangles: number, draws: number }[], nodes: string[], anchors: string[],
 *   colliders: string[], materials: string[], animations: string[], extras: object }} The
 *   measurements.
 */
export function measureGltf(gltf) {
  const nodes = gltf.nodes ?? [];
  const parents = new Map();
  nodes.forEach((node, index) => {
    for (const child of node.children ?? []) parents.set(child, index);
  });
  const levelOf = (index) => {
    for (let current = index; current !== undefined; current = parents.get(current)) {
      const level = lodLevelOf(nodes[current].name ?? '');
      if (level !== null) return level;
    }
    return null;
  };
  const isProxy = (index) => {
    for (let current = index; current !== undefined; current = parents.get(current)) {
      if (isColliderName(nodes[current].name ?? '')) return true;
    }
    return false;
  };
  const always = { triangles: 0, draws: 0 };
  /** @type {Map<number, { triangles: number, draws: number }>} */
  const levels = new Map();
  nodes.forEach((node, index) => {
    if (node.mesh === undefined || isProxy(index)) return;
    let triangles = 0;
    let draws = 0;
    for (const primitive of gltf.meshes[node.mesh].primitives ?? []) {
      const accessor = primitive.indices !== undefined ? primitive.indices : primitive.attributes.POSITION;
      triangles += Math.floor(gltf.accessors[accessor].count / 3);
      draws += 1;
    }
    const level = levelOf(index);
    const bucket = level === null ? always : levels.get(level) ?? levels.set(level, { triangles: 0, draws: 0 }).get(level);
    bucket.triangles += triangles;
    bucket.draws += draws;
  });
  if (levels.size === 0) levels.set(0, { triangles: 0, draws: 0 });
  const lods = [...levels.keys()].sort((a, b) => a - b).map((level) => ({
    level,
    triangles: levels.get(level).triangles + always.triangles,
    draws: levels.get(level).draws + always.draws,
  }));
  const names = nodes.map((node) => node.name ?? '');
  return {
    lods,
    nodes: names,
    anchors: names.filter(isAnchorName),
    colliders: names.filter(isColliderName),
    badColliders: names.filter((name) => isColliderName(name) && colliderShapeOf(name) === null),
    materials: (gltf.materials ?? []).map((material) => material.name ?? ''),
    animations: (gltf.animations ?? []).map((animation) => animation.name ?? ''),
    extras: gltf.scenes?.[0]?.extras ?? {},
  };
}
