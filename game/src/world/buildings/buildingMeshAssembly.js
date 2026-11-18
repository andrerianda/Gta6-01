// Building mesh assembly: lays a facade kit's modules along every edge of each planned building
// (bays stretched to fit, corner posts, ground, upper and top storeys), closes the volume with a
// roof, a plinth and roof plant, and merges everything of one sector into one mesh per material
// with the building's wall and trim tints in vertex colours: a street of hundreds of bays is a
// handful of draw calls. It also makes the far level (one card per facade) and lists the lights,
// sign anchors and colliders of the buildings.
import * as THREE from 'three';

const SLOT_FALLBACKS = {
  ground_entrance: ['ground_shop', 'ground_wall'],
  ground_shop: ['ground_wall'],
  ground_wall: ['ground_shop'],
  upper_balcony: ['upper_window'],
  upper_mechanical: ['upper_window'],
  top_crown: ['top_parapet'],
};

/**
 * Builds the meshes of a sector's buildings.
 * @param {import('./buildingMassingPlan.js').BuildingPlan[]} plans The buildings.
 * @param {{kitFor: (plan: object) => object, materialFor: (kit: object, role: string) => THREE.Material,
 *   cardMaterialFor: (plan: object) => THREE.Material, roofMaterial: THREE.Material,
 *   origin?: {x: number, z: number}}} options kitFor gives the facade kit of a plan (a baked kit
 *   from bakedFacadeKit.js or a procedural one), materialFor the material of a kit's role
 *   (wall, trim, glass, glassLit, frame, atlas), cardMaterialFor the far-level facade material.
 * @returns {{near: THREE.Group, far: THREE.Group, lights: object[], signs: object[],
 *   colliders: object[], stats: {buildings: number, modules: number, triangles: number}}}
 */
