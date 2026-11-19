// Sector clutter dressing: turns one sector's clutter layout (streetClutterLayout.js, kept by the
// surface clearance in sectorStreetItems.js) into world-space instance transforms of set_sidewalk
// and set_alley_and_yard objects for the city-wide pools (streetItemPools.js), a box collider for
// every fixed or knockable object that stands on the ground, and the seats of benches and bus
// shelters (their anchor_seat_* anchors in world space) for pedestrians to sit on.
// Items with `tint` [r, g, b] (port boxes, awnings, beach canvas) group apart and carry per-item
// colours for their paint parts; items with `legs` (quay cranes) get a box per leg instead of one
// round the whole object.
import * as THREE from 'three';
import { PROP_SET_OBJECTS } from '../../assets/registry/props.js';
import { LEISURE_SET_OBJECTS } from '../../assets/registry/leisure.js';

/** The registry facts (class, size, anchors) of a set object, props or leisure. */
const setObjectInfo = (assetId, object) => PROP_SET_OBJECTS[assetId]?.[object] ?? LEISURE_SET_OBJECTS[assetId]?.[object] ?? null;

/**
 * Builds the instances, colliders and seats of a sector's clutter.
 * @param {object[]} items Clutter items {assetId, object, x, z, rotationY, kind, halfX, halfZ,
 *   base?, y?, mounted?}.
 * @param {{assets: {has: (id: string) => boolean, get: (id: string) => object},
 *   heightAt: (x: number, z: number) => number}} options
 * @returns {{instances: {source: {assetId: string, object: string}, kind: string, matrices: Float32Array, count: number}[],
 *   colliders: object[], seats: {x: number, y: number, z: number, rotationY: number, heading: number, object: string}[]}}
 */
export function buildSectorClutter(items, options) {
  const { assets, heightAt } = options;
  const groups = new Map();
  for (const item of items) {
    if (!assets.has(item.assetId)) continue;
    const key = `${item.assetId}/${item.object}${item.tint ? '/tint' : ''}`;
    if (!groups.has(key)) {
      const source = item.tint ? { assetId: item.assetId, object: item.object, tint: true } : { assetId: item.assetId, object: item.object };
      groups.set(key, { source, kind: item.kind ?? 'clutter', items: [] });
    }
    groups.get(key).items.push(item);
  }
  const instances = [];
  const colliders = [];
  const seats = [];
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const unit = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  const seat = new THREE.Vector3();
  for (const { source, kind, items: list } of groups.values()) {
    const info = setObjectInfo(source.assetId, source.object);
    const seatAnchors = (info?.anchors ?? []).some((name) => name.startsWith('anchor_seat'))
      ? seatAnchorsOf(assets.get(source.assetId), source.object) : [];
    const matrices = new Float32Array(list.length * 16);
    const colors = source.tint ? new Float32Array(list.length * 3) : null;
    list.forEach((item, index) => {
      const ground = item.base ?? heightAt(item.x, item.z);
      const y = ground + (item.y ?? 0);
      position.set(item.x, y, item.z);
      rotation.setFromAxisAngle(up, item.rotationY);
      matrix.compose(position, rotation, unit);
      matrix.toArray(matrices, index * 16);
      if (colors) colors.set(item.tint, index * 3);
      if (item.legs && info) {
        const height = info.size?.[1] ?? 1;
        const c = Math.cos(item.rotationY);
        const s = Math.sin(item.rotationY);
        for (const [lx, lz, half] of item.legs) {
          colliders.push({ shape: 'box', x: item.x + c * lx + s * lz, y: y + height / 2, z: item.z - s * lx + c * lz,
            halfX: half, halfY: height / 2, halfZ: half, rotationY: item.rotationY, heading: -item.rotationY });
        }
      }
      if (!item.mounted && info && info.class !== 'scatter') {
        const height = info.size?.[1] ?? 1;
        colliders.push({ shape: 'box', x: item.x, y: y + height / 2, z: item.z, halfX: item.halfX, halfY: height / 2, halfZ: item.halfZ,
          rotationY: item.rotationY, heading: -item.rotationY });
      }
      for (const anchor of seatAnchors) {
        seat.copy(anchor).applyQuaternion(rotation);
        // A sitter faces the object's -Z.
        seats.push({ x: item.x + seat.x, y: y + seat.y, z: item.z + seat.z, rotationY: item.rotationY, heading: -item.rotationY, object: source.object });
      }
    });
    instances.push(colors ? { source, kind, matrices, colors, count: list.length } : { source, kind, matrices, count: list.length });
  }
  return { instances, colliders, seats };
}

const seatCache = new WeakMap();

/** The seat anchors of a set object, in the object's own space. */
function seatAnchorsOf(asset, object) {
  let cache = seatCache.get(asset);
  if (!cache) seatCache.set(asset, (cache = new Map()));
  if (cache.has(object)) return cache.get(object);
  asset.scene.updateMatrixWorld(true);
  const root = asset.scene.getObjectByName(object) ?? asset.scene;
  const inverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const found = [];
  asset.scene.traverse((node) => {
    if (!node.name.startsWith('anchor_seat') || !node.name.endsWith(`__${object}`)) return;
    found.push(new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().multiplyMatrices(inverse, node.matrixWorld)));
  });
  cache.set(object, found);
  return found;
}
