// What the wet-street mirror draws: a chosen list, not the whole scene. A wet street at night
// visibly mirrors what glows (street-lamp heads, signal lamps, lit shop signs and neon, car lamps
// and light bars, lamp glow cards), the buildings with their lit windows (the city-wide building
// batches), car bodies near and middle-distant, the sky and the sea. Everything else (people,
// palms and trees, lamp poles and every other street item, far levels of the pools, wear decals)
// is a few blurred pixels in the quarter-size picture yet costs a draw call, so it stays out.
//
// The scene is walked once now and then (refresh): every drawn thing is judged, and the mirror
// pass then hides only the largest subtrees with nothing chosen in them (a whole crowd, a car's
// wheels, the pool meshes of benches and bins) so the pass's render visits little more than the
// chosen objects, their parents and the lights. A drawn object that is not chosen but has chosen
// things under it is masked from the camera's layers instead (its children still draw).
//
//   const subjects = createWetReflectionSubjects();
//   subjects.refresh(scene);   // now and then: walks the scene, remembers what to hide
//   subjects.hide();           // just before the mirror pass ...
//   subjects.restore();        // ... and right after it (each object's own visibility comes back)
//
// Nothing is allocated per pass.

/** A vehicle part at least this big (bounding sphere radius, metres) is its body. */
export const MIRROR_CAR_BODY_RADIUS = 1.2;
/** Instanced levels drawn in the mirror: _lod0 and _lod1 (the far levels stay out). */
export const MIRROR_MAX_POOL_LEVEL = 1;

const LEVEL_PATTERN = /_lod(\d+)/;
const VEHICLE_ROOT_PREFIX = 'vehicle_';

/** The level number in a pool's name (`..._lod2`, `..._merged_lod1_instances`), or -1. */
function levelOf(name) {
  const match = LEVEL_PATTERN.exec(name);
  return match ? Number(match[1]) : -1;
}

/** Whether a material lights itself now: an emissive colour that is not black, turned up. */
function glows(material) {
  const emissive = material.emissive;
  return Boolean(emissive) && material.emissiveIntensity > 0 && emissive.r + emissive.g + emissive.b > 0.02;
}

function anyMaterial(object, test) {
  const material = object.material;
  if (!Array.isArray(material)) return Boolean(material) && test(material);
  for (let i = 0; i < material.length; i += 1) if (material[i] && test(material[i])) return true;
  return false;
}

/**
 * Whether the mirror draws this object itself (not its children; lights are kept by the walk).
 * @param {object} object A three.js object.
 * @param {boolean} [inVehicle] Whether it is part of a near vehicle (an ancestor named vehicle_*).
 * @param {boolean} [carried] Whether it hangs on a skeleton's bone (what a person holds or wears).
 * @returns {boolean}
 */
export function isMirrorSubject(object, inVehicle = false, carried = false) {
  if (!object.isMesh && !object.isLine && !object.isPoints && !object.isSprite) return false;
  if (object.isSkinnedMesh || carried) return false;
  if (!anyMaterial(object, (material) => material.colorWrite !== false)) return false;
  // Lamp heads, lit signal lamps, shop signs and neon, car lamps and light bars.
  if (anyMaterial(object, glows)) return true;
  // The city-wide building batches (lit windows by night, the facades by day).
  if (object.isBatchedMesh) return true;
  // Pools are judged by what they are, never by frustum: only glowing parts (above) and the
  // middle-distance cars' levels are drawn.
  if (object.isInstancedMesh) {
    return anyMaterial(object, (material) => (material.name ?? '').startsWith('vehicle') && !material.transparent)
      && levelOf(object.name) <= MIRROR_MAX_POOL_LEVEL;
  }
  // Sky dome, sea, light glow cards, particles: whole-scene things their owners never cull.
  if (object.frustumCulled === false) return true;
  if (inVehicle) {
    const geometry = object.geometry;
    if (geometry && !geometry.boundingSphere && typeof geometry.computeBoundingSphere === 'function') geometry.computeBoundingSphere();
    const radius = geometry?.boundingSphere?.radius ?? 0;
    return radius >= MIRROR_CAR_BODY_RADIUS && anyMaterial(object, (material) => !material.transparent);
  }
  return false;
}

