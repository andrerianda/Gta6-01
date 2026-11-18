// What the wet-street mirror leaves out. Its picture is a quarter of the frame's size and is seen
// smeared in the road, so people (skinned bodies and what they carry) and small or flat things
// (bins, bollards, wheels, decals, contact shadows, tree-pit soil, sign plates) are a few blurred
// pixels there, yet each costs a draw call. Buildings, lamps, palms, car bodies, signs on poles,
// the sky and the sea stay: they are what a wet street visibly mirrors at night.
//
//   const culling = createWetReflectionCulling();
//   culling.refresh(scene);   // now and then: walks the scene once, remembers what to leave out
//   culling.hide();           // just before the mirror pass ...
//   culling.restore();        // ... and right after it (each object's own visibility comes back)
//
// Nothing is allocated per pass; verdicts are cached per geometry.

/** A drawn thing whose bounding sphere is smaller than this (metres) is left out of the mirror. */
export const MIRROR_SMALL_RADIUS = 1.1;
/** A drawn thing flatter than this (metres, local bounding box height) is left out too. */
export const MIRROR_FLAT_HEIGHT = 0.12;

/**
 * Whether the mirror leaves this object out (its own visibility is not considered).
 * @param {object} object A three.js object.
 * @param {WeakMap<object, boolean>} [verdicts] Cache of geometry verdicts.
 * @returns {boolean}
 */
export function isLeftOutOfMirror(object, verdicts) {
  if (!object.isMesh && !object.isLine && !object.isPoints) return false;
  // Sky domes, full-screen and city-wide things opt out of culling: always mirrored.
  if (object.frustumCulled === false || object.isBatchedMesh) return false;
  if (object.isSkinnedMesh) return true;
  const geometry = object.geometry;
  if (!geometry) return false;
  const known = verdicts?.get(geometry);
  if (known !== undefined) return known;
  if (!geometry.boundingSphere && typeof geometry.computeBoundingSphere === 'function') geometry.computeBoundingSphere();
  if (!geometry.boundingBox && typeof geometry.computeBoundingBox === 'function') geometry.computeBoundingBox();
  const radius = geometry.boundingSphere?.radius ?? Infinity;
  const box = geometry.boundingBox;
  const height = box ? box.max.y - box.min.y : Infinity;
  const verdict = (Number.isFinite(radius) && radius < MIRROR_SMALL_RADIUS) || (Number.isFinite(height) && height < MIRROR_FLAT_HEIGHT);
  verdicts?.set(geometry, verdict);
  return verdict;
}

/**
 * Creates the mirror's leave-out list.
 * @param {{keep?: (object: object) => boolean}} [options] keep(object) true never leaves it out.
 */
export function createWetReflectionCulling({ keep } = {}) {
  const verdicts = new WeakMap();
  const left = [];
  const states = [];
  let count = 0;

  const visit = (object) => {
    if (keep && keep(object)) return;
    if (isLeftOutOfMirror(object, verdicts)) left[count++] = object;
  };

  return {
    /** How many objects the last refresh leaves out. */
    get count() {
      return count;
    },
    /** Walks the scene and remembers what the mirror leaves out (call every second or so). */
    refresh(scene) {
      count = 0;
      scene.traverse(visit);
      for (let i = count; i < left.length; i += 1) left[i] = null;
    },
    /** Hides the remembered objects (call right before the mirror's render). */
    hide() {
      for (let i = 0; i < count; i += 1) {
        const object = left[i];
        states[i] = object.visible;
        object.visible = false;
      }
    },
    /** Gives every hidden object its own visibility back. */
    restore() {
      for (let i = 0; i < count; i += 1) left[i].visible = states[i];
    },
  };
}
