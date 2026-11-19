// The live glass of a cockpit model: the instrument faces and the combiner HUD.
// - createCockpitDisplays: every named face mesh of the cockpit kind (the four displays of the
//   glass cockpit, the round gauges of the analog ones) shows its cell of ONE shared canvas; the
//   face's own 0..1 texture coordinates are moved into the cell once, here. The canvas is an unlit
//   texture, so the instruments glow at night as they do by day; setLevel() divides the exposure
//   out so the picture's tone curve does not wash them.
// - createCombinerHud: the pilot's symbology on the `hud_combiner` glass, painted by
//   flightHudPainter.js paintCombinerHud on its own small canvas and drawn additive over the
//   glass's faint tint, with no depth write. It measures how tall the glass looks from the eye so
//   the pitch ladder can be conformal.
// Both work on one instance of the cockpit model and are thrown away with it.
import * as THREE from 'three';
import { ANALOG_JET_FACE_PAINTERS } from './analogJetPanel.js';
import { COCKPIT_FACES, COCKPIT_LIGHTING, COCKPIT_NODES, faceAtlasLayout, faceUvInAtlas, glassAngularSize } from './cockpitTuning.js';
import { paintCombinerHud } from './flightHudPainter.js';
import { GLASS_DISPLAY_PAINTERS } from './glassCockpitPanel.js';
import { TRAINER_FACE_PAINTERS } from './trainerSixPackPanel.js';

/** The face painters of each cockpit kind, by mesh name. */
export const COCKPIT_FACE_PAINTERS = Object.freeze({
  glass_four: GLASS_DISPLAY_PAINTERS,
  analog_gauges: ANALOG_JET_FACE_PAINTERS,
  analog_six: TRAINER_FACE_PAINTERS,
});

/** Draw order of the see-through parts, after everything of the world: canopy, combiner glass, symbology. */
export const COCKPIT_RENDER_ORDER = Object.freeze({ canopy: 20, combinerGlass: 21, symbology: 22 });
const COMBINER_CANVAS_WIDTH = 512;

/**
 * The meshes of a named node of an instance: the node itself, or the meshes under it when the
 * loader split it by material.
 * @param {THREE.Object3D} instance
 * @param {string} name
 * @returns {THREE.Mesh[]}
 */
export function meshesNamed(instance, name) {
  const found = [];
  instance.traverse((node) => {
    if (node.name !== name && node.userData?.name !== name) return;
    if (node.isMesh) found.push(node);
    else node.traverse((child) => { if (child.isMesh && !found.includes(child)) found.push(child); });
  });
  return found;
}

/** A copy of a face's geometry whose texture coordinates fill 0..1 exactly (the face's own bounds). */
function unitUvGeometry(mesh) {
  const geometry = mesh.geometry.clone();
  const source = geometry.getAttribute('uv');
  if (!source) return null;
  const uv = new THREE.BufferAttribute(new Float32Array(source.count * 2), 2);
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  for (let i = 0; i < source.count; i += 1) {
    const u = source.getX(i);
    const v = source.getY(i);
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }
  // (a face whose coordinates do not span a real rectangle keeps them as they are)
  const real = maxU - minU > 0.05 && maxV - minV > 0.05;
  const spanU = real ? maxU - minU : 1;
  const spanV = real ? maxV - minV : 1;
  if (!real) { minU = 0; minV = 0; }
  for (let i = 0; i < source.count; i += 1) uv.setXY(i, (source.getX(i) - minU) / spanU, (source.getY(i) - minV) / spanV);
  geometry.setAttribute('uv', uv);
  return geometry;
}

/**
 * Puts the live canvas on a cockpit instance's instrument faces.
 * @param {Document} document
 * @param {THREE.Object3D} instance An instance of the cockpit model.
 * @param {string} cockpitKind A key of COCKPIT_FACES.
 * @param {{stallClean: number, stallFlaps: number, neverExceed: number} | null} speeds Airspeed arcs, knots.
 * @param {number} [anisotropy]
 * @returns {{paint: (readout: object, extra: object) => void, setLevel: (level: number) => void, dispose: () => void,
 *   faces: string[], canvas: HTMLCanvasElement} | null} Null when the model has none of the kind's faces.
 */