export function assembleSectorBuildings(plans, options) {
  const ox = options.origin?.x ?? 0;
  const oz = options.origin?.z ?? 0;
  const near = new Map();
  const far = new Map();
  const lights = [];
  const signs = [];
  const colliders = [];
  const wall = new THREE.Color();
  const trim = new THREE.Color();
  const white = new THREE.Color(1, 1, 1);
  let modules = 0;

  for (const plan of plans) {
    const kit = options.kitFor(plan);
    const bySlot = slotsOf(kit);
    wall.set(plan.tints.wall);
    trim.set(plan.tints.trim);
    let seed = plan.seed >>> 0 || 1;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const upperHeight = kit.upper ?? plan.upperHeight;
    const roofY = plan.y + 4.2 + (plan.storeys - 1) * upperHeight;
    const crown = plan.family === 'tower' && plan.storeys > 10;

    const place = (module, edge, along, y, scaleX, litShare) => {
      const lit = random() < litShare;
      for (const part of module.parts) {
        let role = part.role;
        if (role === 'glass' && lit) role = 'glassLit';
        const material = options.materialFor(kit, role, part);
        const tint = part.role === 'wall' ? wall : part.role === 'trim' ? trim : white;
        writePart(target(near, material), part, edge, along, y, scaleX, tint, ox, oz);
      }
      modules += 1;
    };

    for (const edge of plan.edges) {
      let along = 0.5;
      edge.bays.forEach((bay, column) => {
        const centre = along + bay.width / 2;
        const ground = pickModule(bySlot, bay.ground, bay.width);
        if (ground) place(ground, edge, centre, plan.y, bay.width / ground.width, bay.ground === 'ground_wall' ? plan.litShare : 0.85);
        if (edge.front && bay.ground === 'ground_entrance') {
          lights.push({ kind: 'point', position: [edge.ax + edge.tx * centre + edge.nx * 1.0, plan.y + 3.0, edge.az + edge.tz * centre + edge.nz * 1.0],
            color: 0xffcf8f, intensity: 90, range: 9, groundY: plan.y, importance: 0.5 });
          if (plan.landmarkKind) {
            signs.push({ lotId: plan.lotId, landmarkKind: plan.landmarkKind,
              position: [edge.ax + edge.tx * centre - edge.nx * -0.15, plan.y + 3.7, edge.az + edge.tz * centre + edge.nz * 0.15],
              direction: [edge.nx, 0, edge.nz], width: bay.width - 0.4, height: 0.7 });
          }
        }
        const balcony = plan.balconyEvery && edge.front && column % plan.balconyEvery === 1;
        for (let storey = 1; storey < plan.storeys; storey += 1) {
          const slot = balcony ? 'upper_balcony' : 'upper_window';
          const upper = pickModule(bySlot, slot, bay.width, plan.upperVariant);
          if (upper) place(upper, edge, centre, plan.y + 4.2 + (storey - 1) * upperHeight, bay.width / upper.width, plan.litShare);
        }
        const top = pickModule(bySlot, crown && edge.front ? 'top_crown' : 'top_parapet', bay.width);
        if (top) place(top, edge, centre, roofY, bay.width / top.width, 0);
        along += bay.width;
      });
      // Corner posts at the end of the edge, where the next facade turns towards +X.
      const cornerAlong = edge.length - 0.25;
      const posts = [pickModule(bySlot, 'corner_ground', 0.5), pickModule(bySlot, 'corner_upper', 0.5), pickModule(bySlot, 'corner_top', 0.5)];
      if (posts[0]) place(posts[0], edge, cornerAlong, plan.y, 1, 0);
      if (posts[1]) for (let storey = 1; storey < plan.storeys; storey += 1) place(posts[1], edge, cornerAlong, plan.y + 4.2 + (storey - 1) * upperHeight, 1, 0);
      if (posts[2]) place(posts[2], edge, cornerAlong, roofY, 1, 0);
      // Plinth below the pad, so sloping ground at the lot's edge never shows a gap.
      writeQuad(target(near, options.materialFor(kit, 'trim')), edge, 0, edge.length, plan.y - 2, plan.y, trim, ox, oz);
      // Far level: one card per facade, a band for the parapet.
      writeQuad(target(far, options.cardMaterialFor(plan)), edge, 0, edge.length, plan.y - 2, roofY, wall, ox, oz);
      writeQuad(target(far, options.materialFor(kit, 'trim')), edge, 0, edge.length, roofY, roofY + 1.2, trim, ox, oz);
    }
    writeRoof(target(near, options.roofMaterial), plan.footprint, roofY + 0.02, ox, oz);
    writeRoof(target(far, options.roofMaterial), plan.footprint, roofY + 0.02, ox, oz);
    writeRoofPlant(target(near, options.materialFor(kit, 'frame')), plan, roofY, random, ox, oz);
    colliders.push(colliderOf(plan, roofY + 1.2));
  }

  const nearGroup = toGroup(near, 'buildings_near');
  const farGroup = toGroup(far, 'buildings_far');
  let triangles = 0;
  nearGroup.traverse((node) => { if (node.isMesh) triangles += node.geometry.attributes.position.count / 3; });
  return { near: nearGroup, far: farGroup, lights, signs, colliders, stats: { buildings: plans.length, modules, triangles } };
}

/** The modules of a kit by slot, cached on the kit. */
function slotsOf(kit) {
  if (kit.bySlot) return kit.bySlot;
  const bySlot = {};
  for (const [name, module] of Object.entries(kit.modules)) {
    (bySlot[module.slot] ??= []).push({ name, ...module });
  }
  for (const list of Object.values(bySlot)) list.sort((a, b) => a.name.localeCompare(b.name));
  kit.bySlot = bySlot;
  return bySlot;
}

/** The module of a slot whose width best fits the bay, falling back to related slots. */
function pickModule(bySlot, slot, width, variant = 0) {
  const chain = [slot, ...(SLOT_FALLBACKS[slot] ?? [])];
  let loose = null;
  for (const name of chain) {
    const list = bySlot[name];
    if (!list?.length) continue;
    let bestError = Infinity;
    for (const module of list) bestError = Math.min(bestError, Math.abs(Math.log(width / module.width)));
    const fitting = list.filter((module) => Math.abs(Math.abs(Math.log(width / module.width)) - bestError) < 1e-6);
    const choice = fitting[variant % fitting.length];
    if (bestError < 0.25 || slot.startsWith('corner')) return choice;
    loose ??= choice;
  }
  return loose;
}

