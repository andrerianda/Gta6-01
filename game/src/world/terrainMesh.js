// The ground of Marazul: one height-field mesh per 128 m sector on the plan's own 4 m grid (so
// its heights are the plan's, and neighbouring sectors share their edge vertices exactly), and
// one coarse mesh of the whole island under them for the distance. The ground blends grass,
// beach sand (darkened where the sea wets it), bare dirt, wetland mud and the concrete of built
// lots in one material; under road corridors it sinks out of sight below the street meshes.
//
//   const material = createTerrainGroundMaterial(surfaces);
//   const mesh = buildTerrainSectorMesh(plan, { minX, minZ, size: 128 }, material);
//   const backdrop = buildDistantTerrainMesh(plan, material);

import * as THREE from 'three';

/** Grid step of the sector meshes: the plan's height-field step. */
const TERRAIN_STEP = 4;
/** Open ground closer than this to a beach shore is sand, metres. */
const BEACH_REACH = 135;
/** Open ground closer than this to a quay shore (marina, port) is the paved apron, metres. */
const QUAY_APRON = 38;
/** Ground under paved and dirt road corridors is pressed this far down, below the streets. */
const CORRIDOR_SINK = 0.45;
/** The distant mesh lies this far under the sector meshes, so built sectors always cover it. */
const DISTANT_SINK = 1.6;
const DIRT_DISTRICTS = new Set(['puerto_tamarindo', 'barrio_hierro']);

/**
 * The blended ground material. Grass is the base; a vertex attribute `groundMix` (sand, dirt,
 * mud, concrete weights) mixes the others in.
 * @param {ReturnType<import('../render/textures/surfaceMaterials.js').createSurfaceLibrary>} surfaces
 * @returns {THREE.MeshStandardMaterial}
 */
