// The paved ground of Base Aérea Punta Garza as three meshes: asphalt (runway, taxiways, road),
// concrete (apron) and paint (centreline, edge lines, threshold bars, the numbers 27 and 09, yellow
// taxi lines and stand marks). The plan sinks its own ground under them (cover code "paved").
//
//   const ground = buildAirBaseSurfaces(layout, surfaces);   // surfaces: the city's library, or null
//   scene.add(ground.object3d);  ground.dispose();

import * as THREE from 'three';
import { PUNTA_GARZA_AIR_BASE, puntaGarzaToWorld } from '../../catalog/puntaGarzaAirBase.js';

/** Metres the slabs lie above the plan's pad, and the paint above the slabs. */
const SLAB_LIFT = 0.04;
const PAINT_LIFT = 0.03;
const WHITE = [0.86, 0.86, 0.84];
const YELLOW = [0.9, 0.68, 0.1];
// Seven-segment strokes of the runway numbers: [s0, t0, s1, t1] in a 3 x 9 m cell (s right, t up).
const STROKES = { a: [0, 8.1, 3, 9], b: [2.1, 4.5, 3, 9], c: [2.1, 0, 3, 4.5], d: [0, 0, 3, 0.9], e: [0, 0, 0.9, 4.5], f: [0, 4.5, 0.9, 9], g: [0, 4.05, 3, 4.95] };
const DIGITS = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };

/**
 * Builds the ground meshes of the base.
 * @param {import('./airBaseLayout.js').AirBaseLayout} layout
 * @param {{requestMaterial?: (name: string) => {map: THREE.Texture, normalMap?: THREE.Texture}} | null} surfaces
 * @returns {{object3d: THREE.Group, dispose: () => void}}
 */
export function buildAirBaseSurfaces(layout, surfaces) {
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
  for (const side of [-1, 1]) paint.rect(side * (half - 1.5) - 0.45, 0, side * (half - 1.5) + 0.45, runway.length, WHITE);
  for (let t = 90; t + 30 < runway.length - 90; t += 50) paint.rect(-0.45, t, 0.45, t + 30, WHITE);
  for (const end of [0, 1]) {
    // Each end in its own reading frame: up is the landing direction, right its right hand.
    const sign = end === 0 ? 1 : -1;
    const origin = end === 0 ? east : west;
    paint.frame(origin.x, origin.z, along.x * sign, along.z * sign, nx * sign, nz * sign, top);
    for (let i = 0; i < 8; i += 1) {
      const s = (i < 4 ? -1 : 1) * (3.2 + (i % 4) * 3.6);
      paint.rect(s - 0.9, 6, s + 0.9, 36, WHITE);
    }
    const text = runway.designators[end];
    for (let i = 0; i < text.length; i += 1) {
      const left = (i - text.length / 2) * 5 + 1;
      for (const key of DIGITS[text[i]] ?? '') {
        const [s0, t0, s1, t1] = STROKES[key];
        paint.rect(left + s0, 44 + t0, left + s1, 44 + t1, WHITE);
      }
    }
  }
  for (const taxiway of layout.taxiways) strip(paint, taxiway.a, taxiway.b, 0.5, top, YELLOW, taxiway.id === 'taxi_parallel' ? 0 : 0.25);
  // Stand marks: a lead-in line from the taxiway side and a stop bar at the nose wheel.
  for (const stand of layout.stands) {
    const fx = Math.sin(stand.heading);
    const fz = -Math.cos(stand.heading);
    paint.frame(stand.x, stand.z, fx, fz, -fz, fx, top);
    paint.rect(-0.25, -6, 0.25, 70, YELLOW);
    paint.rect(-5, 8, 5, 8.6, YELLOW);
    paint.rect(-12, -14, -11.5, 2, WHITE);
    paint.rect(11.5, -14, 12, 2, WHITE);
  }
  for (let i = 0; i + 1 < layout.road.points.length; i += 1) {
    const a = layout.road.points[i];
    const b = layout.road.points[i + 1];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    paint.frame(a.x, a.z, (b.x - a.x) / length, (b.z - a.z) / length, -(b.z - a.z) / length, (b.x - a.x) / length, top);
    for (let t = 3; t + 3 < length; t += 9) paint.rect(-0.07, t, 0.07, t + 3, WHITE);
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
  offset(meshes[3], -1, -1);
  for (const mesh of meshes) group.add(mesh);
  return {
    object3d: group,
    dispose() {
      group.removeFromParent();
      for (const mesh of meshes) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
    },
  };
}

// The cleared, graded ground of the whole pad: dry mown grass and compacted sand instead of the
// dark wetland mud around it, so the base reads as a kept military field from the air.
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
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide });
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
