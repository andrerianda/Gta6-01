// What the Federasi Norvast built in the hidden valley: the asphalt strip with worn markings and
// a few dim edge lights, the turning pad, the apron, the camouflage-net hangar (the real model
// when the asset library has it, else a plain stand-in of poles and netting), and stores of fuel
// drums and crates. Everything is in the island's own frame (x along the strip, z to its north).
import * as THREE from 'three';
import { NORVAST_ISLAND_SHAPE as SHAPE } from './norvastIslandShape.js';

const HANGAR_ASSET = 'camo_net_hangar';

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

/**
 * Builds the airfield of the island.
 * @param {import('../../core/systems/gameContext.js').GameContext} context The game context.
 * @param {ReturnType<import('../../render/textures/surfaceMaterials.js').createSurfaceLibrary>} surfaces
 * @returns {{object3d: THREE.Group, hasRealHangar: boolean, dispose: () => void}}
 */
export function buildIslandAirfield(context, surfaces) {
  const group = new THREE.Group();
  group.name = 'norvast-airfield';
  const owned = [];
  const { u0, u1, halfWidth, y } = SHAPE.stripLocal;
  const length = u1 - u0, middle = (u0 + u1) / 2;
  const mesh = (batch, material, order = 0) => {
    const geometry = batch.build();
    const made = new THREE.Mesh(geometry, material);
    made.receiveShadow = true;
    made.renderOrder = order;
    owned.push(geometry, material);
    group.add(made);
    return made;
  };

  // Asphalt: the strip, and a patched apron; the pad is a ring of quads under the rock wall.
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

  // Worn paint: a dashed centre line, edge lines, and threshold bars at both ends.
  const dashes = createQuadBatch();
  dashes.add(middle, 0, y + 0.07, length - 120, 0.6, length - 120, 0.3);
  mesh(dashes, layered(surfaces.requestMaterial('markingDashedLine', { wear: 0.7, dash: 12, gap: 14 }), -3, -8), 1);
  const lines = createQuadBatch();
  for (const side of [-1, 1]) lines.add(middle, side * (halfWidth - 1.2), y + 0.07, length - 8, 0.45, length - 8, 0.3);
  for (const end of [u0 + 14, u1 - 14]) {
    for (let k = 0; k < 8; k += 1) lines.add(end, -halfWidth + 4.5 + k * 4.43, y + 0.07, 16, 1.5, 16, 0.3);
  }
  mesh(lines, layered(surfaces.requestMaterial('markingSolidLine', { lineWidth: 0.3, wear: 0.75 }), -3, -8), 1);

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
  const hasRealHangar = Boolean(context.assets && context.assets.has(HANGAR_ASSET));
  let hangar = null;
  if (hasRealHangar) {
    try { hangar = context.assets.instantiate(HANGAR_ASSET); } catch { hangar = null; }
  }
  if (!hangar) hangar = buildStandInHangar(owned);
  hangar.position.set(SHAPE.hangarLocal.u, y, SHAPE.hangarLocal.v);
  group.add(hangar);

  // Stores beside the hangar: fuel drums in rows and a few crates.
  const drumGeometry = new THREE.CylinderGeometry(0.29, 0.29, 0.88, 12);
  drumGeometry.translate(0, 0.44, 0);
  const drumMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62, metalness: 0.45 });
  const drums = new THREE.InstancedMesh(drumGeometry, drumMaterial, 28);
  const drumColours = [0x39432c, 0x2f3626, 0x4a3b2a, 0x3c4a3d];
  for (let i = 0; i < 28; i += 1) {
    const stack = i < 20 ? 0 : 1;
    const column = stack === 0 ? i % 5 : (i - 20) % 4, line = stack === 0 ? Math.floor(i / 5) : Math.floor((i - 20) / 4);
    matrix.makeTranslation(SHAPE.hangarLocal.u + 38 + column * 0.66 + stack * 6, y + 0.04, 132 + line * 0.66 + stack * 2);
    drums.setMatrixAt(i, matrix);
    drums.setColorAt(i, colour.setHex(drumColours[(i * 5 + line) % drumColours.length]));
  }
  drums.castShadow = true;
  const crateGeometry = new THREE.BoxGeometry(1, 1, 1);
  crateGeometry.translate(0, 0.5, 0);
  const crateMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
  const crates = new THREE.InstancedMesh(crateGeometry, crateMaterial, 12);
  const scale = new THREE.Vector3(), place = new THREE.Vector3(), turn = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < 12; i += 1) {
    const top = i >= 9;
    scale.set(1.6 + (i % 3) * 0.3, 0.9 + (i % 2) * 0.25, 1.1);
    place.set(SHAPE.hangarLocal.u - 42 - (top ? 1 : (i % 3) * 2.4), y + 0.04 + (top ? 0.9 : 0), 96 + (top ? (i - 9) * 1.6 : Math.floor(i / 3) * 1.5));
    turn.setFromAxisAngle(up, ((i * 37) % 11) * 0.03);
    matrix.compose(place, turn, scale);
    crates.setMatrixAt(i, matrix);
    crates.setColorAt(i, colour.setHex(i % 4 === 0 ? 0x4b5238 : 0x6b5a3e));
  }
  crates.castShadow = true;
  owned.push(drumGeometry, drumMaterial, crateGeometry, crateMaterial);
  group.add(drums, crates);

  return {
    object3d: group,
    hasRealHangar: hasRealHangar && hangar.name !== 'camo-net-hangar-stand-in',
    dispose() {
      for (const item of owned) item.dispose();
      group.clear();
    },
  };
}
