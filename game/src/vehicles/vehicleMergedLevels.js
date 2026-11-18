// One draw call per car at the lower levels of detail. A vehicle asset's lod1 and lod2 are one
// mesh per material (atlas, paint, glass, lenses, lamps: about seven draws); here each level is
// merged once per asset into one geometry, and every car of that model draws it with one
// material chosen by paint colour, lamp state and siren state (cached and shared). Per-vertex
// attributes remember which source material a vertex came from:
//   color      the source material's base colour (white for paint: the paint comes from the
//              material; glass darkened, as it reads from a distance),
//   farMix.x   1 where the atlas texture applies,
//   farMix.y   1 where the car's paint colour applies,
//   farMix.z   lamp code: 1 head and tail lamps (glow with the lamps on), 2 siren a, 3 siren b,
//              4 brake, 5 reversing, 6 and 7 the indicators (lit only by the near level's state),
//   farMix.w   1 for glossy surfaces (paint, glass, lenses).
// The same geometry, drawn with an invisible material, is the shadow caster of a near car, so a
// near car casts one shadow draw instead of one per part. settleMergedVehicleLevels seats the
// merged levels on the road where the physics wheels touch it.
import * as THREE from 'three';
import { dayEnvironmentOf, trackVehicleMaterial } from './vehicleNightReflections.js';
import { tuneVehicleGlass } from './vehicleGlass.js';

const LAMP_CODES = {
  lamp_head: 1, lamp_tail: 1, lamp_siren_a: 2, lamp_siren_b: 3, lamp_brake: 4, lamp_reverse: 5, lamp_indicator_l: 6, lamp_indicator_r: 7,
};
/** @type {WeakMap<object, Map<number, {geometry: THREE.BufferGeometry, map: THREE.Texture | null}>>} */
const mergedByAsset = new WeakMap();
/** @type {WeakMap<object, Map<string, THREE.Material>>} */
const materialsByAsset = new WeakMap();
/** Opaque window glass of the merged levels: the (tuned) glass tint times this (was 0.16). */
const GLASS_SHADE = 0.22;
const shadowOnly =new THREE.MeshBasicMaterial({ name: 'vehicle_shadow_caster', colorWrite: false, depthWrite: false });
const vertex = new THREE.Vector3();
const normalMatrix = new THREE.Matrix3();
const tint = new THREE.Color();

/**
 * The merged geometry of one level of an asset (made on first use, then shared).
 * @param {import('../assets/Asset.js').Asset} asset A loaded vehicle asset.
 * @param {number} level 1 or 2 (clamped to the asset's levels).
 * @returns {{geometry: THREE.BufferGeometry, map: THREE.Texture | null}}
 */
export function mergedVehicleLevel(asset, level) {
  let levels = mergedByAsset.get(asset);
  if (!levels) mergedByAsset.set(asset, (levels = new Map()));
  const wanted = Math.max(0, Math.min(level, asset.lodCount - 1));
  if (!levels.has(wanted)) levels.set(wanted, buildMergedLevel(asset, wanted));
  return levels.get(wanted);
}

function roleColour(material, out) {
  const name = material.name ?? '';
  if (name === 'paint') return out.setRGB(1, 1, 1);
  out.copy(material.color ?? tint.setRGB(1, 1, 1));
  if (name === 'glass') return out.multiplyScalar(GLASS_SHADE).addScalar(0.02);
  if (name === 'glass_lens') return out.multiplyScalar(0.55);
  if (name.startsWith('lamp_') && material.emissive && material.emissive.getHex() !== 0) out.lerp(material.emissive, 0.5);
  return out;
}

function buildMergedLevel(asset, level) {
  tuneVehicleGlass(asset); // the same window shade as the near level (traffic's batches too)
  const instance = asset.instantiate({ lod: level });
  instance.updateMatrixWorld(true);
  const parts = [];
  instance.traverse((node) => {
    if (node.isMesh && node.geometry?.attributes?.position) parts.push(node);
  });
  const merged = mergeVehicleParts(parts, instance);
  merged.geometry.name = `${asset.id}_merged_lod${level}`;
  return merged;
}

