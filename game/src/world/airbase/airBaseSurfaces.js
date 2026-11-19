// The ground of Base Aérea Punta Garza. With the artists' ground library in memory
// (military/base_ground.glb, see groundKit.js) it is their baked materials on generated slabs, one
// merged mesh per material: weathered concrete slabs on the apron and the hardstands, asphalt on
// the runway, taxiways and road, airfield grass over the whole cleared pad, the dirt patrol track,
// and the alpha decals over them (worn white and yellow paint for every marking, tyre rubber in the
// touchdown zones, oil, jet scorch, cracks). Until the library has loaded, the plain slabs of the
// first version stand in (buildPlainSurfaces). The plan sinks its own ground under them.
//
//   const ground = buildAirBaseSurfaces(layout, surfaces, assets, { groundAt });
//   scene.add(ground.object3d);  ground.baked;  ground.dispose();

import * as THREE from 'three';
import { PUNTA_GARZA_AIR_BASE, puntaGarzaToWorld } from '../../catalog/puntaGarzaAirBase.js';
import { GROUND_TINTS, createGroundBatch, groundLayerMesh, readGroundMaterials } from './groundKit.js';

/** Metres the layers lie above the plan's pad: grass, dirt, paving, then the decals and the paint. */
const LIFT = Object.freeze({ grass: 0.012, dirt: 0.022, road: 0.03, concrete: 0.034, taxiway: 0.037, runway: 0.04, crack: 0.05, stain: 0.056, paint: 0.066 });
const RADIANS = Math.PI / 180;
const GRID_TURN = 6 * RADIANS;
// Seven-segment strokes of the runway numbers: [s0, t0, s1, t1] in a 3 x 9 m cell (s right, t up).
const STROKES = { a: [0, 8.1, 3, 9], b: [2.1, 4.5, 3, 9], c: [2.1, 0, 3, 4.5], d: [0, 0, 3, 0.9], e: [0, 0, 0.9, 4.5], f: [0, 4.5, 0.9, 9], g: [0, 4.05, 3, 4.95] };
const DIGITS = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };

/**
 * Builds the ground meshes of the base.
 * @param {import('./airBaseLayout.js').AirBaseLayout} layout
 * @param {{requestMaterial?: (name: string) => {map: THREE.Texture, normalMap?: THREE.Texture}} | null} surfaces The city's
 *   surface library (only the stand-in slabs use it).
 * @param {{has?: (id: string) => boolean, get?: (id: string) => any} | null} [assets] The asset library.
 * @param {{groundAt?: (x: number, z: number) => number, anisotropy?: number}} [options] groundAt: the plan's
 *   ground height, for the access road's ramp outside the pad.
 * @returns {{object3d: THREE.Group, baked: boolean, layers: Record<string, number>, dispose: () => void}}
 */
export function buildAirBaseSurfaces(layout, surfaces, assets = null, options = {}) {
  const ground = readGroundMaterials(assets, options.anisotropy ?? 8);
  return ground ? buildBakedSurfaces(layout, ground, options) : buildPlainSurfaces(layout, surfaces);
}

