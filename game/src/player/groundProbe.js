// Where the ground is under the lead: the city's ground query when the open-world city offers
// one, and until then a downward ray through the static world layer (the scenery that stands in
// for the city), cached while the lead stands still. (The physics system's own fallback ground
// is the focus's ground level, which the camera writes from this, so it is not asked here.)
import * as THREE from 'three';

/**
 * Creates the ground-height function the lead walks on.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 * @returns {(x: number, z: number, fromY: number) => number} Ground height under a point, looking
 *   down from `fromY` (so a canopy overhead is not mistaken for the ground).
 */
export function createGroundProbe(context) {
  const city = context.systems.find('openWorldCity');
  if (city && typeof city.groundHeightAt === 'function') return (x, z) => city.groundHeightAt(x, z);

  const raycaster = new THREE.Raycaster();
  const origin = new THREE.Vector3();
  const down = new THREE.Vector3(0, -1, 0);
  const hits = [];
  let lastX = NaN, lastZ = NaN, lastFrom = NaN, lastHeight = 0;
  return function groundHeightAt(x, z, fromY) {
    if (Math.abs(x - lastX) + Math.abs(z - lastZ) < 0.15 && Math.abs(fromY - lastFrom) < 0.3) return lastHeight;
    lastX = x; lastZ = z; lastFrom = fromY;
    const world = context.view && context.view.layers ? context.view.layers.world : null;
    if (!world) return lastHeight;
    origin.set(x, Math.min(fromY, 1e4), z);
    raycaster.set(origin, down);
    raycaster.camera = context.view.camera;
    raycaster.far = 2e4;
    hits.length = 0;
    world.updateMatrixWorld();
    raycaster.intersectObject(world, true, hits);
    for (const hit of hits) {
      if (hit.object.isMesh && !hit.object.isSkinnedMesh) {
        lastHeight = hit.point.y;
        break;
      }
    }
    return lastHeight;
  };
}
