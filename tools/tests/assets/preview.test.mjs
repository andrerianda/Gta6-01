// The Cycles preview of a built (Draco-compressed) file: Blender's glTF importer on our machines
// has no Draco library, so art/blender/lib/preview.py imports a plain copy decoded by
// glb.Document.decompress(). These tests prove that copy holds exactly the geometry the game's
// own decoder (game/vendor/three/draco/) reads from the shipped file, and that Blender imports it.
// They need Blender's Python (MARAZUL_PYTHON, default /opt/marazul-blender/bin/python) and skip
// without it. Run with: node --test "tools/tests/assets/*.test.mjs"
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { dracoDecoder, readGlb } from './glbFile.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoDir = join(here, '..', '..', '..');
const assetsDir = join(repoDir, 'game', 'assets');
const PYTHON = process.env.MARAZUL_PYTHON ?? '/opt/marazul-blender/bin/python';
const DRACO = 'KHR_draco_mesh_compression';
const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const ARRAYS = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
// One file of each kind the artists preview most: a skinned person, a vehicle, a building kit.
const SAMPLE_DOMAINS = ['characters', 'vehicles', 'buildings'];

// Writes plain copies with the preview's own function, then imports one of them into Blender
// and prints, per file, the triangles Blender's importer made.
const PYTHON_SCRIPT = `
import json, sys
sys.path.insert(0, 'art/blender')
import bpy
from lib import preview, scene
out, paths = sys.argv[1], sys.argv[2:]
report = []
for path in paths:
    copy = preview.plain_copy(path, out)
    scene.reset_scene()
    bpy.ops.import_scene.gltf(filepath=copy)
    meshes = {obj.data for obj in bpy.data.objects if obj.type == 'MESH'
              and not all(c.name.startswith(preview.IMPORTER_HELPERS) for c in obj.users_collection)}
    report.append({'path': path, 'copy': copy,
                   'triangles': sum(sum(len(p.vertices) - 2 for p in mesh.polygons) for mesh in meshes)})
print('RESULT ' + json.dumps(report))
`;

async function sampleFiles() {
  const files = [];
  for (const domain of SAMPLE_DOMAINS) {
    let names = [];
    try {
      names = (await readdir(join(assetsDir, domain))).filter((name) => name.endsWith('.glb')).sort();
    } catch {
      continue;
    }
    if (names.length) files.push(join(assetsDir, domain, names[0]));
  }
  return files;
}

function accessorArray(glb, index) {
  const accessor = glb.json.accessors[index];
  const view = glb.json.bufferViews[accessor.bufferView];
  const Type = ARRAYS[accessor.componentType];
  const components = COMPONENTS[accessor.type];
  const start = glb.binary.byteOffset + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const stride = view.byteStride ?? Type.BYTES_PER_ELEMENT * components;
  const out = new Type(accessor.count * components);
  const bytes = new Uint8Array(glb.binary.buffer);
  for (let row = 0; row < accessor.count; row += 1) {
    const rowBytes = bytes.slice(start + row * stride, start + row * stride + Type.BYTES_PER_ELEMENT * components);
    out.set(new Type(rowBytes.buffer), row * components);
  }
  return out;
}

