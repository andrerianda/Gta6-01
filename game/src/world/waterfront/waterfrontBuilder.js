// Builds the waterfront pieces of one sector (waterfrontLayout.js): promenade paving and its sea
// wall, pier and pontoon decks of planks on concrete piles down to the sea floor, steel
// railings, sheer quay walls and crane rails. Every deck top goes into the sector's walking
// height raster (also the parts of a neighbour's piece that overhang into this sector), and
// decks, walls and railings get hull colliders, so people walk out on the pier and cannot
// fall off it. One mesh per material per sector.
//
//   const front = yield* buildWaterfrontSector({ pieces, overlapping, raster, materials, seabedAt });
//   front = { object3d, colliders, geometries }

import * as THREE from 'three';
import { createSurfaceGeometryBuffer } from '../streets/surfaceGeometryBuffer.js';

const PILE_SPACING = 6;
const PILE_SIZE = 0.38;
const RAILING_HEIGHT = 1.05;
const POST_SPACING = 2;
/** The promenade paving stands this far over the levelled ground under it. */
const PROMENADE_LIFT = 0.06;

/** The surface-library paintings the waterfront needs (painted at load). */
export const WATERFRONT_PAINTINGS = [['plazaPavers', { seed: 5 }], ['dockPlanks', {}], ['galvanisedMetal', {}]];

/**
 * @param {ReturnType<import('../../render/textures/surfaceMaterials.js').createSurfaceLibrary>} surfaces
 */
export function createWaterfrontMaterials(surfaces) {
  return {
    promenade: surfaces.getMaterial('plazaPavers', { seed: 5 }),
    planks: surfaces.getMaterial('dockPlanks'),
    concrete: surfaces.getMaterial('concrete'),
    metal: surfaces.getMaterial('galvanisedMetal'),
  };
}

/**
 * Groups pieces by owning sector, and deck pieces by every sector their footprint overlaps.
 * @param {Object[]} pieces From planWaterfrontPieces.
 * @param {{minX: number, minZ: number, size: number, columns: number, rows: number}} grid
 * @returns {{owned: Map<number, Object[]>, overlapping: Map<number, Object[]>}}
 */
export function indexWaterfrontPieces(pieces, grid) {
  const owned = new Map();
  const overlapping = new Map();
  const add = (map, cell, piece) => {
    if (!map.has(cell)) map.set(cell, []);
    map.get(cell).push(piece);
  };
  for (const piece of pieces) {
    add(owned, piece.cell, piece);
    if (piece.kind !== 'deck') continue;
    const reach = piece.width / 2 + 1;
    const c0 = Math.max(0, Math.floor((Math.min(piece.ax, piece.bx) - reach - grid.minX) / grid.size));
    const c1 = Math.min(grid.columns - 1, Math.floor((Math.max(piece.ax, piece.bx) + reach - grid.minX) / grid.size));
    const r0 = Math.max(0, Math.floor((Math.min(piece.az, piece.bz) - reach - grid.minZ) / grid.size));
    const r1 = Math.min(grid.rows - 1, Math.floor((Math.max(piece.az, piece.bz) + reach - grid.minZ) / grid.size));
    for (let r = r0; r <= r1; r += 1) for (let c = c0; c <= c1; c += 1) add(overlapping, r * grid.columns + c, piece);
  }
  return { owned, overlapping };
}

/**
 * Builds one sector's waterfront.
 * @param {Object} options
 * @param {Object[]} options.pieces Pieces this sector owns.
 * @param {Object[]} options.overlapping Deck pieces over this sector (for the raster).
 * @param {ReturnType<import('../streets/surfaceHeightRaster.js').createSurfaceHeightRaster>} options.raster
 * @param {ReturnType<typeof createWaterfrontMaterials>} options.materials
 * @param {(x: number, z: number) => number} options.seabedAt Ground height (may be NaN).
 * @returns {Generator<void, {object3d: THREE.Group, colliders: Object[], geometries: THREE.BufferGeometry[]}, void>}
 */