export function createTerrainGroundMaterial(surfaces) {
  const grass = surfaces.getTextures('grass');
  const sand = surfaces.getTextures('sand');
  const dirt = surfaces.getTextures('dirt');
  const mud = surfaces.getTextures('mud');
  const concrete = surfaces.getTextures('concrete');
  const material = new THREE.MeshStandardMaterial({
    map: grass.map,
    normalMap: grass.normalMap,
    roughnessMap: grass.ormMap,
    aoMap: grass.ormMap,
    roughness: 1,
    metalness: 0,
  });
  material.name = 'terrain-ground';
  const scale = (set) => grass.tileMetres / set.tileMetres;
  const uniforms = {
    groundSandMap: { value: sand.map },
    groundSandNormal: { value: sand.normalMap },
    groundDirtMap: { value: dirt.map },
    groundMudMap: { value: mud.map },
    groundConcreteMap: { value: concrete.map },
    groundScales: { value: new THREE.Vector4(scale(sand), scale(dirt), scale(mud), scale(concrete)) },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 groundMix;\nvarying vec4 vGroundMix;\nvarying float vGroundHeight;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGroundMix = groundMix;\nvGroundHeight = (modelMatrix * vec4(transformed, 1.0)).y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <normalmap_pars_fragment>', `#include <normalmap_pars_fragment>
uniform sampler2D groundSandMap;
uniform sampler2D groundSandNormal;
uniform sampler2D groundDirtMap;
uniform sampler2D groundMudMap;
uniform sampler2D groundConcreteMap;
uniform vec4 groundScales;
varying vec4 vGroundMix;
varying float vGroundHeight;
vec4 groundColour(vec2 uv) {
  vec4 w = clamp(vGroundMix, 0.0, 1.0);
  vec4 colour = texture2D(map, uv);
  // Large patches of lusher and drier grass break up the tiling.
  float patches = texture2D(groundDirtMap, uv * 0.047).g;
  colour.rgb *= mix(0.82, 1.16, smoothstep(0.25, 0.55, patches));
  colour = mix(colour, texture2D(groundDirtMap, uv * groundScales.y), w.y);
  colour = mix(colour, texture2D(groundMudMap, uv * groundScales.z), w.z);
  // The beach, by height above the sea (level 0). The plan's beach is very flat at the water
  // (0.02 m at 5 m inland, 0.08 at 10, 0.18 at 15, 0.30 at 20, 0.62 at 30). From the water up:
  // a thin glossy film where the last wave drains (about 5 m, unwobbled: it follows the sea),
  // dark wet sand to about 12 m with a broken lace of dried foam at its top, damp sand to a crisp
  // high-tide edge at about 23 m marked by a dark line of wrack, then warm dry sand. A slow
  // wobble keeps the bands off the exact contour. The sea's own foam lies on the waterline.
  vec4 sand = texture2D(groundSandMap, uv * groundScales.x);
  sand.rgb *= vec3(1.06, 1.0, 0.86);
  float wobble = texture2D(groundDirtMap, uv * 0.11).g - 0.5;
  float h = vGroundHeight + wobble * 0.07;
  float film = 1.0 - smoothstep(0.015, 0.045, vGroundHeight);
  float wet = 1.0 - smoothstep(0.07, 0.15, h);
  float damp = 1.0 - smoothstep(0.36, 0.43, h);
  float wrack = smoothstep(0.4, 0.43, h) * (1.0 - smoothstep(0.45, 0.5, h));
  wrack *= smoothstep(0.35, 0.6, texture2D(groundDirtMap, uv * 0.37).g);
  float lace = smoothstep(0.05, 0.065, h) * (1.0 - smoothstep(0.075, 0.1, h));
  lace *= smoothstep(0.45, 0.7, texture2D(groundDirtMap, uv * 0.31).g);
  sand.rgb *= mix(1.0, 0.8, damp) * mix(1.0, 0.85, film);
  sand.rgb *= mix(vec3(1.0), vec3(0.6, 0.58, 0.58), wet);
  sand.rgb = mix(sand.rgb, sand.rgb * vec3(0.5, 0.46, 0.4), wrack * 0.85);
  sand.rgb = mix(sand.rgb, vec3(0.8, 0.82, 0.8), lace * 0.6);
  colour = mix(colour, sand, w.x);
  return mix(colour, texture2D(groundConcreteMap, uv * groundScales.w), w.w);
}
vec4 groundNormal(vec2 uv) {
  vec4 w = clamp(vGroundMix, 0.0, 1.0);
  vec4 normal = mix(texture2D(normalMap, uv), texture2D(groundSandNormal, uv * groundScales.x), w.x);
  // The draining film is smooth: it mirrors the sky.
  normal = mix(normal, vec4(0.5, 0.5, 1.0, 1.0), w.x * 0.75 * (1.0 - smoothstep(0.015, 0.045, vGroundHeight)));
  return mix(normal, vec4(0.5, 0.5, 1.0, 1.0), w.w * 0.7);
}`)
      .replace('#include <map_fragment>', THREE.ShaderChunk.map_fragment.replace('texture2D( map, vMapUv )', 'groundColour( vMapUv )'))
      // Wet sand has a dull sheen; only the film at the water is glossy and catches the low sun.
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
float beachSand = clamp(vGroundMix.x, 0.0, 1.0);
roughnessFactor = mix(roughnessFactor, 0.55, beachSand * (1.0 - smoothstep(0.07, 0.15, vGroundHeight)));
roughnessFactor = mix(roughnessFactor, 0.12, beachSand * (1.0 - smoothstep(0.015, 0.045, vGroundHeight)));`)
      .replace(
        '#include <normal_fragment_maps>',
        THREE.ShaderChunk.normal_fragment_maps.replace('texture2D( normalMap, vNormalMapUv )', 'groundNormal( vNormalMapUv )'),
      );
  };
  material.customProgramCacheKey = () => 'marazul-terrain-ground';
  return material;
}

/**
 * The ground weights at a point: [sand, dirt, mud, concrete].
 * @param {Object} plan
 * @param {number} x
 * @param {number} z
 * @param {number} code The plan's cover code there.
 * @param {number[]} out
 */
function groundMixAt(plan, x, z, code, out) {
  out[0] = 0;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  if (code >= 3) {
    if (plan.lots[code - 3].zone !== 'park') out[3] = 1;
    return out;
  }
  if (code === 1 || code === 2) {
    out[3] = 1;
    return out;
  }
  const shore = plan.shoreDistanceAt(x, z);
  const kind = shore < BEACH_REACH ? plan.terrain.shoreKindAt?.(x, z) : null;
  // The marina's and the port's apron is paved right up to the quay wall, not lawn or dirt.
  if (kind === 'quay' && shore >= 0 && shore < QUAY_APRON) {
    out[3] = Math.min(1, (QUAY_APRON - shore) / 4);
    if (out[3] >= 1) return out;
  }
  if (shore < 2) out[0] = 1;
  else out[0] = Math.min(1, Math.max(0, plan.terrain.naturalSandAt(x, z)));
  // A beach runs up to the promenade (about 120 m from the water on Playa Dorada), not to a
  // strip of lawn: open ground that near a beach shore is sand too.
  if (out[0] < 1 && kind === 'beach') {
    out[0] = Math.max(out[0], Math.min(1, (BEACH_REACH - shore) / 10));
  }
  const wet = plan.wetlandAt ? plan.wetlandAt(x, z) : 0;
  out[2] = Math.min(1, Math.max(0, wet * 1.4 - 0.2));
  if (DIRT_DISTRICTS.has(plan.districtAt(x, z))) out[1] = 0.85;
  return out;
}

