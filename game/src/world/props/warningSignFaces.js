// The painted words of the warning plates and posts (set_yard_clutter warning_plate and
// warning_post): the props leave a blank band at anchor_sign (0.38 x 0.15 m, facing the plate's
// -Z), and this module lays a lettered quad on it, picked per item from WARNING_TEXTS. One
// instanced quad for the city (one draw), a small atlas painted once, faces beyond
// WARNING_FACE_DISTANCE dropped; no shadows.
//
//   const faces = createWarningSignFaces({ assets });
//   const handle = faces.addSector(items);   // placed clutter items {object, x, y, z, rotationY, lotId}
//   faces.update();                          // once a frame: uploads after changes
//   handle.dispose();

import * as THREE from 'three';
import { createSignCanvas } from '../../render/textures/signs/signPainter.js';

const SET = 'set_yard_clutter';
/** Short warnings of our own (Spanish, as the city's signs are). */
export const WARNING_TEXTS = Object.freeze(['PELIGRO', 'PROHIBIDO EL PASO', 'NO APARCAR', 'PROPIEDAD PRIVADA',
  'ALTA TENSIÓN', 'ZONA VIGILADA', 'SOLO PERSONAL', 'OBRAS']);
export const WARNING_FACE_DISTANCE = 70;
const FACE = Object.freeze({ width: 0.38, height: 0.15, lift: 0.003 });
const CELL = Object.freeze({ width: 256, height: 100, columns: 2 });

/** The text of an item's plate (stable per lot and object). */
export function warningTextFor(item) {
  const key = Math.abs(Math.floor((item.lotId ?? 0) * 31 + item.x * 7 + item.z * 13));
  return key % WARNING_TEXTS.length;
}

/**
 * @param {{assets: {has: (id: string) => boolean, get: (id: string) => object}}} options
 */
export function createWarningSignFaces(options) {
  const { assets } = options;
  const root = new THREE.Group();
  root.name = 'city_dressing_warning_faces';
  const anchors = assets?.has?.(SET) ? readAnchors(assets.get(SET)) : new Map();
  const rows = Math.ceil(WARNING_TEXTS.length / CELL.columns);
  const canvas = createSignCanvas(CELL.width * CELL.columns, CELL.height * rows);
  paintAtlas(canvas.getContext('2d'), rows);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.55, metalness: 0.1,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  material.name = 'warning_sign_faces';
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 signCell;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n\tvMapUv = signCell.xy + uv * signCell.zw;\n#endif')
      .replace('#include <project_vertex>', `#include <project_vertex>
#ifdef USE_INSTANCING
	if ( distance( ( modelMatrix * instanceMatrix[ 3 ] ).xyz, cameraPosition ) > ${WARNING_FACE_DISTANCE.toFixed(1)} ) gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 );
#endif`);
  };
  material.customProgramCacheKey = () => 'warning_sign_faces';
  const sectors = new Set();
  let mesh = null;
  let capacity = 0;
  let total = 0;
  let dirty = false;
  const object = new THREE.Matrix4();
  const face = new THREE.Matrix4();
  const step = new THREE.Matrix4().makeTranslation(0, 0, -FACE.lift);
  const turn = new THREE.Matrix4().makeRotationY(Math.PI).multiply(new THREE.Matrix4().makeScale(FACE.width, FACE.height, 1));
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const unit = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);

  function cellOf(index) {
    const du = 1 / CELL.columns;
    const dv = 1 / rows;
    return [(index % CELL.columns) * du, 1 - (Math.floor(index / CELL.columns) + 1) * dv, du, dv];
  }

  function rebuild() {
    dirty = false;
    total = 0;
    for (const sector of sectors) total += sector.count;
    if (total > capacity) {
      if (mesh) { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.dispose(); }
      capacity = Math.max(64, Math.ceil(total * 1.5));
      const geometry = new THREE.PlaneGeometry(1, 1);
      geometry.setAttribute('signCell', new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4));
      mesh = new THREE.InstancedMesh(geometry, material, capacity);
      mesh.name = 'warning_sign_faces';
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.matrixAutoUpdate = false;
      root.add(mesh);
    }
    if (!mesh) return;
    const cells = mesh.geometry.getAttribute('signCell');
    let index = 0;
    for (const sector of sectors) {
      mesh.instanceMatrix.array.set(sector.matrices, index * 16);
      cells.array.set(sector.cells, index * 4);
      index += sector.count;
    }
    mesh.count = total;
    mesh.visible = total > 0;
    mesh.instanceMatrix.needsUpdate = true;
    cells.needsUpdate = true;
  }

  return {
    object3d: root,
    addSector(items) {
      const placed = (items ?? []).filter((item) => anchors.has(item.object));
      if (!placed.length) return { dispose() {} };
      const sector = { count: placed.length, matrices: new Float32Array(placed.length * 16), cells: new Float32Array(placed.length * 4) };
      placed.forEach((item, index) => {
        position.set(item.x, item.y, item.z);
        rotation.setFromAxisAngle(up, item.rotationY);
        object.compose(position, rotation, unit);
        // On the band, looking along the anchor's -Z (the plane looks to +Z: turn it).
        face.multiplyMatrices(object, anchors.get(item.object)).multiply(step).multiply(turn);
        face.toArray(sector.matrices, index * 16);
        sector.cells.set(cellOf(warningTextFor(item)), index * 4);
      });
      sectors.add(sector);
      dirty = true;
      return { dispose() { if (sectors.delete(sector)) dirty = true; } };
    },
    update() { if (dirty) rebuild(); },
    stats: () => ({ faces: total, draws: total > 0 ? 1 : 0 }),
    dispose() {
      sectors.clear();
      if (mesh) { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.dispose(); }
      texture.dispose();
      material.dispose();
    },
  };
}

function readAnchors(asset) {
  const found = new Map();
  asset.scene.updateMatrixWorld(true);
  const inverse = new THREE.Matrix4();
  for (const objectName of ['warning_post', 'warning_plate']) {
    const objectNode = asset.scene.getObjectByName(objectName);
    const anchor = asset.scene.getObjectByName(`anchor_sign__${objectName}`);
    if (!objectNode || !anchor) continue;
    inverse.copy(objectNode.matrixWorld).invert();
    found.set(objectName, new THREE.Matrix4().multiplyMatrices(inverse, anchor.matrixWorld));
  }
  return found;
}

/** Black lettering on the plate's white band, one cell per text, fitted to the cell's width. */
function paintAtlas(context, rows) {
  context.fillStyle = '#f2f0ea';
  context.fillRect(0, 0, CELL.width * CELL.columns, CELL.height * rows);
  WARNING_TEXTS.forEach((text, index) => {
    const x = (index % CELL.columns) * CELL.width;
    const y = Math.floor(index / CELL.columns) * CELL.height;
    const words = text.split(' ');
    const lines = words.length > 1 && text.length > 9 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : [text];
    context.fillStyle = '#151515';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const size = lines.length > 1 ? 38 : 56;
    context.font = `900 ${size}px "Arial Black", Arial, sans-serif`;
    lines.forEach((line, row) => {
      const width = context.measureText(line).width;
      const squeeze = Math.min(1, (CELL.width - 20) / Math.max(1, width));
      context.save();
      context.translate(x + CELL.width / 2, y + CELL.height / 2 + (row - (lines.length - 1) / 2) * size * 1.05);
      context.scale(squeeze, 1);
      context.fillText(line, 0, 0);
      context.restore();
    });
  });
}