/**
 * Creates the mirror's chosen list.
 */
export function createWetReflectionSubjects() {
  const pruned = [];
  const prunedStates = [];
  const masked = [];
  const maskedStates = [];
  const results = [];
  // Parents kept for the pass, with their child count and last child at the refresh: a thing
  // added under one of them since (a new car or person, a pool grown, a sector's decals) would
  // be drawn unjudged, so a changed parent asks for a refresh before the pass.
  const watched = [];
  const watchedLength = [];
  const watchedLast = [];
  let watchedCount = 0;
  let prunedCount = 0;
  let maskedCount = 0;
  let subjectCount = 0;
  let top = 0;

  // Returns whether anything under (or at) the object is drawn; pushes the not-chosen children of
  // objects that have chosen things under them.
  const walk = (object, inVehicle, onBone) => {
    const vehicle = inVehicle || object.name.startsWith(VEHICLE_ROOT_PREFIX);
    const carried = onBone || object.isBone === true;
    const self = isMirrorSubject(object, vehicle, carried);
    if (self) subjectCount += 1;
    let any = self || object.isLight === true;
    const children = object.children;
    const base = top;
    for (let i = 0; i < children.length; i += 1) {
      const kept = walk(children[i], vehicle, carried);
      results[top] = kept;
      top += 1;
      if (kept) any = true;
    }
    if (any) {
      if (children.length > 0) {
        watched[watchedCount] = object;
        watchedLength[watchedCount] = children.length;
        watchedLast[watchedCount] = children[children.length - 1];
        watchedCount += 1;
      }
      for (let i = 0; i < children.length; i += 1) if (!results[base + i]) pruned[prunedCount++] = children[i];
      if (!self && !object.isLight && (object.isMesh || object.isLine || object.isPoints || object.isSprite)) masked[maskedCount++] = object;
    }
    top = base;
    return any;
  };

  return {
    /** How many drawn objects the mirror chose at the last refresh. */
    get subjects() {
      return subjectCount;
    },
    /** How many subtrees the pass hides. */
    get pruned() {
      return prunedCount;
    },
    /** Walks the scene and remembers what the pass hides (call every second or so). */
    refresh(scene) {
      prunedCount = 0;
      maskedCount = 0;
      subjectCount = 0;
      watchedCount = 0;
      top = 0;
      walk(scene, false, false);
      for (let i = prunedCount; i < pruned.length; i += 1) pruned[i] = null;
      for (let i = maskedCount; i < masked.length; i += 1) masked[i] = null;
      for (let i = watchedCount; i < watched.length; i += 1) watched[i] = watchedLast[i] = null;
    },
    /** Whether something was added to or removed from a kept parent since the last refresh. */
    changed() {
      for (let i = 0; i < watchedCount; i += 1) {
        const children = watched[i].children;
        if (children.length !== watchedLength[i] || children[children.length - 1] !== watchedLast[i]) return true;
      }
      return false;
    },
    /** Hides what is not chosen (call right before the mirror's render). */
    hide() {
      for (let i = 0; i < prunedCount; i += 1) {
        const object = pruned[i];
        prunedStates[i] = object.visible;
        object.visible = false;
      }
      for (let i = 0; i < maskedCount; i += 1) {
        const object = masked[i];
        maskedStates[i] = object.layers.mask;
        object.layers.mask = 0;
      }
    },
    /** Gives every hidden object its own visibility and layers back. */
    restore() {
      for (let i = maskedCount - 1; i >= 0; i -= 1) masked[i].layers.mask = maskedStates[i];
      for (let i = prunedCount - 1; i >= 0; i -= 1) pruned[i].visible = prunedStates[i];
    },
  };
}