function buildBakedSurfaces(layout, ground, options) {
  const base = PUNTA_GARZA_AIR_BASE;
  const y = layout.y;
  const place = (e, n) => puntaGarzaToWorld(e, n);
  const cos = Math.cos(GRID_TURN);
  const sin = Math.sin(GRID_TURN);
  const toCity = (point) => [point.x * cos + point.z * sin, point.x * sin - point.z * cos];
  const batches = {};
  const batch = (name) => (batches[name] ??= createGroundBatch(place));

  // ---- Tiled ground.
  batch('grass').polygon(layout.field.map(toCity), y + LIFT.grass, { cell: 16, tint: GROUND_TINTS.grass });
  for (const segment of layout.dressing.dirtTrack) {
    const [ae, an] = toCity(segment.a);
    const [be, bn] = toCity(segment.b);
    const length = Math.hypot(be - ae, bn - an) || 1;
    const de = ((be - ae) / length) * 2;
    const dn = ((bn - an) / length) * 2;
    batch('dirt').ribbon(ae - de, an - dn, be + de, bn + dn, segment.width, y + LIFT.dirt, { cell: 8, tint: GROUND_TINTS.dirt });
  }
  const [fromE, runwayN] = base.runway.from;
  const toE = base.runway.to[0];
  const half = base.runway.width / 2;
  const asphalt = batch('asphalt');
  asphalt.rect(toE, runwayN - half, fromE, runwayN + half, y + LIFT.runway, { cell: 8, tint: GROUND_TINTS.asphalt });
  for (const way of base.taxiways) {
    const [a, b] = way.line;
    const w = way.width / 2;
    if (a[1] === b[1]) asphalt.rect(Math.min(a[0], b[0]) - 9, a[1] - w, Math.max(a[0], b[0]) + 9, a[1] + w, y + LIFT.taxiway, { cell: 8, tint: GROUND_TINTS.asphalt });
    else asphalt.rect(a[0] - w, Math.min(a[1], b[1]), a[0] + w, Math.max(a[1], b[1]), y + LIFT.taxiway - 0.003, { cell: 8, tint: GROUND_TINTS.asphalt });
  }
  {
    // The access road: flat on the pad, following the plan's ramp down to the highway outside it.
    const road = base.accessRoad;
    const groundAt = typeof options.groundAt === 'function' ? options.groundAt : null;
    const heightAt = (e, n) => {
      const at = place(e, n);
      const found = groundAt ? groundAt(at.x, at.z) : y;
      return (Number.isFinite(found) ? Math.min(found, y) : y) + LIFT.road;
    };
    const roadE = road.line[0][0];
    asphalt.rect(roadE - road.width / 2, road.line[0][1] - 0.5, roadE + road.width / 2, road.line[road.line.length - 1][1], 0, { cell: 4, tint: GROUND_TINTS.asphalt, heightAt });
  }
  const concrete = batch('concrete');
  const apron = base.apron;
  // Up to the parallel taxiway's south edge; slab joints fall on the 4 m grid of the texture.
  concrete.rect(apron.west, apron.south, apron.east, base.taxiways[0].line[0][1] - base.taxiways[0].width / 2, y + LIFT.concrete, { tint: GROUND_TINTS.concrete, perCell: true });
  for (const stand of layout.dressing.hardstands) concrete.rect(stand.west, stand.south, stand.east, stand.north, y + LIFT.concrete, { tint: GROUND_TINTS.concrete, perCell: true });

  // ---- Paint. `mark` draws in a frame: origin (e, n), t along `up` (city degrees), s to its right.
  const top = y + LIFT.paint;
  const mark = (name, e, n, upDegrees) => {
    const angle = upDegrees * RADIANS;
    const ue = Math.sin(angle), un = Math.cos(angle);
    const re = un, rn = -ue;
    const list = batch(name);
    return {
      /** A painted bar from (s0, t0) to (s1, t1), drawn along its longer side. */
      bar(s0, t0, s1, t1, wear = 0.25) {
        const alongT = Math.abs(t1 - t0) >= Math.abs(s1 - s0);
        const width = alongT ? Math.abs(s1 - s0) : Math.abs(t1 - t0);
        const a = alongT ? [(s0 + s1) / 2, t0] : [s0, (t0 + t1) / 2];
        const b = alongT ? [(s0 + s1) / 2, t1] : [s1, (t0 + t1) / 2];
        list.line(e + re * a[0] + ue * a[1], n + rn * a[0] + un * a[1], e + re * b[0] + ue * b[1], n + rn * b[0] + un * b[1], width, top, wear);
      },
    };
  };
  const WHITE = 'decal_paint_white';
  const YELLOW = 'decal_paint_yellow';
  const length = fromE - toE;
  {
    const east = mark(WHITE, fromE, runwayN, 270);
    for (const side of [-1, 1]) east.bar(side * (half - 1.5) - 0.45, 0, side * (half - 1.5) + 0.45, length);
    for (let t = 90; t + 30 < length - 90; t += 50) east.bar(-0.45, t, 0.45, t + 30, 0.35);
  }
  base.runway.designators.forEach((text, end) => {
    // Each end in its own reading frame: up is the landing direction, right its right hand.
    const frame = mark(WHITE, end === 0 ? fromE : toE, runwayN, end === 0 ? 270 : 90);
    for (let i = 0; i < 8; i += 1) {
      const s = (i < 4 ? -1 : 1) * (3.2 + (i % 4) * 3.6);
      frame.bar(s - 0.9, 6, s + 0.9, 36, 0.4);
    }
    for (let i = 0; i < text.length; i += 1) {
      const left = (i - text.length / 2) * 5 + 1;
      for (const key of DIGITS[text[i]] ?? '') {
        const [s0, t0, s1, t1] = STROKES[key];
        frame.bar(left + s0, 44 + t0, left + s1, 44 + t1, 0.35);
      }
    }
    // The aiming point: two broad bars 300 m in, where the rubber is thickest.
    for (const side of [-1, 1]) frame.bar(side * 9 - 3, 300, side * 9 + 3, 345, 0.5);
  });
  for (const way of base.taxiways) {
    const [a, b] = way.line;
    batch(YELLOW).line(a[0], a[1], b[0], b[1], 0.4, top, 0.3);
  }
  for (const stand of base.stands) {
    // Stand marks: a lead-in line from the taxiway side, a stop bar at the nose wheel, the box's sides.
    const yellow = mark(YELLOW, stand.at[0], stand.at[1], 0);
    yellow.bar(-0.25, -6, 0.25, 70, 0.3);
    yellow.bar(-5, 8, 5, 8.6, 0.3);
    const white = mark(WHITE, stand.at[0], stand.at[1], 0);
    white.bar(-12, -14, -11.5, 2, 0.4);
    white.bar(11.5, -14, 12, 2, 0.4);
  }
  for (const fighter of base.parkedFighters ?? []) {
    if (fighter.place !== 'apron') continue;
    const yellow = mark(YELLOW, fighter.at[0], fighter.at[1], 0);
    yellow.bar(-0.2, -4, 0.2, 40, 0.35);
    yellow.bar(-3, 5.4, 3, 5.9, 0.35);
  }
  {
    const road = base.accessRoad;
    const from = road.line[1];
    const to = road.line[road.line.length - 1];
    for (let n = from[1] + 3; n + 3 < to[1]; n += 9) batch(WHITE).line(from[0], n, from[0], n + 3, 0.14, top, 0.4);
  }

  // ---- Wear: the dressing's decals. The decal's length runs along its heading.
  for (const decal of layout.dressing.decals) {
    const lift = decal.kind === 'decal_crack' ? LIFT.crack : LIFT.stain;
    batch(decal.kind).decal(decal.e, decal.n, decal.heading - GRID_TURN, decal.width, decal.length, y + lift, decal.alpha);
  }

  const group = new THREE.Group();
  group.name = 'airbase-ground';
  const layers = {};
  const add = (name, material, order) => {
    const list = batches[name];
    if (!list) return;
    const mesh = groundLayerMesh(list.geometry(), material, `airbase-${name}`, order);
    if (!mesh) return;
    layers[name] = list.quads;
    group.add(mesh);
  };
  add('grass', ground.tiles.grass ?? null, 0);
  add('dirt', ground.tiles.dirt ?? null, 0);
  add('asphalt', ground.tiles.asphalt, 0);
  add('concrete', ground.tiles.concrete, 0);
  for (const name of Object.keys(ground.decals)) add(name, ground.decals[name], ground.order[name] ?? 1);
  // Without the grass tile the cleared ground of the first version keeps the field from being bare mud.
  let cleared = null;
  if (!ground.tiles.grass) {
    cleared = clearedGround(layout.y);
    group.add(cleared);
  }
  return {
    object3d: group,
    baked: true,
    layers,
    dispose() {
      group.removeFromParent();
      for (const mesh of group.children) mesh.geometry.dispose();
      cleared?.material.dispose();
      ground.dispose();
    },
  };
}