function target(map, material) {
  let entry = map.get(material);
  if (!entry) {
    entry = { material, position: new GrowingArray(), normal: new GrowingArray(), uv: new GrowingArray(), color: new GrowingArray() };
    map.set(material, entry);
  }
  return entry;
}

/** Writes one module part placed on an edge: x along the edge, y up, module -Z outward. */
function writePart(out, part, edge, along, y, scaleX, tint, ox, oz) {
  const { position, normal, uv } = part;
  const bx = edge.ax + edge.tx * along - ox;
  const bz = edge.az + edge.tz * along - oz;
  const count = position.length / 3;
  for (let i = 0; i < count; i += 1) {
    const mx = position[i * 3] * scaleX;
    const my = position[i * 3 + 1];
    const mz = position[i * 3 + 2];
    out.position.push3(bx + edge.tx * mx - edge.nx * mz, y + my, bz + edge.tz * mx - edge.nz * mz);
    const nx = normal[i * 3];
    const ny = normal[i * 3 + 1];
    const nz = normal[i * 3 + 2];
    out.normal.push3(edge.tx * nx - edge.nx * nz, ny, edge.tz * nx - edge.nz * nz);
    if (part.uvAbsolute) out.uv.push2(uv[i * 2], uv[i * 2 + 1]);
    else out.uv.push2(uv[i * 2] * (Math.abs(nx) > 0.5 ? 1 : scaleX) + along, uv[i * 2 + 1] + y);
    out.color.push3(tint.r, tint.g, tint.b);
  }
}

/** A quad on the wall plane of an edge, from along a to b and height y0 to y1. */
function writeQuad(out, edge, a, b, y0, y1, tint, ox, oz) {
  const x0 = edge.ax + edge.tx * a - ox;
  const z0 = edge.az + edge.tz * a - oz;
  const x1 = edge.ax + edge.tx * b - ox;
  const z1 = edge.az + edge.tz * b - oz;
  const corners = [[x0, y0, z0, a, y0], [x1, y0, z1, b, y0], [x1, y1, z1, b, y1], [x0, y1, z0, a, y1]];
  // Outward normal n; module +X is t, and t x up = -n, so (a, b, c) as listed faces -n: flip.
  for (const index of [0, 2, 1, 0, 3, 2]) {
    const c = corners[index];
    out.position.push3(c[0], c[1], c[2]);
    out.normal.push3(edge.nx, 0, edge.nz);
    out.uv.push2(c[3], c[4]);
    out.color.push3(tint.r, tint.g, tint.b);
  }
}

function writeRoof(out, ring, y, ox, oz) {
  // Two triangles over the four corners, facing up.
  const p = (i) => [ring[i * 2] - ox, ring[i * 2 + 1] - oz];
  const corners = [p(0), p(1), p(2), p(3)];
  const area = (corners[1][0] - corners[0][0]) * (corners[2][1] - corners[0][1]) - (corners[2][0] - corners[0][0]) * (corners[1][1] - corners[0][1]);
  const order = area < 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
  for (const index of order) {
    const [x, z] = corners[index];
    out.position.push3(x, y, z);
    out.normal.push3(0, 1, 0);
    out.uv.push2(x + ox, z + oz);
    out.color.push3(1, 1, 1);
  }
}

/** A stair house and a few air-conditioning units on the roof. */
function writeRoofPlant(out, plan, roofY, random, ox, oz) {
  const [cx, cz] = plan.centre;
  const edge = plan.edges[0];
  if (!edge) return;
  const units = 2 + Math.floor(random() * 4);
  for (let i = 0; i < units; i += 1) {
    const along = (random() - 0.5) * Math.min(edge.length * 0.6, 20);
    const across = (random() - 0.5) * 8;
    const size = 0.8 + random() * 1.4;
    writeBox(out, cx + edge.tx * along + edge.nx * across - ox, roofY, cz + edge.tz * along + edge.nz * across - oz, size, 0.6 + random() * 0.9, size * 0.8, edge);
  }
}

