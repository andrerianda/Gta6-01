// The Norvast island's ground as meshes: tiles of 320 m cut from the baked height grid at three
// levels of detail (4, 8 and 16 m, with skirts that hide the seams between levels), one blended
// material of dark rock, scree, sparse dry scrub and cove sand built from the city's surface
// library (lit like the city's ground), and the low silhouette mesh drawn from far away.
// Geometry is in the island's own frame: x along the strip, z to its north side.
import * as THREE from 'three';
import { NORVAST_ISLAND_SHAPE, islandFloorDistanceLocal, islandHeightLocal } from './norvastIslandShape.js';

/** Grid cells along one side of a tile. */
export const ISLAND_TILE_CELLS = 80;
/** Grid cells between vertices at each level of detail. */
export const ISLAND_LOD_STRIDES = Object.freeze([1, 2, 4]);

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * Builds one tile of the island's ground at one level of detail.
 * @param {ReturnType<import('./islandHeightGrid.js').createIslandHeightGrid>} grid The baked grid.
 * @param {number} tileCol Tile column (along u).
 * @param {number} tileRow Tile row (along v).
 * @param {number} stride Grid cells between vertices: 1, 2 or 4.
 * @returns {THREE.BufferGeometry | null} Null when the whole tile lies under the sea.
 */
