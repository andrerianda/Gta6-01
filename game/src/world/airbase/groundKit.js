// The artists' airfield ground and equipment put to work, shared by Base Aérea Punta Garza and
// the Norvast island strip:
// - the baked, tileable ground materials and alpha decals of military/base_ground.glb laid on
//   generated slabs (one merged mesh per material): world-scale repeat, slab joints on the 4 m
//   grid, a low-frequency tint in the vertex colours so the tiling does not show from the air;
// - the items of military/base_ground_kit.glb (and any other model) drawn instanced.
// The models stay the artists'; this file only places their materials and meshes.
//
//   const ground = readGroundMaterials(assets);            // null until base_ground is loaded
//   const batch = createGroundBatch((p, q) => ({ x, z }));  // plan metres -> model metres
//   batch.rect(p0, q0, p1, q1, y, { tint: GROUND_TINTS.concrete, perCell: true });
//   batch.decal(p, q, angle, width, length, y, alpha);     batch.line(p0, q0, p1, q1, width, y);
//   new THREE.Mesh(batch.geometry(), ground.tiles.concrete);

import * as THREE from 'three';

export const GROUND_ASSET = 'base_ground';
export const GROUND_KIT_ASSET = 'base_ground_kit';
/** Metres one repeat of a ground tile covers (the asset's scene extra `tile_metres`). */
export const TILE_METRES = 4;
const TILE_NAMES = ['ground_concrete', 'ground_asphalt', 'ground_grass', 'ground_dirt'];
const DECAL_NAMES = ['decal_tyre_rubber', 'decal_oil_stain', 'decal_crack', 'decal_paint_white', 'decal_paint_yellow', 'decal_scorch'];
/** Depth offsets that stack the flat layers when seen from kilometres away: [factor, units]. */
const LAYER_OFFSET = Object.freeze({
  ground_grass: [-1, -1], ground_dirt: [-1.5, -2], ground_asphalt: [-2, -4], ground_concrete: [-2, -4],
  decal_crack: [-3, -6], decal_tyre_rubber: [-3.5, -7], decal_oil_stain: [-3.5, -7], decal_scorch: [-3.5, -7],
  decal_paint_white: [-4, -9], decal_paint_yellow: [-4, -9],
});
/** Draw order of the blended layers over one another. */
const LAYER_ORDER = Object.freeze({ decal_crack: 1, decal_tyre_rubber: 2, decal_scorch: 2, decal_oil_stain: 3, decal_paint_white: 4, decal_paint_yellow: 4 });

/**
 * The ground materials of the asset library, made ready for generated slabs: tiles repeat and
 * take a vertex tint, decals blend without writing depth; every layer has its depth offset.
 * @param {{has?: (id: string) => boolean, get?: (id: string) => any} | null} assets The asset library.
 * @param {number} [anisotropy] Anisotropic filtering for the tiles (they are seen at grazing angles).
 * @returns {{tiles: Record<string, THREE.Material>, decals: Record<string, THREE.Material>, order: Record<string, number>,
 *   dispose: () => void} | null} Null while the asset is not in memory (or lacks a tile).
 */
export function readGroundMaterials(assets, anisotropy = 8) {
  if (!assets?.has?.(GROUND_ASSET)) return null;
  let asset = null;
  try { asset = assets.get(GROUND_ASSET); } catch { return null; }
  const source = asset?.materials;
  if (!source || typeof source.get !== 'function') return null;
  const made = [];
  const ready = (name, decal) => {
    const base = source.get(name);
    if (!base) return null;
    const material = base.clone();
    material.name = `airfield-${name}`;
    material.vertexColors = true;
    material.polygonOffset = true;
    [material.polygonOffsetFactor, material.polygonOffsetUnits] = LAYER_OFFSET[name] ?? [-2, -4];
    material.side = THREE.FrontSide;
    if (decal) {
      material.transparent = true;
      material.depthWrite = false;
      material.alphaTest = 0;
    } else {
      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) {
        const texture = material[key];
        if (!texture) continue;
        const changed = texture.wrapS !== THREE.RepeatWrapping || texture.wrapT !== THREE.RepeatWrapping || texture.anisotropy < anisotropy;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.anisotropy = Math.max(texture.anisotropy, anisotropy);
        if (changed) texture.needsUpdate = true;
      }
    }
    made.push(material);
    return material;
  };
  const tiles = {};
  const decals = {};
  for (const name of TILE_NAMES) {
    const material = ready(name, false);
    if (material) tiles[name.slice('ground_'.length)] = material;
  }
  for (const name of DECAL_NAMES) {
    const material = ready(name, true);
    if (material) decals[name] = material;
  }
  if (!tiles.concrete || !tiles.asphalt) {
    for (const material of made) material.dispose();
    return null;
  }
  return { tiles, decals, order: LAYER_ORDER, dispose() { for (const material of made) material.dispose(); } };
}

