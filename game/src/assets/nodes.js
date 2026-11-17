// Named-node helpers for loaded assets and their instances: finding parts and anchors by the
// names of the asset contract, and reading where they are.
import * as THREE from 'three';
import { isAnchorName, isColliderName, lodLevelOf } from './contract.js';

/**
 * Finds a node by name under a root.
 * @param {THREE.Object3D} root An asset instance (or any object).
 * @param {string} name The node name, for example "wheel_fl" or "anchor_light".
 * @returns {THREE.Object3D | null} The node, or null when there is none.
 */
export function findNode(root, name) {
  return root.getObjectByName(name) ?? null;
}

/**
 * Finds a node by name under a root and fails loudly when it is missing.
 * @param {THREE.Object3D} root An asset instance (or any object).
 * @param {string} name The node name.
 * @returns {THREE.Object3D} The node.
 */
export function requireNode(root, name) {
  const node = root.getObjectByName(name);
  if (!node) {
    const label = root.userData?.assetId ?? root.name ?? 'object';
    throw new Error(`asset "${label}" has no node named "${name}"`);
  }
  return node;
}

/**
 * Finds several nodes at once.
 * @param {THREE.Object3D} root An asset instance.
 * @param {string[]} names The node names.
 * @returns {Record<string, THREE.Object3D | null>} Each name mapped to its node or null.
 */
export function findNodes(root, names) {
  /** @type {Record<string, THREE.Object3D | null>} */
  const found = {};
  for (const name of names) found[name] = findNode(root, name);
  return found;
}

/**
 * Collects the anchor nodes under a root.
 * @param {THREE.Object3D} root An asset instance.
 * @returns {Record<string, THREE.Object3D>} Anchor nodes by name ("anchor_light", ...).
 */
export function collectAnchors(root) {
  /** @type {Record<string, THREE.Object3D>} */
  const anchors = {};
  root.traverse((node) => {
    if (isAnchorName(node.name)) anchors[node.name] = node;
  });
  return anchors;
}

/**
 * The level of detail a node belongs to: its own name or the nearest ancestor's below `root`.
 * @param {THREE.Object3D} node A node of an asset.
 * @param {THREE.Object3D} root The asset's root.
 * @returns {number | null} The level, or null when the node shows at every level.
 */
export function lodLevelOfNode(node, root) {
  for (let current = node; current && current !== root; current = current.parent) {
    const level = lodLevelOf(current.name);
    if (level !== null) return level;
  }
  return null;
}

/**
 * Whether a node is, or sits under, a collision proxy.
 * @param {THREE.Object3D} node A node of an asset.
 * @param {THREE.Object3D} root The asset's root.
 * @returns {boolean} True for collision-only nodes.
 */
export function isColliderNode(node, root) {
  for (let current = node; current && current !== root; current = current.parent) {
    if (isColliderName(current.name)) return true;
  }
  return false;
}

const scratchRootInverse = new THREE.Matrix4();

/**
 * The transform of a node relative to a root that contains it.
 * @param {THREE.Object3D} node The node.
 * @param {THREE.Object3D} root An ancestor of the node.
 * @param {THREE.Matrix4} [target] Where to write the result.
 * @returns {THREE.Matrix4} The node's matrix in the root's space.
 */
export function matrixInRoot(node, root, target = new THREE.Matrix4()) {
  root.updateWorldMatrix(true, false);
  node.updateWorldMatrix(true, false);
  scratchRootInverse.copy(root.matrixWorld).invert();
  return target.multiplyMatrices(scratchRootInverse, node.matrixWorld);
}

/**
 * The world position and forward direction of an anchor (or any node). An anchor points along
 * its local -Z, the same convention as every object in the game.
 * @param {THREE.Object3D} node The anchor node.
 * @param {{ position?: THREE.Vector3, direction?: THREE.Vector3 }} [target] Vectors to fill.
 * @returns {{ position: THREE.Vector3, direction: THREE.Vector3 }} World position and direction.
 */
export function anchorWorld(node, target = {}) {
  const position = target.position ?? new THREE.Vector3();
  const direction = target.direction ?? new THREE.Vector3();
  node.updateWorldMatrix(true, false);
  position.setFromMatrixPosition(node.matrixWorld);
  direction.set(0, 0, -1).transformDirection(node.matrixWorld);
  return { position, direction };
}