/**
 * Merges meshes of a vehicle into one geometry with the role attributes above, in the space of
 * `space` (the near level merges its body in the lod0 node's space and each door in its hinge's).
 * @param {THREE.Mesh[]} parts Meshes with world matrices up to date.
 * @param {THREE.Object3D} space The node whose local space the geometry is in.
 * @returns {{geometry: THREE.BufferGeometry, map: THREE.Texture | null}}
 */
export function mergeVehicleParts(parts, space) {
  let map = null;
  for (const part of parts) {
    const material = part.material;
    if (material?.map && (!map || material.name === 'atlas')) map = material.map;
  }
  const toSpace = new THREE.Matrix4().copy(space.matrixWorld).invert();
  const relative = new THREE.Matrix4();
  let vertexCount = 0;
  let indexCount = 0;
  for (const part of parts) {
    vertexCount += part.geometry.attributes.position.count;
    indexCount += part.geometry.index ? part.geometry.index.count : part.geometry.attributes.position.count;
  }
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const colours = new Float32Array(vertexCount * 3);
  const mixes = new Float32Array(vertexCount * 4);
  const indices = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
  let v = 0;
  let k = 0;
  for (const part of parts) {
    const { geometry, material } = part;
    const matrixWorld = relative.multiplyMatrices(toSpace, part.matrixWorld);
    const position = geometry.attributes.position;
    const normal = geometry.attributes.normal ?? null;
    const uv = geometry.attributes.uv ?? null;
    const sourceColour = geometry.attributes.color ?? null;
    normalMatrix.getNormalMatrix(matrixWorld);
    roleColour(material, tint);
    const name = material.name ?? '';
    const textured = map && material.map === map ? 1 : 0;
    const painted = name === 'paint' ? 1 : 0;
    const lamp = LAMP_CODES[name] ?? 0;
    const glossy = painted || name.startsWith('glass') ? 1 : 0;
    for (let i = 0; i < position.count; i += 1) {
      vertex.fromBufferAttribute(position, i).applyMatrix4(matrixWorld);
      positions.set([vertex.x, vertex.y, vertex.z], (v + i) * 3);
      if (normal) vertex.fromBufferAttribute(normal, i).applyMatrix3(normalMatrix).normalize();
      else vertex.set(0, 1, 0);
      normals.set([vertex.x, vertex.y, vertex.z], (v + i) * 3);
      if (uv) uvs.set([uv.getX(i), uv.getY(i)], (v + i) * 2);
      const r = sourceColour ? sourceColour.getX(i) : 1;
      const g = sourceColour ? sourceColour.getY(i) : 1;
      const b = sourceColour ? sourceColour.getZ(i) : 1;
      colours.set([tint.r * r, tint.g * g, tint.b * b], (v + i) * 3);
      mixes.set([textured, painted, lamp, glossy], (v + i) * 4);
    }
    if (geometry.index) for (let i = 0; i < geometry.index.count; i += 1) indices[k + i] = geometry.index.getX(i) + v;
    else for (let i = 0; i < position.count; i += 1) indices[k + i] = v + i;
    k += geometry.index ? geometry.index.count : position.count;
    v += position.count;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  merged.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  merged.setAttribute('farMix', new THREE.BufferAttribute(mixes, 4));
  merged.setIndex(new THREE.BufferAttribute(indices, 1));
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return { geometry: merged, map };
}

function patchShader(shader) {
  shader.uniforms.farPaint = { value: this.userData.farPaint };
  shader.uniforms.farLamps = { value: this.userData.farLamps };
  shader.uniforms.farLampsMore = { value: this.userData.farLampsMore };
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec4 farMix;\nvarying vec4 vFarMix;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFarMix = farMix;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec4 vFarMix;\nuniform vec3 farPaint;\nuniform vec3 farLamps;\nuniform vec4 farLampsMore;')
    // The near level's clear coat (MeshPhysicalMaterial) is on the paint only.
    .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\nmaterial.clearcoat *= vFarMix.y;\n#endif')
    .replace('#include <map_fragment>', [
      '#ifdef USE_MAP',
      '  diffuseColor *= mix( vec4( 1.0 ), texture2D( map, vMapUv ), vFarMix.x );',
      '#endif',
      'diffuseColor.rgb *= mix( vec3( 1.0 ), farPaint, vFarMix.y );',
    ].join('\n'))
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix( roughnessFactor, 0.14, vFarMix.w );')
    .replace('#include <emissivemap_fragment>', [
      '#include <emissivemap_fragment>',
      'float farGlow = vFarMix.z < 0.5 ? 0.0 : vFarMix.z < 1.5 ? farLamps.x : vFarMix.z < 2.5 ? farLamps.y : vFarMix.z < 3.5 ? farLamps.z',
      '  : vFarMix.z < 4.5 ? farLampsMore.x : vFarMix.z < 5.5 ? farLampsMore.y : vFarMix.z < 6.5 ? farLampsMore.z : farLampsMore.w;',
      'totalEmissiveRadiance += vColor.rgb * farGlow * 2.5;',
    ].join('\n'));
}

function programKey() {
  return 'vehicle_merged_v2';
}

/**
 * The material of a merged level: one per asset, paint colour, lamp state and siren state.
 * @param {import('../assets/Asset.js').Asset} asset The vehicle asset.
 * @param {{map: THREE.Texture | null}} merged From mergedVehicleLevel.
 * @param {THREE.ColorRepresentation} colour The paint.
 * @param {boolean} lamps Head and tail lamps on.
 * @param {number} [sirens] Bit 1 siren a lit, bit 2 siren b lit.
 * @param {number} [more] Bit 1 brake, 2 reversing, 4 left indicator, 8 right indicator lit.
 * @param {boolean} [near] True for the near level: the paint's clear coat (MeshPhysicalMaterial).
 * @returns {THREE.Material}
 */
export function mergedVehicleMaterial(asset, merged, colour, lamps, sirens = 0, more = 0, near = false) {
  let cache = materialsByAsset.get(asset);
  if (!cache) materialsByAsset.set(asset, (cache = new Map()));
  const hex = new THREE.Color(colour).getHex();
  const key = `${merged.map?.uuid ?? '-'}/${hex}/${lamps ? 1 : 0}/${sirens}/${more}/${near ? 1 : 0}`;
  let material = cache.get(key);
  if (!material) {
    const paint = asset.materials?.get('paint');
    const settings = {
      name: 'vehicle_merged', map: merged.map, vertexColors: true, roughness: 0.55, metalness: 0.15,
      envMapIntensity: dayEnvironmentOf(paint),
    };
    material = near
      ? new THREE.MeshPhysicalMaterial({ ...settings, clearcoat: paint?.clearcoat ?? 0.6, clearcoatRoughness: paint?.clearcoatRoughness ?? 0.08 })
      : new THREE.MeshStandardMaterial(settings);
    material.userData.farPaint = new THREE.Color(hex);
    material.userData.farLamps = new THREE.Vector3(lamps ? 1 : 0, sirens & 1 ? 1 : 0, sirens & 2 ? 1 : 0);
    material.userData.farLampsMore = new THREE.Vector4(more & 1 ? 1 : 0, more & 2 ? 1 : 0, more & 4 ? 1 : 0, more & 8 ? 1 : 0);
    material.onBeforeCompile = patchShader;
    material.customProgramCacheKey = programKey;
    trackVehicleMaterial(material); // less sky reflection at night
    cache.set(key, material);
  }
  return material;
}

/**
 * A mesh of a merged level for one car.
 * @param {import('../assets/Asset.js').Asset} asset The vehicle asset.
 * @param {number} level 1 or 2.
 * @param {THREE.ColorRepresentation} colour The paint.
 * @param {boolean} castShadow True when this level casts sun shadows.
 * @returns {THREE.Mesh}
 */
export function createMergedVehicleMesh(asset, level, colour, castShadow) {
  const merged = mergedVehicleLevel(asset, level);
  const mesh = new THREE.Mesh(merged.geometry, mergedVehicleMaterial(asset, merged, colour, false));
  mesh.name = `merged_lod${level}`;
  mesh.userData.merged = merged;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * The shadow caster of a near car: the merged level 1 drawn with no colour and no depth, so the
 * sun's shadow passes draw the car once instead of once per part.
 * @param {import('../assets/Asset.js').Asset} asset The vehicle asset.
 * @returns {THREE.Mesh}
 */
export function createVehicleShadowCaster(asset) {
  const mesh = new THREE.Mesh(mergedVehicleLevel(asset, 1).geometry, shadowOnly);
  mesh.name = 'shadow_caster';
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  mesh.renderOrder = -1;
  return mesh;
}

function settle(mesh, height, pitch, roll) {
  if (!mesh) return;
  mesh.position.y = height;
  mesh.rotation.set(pitch, 0, roll);
}

/**
 * Seats the merged levels on the road. Their wheels are fixed at the modelled ride height, but a
 * parked car's springs hold its body a centimetre or two higher (and a heavy van leans a little),
 * which the near level hides by dropping its separate wheels to the ground. The merged levels
 * instead follow the plane through the four physics wheel offsets: lowered and tilted so every
 * wheel touches. A few multiplies, no allocation; airborne cars keep their modelled pose.
 * @param {{mid: THREE.Object3D | null, far: THREE.Object3D | null}} rig From createVehicleRig.
 * @param {{tuning: {wheels: {x: number, z: number}[]}, wheelOffset: ArrayLike<number>,
 *   wheelContact?: ArrayLike<number>}} car The physics car.
 * @returns {number} Height of the ground under the car's origin relative to the body, metres
 *   (negative when the body rides high), for the contact shadow.
 */
export function settleMergedVehicleLevels(rig, car) {
  const wheels = car.tuning.wheels;
  const offset = car.wheelOffset;
  const contact = car.wheelContact;
  if (wheels.length !== 4 || (contact && !(contact[0] && contact[1] && contact[2] && contact[3]))) {
    settle(rig.mid, 0, 0, 0);
    settle(rig.far, 0, 0, 0);
    return 0;
  }
  const front = (offset[0] + offset[1]) * 0.5;
  const rear = (offset[2] + offset[3]) * 0.5;
  const left = (offset[0] + offset[2]) * 0.5;
  const right = (offset[1] + offset[3]) * 0.5;
  const base = (wheels[2].z + wheels[3].z - wheels[0].z - wheels[1].z) * 0.5;
  const track = (wheels[1].x + wheels[3].x - wheels[0].x - wheels[2].x) * 0.5;
  // The plane height(x, z) = h0 + sx x + sz z through the wheels; a turn of -sz about X and sx
  // about Z tilts the model by the same slopes.
  const sz = base > 0.1 ? (rear - front) / base : 0;
  const sx = track > 0.1 ? (right - left) / track : 0;
  const cx = (wheels[0].x + wheels[1].x + wheels[2].x + wheels[3].x) * 0.25;
  const cz = (wheels[0].z + wheels[1].z + wheels[2].z + wheels[3].z) * 0.25;
  const h0 = (front + rear) * 0.5 - sx * cx - sz * cz;
  settle(rig.mid, h0, -sz, sx);
  settle(rig.far, h0, -sz, sx);
  return h0;
}

/**
 * Re-chooses the material of a merged mesh (paint, lamps, sirens); cheap when nothing changed.
 * @param {THREE.Mesh} mesh From createMergedVehicleMesh.
 * @param {import('../assets/Asset.js').Asset} asset The vehicle asset.
 * @param {THREE.ColorRepresentation} colour The paint.
 * @param {boolean} lamps Head and tail lamps on.
 * @param {number} sirens Bit 1 siren a lit, bit 2 siren b lit.
 */
export function setMergedVehicleLook(mesh, asset, colour, lamps, sirens) {
  mesh.material = mergedVehicleMaterial(asset, mesh.userData.merged, colour, lamps, sirens);
}