// ---- Low-frequency tints (multiplied with the baked colour through the vertex colours).

const hash2 = (a, b) => {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Smooth value noise, 0..1, one unit per lattice cell. */
function valueNoise(x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0);
  const b = hash2(x0 + 1, y0);
  const c = hash2(x0, y0 + 1);
  const d = hash2(x0 + 1, y0 + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Two octaves of noise about zero: -1..1, mostly within +-0.6. */
const drift = (p, q, scale, seed) => (valueNoise(p / scale + seed, q / scale - seed) - 0.5) * 1.3 + (valueNoise(p / (scale * 0.37) - seed, q / (scale * 0.37) + seed * 2) - 0.5) * 0.7;

/**
 * The tints: (p, q, out, cell) fills out[0..2] with the colour multiplier at a plan point; `cell`
 * is the slab's own number (0..1) where the batch lays whole slabs.
 */
export const GROUND_TINTS = Object.freeze({
  /** Apron slabs: each its own tone (+-6 %), broad lighter and darker fields, a warm / cool drift. */
  concrete(p, q, out, cell = 0.5) {
    const tone = 1 + (cell - 0.5) * 0.12 + drift(p, q, 58, 3.1) * 0.09 + drift(p, q, 210, 7.7) * 0.05;
    const warm = drift(p, q, 120, 11.3) * 0.025;
    out[0] = tone * (1 + warm);
    out[1] = tone;
    out[2] = tone * (1 - warm);
  },
  /** Runway and taxiway asphalt: grey fields from old patches and resurfacing. */
  asphalt(p, q, out) {
    const tone = 1 + drift(p, q, 34, 5.9) * 0.13 + drift(p, q, 150, 2.3) * 0.08;
    out[0] = tone * 1.01;
    out[1] = tone;
    out[2] = tone * 0.99;
  },
  /** Airfield grass: dry straw patches against greener ground, darker damp hollows. */
  grass(p, q, out) {
    const tone = 1 + drift(p, q, 46, 9.4) * 0.2 + drift(p, q, 190, 4.2) * 0.1;
    const dry = drift(p, q, 85, 13.8) * 0.5 + drift(p, q, 23, 1.7) * 0.2;
    out[0] = tone * (1 + dry * 0.22);
    out[1] = tone * (1 + dry * 0.05);
    out[2] = tone * (1 - dry * 0.2);
  },
  /** Compacted dirt: wetter and drier stretches. */
  dirt(p, q, out) {
    const tone = 1 + drift(p, q, 28, 6.6) * 0.12;
    out[0] = tone;
    out[1] = tone * 0.99;
    out[2] = tone * 0.97;
  },
});

// ---- Slabs and decals.

/**
 * Collects flat quads in plan coordinates (two axes in metres: p and q) into one geometry.
 * @param {(p: number, q: number) => {x: number, z: number}} place Plan metres to the mesh's own metres.
 */
export function createGroundBatch(place) {
  const positions = [];
  const uvs = [];
  const colours = [];
  const indices = [];
  const tint = [1, 1, 1];
  // Whether (p, q) is left-handed in the mesh (decides the winding that faces up).
  const o = place(0, 0);
  const a = place(1, 0);
  const b = place(0, 1);
  const flip = (a.z - o.z) * (b.x - o.x) - (a.x - o.x) * (b.z - o.z) < 0;
  const vertex = (p, q, y, u, v, r, g, bl, alpha) => {
    const at = place(p, q);
    positions.push(at.x, y, at.z);
    uvs.push(u, v);
    colours.push(r, g, bl, alpha);
  };
  const face = () => {
    const first = positions.length / 3 - 4;
    if (flip) indices.push(first, first + 2, first + 1, first, first + 3, first + 2);
    else indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
  };
  // One quad of a tiled surface: corners in order, UVs from the plan (so tiles join everywhere).
  // `y` is a height or a function of the plan point (ground that follows a slope).
  const tile = (corners, y, tintOf, cell) => {
    for (const [p, q] of corners) {
      if (tintOf) tintOf(p, q, tint, cell);
      else tint[0] = tint[1] = tint[2] = 1;
      vertex(p, q, typeof y === 'function' ? y(p, q) : y, p / TILE_METRES, q / TILE_METRES, tint[0], tint[1], tint[2], 1);
    }
    face();
  };
  const batch = {
    get quads() { return positions.length / 12; },
    /**
     * An axis-aligned rectangle of tiled ground, cut on the grid of `cell` metres (multiples of
     * the tile, so slab joints fall on the texture's own joints).
     * @param {{tint?: Function, cell?: number, perCell?: boolean, heightAt?: (p: number, q: number) => number}} [options]
     *   perCell gives every cell its own tone number (concrete slabs); heightAt replaces `y`.
     */
    rect(p0, q0, p1, q1, y, options = {}) {
      if (options.heightAt) y = options.heightAt;
      const cell = options.cell ?? TILE_METRES;
      const pa = Math.min(p0, p1), pb = Math.max(p0, p1), qa = Math.min(q0, q1), qb = Math.max(q0, q1);
      for (let q = Math.floor(qa / cell) * cell; q < qb; q += cell) {
        for (let p = Math.floor(pa / cell) * cell; p < pb; p += cell) {
          const l = Math.max(p, pa), r = Math.min(p + cell, pb), s = Math.max(q, qa), t = Math.min(q + cell, qb);
          if (r - l < 1e-4 || t - s < 1e-4) continue;
          tile([[l, s], [r, s], [r, t], [l, t]], y, options.tint, options.perCell ? hash2(Math.round(p / cell), Math.round(q / cell)) : 0.5);
        }
      }
    },
    /**
     * A strip of tiled ground from a to b (any direction), `width` wide, its texture laid along
     * it (V along the strip: the dirt track's ruts), cut every `cell` metres for the tint.
     */
    ribbon(pa, qa, pb, qb, width, y, options = {}) {
      const length = Math.hypot(pb - pa, qb - qa);
      if (length < 1e-3) return;
      const dp = (pb - pa) / length, dq = (qb - qa) / length;
      const cell = options.cell ?? 8;
      const half = width / 2;
      const steps = Math.max(1, Math.ceil(length / cell));
      for (let i = 0; i < steps; i += 1) {
        const t0 = (i * length) / steps, t1 = ((i + 1) * length) / steps;
        const ends = [[t0, -1], [t0, 1], [t1, 1], [t1, -1]];
        for (const [t, side] of ends) {
          const p = pa + dp * t + dq * half * side, q = qa + dq * t - dp * half * side;
          if (options.tint) options.tint(p, q, tint);
          else tint[0] = tint[1] = tint[2] = 1;
          vertex(p, q, y, side > 0 ? 1 : 0, (t + (options.offset ?? 0)) / TILE_METRES, tint[0], tint[1], tint[2], 1);
        }
        face();
      }
    },
    /**
     * A closed outline of tiled ground (any simple polygon), cut into bands and cells of `cell` metres.
     * @param {number[][]} ring [[p, q], ...]
     */
    polygon(ring, y, options = {}) {
      const cell = options.cell ?? 16;
      let qMin = Infinity, qMax = -Infinity;
      for (const [, q] of ring) {
        qMin = Math.min(qMin, q);
        qMax = Math.max(qMax, q);
      }
      const cuts = new Set(ring.map(([, q]) => q));
      for (let q = Math.ceil(qMin / cell) * cell; q < qMax; q += cell) cuts.add(q);
      const levels = [...cuts].sort((m, n) => m - n);
      for (let k = 0; k + 1 < levels.length; k += 1) {
        const s = levels[k], t = levels[k + 1];
        if (t - s < 1e-6) continue;
        const middle = (s + t) / 2;
        // The edges that cross this band, left to right; no corner lies inside a band.
        const crossing = [];
        for (let i = 0; i < ring.length; i += 1) {
          const [p0, q0] = ring[i];
          const [p1, q1] = ring[(i + 1) % ring.length];
          if (q0 > middle === q1 > middle) continue;
          const at = (q) => p0 + ((p1 - p0) * (q - q0)) / (q1 - q0);
          crossing.push({ low: at(s), high: at(t), mid: at(middle) });
        }
        crossing.sort((m, n) => m.mid - n.mid);
        for (let i = 0; i + 1 < crossing.length; i += 2) {
          const left = crossing[i], right = crossing[i + 1];
          const columns = Math.max(1, Math.ceil(Math.max(right.low - left.low, right.high - left.high) / cell));
          for (let c = 0; c < columns; c += 1) {
            const f0 = c / columns, f1 = (c + 1) / columns;
            tile([
              [left.low + (right.low - left.low) * f0, s], [left.low + (right.low - left.low) * f1, s],
              [left.high + (right.high - left.high) * f1, t], [left.high + (right.high - left.high) * f0, t],
            ], y, options.tint, 0.5);
          }
        }
      }
    },
    /**
     * A decal quad (UV 0..1) centred on a plan point: its V axis (length) points along `angle`
     * (radians from +q towards +p), `width` across. `alpha` thins it; `shade` darkens paint.
     */
    decal(p, q, angle, width, length, y, alpha = 1, shade = 1) {
      const vp = Math.sin(angle), vq = Math.cos(angle);
      const up = vq, uq = -vp;
      const hw = width / 2, hl = length / 2;
      vertex(p - up * hw - vp * hl, q - uq * hw - vq * hl, y, 0, 0, shade, shade, shade, alpha);
      vertex(p + up * hw - vp * hl, q + uq * hw - vq * hl, y, 1, 0, shade, shade, shade, alpha);
      vertex(p + up * hw + vp * hl, q + uq * hw + vq * hl, y, 1, 1, shade, shade, shade, alpha);
      vertex(p - up * hw + vp * hl, q - uq * hw + vq * hl, y, 0, 1, shade, shade, shade, alpha);
      face();
    },
    /**
     * A painted line from a to b built of tile-long decal quads (the worn-paint strips tile along
     * V); each piece gets its own wear (alpha and shade) so a long line is not uniform.
     */
    line(pa, qa, pb, qb, width, y, wear = 0.2) {
      const length = Math.hypot(pb - pa, qb - qa);
      if (length < 1e-3) return;
      const dp = (pb - pa) / length, dq = (qb - qa) / length;
      const up = dq, uq = -dp;
      const hw = width / 2;
      for (let t = 0, piece = 0; t < length - 1e-3; t += TILE_METRES, piece += 1) {
        const end = Math.min(length, t + TILE_METRES);
        const v1 = (end - t) / TILE_METRES;
        const worn = hash2(Math.round(pa * 3 + piece * 17), Math.round(qa * 3 - piece * 29));
        const alpha = 1 - wear * worn;
        const shade = 1 - wear * 0.5 * hash2(piece + 5, Math.round(pb + qb));
        const p0 = pa + dp * t, q0 = qa + dq * t, p1 = pa + dp * end, q1 = qa + dq * end;
        vertex(p0 - up * hw, q0 - uq * hw, y, 0, 0, shade, shade, shade, alpha);
        vertex(p0 + up * hw, q0 + uq * hw, y, 1, 0, shade, shade, shade, alpha);
        vertex(p1 + up * hw, q1 + uq * hw, y, 1, v1, shade, shade, shade, alpha);
        vertex(p1 - up * hw, q1 - uq * hw, y, 0, v1, shade, shade, shade, alpha);
        face();
      }
    },
    /** The merged geometry (normals straight up), or null when nothing was added. */
    geometry() {
      if (positions.length === 0) return null;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 4));
      const normals = new Float32Array(positions.length);
      for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
      geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
      geometry.setIndex(fixWinding(positions, indices));
      geometry.computeBoundingSphere();
      geometry.computeBoundingBox();
      return geometry;
    },
  };
  return batch;
}