function writeBox(out, x, y, z, w, h, d, edge) {
  const tx = edge.tx; const tz = edge.tz; const nx = edge.nx; const nz = edge.nz;
  const faces = [
    [nx, 0, nz, tx, tz, w, d], [-nx, 0, -nz, -tx, -tz, w, d], [tx, 0, tz, -nx, -nz, d, w], [-tx, 0, -tz, nx, nz, d, w],
  ];
  const grey = 0.75;
  for (const [fx, , fz, ux, uz, width, depth] of faces) {
    const cx = x + fx * depth / 2;
    const cz = z + fz * depth / 2;
    const quad = [[cx - ux * width / 2, y, cz - uz * width / 2], [cx + ux * width / 2, y, cz + uz * width / 2],
      [cx + ux * width / 2, y + h, cz + uz * width / 2], [cx - ux * width / 2, y + h, cz - uz * width / 2]];
    emitFacing(out, quad, [fx, 0, fz], grey);
  }
  const hw = w / 2; const hd = d / 2;
  const top = [[x - tx * hw - nx * hd, y + h, z - tz * hw - nz * hd], [x + tx * hw - nx * hd, y + h, z + tz * hw - nz * hd],
    [x + tx * hw + nx * hd, y + h, z + tz * hw + nz * hd], [x - tx * hw + nx * hd, y + h, z - tz * hw + nz * hd]];
  emitFacing(out, top, [0, 1, 0], grey);
}

function emitFacing(out, quad, n, grey) {
  const [a, b, c] = quad;
  const ux = b[0] - a[0]; const uy = b[1] - a[1]; const uz = b[2] - a[2];
  const vx = c[0] - a[0]; const vy = c[1] - a[1]; const vz = c[2] - a[2];
  const facing = (uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2];
  const order = facing >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
  for (const index of order) {
    const v = quad[index];
    out.position.push3(v[0], v[1], v[2]);
    out.normal.push3(n[0], n[1], n[2]);
    out.uv.push2(v[0] + v[2], v[1]);
    out.color.push3(grey, grey, grey);
  }
}

function colliderOf(plan, top) {
  const f = plan.footprint;
  const ux = f[2] - f[0]; const uz = f[3] - f[1];
  const vx = f[6] - f[0]; const vz = f[7] - f[1];
  const width = Math.hypot(ux, uz);
  const depth = Math.hypot(vx, vz);
  const rotationY = Math.atan2(-uz / width, ux / width);
  return {
    lotId: plan.lotId, shape: 'box',
    x: plan.centre[0], y: (plan.y - 2 + top) / 2, z: plan.centre[1],
    halfX: width / 2, halfY: (top - plan.y + 2) / 2, halfZ: depth / 2,
    rotationY, heading: -rotationY,
  };
}

function toGroup(map, name) {
  const group = new THREE.Group();
  group.name = name;
  for (const entry of map.values()) {
    if (entry.position.length === 0) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(entry.position.toArray(), 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(entry.normal.toArray(), 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(entry.uv.toArray(), 2));
    geometry.setAttribute('color', new THREE.BufferAttribute(entry.color.toArray(), 3));
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    const mesh = new THREE.Mesh(geometry, entry.material);
    mesh.name = `${name}_${entry.material.name || 'material'}`;
    mesh.castShadow = !entry.material.userData?.noShadow;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }
  return group;
}

/** A float array that grows by doubling, for building geometry without per-vertex objects. */
class GrowingArray {
  constructor(capacity = 4096) {
    this.data = new Float32Array(capacity);
    this.length = 0;
  }

  reserve(extra) {
    if (this.length + extra <= this.data.length) return;
    let size = this.data.length * 2;
    while (size < this.length + extra) size *= 2;
    const next = new Float32Array(size);
    next.set(this.data.subarray(0, this.length));
    this.data = next;
  }

  push2(a, b) {
    this.reserve(2);
    this.data[this.length++] = a;
    this.data[this.length++] = b;
  }

  push3(a, b, c) {
    this.reserve(3);
    this.data[this.length++] = a;
    this.data[this.length++] = b;
    this.data[this.length++] = c;
  }

  toArray() {
    return this.data.slice(0, this.length);
  }
}