// Decodes one primitive the way three.js's DRACOLoader does for the game: every attribute into
// its accessor's component type, for all points, and the triangles as 32-bit indices.
function gameDecode(draco, glb, primitive) {
  const extension = primitive.extensions[DRACO];
  const view = glb.json.bufferViews[extension.bufferView];
  const bytes = new Int8Array(glb.binary.buffer, glb.binary.byteOffset + (view.byteOffset ?? 0), view.byteLength);
  const decoder = new draco.Decoder();
  const geometry = new draco.Mesh();
  const status = decoder.DecodeArrayToMesh(bytes, bytes.byteLength, geometry);
  assert.ok(status.ok(), `Draco decoding failed: ${status.error_msg()}`);
  const types = { 5120: draco.DT_INT8, 5121: draco.DT_UINT8, 5122: draco.DT_INT16, 5123: draco.DT_UINT16, 5125: draco.DT_UINT32, 5126: draco.DT_FLOAT32 };
  const attributes = {};
  for (const [semantic, id] of Object.entries(extension.attributes)) {
    const accessor = glb.json.accessors[primitive.attributes[semantic]];
    const Type = ARRAYS[accessor.componentType];
    const attribute = decoder.GetAttributeByUniqueId(geometry, id);
    const count = geometry.num_points() * attribute.num_components();
    const pointer = draco._malloc(count * Type.BYTES_PER_ELEMENT);
    decoder.GetAttributeDataArrayForAllPoints(geometry, attribute, types[accessor.componentType], count * Type.BYTES_PER_ELEMENT, pointer);
    attributes[semantic] = new Type(draco.HEAPU8.buffer, pointer, count).slice();
    draco._free(pointer);
  }
  const indexCount = geometry.num_faces() * 3;
  const pointer = draco._malloc(indexCount * 4);
  decoder.GetTrianglesUInt32Array(geometry, indexCount * 4, pointer);
  const indices = new Uint32Array(draco.HEAPU8.buffer, pointer, indexCount).slice();
  draco._free(pointer);
  draco.destroy(geometry);
  draco.destroy(decoder);
  return { attributes, indices };
}

function sameBits(a, b) {
  return a.length === b.length && Buffer.compare(Buffer.from(a.buffer, a.byteOffset, a.byteLength),
    Buffer.from(b.buffer, b.byteOffset, b.byteLength)) === 0;
}

test('the Cycles preview imports exactly the geometry the game decodes', { timeout: 240000 }, async (context) => {
  const files = await sampleFiles();
  if (!existsSync(PYTHON) || files.length === 0) {
    context.skip(`needs Blender's Python (${PYTHON}) and built files`);
    return;
  }
  const out = await mkdtemp(join(tmpdir(), 'marazul-preview-test-'));
  try {
    const { stdout } = await promisify(execFile)(PYTHON, ['-B', '-c', PYTHON_SCRIPT, out, ...files],
      { cwd: repoDir, maxBuffer: 64 * 1024 * 1024, timeout: 220000 });
    const line = stdout.split('\n').find((text) => text.startsWith('RESULT '));
    assert.ok(line, `no result from Blender's Python:\n${stdout.slice(-2000)}`);
    const report = JSON.parse(line.slice('RESULT '.length));
    const draco = await dracoDecoder();
    for (const { path, copy, triangles } of report) {
      const name = path.slice(assetsDir.length + 1);
      const shipped = await readGlb(path);
      const plain = await readGlb(copy);
      assert.ok(!(plain.json.extensionsUsed ?? []).includes(DRACO), `${name}: the preview copy still uses Draco`);
      assert.equal(plain.json.meshes.length, shipped.json.meshes.length, `${name}: mesh count`);
      assert.deepEqual(plain.json.nodes.map((node) => node.name), shipped.json.nodes.map((node) => node.name), `${name}: nodes`);
      let compressed = 0;
      let expectedTriangles = 0;
      shipped.json.meshes.forEach((mesh, meshIndex) => {
        mesh.primitives.forEach((primitive, primitiveIndex) => {
          const where = `${name} mesh "${mesh.name}" primitive ${primitiveIndex}`;
          const twin = plain.json.meshes[meshIndex].primitives[primitiveIndex];
          assert.equal(twin.extensions?.[DRACO], undefined, `${where}: still compressed`);
          expectedTriangles += shipped.json.accessors[primitive.indices].count / 3;
          if (!primitive.extensions?.[DRACO]) return;
          compressed += 1;
          const game = gameDecode(draco, shipped, primitive);
          for (const [semantic, values] of Object.entries(game.attributes)) {
            assert.ok(sameBits(accessorArray(plain, twin.attributes[semantic]), values),
              `${where}: ${semantic} differs from the game's decoding`);
          }
          const indices = Uint32Array.from(accessorArray(plain, twin.indices));
          assert.ok(sameBits(indices, game.indices), `${where}: triangles differ from the game's decoding`);
        });
      });
      assert.ok(compressed > 0, `${name}: expected Draco-compressed primitives to decode`);
      assert.equal(triangles, expectedTriangles, `${name}: Blender imported ${triangles} triangles, the file has ${expectedTriangles}`);
    }
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});