// Turns every triangle to face up, whichever way its quad was listed.
function fixWinding(positions, indices) {
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
    const normalY = (positions[b + 2] - positions[a + 2]) * (positions[c] - positions[a]) - (positions[b] - positions[a]) * (positions[c + 2] - positions[a + 2]);
    if (normalY < 0) {
      const swap = indices[i + 1];
      indices[i + 1] = indices[i + 2];
      indices[i + 2] = swap;
    }
  }
  return indices;
}

/**
 * A flat mesh of one ground layer: receives shadows, casts none, never moves.
 * @param {THREE.BufferGeometry | null} geometry
 * @param {THREE.Material | undefined} material
 * @param {string} name
 * @param {number} [order] renderOrder (the blended layers).
 * @returns {THREE.Mesh | null}
 */
export function groundLayerMesh(geometry, material, name, order = 0) {
  if (!geometry || !material) {
    geometry?.dispose();
    return null;
  }
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.renderOrder = order;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}

// ---- Instanced models.

/**
 * The meshes under one named node of a loaded model as geometries in that node's parent space
 * (collision proxies left out). With `level`, only that level of detail of a model that has levels
 * (nodes without a level are kept: lamps, signs).
 * @param {any} asset A loaded asset (assets.get(id)).
 * @param {string | null} nodeName The node (null: the whole model).
 * @param {{level?: number, keep?: (name: string) => boolean, local?: boolean}} [options] local: the
 *   geometry stays in the mesh's own space (plants whose nodes are spread out along X in the file).
 * @returns {{geometry: THREE.BufferGeometry, material: THREE.Material, castShadow: boolean}[]}
 */
