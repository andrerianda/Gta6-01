// What the Federasi Norvast built in the hidden valley: the asphalt strip with worn markings and
// a few dim edge lights, the turning pad, the concrete apron, the camouflage-net hangar and its
// stores. With the artists' ground library and equipment kit in memory (military/base_ground.glb
// and base_ground_kit.glb, the same ones Base Aérea Punta Garza uses; world/airbase/groundKit.js)
// the ground is their baked asphalt and concrete with paint, tyre-rubber, crack, oil and scorch
// decals, the stores are the kit's drums, crates, power unit, bowser and tug, and grass and scrub
// grow along the strip; until they have loaded, the city library's asphalt stands in and the
// stores are left out. The hangar is the real model when the asset library has it, else a plain
// stand-in of poles and netting. Everything is in the island's own frame (x along the strip, z to
// its north).
import * as THREE from 'three';
import { GROUND_KIT_ITEMS } from '../airbase/airBaseDressingPlan.js';
import { GROUND_KIT_ASSET, GROUND_TINTS, createGroundBatch, groundLayerMesh, instanceParts, modelParts, readGroundMaterials } from '../airbase/groundKit.js';
import { ISLAND_PROPS, planIslandPlanting } from './islandGarrison.js';
import { NORVAST_ISLAND_SHAPE as SHAPE } from './norvastIslandShape.js';

const HANGAR_ASSET = 'camo_net_hangar';
const COLLIDER_GROUP = 'norvast:airfield';
/** The models the airfield is built from besides the hangar (the zone loads them and rebuilds when they arrive). */
export const ISLAND_AIRFIELD_KIT = Object.freeze(['base_ground', GROUND_KIT_ASSET, HANGAR_ASSET, 'ground_cover', 'shrubs_tropical']);

const hash = (a, b) => {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Collects flat quads (in the island frame, UVs in metres) into one geometry. */
function createQuadBatch() {
  const positions = [], uvs = [], indices = [];
  return {
    /** A quad centred at u, v: `length` along u, `width` along v; UVs span uvLength x uvWidth. */
    add(u, v, y, length, width, uvLength = length, uvWidth = width, alongV = false) {
      const base = positions.length / 3;
      const hl = length / 2, hw = width / 2;
      positions.push(u - hl, y, v - hw, u + hl, y, v - hw, u - hl, y, v + hw, u + hl, y, v + hw);
      if (alongV) uvs.push(0, 0, 0, uvWidth, uvLength, 0, uvLength, uvWidth);
      else uvs.push(0, 0, uvLength, 0, 0, uvWidth, uvLength, uvWidth);
      indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    },
    build() {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      return geometry;
    },
  };
}

function layered(material, factor, units) {
  const copy = material.clone();
  copy.polygonOffset = true;
  copy.polygonOffsetFactor = factor;
  copy.polygonOffsetUnits = units;
  return copy;
}

/** A plain shelter of poles under a sagging camouflage net, until the real model is there. */
function buildStandInHangar(owned) {
  const group = new THREE.Group();
  group.name = 'camo-net-hangar-stand-in';
  const width = 60, depth = 44, clear = 16;
  const net = new THREE.PlaneGeometry(width + 6, depth + 6, 12, 8);
  net.rotateX(-Math.PI / 2);
  const position = net.getAttribute('position');
  const colours = new Float32Array(position.count * 3);
  const palette = [[0.16, 0.2, 0.11], [0.24, 0.23, 0.15], [0.11, 0.14, 0.09], [0.3, 0.29, 0.2]];
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i), z = position.getZ(i);
    const arch = Math.cos((x / (width + 6)) * Math.PI) * 3.2;
    const sag = Math.sin(x * 0.42) * Math.sin(z * 0.37) * 0.5;
    const edge = Math.max(Math.abs(x) / (width / 2 + 3), Math.abs(z) / (depth / 2 + 3)) > 0.98 ? -2.2 : 0;
    position.setY(i, clear + 0.6 + arch + sag + edge);
    colours.set(palette[(i * 7 + Math.floor(i / 13) * 3) % palette.length], i * 3);
  }
  net.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  net.computeVertexNormals();
  const netMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide });
  const roof = new THREE.Mesh(net, netMaterial);
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);
  const poleGeometry = new THREE.CylinderGeometry(0.22, 0.26, clear + 1, 8);
  poleGeometry.translate(0, (clear + 1) / 2, 0);
  const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x3a3d33, roughness: 0.8, metalness: 0.3 });
  const poles = new THREE.InstancedMesh(poleGeometry, poleMaterial, 12);
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < 12; i += 1) {
    const side = i < 6 ? -1 : 1;
    matrix.makeTranslation(side * (width / 2), 0, -depth / 2 + ((i % 6) * depth) / 5);
    poles.setMatrixAt(i, matrix);
  }
  poles.castShadow = true;
  group.add(poles);
  owned.push(net, netMaterial, poleGeometry, poleMaterial);
  return group;
}

