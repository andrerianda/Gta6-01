// Sign face dressing: the painted faces of the junctions' stop signs (white ALTO on the red
// octagon of set_traffic_control) and street-name posts (each blade's street and district, on
// both sides of the blade), as two city-wide instanced quads: one draw call for every stop face
// and one for every name face, whatever the number of sectors. The names share one atlas canvas
// painted by the texture toolkit's paintStreetNamePlate, a cell per street, painted the first
// time a street is shown and uploaded at most once a frame; each quad reads its cell from a
// per-instance attribute. Faces beyond FACE_DISTANCE are dropped in the vertex shader (the
// letters are unreadable there and the poles go to their far levels), so no per-frame pass runs.
//
//   const faces = createSignFaces({ assets, districtName: (id) => 'Centro' });
//   pools.object3d.add(faces.object3d);
//   const handle = faces.addSector(junction.placed);   // handle.dispose()
//   faces.update();                                    // once per frame (uploads new names)
import * as THREE from 'three';
import { createSignCanvas, paintStreetNamePlate } from '../../render/textures/signs/signPainter.js';

const SET = 'set_traffic_control';
/** The faces of each object: the anchor (on the blank face, looking along its -Z) and both sides or one. */
const FACE_ANCHORS = Object.freeze({
  sign_octagon: [{ anchor: 'anchor_sign__sign_octagon', kind: 'stop', blade: -1, back: false }],
  street_name_post: [
    { anchor: 'anchor_sign_1__street_name_post', kind: 'name', blade: 0, back: true },
    { anchor: 'anchor_sign_2__street_name_post', kind: 'name', blade: 1, back: true },
  ],
});
/** The blade is 8 mm thick (its anchor sits on the -Z face at z = -0.004 in the file). */
const BLADE_THICKNESS = 0.008;
/** Faces stand 2 mm proud of the surface (with a polygon offset against flicker far away). */
const LIFT = 0.002;
/** Beyond this distance (metres) from the camera a face is not drawn. */
export const FACE_DISTANCE = 160;
/** The name atlas: 128 cells of 256 by 64 pixels; cell 0 is a blank plate for when it is full. */
const ATLAS = Object.freeze({ width: 2048, height: 1024, cellWidth: 256, cellHeight: 64 });

/**
 * Creates the sign faces.
 * @param {{assets: {has: (id: string) => boolean, get: (id: string) => object},
 *   districtName?: (id: string) => string}} options
 */