export function* buildWaterfrontSector({ pieces, overlapping, raster, materials, seabedAt }) {
  const buffers = {};
  const bufferFor = (name) => (buffers[name] ??= createSurfaceGeometryBuffer());
  const colliders = [];
  for (const piece of overlapping) rasterDeck(raster, piece);
  let count = 0;
  for (const piece of pieces) {
    if (piece.kind === 'deck') buildDeck(piece, bufferFor, colliders, seabedAt);
    else if (piece.kind === 'wall') buildWall(piece, bufferFor, colliders);
    else if (piece.kind === 'railing') buildRailing(piece, bufferFor, colliders);
    else if (piece.kind === 'rail') prism(bufferFor('metal'), piece.ax, piece.az, piece.bx, piece.bz, 0.07, piece.y + 0.1, piece.y + 0.1, piece.y - 0.2, piece.y - 0.2, false);
    count += 1;
    if (count % 8 === 0) yield;
  }
  const object3d = new THREE.Group();
  object3d.name = 'waterfront';
  const geometries = [];
  for (const [name, buffer] of Object.entries(buffers)) {
    const geometry = buffer.toGeometry();
    if (!geometry) continue;
    geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, materials[name]);
    mesh.name = `waterfront-${name}`;
    mesh.receiveShadow = true;
    mesh.castShadow = name !== 'promenade';
    mesh.matrixAutoUpdate = false;
    object3d.add(mesh);
  }
  return { object3d, colliders, geometries };
}

function deckTop(piece) {
  const lift = piece.surface === 'promenade' ? PROMENADE_LIFT : 0;
  return [piece.ya + lift, piece.yb + lift];
}

function rasterDeck(raster, piece) {
  const [ta, tb] = deckTop(piece);
  const c = corners(piece.ax, piece.az, piece.bx, piece.bz, piece.width / 2);
  raster.addTriangle(c[0], ta, c[1], c[2], ta, c[3], c[4], tb, c[5]);
  raster.addTriangle(c[0], ta, c[1], c[4], tb, c[5], c[6], tb, c[7]);
}

function buildDeck(piece, bufferFor, colliders, seabedAt) {
  const [ta, tb] = deckTop(piece);
  const half = piece.width / 2;
  const thickness = piece.thickness ?? 0.35;
  const top = bufferFor(piece.surface === 'promenade' ? 'promenade' : 'planks');
  const sides = piece.surface === 'promenade' ? bufferFor('concrete') : top;
  prism(top, piece.ax, piece.az, piece.bx, piece.bz, half, ta, tb, ta - thickness, tb - thickness, true, sides);
  hull(colliders, piece.ax, piece.az, piece.bx, piece.bz, half, ta, tb, ta - thickness, tb - thickness, piece.surface === 'promenade' ? 'concrete' : 'wood');
  if (!piece.piles) return;
  const length = Math.hypot(piece.bx - piece.ax, piece.bz - piece.az);
  const dx = (piece.bx - piece.ax) / length;
  const dz = (piece.bz - piece.az) / length;
  const across = Math.max(1, Math.round((piece.width - 1) / 7));
  const piles = bufferFor('concrete');
  for (let a = PILE_SPACING / 2; a < length; a += PILE_SPACING) {
    const t = a / length;
    const y = ta + (tb - ta) * t - thickness;
    for (let k = 0; k <= across; k += 1) {
      const s = -half + 0.6 + ((piece.width - 1.2) * k) / across;
      const x = piece.ax + dx * a - dz * s;
      const z = piece.az + dz * a + dx * s;
      const floor = seabedAt(x, z);
      const bottom = (Number.isFinite(floor) ? Math.min(floor, -1) : -8) - 0.5;
      prism(piles, x - dx * PILE_SIZE / 2, z - dz * PILE_SIZE / 2, x + dx * PILE_SIZE / 2, z + dz * PILE_SIZE / 2, PILE_SIZE / 2, y, y, bottom, bottom, false);
    }
  }
}

function buildWall(piece, bufferFor, colliders) {
  // The wall's sea face stands on the piece's line; its thickness lies inland.
  const t = piece.thickness / 2;
  const ox = -piece.nx * t;
  const oz = -piece.nz * t;
  prism(bufferFor('concrete'), piece.ax + ox, piece.az + oz, piece.bx + ox, piece.bz + oz, t, piece.top, piece.top, piece.bottom, piece.bottom, true);
  hull(colliders, piece.ax + ox, piece.az + oz, piece.bx + ox, piece.bz + oz, t, piece.top, piece.top, piece.bottom, piece.bottom, 'concrete');
}