// The stand-in ground: the city library's old asphalt and its procedural worn markings.
function layStandInGround(group, owned, surfaces) {
  const { u0, u1, halfWidth, y } = SHAPE.stripLocal;
  const length = u1 - u0, middle = (u0 + u1) / 2;
  const mesh = (batch, material, order = 0) => {
    const geometry = batch.build();
    const made = new THREE.Mesh(geometry, material);
    made.receiveShadow = true;
    made.renderOrder = order;
    owned.push(geometry, material);
    group.add(made);
  };
  const asphalt = createQuadBatch();
  asphalt.add(middle, 0, y + 0.05, length, halfWidth * 2);
  const pad = SHAPE.padLocal;
  for (let i = -5; i <= 5; i += 1) {
    const offset = (i / 5.5) * pad.radius;
    const chord = Math.sqrt(pad.radius * pad.radius - offset * offset);
    asphalt.add(pad.u + offset, 0, y + 0.045, pad.radius / 5.5 + 0.01, chord * 2);
  }
  mesh(asphalt, layered(surfaces.requestMaterial('asphaltOld'), -1, -2));
  const apron = SHAPE.apronLocal;
  const apronBatch = createQuadBatch();
  apronBatch.add((apron.u0 + apron.u1) / 2, (halfWidth + apron.v1 - 6) / 2, y + 0.04, apron.u1 - apron.u0 - 12, apron.v1 - 6 - halfWidth);
  mesh(apronBatch, layered(surfaces.requestMaterial('asphaltPatched'), -1, -2));
  const dashes = createQuadBatch();
  dashes.add(middle, 0, y + 0.07, length - 120, 0.6, length - 120, 0.3);
  mesh(dashes, layered(surfaces.requestMaterial('markingDashedLine', { wear: 0.7, dash: 12, gap: 14 }), -3, -8), 1);
  const lines = createQuadBatch();
  for (const side of [-1, 1]) lines.add(middle, side * (halfWidth - 1.2), y + 0.07, length - 8, 0.45, length - 8, 0.3);
  for (const end of [u0 + 14, u1 - 14]) {
    for (let k = 0; k < 8; k += 1) lines.add(end, -halfWidth + 4.5 + k * 4.43, y + 0.07, 16, 1.5, 16, 0.3);
  }
  mesh(lines, layered(surfaces.requestMaterial('markingSolidLine', { lineWidth: 0.3, wear: 0.75 }), -3, -8), 1);
}