/**
 * The ground of one sector, or null where it is all deep sea floor.
 * @param {Object} plan The city plan.
 * @param {{minX: number, minZ: number, size: number}} bounds
 * @param {THREE.Material} material From createTerrainGroundMaterial.
 * @returns {Generator<undefined, ?THREE.Mesh>} A generator that yields between bands of rows
 *   (use `yield*` inside a job) and returns the mesh.
 */
export function* buildTerrainSectorMesh(plan, bounds, material) {
  const cells = Math.round(bounds.size / TERRAIN_STEP);
  const side = cells + 1;
  const positions = new Float32Array(side * side * 3);
  const uvs = new Float32Array(side * side * 2);
  const mix = new Float32Array(side * side * 4);
  const weights = [0, 0, 0, 0];
  let highest = -Infinity;
  for (let r = 0; r < side; r += 1) {
    if (r % 6 === 5) yield;
    for (let c = 0; c < side; c += 1) {
      const x = bounds.minX + c * TERRAIN_STEP;
      const z = bounds.minZ + r * TERRAIN_STEP;
      const code = plan.cover.codeAt(x, z);
      let y = safeHeightAt(plan, x, z);
      highest = Math.max(highest, y);
      if ((code === 1 || code === 2) && y > -0.5) y -= CORRIDOR_SINK;
      const i = r * side + c;
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      uvs[i * 2] = x;
      uvs[i * 2 + 1] = z;
      groundMixAt(plan, x, z, code, weights);
      mix.set(weights, i * 4);
    }
  }
  if (highest < -9) return null;
  return gridMesh(positions, uvs, mix, side, material, 'terrain-sector');
}

/**
 * A coarse ground for the whole plan, shown wherever no sector is built yet.
 * @param {Object} plan
 * @param {THREE.Material} material
 * @param {number} [step] Grid step in metres; default 32.
 * @returns {THREE.Mesh}
 */
export function buildDistantTerrainMesh(plan, material, step = 32) {
  const { minX, maxX, minZ, maxZ } = plan.frame.extent;
  const columns = Math.ceil((maxX - minX) / step) + 1;
  const rows = Math.ceil((maxZ - minZ) / step) + 1;
  const side = Math.max(columns, rows);
  const positions = new Float32Array(side * side * 3);
  const uvs = new Float32Array(side * side * 2);
  const mix = new Float32Array(side * side * 4);
  const weights = [0, 0, 0, 0];
  for (let r = 0; r < side; r += 1) {
    for (let c = 0; c < side; c += 1) {
      const x = minX + c * step;
      const z = minZ + r * step;
      const i = r * side + c;
      positions[i * 3] = x;
      positions[i * 3 + 1] = safeHeightAt(plan, x, z) - DISTANT_SINK;
      positions[i * 3 + 2] = z;
      uvs[i * 2] = x;
      uvs[i * 2 + 1] = z;
      groundMixAt(plan, x, z, plan.cover.codeAt(x, z), weights);
      if (weights[3] > 0) weights[3] = 0.6;
      mix.set(weights, i * 4);
    }
  }
  const mesh = gridMesh(positions, uvs, mix, side, material, 'terrain-distant');
  mesh.receiveShadow = false;
  return mesh;
}

/**
 * The plan's height, stepping a little aside where the height field answers NaN (a few points
 * in carved water do; reported to the plan's owner).
 */
export function safeHeightAt(plan, x, z) {
  const y = plan.heightAt(x, z);
  if (Number.isFinite(y)) return y;
  for (const [dx, dz] of [[0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6], [2, 2], [-2, -2]]) {
    const near = plan.heightAt(x + dx, z + dz);
    if (Number.isFinite(near)) return near;
  }
  return -2;
}

function gridMesh(positions, uvs, mix, side, material, name) {
  const indices = new (side * side > 65535 ? Uint32Array : Uint16Array)((side - 1) * (side - 1) * 6);
  let k = 0;
  for (let r = 0; r < side - 1; r += 1) {
    for (let c = 0; c < side - 1; c += 1) {
      const a = r * side + c;
      const b = a + 1;
      const d = a + side;
      const e = d + 1;
      // Rows run south (+Z): a, d, b is counter-clockwise seen from above.
      indices[k++] = a; indices[k++] = d; indices[k++] = b;
      indices[k++] = b; indices[k++] = d; indices[k++] = e;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute('groundMix', new THREE.BufferAttribute(mix, 4));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  return mesh;
}