function buildRailing(piece, bufferFor, colliders) {
  const metal = bufferFor('metal');
  const length = Math.hypot(piece.bx - piece.ax, piece.bz - piece.az);
  if (length < 0.2) return;
  const dx = (piece.bx - piece.ax) / length;
  const dz = (piece.bz - piece.az) / length;
  const posts = Math.max(1, Math.round(length / POST_SPACING));
  for (let k = 0; k <= posts; k += 1) {
    const t = k / posts;
    const x = piece.ax + (piece.bx - piece.ax) * t;
    const z = piece.az + (piece.bz - piece.az) * t;
    const y = piece.ya + (piece.yb - piece.ya) * t;
    prism(metal, x - dx * 0.035, z - dz * 0.035, x + dx * 0.035, z + dz * 0.035, 0.035, y + RAILING_HEIGHT, y + RAILING_HEIGHT, y, y, false);
  }
  for (const [h, w] of [[RAILING_HEIGHT, 0.05], [0.55, 0.025]]) {
    prism(metal, piece.ax, piece.az, piece.bx, piece.bz, w, piece.ya + h + w, piece.yb + h + w, piece.ya + h - w, piece.yb + h - w, true);
  }
  hull(colliders, piece.ax, piece.az, piece.bx, piece.bz, 0.08, piece.ya + RAILING_HEIGHT + 0.05, piece.yb + RAILING_HEIGHT + 0.05, piece.ya, piece.yb, 'metal');
}

/** The four corners of a strip a -> b of the given half width: a-left, a-right, b-right, b-left (x, z pairs). */
function corners(ax, az, bx, bz, half) {
  const length = Math.hypot(bx - ax, bz - az) || 1;
  const rx = (-(bz - az) / length) * half;
  const rz = ((bx - ax) / length) * half;
  return [ax - rx, az - rz, ax + rx, az + rz, bx + rx, bz + rz, bx - rx, bz - rz];
}

/**
 * A box along a -> b: top (and optionally bottom), both long sides and both ends. Top UVs are
 * metres along and across, side UVs metres along and up.
 */
function prism(buffer, ax, az, bx, bz, half, topA, topB, bottomA, bottomB, withBottom, sideBuffer = buffer) {
  const c = corners(ax, az, bx, bz, half);
  const length = Math.hypot(bx - ax, bz - az) || 1;
  const dx = (bx - ax) / length;
  const dz = (bz - az) / length;
  const tops = [topA, topA, topB, topB];
  const bottoms = [bottomA, bottomA, bottomB, bottomB];
  const along = [0, 0, length, length];
  const across = [-half, half, half, -half];
  const t = [0, 1, 2, 3].map((k) => buffer.addVertex(c[2 * k], tops[k], c[2 * k + 1], along[k], across[k]));
  buffer.addQuadUp(t[0], t[1], t[2], t[3]);
  if (withBottom) {
    const b = [0, 1, 2, 3].map((k) => buffer.addVertex(c[2 * k], bottoms[k], c[2 * k + 1], along[k], across[k]));
    buffer.addQuadUp(b[0], b[1], b[2], b[3]);
    const n = buffer.indices.length;
    for (const k of [n - 6, n - 3]) {
      const swap = buffer.indices[k + 1];
      buffer.indices[k + 1] = buffer.indices[k + 2];
      buffer.indices[k + 2] = swap;
    }
  }
  // Sides: left (k 0 -> 3) faces -right, right (1 -> 2) faces +right; ends face -d and +d.
  const faces = [[0, 3, dz, -dx, along], [1, 2, -dz, dx, along], [0, 1, -dx, -dz, across], [3, 2, dx, dz, across]];
  for (const [p, q, nx, nz, u] of faces) {
    const v0 = sideBuffer.addVertex(c[2 * p], bottoms[p], c[2 * p + 1], u[p], bottoms[p]);
    const v1 = sideBuffer.addVertex(c[2 * q], bottoms[q], c[2 * q + 1], u[q], bottoms[q]);
    const v2 = sideBuffer.addVertex(c[2 * q], tops[q], c[2 * q + 1], u[q], tops[q]);
    const v3 = sideBuffer.addVertex(c[2 * p], tops[p], c[2 * p + 1], u[p], tops[p]);
    sideBuffer.addQuadFacing(v0, v1, v2, v3, nx, nz);
  }
}

function hull(colliders, ax, az, bx, bz, half, topA, topB, bottomA, bottomB, surface) {
  const c = corners(ax, az, bx, bz, half);
  const tops = [topA, topA, topB, topB];
  const bottoms = [bottomA, bottomA, bottomB, bottomB];
  const v = [];
  for (let k = 0; k < 4; k += 1) v.push(c[2 * k], tops[k], c[2 * k + 1], c[2 * k], bottoms[k], c[2 * k + 1]);
  colliders.push({ shape: 'hull', vertices: new Float64Array(v), surface });
}