// ---- The stand-in ground: flat slabs with the city library's grain, used until the ground
// library has loaded (and when it is missing altogether).

const SLAB_LIFT = 0.04;
const PAINT_LIFT = 0.03;
const PLAIN_WHITE = [0.86, 0.86, 0.84];
const PLAIN_YELLOW = [0.9, 0.68, 0.1];

function buildPlainSurfaces(layout, surfaces) {
  const { runway, along } = layout;
  const y = layout.y + SLAB_LIFT;
  const nx = -along.z;
  const nz = along.x;
  const asphalt = createQuadList();
  const concrete = createQuadList();
  const paint = createQuadList();

  // A strip from a to b, `width` wide, pushed `extend` past both ends.
  const strip = (list, a, b, width, height, colour, extend = 0) => {
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const dx = (b.x - a.x) / length;
    const dz = (b.z - a.z) / length;
    list.frame(a.x - dx * extend, a.z - dz * extend, dx, dz, -dz, dx, height);
    list.rect(-width / 2, 0, width / 2, length + extend * 2, colour);
  };
  const east = { x: runway.x0, z: runway.z0 };
  const west = { x: runway.x1, z: runway.z1 };
  strip(asphalt, east, west, runway.width, y, [0.2, 0.2, 0.21]);
  for (const taxiway of layout.taxiways) strip(asphalt, taxiway.a, taxiway.b, taxiway.width, y - 0.005, [0.24, 0.24, 0.25], taxiway.id === 'taxi_parallel' ? 9 : 0);
  for (let i = 0; i + 1 < layout.road.points.length; i += 1) strip(asphalt, layout.road.points[i], layout.road.points[i + 1], layout.road.width, y - 0.01, [0.23, 0.23, 0.24], 0.5);
  {
    const [sw, se, , nw] = layout.apron.corners;
    const depth = Math.hypot(nw.x - sw.x, nw.z - sw.z);
    const width = Math.hypot(se.x - sw.x, se.z - sw.z);
    concrete.frame(sw.x, sw.z, (nw.x - sw.x) / depth, (nw.z - sw.z) / depth, (se.x - sw.x) / width, (se.z - sw.z) / width, y - 0.012);
    // Up to the taxiway's centreline, so no ground shows between them.
    concrete.rect(0, 0, width, depth + layout.apron.joinNorth, [0.4, 0.39, 0.36]);
  }

  // Runway paint in the frame of the east threshold: t along the runway, s to the north side.
  const top = y + PAINT_LIFT;
  paint.frame(east.x, east.z, along.x, along.z, nx, nz, top);
  const half = runway.width / 2;
  for (const side of [-1, 1]) paint.rect(side * (half - 1.5) - 0.45, 0, side * (half - 1.5) + 0.45, runway.length, PLAIN_WHITE);
  for (let t = 90; t + 30 < runway.length - 90; t += 50) paint.rect(-0.45, t, 0.45, t + 30, PLAIN_WHITE);
  for (const end of [0, 1]) {
    const sign = end === 0 ? 1 : -1;
    const origin = end === 0 ? east : west;
    paint.frame(origin.x, origin.z, along.x * sign, along.z * sign, nx * sign, nz * sign, top);
    for (let i = 0; i < 8; i += 1) {
      const s = (i < 4 ? -1 : 1) * (3.2 + (i % 4) * 3.6);
      paint.rect(s - 0.9, 6, s + 0.9, 36, PLAIN_WHITE);
    }
    const text = runway.designators[end];
    for (let i = 0; i < text.length; i += 1) {
      const left = (i - text.length / 2) * 5 + 1;
      for (const key of DIGITS[text[i]] ?? '') {
        const [s0, t0, s1, t1] = STROKES[key];
        paint.rect(left + s0, 44 + t0, left + s1, 44 + t1, PLAIN_WHITE);
      }
    }
  }
  for (const taxiway of layout.taxiways) strip(paint, taxiway.a, taxiway.b, 0.5, top, PLAIN_YELLOW, taxiway.id === 'taxi_parallel' ? 0 : 0.25);
  for (const stand of layout.stands) {
    const fx = Math.sin(stand.heading);
    const fz = -Math.cos(stand.heading);
    paint.frame(stand.x, stand.z, fx, fz, -fz, fx, top);
    paint.rect(-0.25, -6, 0.25, 70, PLAIN_YELLOW);
    paint.rect(-5, 8, 5, 8.6, PLAIN_YELLOW);
    paint.rect(-12, -14, -11.5, 2, PLAIN_WHITE);
    paint.rect(11.5, -14, 12, 2, PLAIN_WHITE);
  }
  for (let i = 0; i + 1 < layout.road.points.length; i += 1) {
    const a = layout.road.points[i];
    const b = layout.road.points[i + 1];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    paint.frame(a.x, a.z, (b.x - a.x) / length, (b.z - a.z) / length, -(b.z - a.z) / length, (b.x - a.x) / length, top);
    for (let t = 3; t + 3 < length; t += 9) paint.rect(-0.07, t, 0.07, t + 3, PLAIN_WHITE);
  }

  const mapOf = (name) => {
    try {
      return surfaces?.requestMaterial ? surfaces.requestMaterial(name) : null;
    } catch {
      return null;
    }
  };
  const slab = (name, list, source, roughness) => {
    // The vertex colour is the slab's colour; the library lends its grain (uv = world metres).
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness: 0, normalMap: source?.normalMap ?? null });
    material.name = `airbase-${name}`;
    const mesh = new THREE.Mesh(list.geometry(), material);
    mesh.name = `airbase-${name}`;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    return mesh;
  };
  const group = new THREE.Group();
  group.name = 'airbase-ground';
  const meshes = [slab('asphalt', asphalt, mapOf('asphalt'), 0.92), slab('concrete', concrete, mapOf('concrete'), 0.85), slab('paint', paint, null, 0.7)];
  // Depth offsets stack the layers when seen from kilometres away: ground, slabs, paint.
  const offset = (mesh, factor, units) => {
    mesh.material.polygonOffset = true;
    mesh.material.polygonOffsetFactor = factor;
    mesh.material.polygonOffsetUnits = units;
  };
  offset(meshes[0], -1.5, -3);
  offset(meshes[1], -1.5, -3);
  offset(meshes[2], -2, -4);
  meshes.push(clearedGround(layout.y));
  for (const mesh of meshes) group.add(mesh);
  return {
    object3d: group,
    baked: false,
    layers: {},
    dispose() {
      group.removeFromParent();
      for (const mesh of meshes) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
    },
  };
}

