// The farthest level of the distant traffic: one low-poly car shape shared by every model (48
// triangles: wheels and sill, painted body, dark glasshouse, painted roof), drawn as instances
// scaled to each model's length, width and height and tinted with each car's paint through the
// instance colour (the vertex colours make the glass and wheels dark). Its lamps are four small
// quads, white at the nose and red at the tail, lit above 1 so they bloom at night. Unit
// coordinates: x -0.5..0.5 (width), y 0..1 (height), z -0.5 (nose, the game's forward -Z) .. 0.5.
import * as THREE from 'three';

const PAINT = [1, 1, 1];
const GLASS = [0.05, 0.055, 0.06];
const TYRE = [0.03, 0.03, 0.03];
const HEAD = [2.6, 2.4, 2.0];
const TAIL = [2.4, 0.16, 0.08];

/** One far car's body: an indexed-free geometry with position, normal and colour. */
export function createFarCarGeometry() {
  const parts = { position: [], normal: [], color: [] };
  addBox(parts, -0.46, 0.46, 0, 0.3, -0.4, 0.4, TYRE);
  addBox(parts, -0.5, 0.5, 0.2, 0.58, -0.5, 0.5, PAINT);
  addBox(parts, -0.43, 0.43, 0.58, 0.92, -0.2, 0.27, GLASS);
  addBox(parts, -0.41, 0.41, 0.92, 1, -0.16, 0.24, PAINT);
  return toGeometry(parts);
}

/** The far car's lamps: two head lamps at the nose, two tail lamps at the back. */
export function createFarCarLampGeometry() {
  const parts = { position: [], normal: [], color: [] };
  for (const side of [-1, 1]) {
    addQuad(parts, side * 0.28, side * 0.46, 0.4, 0.52, -0.505, -1, HEAD);
    addQuad(parts, side * 0.3, side * 0.47, 0.42, 0.52, 0.505, 1, TAIL);
  }
  return toGeometry(parts);
}

/** The material of the far bodies: plain lit paint, the colour from vertex x instance colour. */
export function createFarCarMaterial() {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.25 });
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

// A quad facing +Z (facing 1) or -Z (facing -1) at depth z.
function addQuad(parts, x0, x1, y0, y1, z, facing, colour) {
  const a = [Math.min(x0, x1), y0, z];
  const b = [Math.max(x0, x1), y0, z];
  const c = [Math.max(x0, x1), y1, z];
  const d = [Math.min(x0, x1), y1, z];
  const order = facing > 0 ? [a, b, c, a, c, d] : [b, a, d, b, d, c];
  for (const v of order) {
    parts.position.push(v[0], v[1], v[2]);
    parts.normal.push(0, 0, facing);
    parts.color.push(colour[0], colour[1], colour[2]);
  }
}

// An axis-aligned box with outward faces (counter-clockwise seen from outside).
function addBox(parts, x0, x1, y0, y1, z0, z1, colour) {
  const faces = [
    [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0]],
    [[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], [-1, 0, 0]],
    [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0]],
    [[x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [0, -1, 0]],
    [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]],
    [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]],
  ];
  for (const [a, b, c, d, n] of faces) {
    for (const v of [a, b, c, a, c, d]) {
      parts.position.push(v[0], v[1], v[2]);
      parts.normal.push(n[0], n[1], n[2]);
      parts.color.push(colour[0], colour[1], colour[2]);
    }
  }
}