// The artists' ground: asphalt strip and pad, concrete apron, worn paint, rubber, cracks, oil, soot.
function layBakedGround(group, owned, ground) {
  const { u0, u1, halfWidth, y } = SHAPE.stripLocal;
  const pad = SHAPE.padLocal;
  const apron = SHAPE.apronLocal;
  const batches = {};
  const batch = (name) => (batches[name] ??= createGroundBatch((p, q) => ({ x: p, z: q })));
  let n = 0;
  const between = (low, high) => low + (high - low) * hash((n += 1), 4409);

  const asphalt = batch('asphalt');
  asphalt.rect(u0, -halfWidth, u1, halfWidth, y + 0.05, { cell: 8, tint: GROUND_TINTS.asphalt });
  for (let i = -5; i <= 5; i += 1) {
    const offset = (i / 5.5) * pad.radius;
    const chord = Math.sqrt(pad.radius * pad.radius - offset * offset);
    const half = pad.radius / 11 + 0.005;
    asphalt.rect(pad.u + offset - half, pad.v - chord, pad.u + offset + half, pad.v + chord, y + 0.045, { cell: 8, tint: GROUND_TINTS.asphalt });
  }
  batch('concrete').rect(apron.u0 + 6, halfWidth, apron.u1 - 6, apron.v1 - 6, y + 0.04, { tint: GROUND_TINTS.concrete, perCell: true });

  // Worn paint: a dashed centre line, edge lines, threshold bars at both ends.
  const top = y + 0.075;
  const white = batch('decal_paint_white');
  for (let u = u0 + 60; u + 12 < u1 - 60; u += 26) white.line(u, 0, u + 12, 0, 0.6, top, 0.6);
  for (const side of [-1, 1]) white.line(u0 + 4, side * (halfWidth - 1.2), u1 - 4, side * (halfWidth - 1.2), 0.45, top, 0.65);
  for (const end of [u0 + 6, u1 - 22]) {
    for (let k = 0; k < 8; k += 1) white.line(end, -halfWidth + 4.5 + k * 4.43, end + 16, -halfWidth + 4.5 + k * 4.43, 1.5, top, 0.6);
  }
  const yellow = batch('decal_paint_yellow');
  yellow.line(SHAPE.hangarLocal.u, halfWidth - 2, SHAPE.hangarLocal.u, SHAPE.hangarLocal.v - 24, 0.3, top, 0.5);

  // Wear. A decal's length lies along `angle` (radians from +v towards +u): pi / 2 is along the strip.
  const along = Math.PI / 2;
  const stain = y + 0.064;
  for (let i = 0; i < 20; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    batch('decal_tyre_rubber').decal(u0 + 45 + (i / 20) * 260 + between(-8, 8), side * between(1.6, 6.5), along + between(-0.02, 0.02), between(5, 7), between(26, 38), stain, between(0.5, 0.95));
  }
  for (let i = 0; i < 8; i += 1) batch('decal_tyre_rubber').decal(u1 - 60 - i * 34 + between(-8, 8), between(-5, 5), along, between(4.5, 6), between(24, 32), stain, between(0.25, 0.5));
  for (let i = 0; i < 34; i += 1) batch('decal_crack').decal(between(u0 + 8, u1 - 8), between(-halfWidth + 3, halfWidth - 3), Math.floor(between(0, 4)) * along + between(-0.1, 0.1), between(4, 8), between(4, 8), y + 0.058, between(0.55, 1));
  for (let i = 0; i < 16; i += 1) batch('decal_crack').decal(between(apron.u0 + 12, apron.u1 - 12), between(halfWidth + 6, apron.v1 - 12), Math.floor(between(0, 4)) * along + between(-0.1, 0.1), between(4, 7), between(4, 7), y + 0.058, between(0.5, 0.95));
  for (let i = 0; i < 9; i += 1) batch('decal_oil_stain').decal(SHAPE.hangarLocal.u + between(-24, 24), between(46, 100), between(0, 6.28), between(1.8, 3.4), between(1.8, 3.4), stain, between(0.55, 1));
  for (const [u, v] of [[414, 74], [262, 140], [274, 140]]) batch('decal_oil_stain').decal(u + between(-1, 1), v + between(-1, 1), between(0, 6.28), between(2, 3.2), between(2, 3.2), stain, 0.8);
  // Soot where aircraft turn on the pad and hold at the threshold (blast back along the strip's start).
  batch('decal_scorch').decal(u0 + 24, between(-2, 2), -along, 7, 11, stain, 0.8);
  batch('decal_scorch').decal(pad.u + 6, pad.v + 8, along * 0.4, 6.5, 9, stain, 0.6);

  const add = (name, material, order) => {
    const mesh = groundLayerMesh(batches[name]?.geometry() ?? null, material, `norvast-${name}`, order);
    if (!mesh) return;
    owned.push(mesh.geometry);
    group.add(mesh);
  };
  add('asphalt', ground.tiles.asphalt, 0);
  add('concrete', ground.tiles.concrete, 0);
  for (const name of Object.keys(ground.decals)) add(name, ground.decals[name], ground.order[name] ?? 1);
  owned.push(ground);
}

/**
 * Builds the airfield of the island.
 * @param {import('../../core/systems/gameContext.js').GameContext} context The game context.
 * @param {ReturnType<import('../../render/textures/surfaceMaterials.js').createSurfaceLibrary>} surfaces
 * @returns {{object3d: THREE.Group, hasRealHangar: boolean, baked: boolean, counts: {props: number, grass: number, scrub: number, colliders: number},
 *   dispose: () => void}}
 */