export function modelParts(asset, nodeName, options = {}) {
  const root = asset?.scene;
  if (!root) return [];
  const start = nodeName ? root.getObjectByName(nodeName) : root;
  if (!start) return [];
  root.updateMatrixWorld(true);
  const inverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const parts = [];
  start.traverse((node) => {
    if (!node.isMesh || node.name.startsWith('col_')) return;
    const own = /(?:^|_)lod(\d)$/.exec(node.name) ?? /(?:^|_)lod(\d)$/.exec(node.parent?.name ?? '');
    if (own && options.level !== undefined && Number(own[1]) !== options.level) return;
    if (options.keep && !options.keep(node.name)) return;
    const geometry = node.geometry.clone();
    if (!options.local) geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, node.matrixWorld));
    const material = node.material;
    parts.push({ geometry, material, castShadow: !material.transparent });
  });
  return parts;
}

/**
 * Draws parts instanced at the given places.
 * @param {{geometry: THREE.BufferGeometry, material: THREE.Material, castShadow: boolean}[]} parts
 * @param {{x: number, y: number, z: number, turn: number, scale?: number}[]} places turn is the rotation about +Y.
 * @param {{name?: string, castShadow?: boolean, receiveShadow?: boolean}} [options]
 * @returns {THREE.InstancedMesh[]}
 */
export function instanceParts(parts, places, options = {}) {
  if (places.length === 0) return [];
  const matrix = new THREE.Matrix4();
  const turn = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();
  return parts.map((part) => {
    const mesh = new THREE.InstancedMesh(part.geometry, part.material, places.length);
    mesh.name = options.name ?? 'airfield-instances';
    places.forEach((item, index) => {
      const size = item.scale ?? 1;
      matrix.compose(position.set(item.x, item.y, item.z), turn.setFromAxisAngle(up, item.turn), scale.set(size, size, size));
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.computeBoundingBox();
    mesh.castShadow = (options.castShadow ?? true) && part.castShadow;
    mesh.receiveShadow = options.receiveShadow ?? true;
    mesh.matrixAutoUpdate = false;
    return mesh;
  });
}