export function createSignFaces(options) {
  const { assets } = options;
  const districtName = options.districtName ?? (() => '');
  const root = new THREE.Group();
  root.name = 'city_dressing_sign_faces';
  const available = Boolean(assets?.has?.(SET));
  const anchors = available ? readAnchors(assets.get(SET)) : new Map();

  const stopTexture = new THREE.CanvasTexture(paintStopLettering());
  stopTexture.colorSpace = THREE.SRGBColorSpace;
  stopTexture.anisotropy = 4;
  const stopMaterial = faceMaterial({ map: stopTexture, alphaTest: 0.45, roughness: 0.4 }, false);
  stopMaterial.name = 'sign_face_stop';

  const atlasCanvas = createSignCanvas(ATLAS.width, ATLAS.height);
  const atlas = atlasCanvas.getContext('2d');
  atlas.fillStyle = '#12553d';
  atlas.fillRect(0, 0, ATLAS.width, ATLAS.height);
  const atlasTexture = new THREE.CanvasTexture(atlasCanvas);
  atlasTexture.colorSpace = THREE.SRGBColorSpace;
  atlasTexture.anisotropy = 8;
  const nameMaterial = faceMaterial({ map: atlasTexture, roughness: 0.35 }, true);
  nameMaterial.name = 'sign_face_names';
  const columns = Math.floor(ATLAS.width / ATLAS.cellWidth);
  const capacity = columns * Math.floor(ATLAS.height / ATLAS.cellHeight);
  const cells = new Map();
  let atlasDirty = false;
  paintCell(0, '', '');

  function paintCell(index, name, district) {
    const x = (index % columns) * ATLAS.cellWidth;
    const y = Math.floor(index / columns) * ATLAS.cellHeight;
    const plate = paintStreetNamePlate(name || ' ', district ? { district } : {});
    atlas.drawImage(plate.canvas, x, y, ATLAS.cellWidth, ATLAS.cellHeight);
    atlasDirty = true;
  }
  /** The atlas cell of a street (painted now if new): its UV rectangle [u, v, du, dv]. */
  function cellOf(name, district, out) {
    const key = `${name}|${district}`;
    let index = cells.get(key);
    if (index === undefined) {
      index = name && cells.size + 1 < capacity ? cells.size + 1 : 0;
      if (index > 0) {
        cells.set(key, index);
        paintCell(index, name, districtName(district));
      }
    }
    const du = ATLAS.cellWidth / ATLAS.width;
    const dv = ATLAS.cellHeight / ATLAS.height;
    out[0] = (index % columns) * du;
    out[1] = 1 - (Math.floor(index / columns) + 1) * dv; // the canvas is flipped on upload
    out[2] = du;
    out[3] = dv;
    return out;
  }

  const stops = createFaceBatch('sign_faces_stop', stopMaterial, false, root);
  const names = createFaceBatch('sign_faces_names', nameMaterial, true, root);
  const object = new THREE.Matrix4();
  const face = new THREE.Matrix4();
  const step = new THREE.Matrix4();
  const flip = new THREE.Matrix4().makeRotationY(Math.PI);
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const unit = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  const cell = [0, 0, 1, 1];

  return {
    object3d: root,
    /**
     * Adds the faces of a sector's junction controls.
     * @param {{object: string, x: number, y: number, z: number, rotationY: number,
     *   item: {names?: string[], districts?: string[]}}[]} placed From buildJunctionControls.
     * @returns {{count: number, dispose: () => void}}
     */
    addSector(placed) {
      const record = { stops: [], names: [] };
      for (const entry of placed) {
        const faces = anchors.get(entry.object);
        if (!faces) continue;
        position.set(entry.x, entry.y, entry.z);
        rotation.setFromAxisAngle(up, entry.rotationY);
        object.compose(position, rotation, unit);
        for (const spec of faces) {
          const isName = spec.kind === 'name';
          if (isName) cellOf(entry.item?.names?.[spec.blade] ?? '', entry.item?.districts?.[spec.blade] ?? '', cell);
          const batch = isName ? names : stops;
          const list = isName ? record.names : record.stops;
          // Front: on the anchor's face, looking along its -Z (the plane looks to +Z: turn it).
          face.multiplyMatrices(object, spec.local).multiply(step.makeTranslation(0, 0, -LIFT)).multiply(flip).multiply(spec.scale);
          list.push(batch.add(face, cell, record, list.length));
          if (spec.back) {
            face.multiplyMatrices(object, spec.local).multiply(step.makeTranslation(0, 0, BLADE_THICKNESS + LIFT)).multiply(spec.scale);
            list.push(batch.add(face, cell, record, list.length));
          }
        }
      }
      stops.commit();
      names.commit();
      return {
        count: record.stops.length + record.names.length,
        dispose() {
          while (record.stops.length) stops.remove(record.stops, record.stops.length - 1);
          while (record.names.length) names.remove(record.names, record.names.length - 1);
          stops.commit();
          names.commit();
        },
      };
    },
    /** Uploads newly painted street names (at most once a frame). */
    update() {
      if (!atlasDirty) return;
      atlasDirty = false;
      atlasTexture.needsUpdate = true;
    },
    /** Draw calls and faces now. */
    stats: () => ({ draws: (stops.count > 0 ? 1 : 0) + (names.count > 0 ? 1 : 0), stopFaces: stops.count, nameFaces: names.count, streets: cells.size }),
    dispose() {
      stops.dispose();
      names.dispose();
      stopTexture.dispose();
      atlasTexture.dispose();
      stopMaterial.dispose();
      nameMaterial.dispose();
    },
  };
}

/** The face anchors of every object, in the object's own space, with the face's size as a scale. */
function readAnchors(asset) {
  const found = new Map();
  asset.scene.updateMatrixWorld(true);
  const inverse = new THREE.Matrix4();
  for (const [objectName, specs] of Object.entries(FACE_ANCHORS)) {
    const objectNode = asset.scene.getObjectByName(objectName);
    if (!objectNode) continue;
    inverse.copy(objectNode.matrixWorld).invert();
    const faces = [];
    for (const spec of specs) {
      const node = asset.scene.getObjectByName(spec.anchor);
      if (!node) continue;
      const size = node.userData ?? {};
      faces.push({ ...spec, local: new THREE.Matrix4().multiplyMatrices(inverse, node.matrixWorld),
        scale: new THREE.Matrix4().makeScale(size.width ?? 0.75, size.height ?? 0.75, 1) });
    }
    if (faces.length) found.set(objectName, faces);
  }
  return found;
}