export function buildIslandTileGeometry(grid, tileCol, tileRow, stride) {
  const side = ISLAND_TILE_CELLS / stride + 1;
  const col0 = tileCol * ISLAND_TILE_CELLS, row0 = tileRow * ISLAND_TILE_CELLS;
  const step = grid.step;
  const count = side * side + side * 4;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const mix = new Float32Array(count * 3);
  let highest = -Infinity;
  for (let j = 0; j < side; j += 1) {
    const row = row0 + j * stride;
    for (let i = 0; i < side; i += 1) {
      const col = col0 + i * stride;
      const index = j * side + i;
      const u = grid.minU + col * step, v = grid.minV + row * step;
      const h = grid.at(col, row);
      if (h > highest) highest = h;
      const slopeU = (grid.at(col + stride, row) - grid.at(col - stride, row)) / (2 * stride * step);
      const slopeV = (grid.at(col, row + stride) - grid.at(col, row - stride)) / (2 * stride * step);
      const inverse = 1 / Math.sqrt(slopeU * slopeU + 1 + slopeV * slopeV);
      positions[index * 3] = u;
      positions[index * 3 + 1] = h;
      positions[index * 3 + 2] = v;
      normals[index * 3] = -slopeU * inverse;
      normals[index * 3 + 1] = inverse;
      normals[index * 3 + 2] = -slopeV * inverse;
      // Sheared so the texture does not smear down a cliff face.
      uvs[index * 2] = u + h * 0.6;
      uvs[index * 2 + 1] = v + h * 0.8;
      const made = islandFloorDistanceLocal(u, v);
      const sand = h < 0 ? 0.7 : (1 - smooth(1.6, 3.2, h)) * smooth(0.7, 0.85, inverse);
      const patches = 0.5 + 0.5 * Math.sin(u * 0.047 + Math.sin(v * 0.039) * 2.1) * Math.cos(v * 0.053 + u * 0.011);
      const scrub = smooth(0.82, 0.92, inverse) * smooth(8, 26, made) * smooth(5, 12, h) * smooth(0.35, 0.75, patches);
      const packed = 1 - smooth(1, 9, made);
      const scree = Math.max(packed, smooth(0.6, 0.8, inverse) * (1 - scrub * 0.6));
      mix[index * 3] = scree;
      mix[index * 3 + 1] = scrub;
      mix[index * 3 + 2] = sand;
    }
  }
  if (highest < -0.5) return null;

  const indices = new Uint16Array((side - 1) * (side - 1) * 6 + (side - 1) * 4 * 12);
  let cursor = 0;
  for (let j = 0; j < side - 1; j += 1) {
    for (let i = 0; i < side - 1; i += 1) {
      const a = j * side + i, b = a + 1, c = a + side, d = c + 1;
      indices[cursor++] = a; indices[cursor++] = c; indices[cursor++] = b;
      indices[cursor++] = b; indices[cursor++] = c; indices[cursor++] = d;
    }
  }
  // Skirts: each edge again, lowered, joined to the edge with both windings.
  const drop = 2 + stride * 3;
  for (let edge = 0; edge < 4; edge += 1) {
    const base = side * side + edge * side;
    for (let k = 0; k < side; k += 1) {
      const source = edge === 0 ? k : edge === 1 ? (side - 1) * side + k : edge === 2 ? k * side : k * side + side - 1;
      const target = base + k;
      positions[target * 3] = positions[source * 3];
      positions[target * 3 + 1] = positions[source * 3 + 1] - drop;
      positions[target * 3 + 2] = positions[source * 3 + 2];
      normals.copyWithin(target * 3, source * 3, source * 3 + 3);
      uvs.copyWithin(target * 2, source * 2, source * 2 + 2);
      mix.copyWithin(target * 3, source * 3, source * 3 + 3);
      if (k === side - 1) continue;
      const next = edge === 0 ? source + 1 : edge === 1 ? source + 1 : source + side;
      indices[cursor++] = source; indices[cursor++] = next; indices[cursor++] = target;
      indices[cursor++] = next; indices[cursor++] = target + 1; indices[cursor++] = target;
      indices[cursor++] = source; indices[cursor++] = target; indices[cursor++] = next;
      indices[cursor++] = next; indices[cursor++] = target; indices[cursor++] = target + 1;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute('islandMix', new THREE.BufferAttribute(mix, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * The island's blended ground material: dark rock as the base, and a vertex attribute
 * `islandMix` (scree, scrub, sand weights) mixing the others in.
 * @param {ReturnType<import('../../render/textures/surfaceMaterials.js').createSurfaceLibrary>} surfaces
 * @returns {THREE.MeshStandardMaterial}
 */
export function createIslandTerrainMaterial(surfaces) {
  const setOf = (name) => {
    const requested = surfaces.requestMaterial(name);
    return { map: requested.map, normalMap: requested.normalMap, ormMap: requested.aoMap, tileMetres: 1 / requested.map.repeat.x };
  };
  const rock = setOf('gravel');
  const scree = setOf('dirt');
  const scrub = setOf('grassDry');
  const sand = setOf('sand');
  const material = new THREE.MeshStandardMaterial({
    map: rock.map, normalMap: rock.normalMap, roughnessMap: rock.ormMap, aoMap: rock.ormMap, roughness: 1, metalness: 0,
  });
  material.name = 'norvast-island-ground';
  const scale = (set) => rock.tileMetres / set.tileMetres;
  const uniforms = {
    islandScreeMap: { value: scree.map },
    islandScrubMap: { value: scrub.map },
    islandSandMap: { value: sand.map },
    islandScales: { value: new THREE.Vector3(scale(scree), scale(scrub), scale(sand)) },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 islandMix;\nvarying vec3 vIslandMix;\nvarying float vIslandHeight;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvIslandMix = islandMix;\nvIslandHeight = (modelMatrix * vec4(transformed, 1.0)).y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <normalmap_pars_fragment>', `#include <normalmap_pars_fragment>
uniform sampler2D islandScreeMap;
uniform sampler2D islandScrubMap;
uniform sampler2D islandSandMap;
uniform vec3 islandScales;
varying vec3 vIslandMix;
varying float vIslandHeight;
vec4 islandColour(vec2 uv) {
  vec3 w = clamp(vIslandMix, 0.0, 1.0);
  // Rock: the stone texture at two scales (slabs and grain), dark, in broad lighter and darker beds.
  float beds = texture2D(islandScreeMap, uv * 0.019).g;
  float veins = texture2D(islandScreeMap, uv * 0.13).g;
  vec4 colour = texture2D(map, uv * 0.11);
  colour.rgb = mix(colour.rgb, texture2D(map, uv * 0.83).rgb, 0.4);
  colour.rgb *= vec3(0.5, 0.49, 0.5) * mix(0.66, 1.2, smoothstep(0.3, 0.62, beds)) * mix(0.85, 1.1, veins);
  vec4 scree = texture2D(islandScreeMap, uv * islandScales.x);
  scree.rgb = mix(scree.rgb, texture2D(map, uv).rgb, 0.45) * vec3(0.8, 0.77, 0.74);
  colour = mix(colour, scree, w.x * smoothstep(0.1, 0.5, w.x + veins * 0.5));
  vec4 scrub = texture2D(islandScrubMap, uv * islandScales.y);
  scrub.rgb *= vec3(0.7, 0.78, 0.6);
  colour = mix(colour, scrub, smoothstep(0.42, 0.62, w.y * 0.7 + texture2D(islandScreeMap, uv * 0.31).g * 0.5));
  colour = mix(colour, texture2D(islandSandMap, uv * islandScales.z), w.z);
  // The sea keeps the foot of the cliffs wet and dark; a pale line of salt above it.
  float wet = 1.0 - smoothstep(0.3, 2.2 + veins, vIslandHeight);
  colour.rgb *= mix(1.0, 0.55, wet * (1.0 - w.z * 0.6));
  return colour;
}`)
      .replace('#include <map_fragment>', THREE.ShaderChunk.map_fragment.replace('texture2D( map, vMapUv )', 'islandColour( vMapUv )'))
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.45, (1.0 - smoothstep(0.3, 2.2, vIslandHeight)) * 0.8);`);
  };
  material.customProgramCacheKey = () => 'marazul-norvast-island-ground';
  return material;
}

/**
 * The island's far silhouette: a few thousand triangles of the real height function, in the
 * island's own frame. It is the far shape while the zone is not loaded and the lens of clearer
 * air over the real terrain once it is (islandFarView.js), so it follows the terrain closely
 * (40 m cells, each sample the highest rock within a third of a cell).
 * @returns {THREE.BufferGeometry}
 */
export function buildIslandSilhouetteGeometry() {
  const { minU, maxU, minV, maxV } = NORVAST_ISLAND_SHAPE.bounds;
  const cell = 40;
  const near = cell / 3;
  const cols = Math.round((maxU - minU) / cell) + 1, rows = Math.round((maxV - minV) / cell) + 1;
  const positions = new Float32Array(cols * rows * 3);
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const u = minU + i * cell, v = minV + j * cell;
      // The highest rock near the sample, so no ridge is lost between samples.
      let h = islandHeightLocal(u, v);
      if (h > 0) h = Math.max(h, islandHeightLocal(u + near, v), islandHeightLocal(u - near, v), islandHeightLocal(u, v + near), islandHeightLocal(u, v - near));
      positions.set([u, Math.max(h, -3), v], (j * cols + i) * 3);
    }
  }
  const indices = [];
  const above = (index) => positions[index * 3 + 1] > 0;
  for (let j = 0; j < rows - 1; j += 1) {
    for (let i = 0; i < cols - 1; i += 1) {
      const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
      if (above(a) || above(b) || above(c)) indices.push(a, c, b);
      if (above(b) || above(c) || above(d)) indices.push(b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