// The cleared, graded ground of the whole pad for the stand-in: dry mown grass and compacted sand
// instead of the dark wetland mud around it.
function clearedGround(height) {
  const ring = PUNTA_GARZA_AIR_BASE.pad.map(([e, n]) => puntaGarzaToWorld(e, n));
  const triangles = THREE.ShapeUtils.triangulateShape(ring.map((p) => new THREE.Vector2(p.x, p.z)), []);
  const positions = [];
  const colours = [];
  for (const p of ring) {
    positions.push(p.x, height, p.z);
    // A little warmer towards the land side, sandier on the causeway.
    const sand = p.x < -1560 ? 1 : 0;
    colours.push(0.36 + 0.1 * sand, 0.37 + 0.05 * sand, 0.24 + 0.06 * sand);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(ring.flatMap(() => [0, 1, 0]), 3));
  // The ring's winding decides the face: draw both sides rather than depend on it.
  geometry.setIndex(triangles.flat());
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  material.name = 'airbase-cleared-ground';
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'airbase-cleared-ground';
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  return mesh;
}

// Collects flat quads; `frame` sets the origin, the up (t) and right (s) directions and the height.
function createQuadList() {
  const positions = [];
  const colours = [];
  const uvs = [];
  const indices = [];
  let ox = 0;
  let oz = 0;
  let ux = 0;
  let uz = 0;
  let rx = 0;
  let rz = 0;
  let height = 0;
  const vertex = (s, t, colour) => {
    const x = ox + rx * s + ux * t;
    const z = oz + rz * s + uz * t;
    positions.push(x, height, z);
    colours.push(colour[0], colour[1], colour[2]);
    uvs.push(x, z);
  };
  return {
    frame(x, z, upX, upZ, rightX, rightZ, y) {
      ox = x;
      oz = z;
      ux = upX;
      uz = upZ;
      rx = rightX;
      rz = rightZ;
      height = y;
    },
    rect(s0, t0, s1, t1, colour) {
      const first = positions.length / 3;
      vertex(s0, t0, colour);
      vertex(s1, t0, colour);
      vertex(s1, t1, colour);
      vertex(s0, t1, colour);
      // Facing up whichever way the frame is handed.
      const up = (rz * ux - rx * uz) * (s1 - s0) * (t1 - t0) > 0;
      if (up) indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
      else indices.push(first, first + 2, first + 1, first, first + 3, first + 2);
    },
    geometry() {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      return geometry;
    },
  };
}