export function createCockpitDisplays(document, instance, cockpitKind, speeds, anisotropy = 8) {
  const painters = COCKPIT_FACE_PAINTERS[cockpitKind];
  const wanted = COCKPIT_FACES[cockpitKind];
  if (!painters || !wanted || !instance) return null;
  const meshesOf = new Map();
  for (const name of wanted) {
    const meshes = meshesNamed(instance, name);
    if (meshes.length > 0 && painters[name]) meshesOf.set(name, meshes);
  }
  if (meshesOf.size === 0) return null;
  const faces = [...meshesOf.keys()];
  const atlas = faceAtlasLayout(faces);
  const canvas = document.createElement('canvas');
  canvas.width = atlas.width;
  canvas.height = atlas.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#020405';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false; // glTF texture coordinates
  texture.anisotropy = anisotropy;
  const material = new THREE.MeshBasicMaterial({ name: 'screen_live_canvas', map: texture, toneMapped: false });
  const geometries = [];
  const place = { u: 0, v: 0 };
  for (const [name, meshes] of meshesOf) {
    const cell = atlas.cells[name];
    for (const mesh of meshes) {
      const geometry = unitUvGeometry(mesh);
      if (!geometry) continue;
      const uv = geometry.getAttribute('uv');
      for (let i = 0; i < uv.count; i += 1) {
        faceUvInAtlas(uv.getX(i), uv.getY(i), cell, atlas, place);
        uv.setXY(i, place.u, place.v);
      }
      geometries.push(geometry);
      mesh.geometry = geometry;
      mesh.material = material;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
    }
  }
  const layout = { speeds };
  let live = true;
  return {
    canvas,
    faces,
    /** Repaints every face from the readout (and the map, radar and time data). */
    paint(readout, extra) {
      if (!live) return;
      for (let i = 0; i < faces.length; i += 1) {
        const cell = atlas.cells[faces[i]];
        ctx.save();
        ctx.beginPath();
        ctx.rect(cell.x, cell.y, cell.w, cell.h);
        ctx.clip();
        painters[faces[i]](ctx, readout, cell.x, cell.y, cell.w, cell.h, extra ?? undefined, layout);
        ctx.restore();
      }
      texture.needsUpdate = true;
    },
    /** The faces' brightness (1 = as painted, before the picture's exposure). */
    setLevel(level) { material.color.setScalar(level); },
    dispose() {
      if (!live) return;
      live = false;
      for (const geometry of geometries) geometry.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}

/**
 * Puts the combiner HUD on a cockpit instance's `hud_combiner` glass.
 * @param {Document} document
 * @param {THREE.Object3D} instance An instance of the cockpit model, at the model's origin.
 * @param {{x: number, y: number, z: number}} eye The pilot's eye in the model's frame.
 * @returns {{paint: (readout: object, options: object) => void, setLevel: (level: number) => void, dispose: () => void,
 *   degreesTall: number, degreesWide: number, canvas: HTMLCanvasElement} | null} Null without the glass.
 */
export function createCombinerHud(document, instance, eye) {
  const glasses = meshesNamed(instance, COCKPIT_NODES.combiner);
  const glass = glasses[0];
  if (!glass) return null;
  // The glass's corners in the model's frame.
  const toModel = new THREE.Matrix4();
  for (let node = glass; node && node !== instance; node = node.parent) {
    node.updateMatrix();
    toModel.premultiply(node.matrix);
  }
  const position = glass.geometry.getAttribute('position');
  const points = new Float32Array(position.count * 3);
  const point = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 1) {
    point.fromBufferAttribute(position, i).applyMatrix4(toModel);
    points[i * 3] = point.x; points[i * 3 + 1] = point.y; points[i * 3 + 2] = point.z;
  }
  const size = glassAngularSize(points, eye, { degreesTall: 16, degreesWide: 18, boresightX: 0.5, boresightY: 0.5, distance: 0.5 })
    ?? { degreesTall: 16, degreesWide: 18, boresightX: 0.5, boresightY: 0.5, distance: 0.5 };
  const geometry = unitUvGeometry(glass);
  if (!geometry) return null;
  const canvas = document.createElement('canvas');
  canvas.width = COMBINER_CANVAS_WIDTH;
  canvas.height = Math.max(256, Math.min(768, Math.round((COMBINER_CANVAS_WIDTH * size.degreesTall) / size.degreesWide / 16) * 16));
  const ctx = canvas.getContext('2d');
  if (!ctx) { geometry.dispose(); return null; }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.MeshBasicMaterial({
    name: 'hud_symbology', map: texture, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    toneMapped: false, side: THREE.DoubleSide, fog: false,
  });
  const symbology = new THREE.Mesh(geometry, material);
  symbology.name = 'hud_symbology';
  symbology.renderOrder = COCKPIT_RENDER_ORDER.symbology;
  symbology.castShadow = false;
  symbology.receiveShadow = false;
  glass.add(symbology);
  // The glass itself: a faint tint that never hides the world behind it.
  const tint = glass.material.clone();
  tint.transparent = true;
  tint.depthWrite = false;
  tint.opacity = Math.min(tint.opacity ?? 1, COCKPIT_LIGHTING.combinerOpacity);
  tint.side = THREE.DoubleSide;
  for (const each of glasses) {
    each.material = tint;
    each.renderOrder = COCKPIT_RENDER_ORDER.combinerGlass;
    each.castShadow = false;
    each.receiveShadow = false;
  }
  let live = true;
  return {
    canvas,
    degreesTall: size.degreesTall,
    degreesWide: size.degreesWide,
    /**
     * Repaints the symbology. `options` is handed to paintCombinerHud with the glass's size added
     * (degreesTall, degreesWide, boresightX, boresightY: where straight ahead crosses the glass).
     */
    paint(readout, options) {
      if (!live) return;
      options.degreesTall = size.degreesTall;
      options.degreesWide = size.degreesWide;
      options.boresightX = size.boresightX;
      options.boresightY = size.boresightY;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      paintCombinerHud(ctx, readout, canvas.width, canvas.height, options);
      ctx.restore();
      texture.needsUpdate = true;
    },
    /** The symbology's brightness (before the picture's exposure). */
    setLevel(level) { material.color.setScalar(level); },
    dispose() {
      if (!live) return;
      live = false;
      symbology.removeFromParent();
      geometry.dispose();
      material.dispose();
      texture.dispose();
      tint.dispose();
    },
  };
}
