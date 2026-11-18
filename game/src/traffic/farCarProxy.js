// The farthest level of the distant traffic: one low-poly car shape shared by every model (84
// triangles: four wheels, a dark underbody, the painted lower body and a sloped glasshouse with a
// painted roof), drawn as instances scaled to each model's length, width and height and tinted
// with each car's paint through the instance colour (the vertex colours keep the glass, tyres and
// underbody dark). Its lamps are four small quads, white at the nose and red at the tail, lit
// above 1 so they bloom at night. Unit coordinates: x -0.5..0.5 (width), y 0..1 (height),
// z -0.5 (nose, the game's forward -Z) .. 0.5 (tail).
import * as THREE from 'three';

const PAINT = [1, 1, 1];
const GLASS = [0.05, 0.055, 0.06];
const TYRE = [0.025, 0.025, 0.025];
const UNDER = [0.06, 0.06, 0.06];
// Bright enough to bloom through the night haze at 120-500 m (at 2.6 / 2.4 they read as faint dots).
const HEAD = [5.2, 4.8, 4.0];
const TAIL = [5.0, 0.26, 0.12];

/** One far car's body: a non-indexed geometry with position, normal and colour. */
export function createFarCarGeometry() {
  const parts = { position: [], normal: [], color: [] };
  for (const x of [-1, 1]) {
    for (const z of [-0.31, 0.31]) addBox(parts, x * 0.4, x * 0.49, 0, 0.3, z - 0.085, z + 0.085, TYRE);
  }
  addBox(parts, -0.42, 0.42, 0.1, 0.2, -0.44, 0.44, UNDER);
  addBox(parts, -0.5, 0.5, 0.2, 0.55, -0.5, 0.5, PAINT);
  // The glasshouse: a raked windscreen and rear window, narrower at the roof; the roof painted.
  addFrustum(parts, { y0: 0.55, y1: 1, x0: 0.46, x1: 0.4, front0: -0.24, front1: -0.06, back0: 0.36, back1: 0.25 });
  return toGeometry(parts);
}

/** The far car's lamps: two head lamps at the nose, two tail lamps at the back. */
export function createFarCarLampGeometry() {
  const parts = { position: [], normal: [], color: [] };
  for (const side of [-1, 1]) {
    addQuad(parts, side * 0.24, side * 0.47, 0.35, 0.52, -0.505, -1, HEAD);
    addQuad(parts, side * 0.27, side * 0.48, 0.37, 0.52, 0.505, 1, TAIL);
  }
  return toGeometry(parts);
}

/** Triangles of one far car (body) and of its lamps. */
export const FAR_CAR_TRIANGLES = 84;
export const FAR_LAMP_TRIANGLES = 8;

/** The material of the far bodies: plain lit paint, the colour from vertex x instance colour. */
export function createFarCarMaterial() {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.3 });
  material.name = 'distant_far_body';
  return material;
}

/** The material of the far lamps: unlit and bright, both faces. */
export function createFarLampMaterial() {
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: true });
  material.name = 'distant_far_lamps';
  return material;
}

function toGeometry(parts) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(parts.position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(parts.normal, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(parts.color, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

// One flat-shaded quad a-b-c-d (counter-clockwise seen from outside) in a colour.
function pushQuad(parts, a, b, c, d, colour) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const length = Math.hypot(nx, ny, nz) || 1;
  nx /= length;
  ny /= length;
  nz /= length;
  for (const v of [a, b, c, a, c, d]) {
    parts.position.push(v[0], v[1], v[2]);
    parts.normal.push(nx, ny, nz);
    parts.color.push(colour[0], colour[1], colour[2]);
  }
}

// A quad facing +Z (facing 1) or -Z (facing -1) at depth z.
function addQuad(parts, x0, x1, y0, y1, z, facing, colour) {
  const lo = Math.min(x0, x1);
  const hi = Math.max(x0, x1);
  if (facing > 0) pushQuad(parts, [lo, y0, z], [hi, y0, z], [hi, y1, z], [lo, y1, z], colour);
  else pushQuad(parts, [hi, y0, z], [lo, y0, z], [lo, y1, z], [hi, y1, z], colour);
}

// An axis-aligned box with outward faces, all in one colour.
function addBox(parts, x0, x1, y0, y1, z0, z1, colour) {
  const half = Math.abs(x1 - x0) / 2;
  addFrustum(parts, { y0, y1, x0: half, x1: half, front0: z0, front1: z0, back0: z1, back1: z1, centre: (x0 + x1) / 2, colour, top: colour });
}

// A six-sided solid, symmetric about x = centre: half width x0 at the bottom (y0) and x1 at the
// top (y1), its front face from z front0 (bottom) to front1 (top) and its back from back0 to back1.
// Sides, front and back in `colour` (glass by default), the top in `top` (paint by default).
function addFrustum(parts, { y0, y1, x0, x1, front0, front1, back0, back1, centre = 0, colour = GLASS, top = PAINT }) {
  const L0 = centre - x0, R0 = centre + x0, L1 = centre - x1, R1 = centre + x1;
  const bfl = [L0, y0, front0], bfr = [R0, y0, front0], bbl = [L0, y0, back0], bbr = [R0, y0, back0];
  const tfl = [L1, y1, front1], tfr = [R1, y1, front1], tbl = [L1, y1, back1], tbr = [R1, y1, back1];
  pushQuad(parts, bfr, bfl, tfl, tfr, colour); // front (-Z)
  pushQuad(parts, bbl, bbr, tbr, tbl, colour); // back (+Z)
  pushQuad(parts, bfl, bbl, tbl, tfl, colour); // left (-X)
  pushQuad(parts, bbr, bfr, tfr, tbr, colour); // right (+X)
  pushQuad(parts, tfl, tbl, tbr, tfr, top); // top
  pushQuad(parts, bfl, bfr, bbr, bbl, colour); // bottom
}
