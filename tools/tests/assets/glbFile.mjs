// A small binary glTF reader for the asset tests (Node standard library only): parses the
// container, checks its structure and measures what the tests compare against the registry.
// Draco-compressed geometry (KHR_draco_mesh_compression) is measured from its accessors, which
// the pipeline keeps exact, and checkDracoPrimitives() decodes it with the game's own vendored
// decoder (game/vendor/three/draco/) to prove the file and its accessors agree.
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { colliderShapeOf, isAnchorName, isColliderName, lodLevelOf } from '../../../game/src/assets/contract.js';

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
const DRACO = 'KHR_draco_mesh_compression';
const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

/**
 * Reads and parses a .glb file.
 * @param {string} path The file to read.
 * @returns {Promise<{ bytes: number, version: number, declaredLength: number, json: object,
 *   binaryLength: number, binary: Buffer }>} The parsed container (`binary`: the BIN chunk).
 */
export async function readGlb(path) {
  const data = await readFile(path);
  if (data.length < 20) throw new Error(`${path}: too short to be a binary glTF file`);
  if (data.readUInt32LE(0) !== GLB_MAGIC) throw new Error(`${path}: missing the "glTF" magic number`);
  const version = data.readUInt32LE(4);
  const declaredLength = data.readUInt32LE(8);
  let offset = 12;
  let json = null;
  let binary = data.subarray(0, 0);
  while (offset + 8 <= data.length) {
    const chunkLength = data.readUInt32LE(offset);
    const chunkType = data.readUInt32LE(offset + 4);
    const chunk = data.subarray(offset + 8, offset + 8 + chunkLength);
    if (chunkType === CHUNK_JSON) json = JSON.parse(chunk.toString('utf8'));
    else if (chunkType === CHUNK_BIN) binary = chunk;
    offset += 8 + chunkLength + ((4 - (chunkLength % 4)) % 4);
  }
  if (!json) throw new Error(`${path}: no JSON chunk`);
  return { bytes: data.length, version, declaredLength, json, binaryLength: binary.length, binary };
}

/** @type {Promise<any> | null} */
let decoderModule = null;

/**
 * The game's Draco decoder: the vendored three.js r185 glTF build, loaded once.
 * @returns {Promise<any>} The Emscripten decoder module.
 */
export function dracoDecoder() {
  decoderModule ??= (async () => {
    const directory = new URL('../../../game/vendor/three/draco/', import.meta.url);
    const DracoDecoderModule = createRequire(import.meta.url)(
      fileURLToPath(new URL('draco_wasm_wrapper.js', directory)));
    const wasmBinary = await readFile(new URL('draco_decoder.wasm', directory));
    return new Promise((resolve) => {
      DracoDecoderModule({ wasmBinary, onModuleLoaded: (draco) => resolve(draco) });
    });
  })();
  return decoderModule;
}

/**
 * Decodes every Draco-compressed primitive of a parsed .glb with the game's decoder and checks
 * it against its accessors: vertex and index counts, one Draco attribute per glTF attribute
 * with the right number of components, and joint indices of skinned meshes inside their skin.
 * @param {{ json: object, binary: Buffer }} glb A file read by readGlb().
 * @returns {Promise<{ primitives: number, problems: string[] }>} How many primitives decoded,
 *   and what is wrong.
 */
export async function checkDracoPrimitives(glb) {
  const gltf = glb.json;
  const jointsOfMesh = new Map();
  for (const node of gltf.nodes ?? []) {
    if (node.mesh !== undefined && node.skin !== undefined) {
      jointsOfMesh.set(node.mesh, gltf.skins[node.skin].joints.length);
    }
  }
  const compressed = [];
  (gltf.meshes ?? []).forEach((mesh, index) => {
    for (const primitive of mesh.primitives ?? []) {
      if (primitive.extensions?.[DRACO]) compressed.push({ mesh, index, primitive });
    }
  });
  const problems = [];
  if (compressed.length === 0) return { primitives: 0, problems };
  if (!(gltf.extensionsRequired ?? []).includes(DRACO)) problems.push(`${DRACO} is used but not required`);
  const draco = await dracoDecoder();
  const decoder = new draco.Decoder();
  let primitives = 0;
  for (const { mesh, index, primitive } of compressed) {
    const where = `mesh "${mesh.name ?? index}"`;
    const extension = primitive.extensions[DRACO];
    const view = gltf.bufferViews[extension.bufferView];
    const bytes = new Int8Array(glb.binary.buffer, glb.binary.byteOffset + (view.byteOffset ?? 0), view.byteLength);
    const geometry = new draco.Mesh();
    const status = decoder.DecodeArrayToMesh(bytes, bytes.byteLength, geometry);
    if (!status.ok() || geometry.ptr === 0) {
      problems.push(`${where}: Draco decoding failed: ${status.error_msg()}`);
      draco.destroy(geometry);
      continue;
    }
    primitives += 1;
    const points = geometry.num_points();
    const positions = gltf.accessors[primitive.attributes.POSITION];
    if (points !== positions.count) problems.push(`${where}: ${points} decoded vertices, accessor says ${positions.count}`);
    if (primitive.indices !== undefined && geometry.num_faces() * 3 !== gltf.accessors[primitive.indices].count) {
      problems.push(`${where}: ${geometry.num_faces()} decoded triangles, accessor says ${gltf.accessors[primitive.indices].count / 3}`);
    }
    for (const semantic of Object.keys(primitive.attributes)) {
      if (!(semantic in extension.attributes)) problems.push(`${where}: ${semantic} is not in the Draco data`);
    }
    for (const [semantic, id] of Object.entries(extension.attributes)) {
      const accessor = gltf.accessors[primitive.attributes[semantic]];
      const attribute = decoder.GetAttributeByUniqueId(geometry, id);
      if (!accessor || !attribute || attribute.ptr === 0) {
        problems.push(`${where}: ${semantic} (Draco id ${id}) is missing`);
        continue;
      }
      if (attribute.num_components() !== COMPONENTS[accessor.type]) {
        problems.push(`${where}: ${semantic} has ${attribute.num_components()} components, accessor says ${accessor.type}`);
      }
      if (semantic === 'JOINTS_0' && jointsOfMesh.has(index)) {
        const count = points * 4;
        const pointer = draco._malloc(count * 2);
        decoder.GetAttributeDataArrayForAllPoints(geometry, attribute, draco.DT_UINT16, count * 2, pointer);
        const joints = new Uint16Array(draco.HEAPU16.buffer, pointer, count).slice();
        draco._free(pointer);
        const largest = joints.reduce((a, b) => Math.max(a, b), 0);
        if (largest >= jointsOfMesh.get(index)) problems.push(`${where}: joint ${largest} is outside its skin`);
      }
    }
    draco.destroy(geometry);
  }
  draco.destroy(decoder);
  return { primitives, problems };
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