/** A face material: standard, a polygon offset, faces dropped beyond FACE_DISTANCE, and an atlas cell per instance. */
function faceMaterial(parameters, atlasCells) {
  const material = new THREE.MeshStandardMaterial({ ...parameters, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  material.onBeforeCompile = (shader) => {
    let vertex = shader.vertexShader
      .replace('#include <project_vertex>', `#include <project_vertex>
#ifdef USE_INSTANCING
	if ( distance( ( modelMatrix * instanceMatrix[ 3 ] ).xyz, cameraPosition ) > ${FACE_DISTANCE.toFixed(1)} ) gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 );
#endif`);
    if (atlasCells) {
      vertex = vertex
        .replace('#include <common>', '#include <common>\nattribute vec4 signCell;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n\tvMapUv = signCell.xy + uv * signCell.zw;\n#endif');
    }
    shader.vertexShader = vertex;
  };
  material.customProgramCacheKey = () => (atlasCells ? 'sign_face_atlas' : 'sign_face');
  return material;
}

/**
 * A growable instanced quad list: add returns a slot, remove swap-fills from the tail; commit
 * uploads what changed. Owners keep their slots in a list; slot -> (list, index) lets the
 * moved slot's owner learn its new place.
 */
function createFaceBatch(name, material, withCells, parent) {
  let capacity = 0;
  let mesh = null;
  let cellAttribute = null;
  let dirty = false;
  const ownerList = [];
  const ownerIndex = [];
  const batch = {
    count: 0,
    add(matrix, cell, record, index) {
      if (batch.count >= capacity) grow(Math.max(64, capacity * 2));
      const slot = batch.count;
      batch.count += 1;
      matrix.toArray(mesh.instanceMatrix.array, slot * 16);
      if (withCells) cellAttribute.array.set(cell, slot * 4);
      ownerList[slot] = record;
      ownerIndex[slot] = index;
      dirty = true;
      return slot;
    },
    /** Removes the slot at list[index] (the last entry of the owner's list). */
    remove(list, index) {
      const slot = list[index];
      const last = batch.count - 1;
      list.length = index;
      if (slot !== last) {
        mesh.instanceMatrix.array.copyWithin(slot * 16, last * 16, last * 16 + 16);
        if (withCells) cellAttribute.array.copyWithin(slot * 4, last * 4, last * 4 + 4);
        const owner = ownerList[last];
        const owned = withCells ? owner.names : owner.stops;
        owned[ownerIndex[last]] = slot;
        ownerList[slot] = owner;
        ownerIndex[slot] = ownerIndex[last];
      }
      ownerList[last] = null;
      batch.count = last;
      dirty = true;
    },
    commit() {
      if (!dirty || !mesh) return;
      dirty = false;
      mesh.count = batch.count;
      mesh.visible = batch.count > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (cellAttribute) cellAttribute.needsUpdate = true;
    },
    dispose() {
      if (!mesh) return;
      mesh.removeFromParent();
      mesh.geometry.dispose();
      mesh.dispose();
    },
  };
  function grow(size) {
    const geometry = new THREE.PlaneGeometry(1, 1);
    const next = new THREE.InstancedMesh(geometry, material, size);
    next.name = name;
    next.frustumCulled = false;
    next.castShadow = false;
    next.receiveShadow = true;
    next.matrixAutoUpdate = false;
    next.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const cells = withCells ? new THREE.InstancedBufferAttribute(new Float32Array(size * 4), 4) : null;
    if (cells) {
      cells.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute('signCell', cells);
    }
    if (mesh) {
      next.instanceMatrix.array.set(mesh.instanceMatrix.array.subarray(0, batch.count * 16));
      if (cells) cells.array.set(cellAttribute.array.subarray(0, batch.count * 4));
      batch.dispose();
    }
    mesh = next;
    cellAttribute = cells;
    capacity = size;
    mesh.count = batch.count;
    parent.add(mesh);
  }
  return batch;
}

/** White ALTO lettering on a clear 256-pixel square, sized for the 0.75 m octagon. */
function paintStopLettering() {
  const size = 256;
  const canvas = createSignCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#f4f2ec';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let fontSize = 96;
  const font = (px) => `700 ${px}px "Helvetica Neue", Arial, "DejaVu Sans", sans-serif`;
  ctx.font = font(fontSize);
  const target = size * 0.66;
  const width = ctx.measureText('ALTO').width;
  if (width > 0) fontSize = Math.floor(fontSize * Math.min(1.2, target / width));
  ctx.font = font(fontSize);
  ctx.fillText('ALTO', size / 2, size / 2 + fontSize * 0.04);
  return canvas;
}
