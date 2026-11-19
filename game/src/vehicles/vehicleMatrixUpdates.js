// Which nodes of a vehicle's model recompute their matrices each frame. A car's model is 76 to 84
// nodes and the scene recomputes every node's world matrix each frame (and its local matrix too
// while it auto-updates), about 0.5 ms for the fleet. Here:
// - Nodes that never move against their parent (body panels, lamps, glass, trim, the merged
//   meshes, the shadow caster) stop recomputing their local matrix: matrixAutoUpdate off, set
//   once. The moving ones keep it: the root (the body's pose), wheels, a bike's fork, the steering
//   wheel, doors, the STILL node and the merged levels (seated on the road each frame), and so do
//   every anchor_ node and every ancestor of these, so a reader that refreshes one of them with
//   updateWorldMatrix(true, false) (seat, grips, door) always gets this frame's answer.
// - A hidden node skips its world matrix and everything under it: the whole near level of a
//   middle or far car, the separate parts while a near car draws merged, the merged meshes while
//   it draws its parts, the whole car beyond the draw distance. It is marked to recompute the
//   frame it shows again. Code that reads a hidden part refreshes it first with
//   updateWorldMatrix (the crash dents and the staged wreck do; the instanced batches refresh the
//   merged level they copy).
import * as THREE from 'three';

const baseUpdateMatrixWorld = THREE.Object3D.prototype.updateMatrixWorld;
/** Node names that move against their parent besides the rig's own movers. */
const MOVING_NAME = /^(door_[fr][lr]$|wheel_([fr]|[fr][lr])$|fork$|steering_wheel$|rotor_(main|tail)$|engine_[lr]$|propeller_[lr]$|anchor_)/;

/**
 * Object3D.updateMatrixWorld for a node that may be hidden: hidden, it and everything under it
 * keep their last world matrices, and it is marked to recompute the frame it shows again.
 * @this {THREE.Object3D}
 * @param {boolean} [force] As three.js passes it.
 */
export function updateMatrixWorldWhenShown(force) {
  if (this.visible) baseUpdateMatrixWorld.call(this, force);
  else this.matrixWorldNeedsUpdate = true;
}

/**
 * The nodes of a rig whose local matrix changes after creation, with every ancestor of them up to
 * the root.
 * @param {object} rig From createVehicleRig (root, near, mid, far, wheels, fork, steeringWheel,
 *   nearMerge).
 * @returns {Set<THREE.Object3D>}
 */
export function movingVehicleNodesOf(rig) {
  const movers = [rig.root, rig.mid, rig.far, rig.fork, rig.steeringWheel, rig.nearMerge?.stillNode, ...(rig.wheels ?? [])];
  rig.root.traverse((node) => { if (MOVING_NAME.test(node.name ?? '')) movers.push(node); });
  const moving = new Set();
  for (const mover of movers) {
    for (let node = mover; node && !moving.has(node); node = node === rig.root ? null : node.parent) moving.add(node);
  }
  return moving;
}

/**
 * Limits a vehicle rig's per-frame matrix work as the header describes. Call once, after the rig
 * and its near merge are built.
 * @param {object} rig From createVehicleRig.
 * @returns {{frozen: number, moving: number}} How many nodes stopped and kept auto-updating.
 */
export function limitVehicleMatrixUpdates(rig) {
  const moving = movingVehicleNodesOf(rig);
  let frozen = 0;
  rig.root.updateWorldMatrix(true, true);
  rig.root.traverse((node) => {
    // Everything that can be hidden (meshes, levels, the STILL node, the root) skips while hidden.
    if (node.isMesh || node === rig.root || node === rig.near || node === rig.nearMerge?.stillNode) {
      node.updateMatrixWorld = updateMatrixWorldWhenShown;
    }
    if (moving.has(node)) return;
    node.updateMatrix();
    node.matrixAutoUpdate = false;
    frozen += 1;
  });
  return { frozen, moving: moving.size };
}