export function buildIslandAirfield(context, surfaces) {
  const group = new THREE.Group();
  group.name = 'norvast-airfield';
  const owned = [];
  const counts = { props: 0, grass: 0, scrub: 0, colliders: 0 };
  const { u0, u1, halfWidth, y } = SHAPE.stripLocal;
  const assets = context.assets ?? null;
  const assetOf = (id) => {
    try { return assets?.has?.(id) ? assets.get(id) : null; } catch { return null; }
  };

  const ground = readGroundMaterials(assets);
  if (ground) layBakedGround(group, owned, ground);
  else layStandInGround(group, owned, surfaces);

  // Edge lights: low shielded lamps, dim amber along the edges, green at the threshold, red at the end.
  const lamps = [];
  for (let u = u0; u <= u1 + 0.1; u += 75) for (const side of [-1, 1]) lamps.push([u, side * (halfWidth + 1.2), 1.0, 0.72, 0.34]);
  for (let k = 0; k < 6; k += 1) {
    const v = -halfWidth + 2 + k * ((halfWidth * 2 - 4) / 5);
    lamps.push([u0 - 2, v, 0.25, 1.0, 0.4], [u1 + 2, v, 1.0, 0.16, 0.1]);
  }
  const lampGeometry = new THREE.SphereGeometry(0.2, 8, 6);
  const lampMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const lampMesh = new THREE.InstancedMesh(lampGeometry, lampMaterial, lamps.length);
  const matrix = new THREE.Matrix4();
  const colour = new THREE.Color();
  lamps.forEach(([u, v, r, g, b], index) => {
    matrix.makeTranslation(u, y + 0.38, v);
    lampMesh.setMatrixAt(index, matrix);
    lampMesh.setColorAt(index, colour.setRGB(r * 1.6, g * 1.6, b * 1.6));
  });
  owned.push(lampGeometry, lampMaterial);
  group.add(lampMesh);

  // The hangar under its net: the open sides face the strip and the cliff.
  const hangarAsset = assetOf(HANGAR_ASSET);
  let hangar = null;
  if (hangarAsset) {
    try { hangar = assets.instantiate(HANGAR_ASSET); } catch { hangar = null; }
  }
  const hasRealHangar = Boolean(hangar);
  if (!hangar) hangar = buildStandInHangar(owned);
  hangar.position.set(SHAPE.hangarLocal.u, y, SHAPE.hangarLocal.v);
  group.add(hangar);

  // The stores and equipment of the kit, instanced by kind; grass and scrub on the valley floor.
  const physics = context.systems?.find?.('physics') ?? null;
  const world = physics?.world ?? null;
  // An item turned by `turn` in the island frame points its front to this compass heading in the world.
  const compass = (turn) => SHAPE.strip.heading * (Math.PI / 180) - Math.PI / 2 - turn;
  const kit = assetOf(GROUND_KIT_ASSET);
  if (kit) {
    const byNode = new Map();
    for (const [node, u, v, turn] of ISLAND_PROPS) {
      if (!byNode.has(node)) byNode.set(node, []);
      byNode.get(node).push({ x: u, y: y + 0.04, z: v, turn });
    }
    for (const [node, places] of byNode) {
      const parts = modelParts(kit, node);
      if (parts.length === 0) continue;
      for (const mesh of instanceParts(parts, places, { name: `norvast-${node}` })) {
        owned.push(mesh.geometry);
        group.add(mesh);
      }
      counts.props += places.length;
      if (!world?.addStaticBox || !GROUND_KIT_ITEMS[node]?.collide) continue;
      const size = GROUND_KIT_ITEMS[node];
      for (const place of places) {
        const at = SHAPE.toWorld(place.x, place.z);
        world.addStaticBox(at.x, y + size.height / 2, at.z, size.width / 2, size.height / 2, size.length / 2, compass(place.turn), { group: COLLIDER_GROUP, surface: 'metal' });
        counts.colliders += 1;
      }
    }
  }
  if (hasRealHangar && hangarAsset.colliders?.length && physics?.addStaticColliders) {
    const at = SHAPE.toWorld(SHAPE.hangarLocal.u, SHAPE.hangarLocal.v);
    physics.addStaticColliders(hangarAsset.colliders, { x: at.x, y, z: at.z, heading: compass(0) }, { group: COLLIDER_GROUP, surface: 'metal' });
    counts.colliders += hangarAsset.colliders.length;
  }
  const grassAsset = assetOf('ground_cover');
  const scrubAsset = assetOf('shrubs_tropical');
  if (grassAsset || scrubAsset) {
    const planting = planIslandPlanting();
    const plant = (asset, list, level, castShadow) => {
      for (const variant of new Set(list.map((item) => item.variant))) {
        const parts = modelParts(asset, `${variant}_lod${level}`, { local: true });
        const places = list.filter((item) => item.variant === variant);
        for (const mesh of instanceParts(parts, places, { name: 'norvast-planting', castShadow })) {
          owned.push(mesh.geometry);
          group.add(mesh);
        }
        if (parts.length > 0) counts[asset === grassAsset ? 'grass' : 'scrub'] += places.length;
      }
    };
    if (grassAsset) plant(grassAsset, planting.grass, 0, false);
    if (scrubAsset) plant(scrubAsset, planting.scrub, 1, true);
  }

  return {
    object3d: group,
    hasRealHangar,
    baked: Boolean(ground),
    counts,
    dispose() {
      physics?.removeStaticColliders?.(COLLIDER_GROUP);
      for (const child of group.children) if (child.isInstancedMesh) child.dispose();
      for (const item of owned) item.dispose();
      group.clear();
    },
  };
}
