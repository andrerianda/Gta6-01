// The hands a person shows: relaxed open hands, or hands closed round a grip while a weapon is in
// hand (owner, 11:08: "holding the pistol they look broken and unclear"). A rebuilt character file
// carries the relaxed hands as their own part (`hands`: a THREE.LOD after createLodInstance, or a
// node hands_lod<N>) and two grip meshes on the same skeleton, `hand_r_grip` (the shooting hand
// round a pistol grip) and `hand_l_grip` (the support hand wrapping it). glTF has no visibility
// flag, so the grips are hidden when the person is set up and swapped in while a weapon is held.
// A file without these nodes (a person not yet rebuilt) is left as it is. Found once; no per-frame work.

/**
 * Finds a person's hand parts and hides the grips.
 * @param {object} instance The character's scene object (anything without traverse is ignored).
 * @returns {{ readonly available: boolean, show(holding: boolean): void }}
 */
export function createGripHands(instance) {
  const grips = [], whole = [], levels = [];
  if (instance && typeof instance.traverse === 'function') {
    instance.traverse((node) => {
      const name = node.name || '';
      if (name === 'hand_r_grip' || name === 'hand_l_grip') grips.push(node);
      else if (name === 'hands') whole.push(node);
      else if (/^hands_lod\d+$/.test(name)) levels.push(node);
    });
  }
  // A THREE.LOD switches its own levels' visibility every frame: hide the LOD itself, not a level.
  const open = whole.length ? whole : levels;
  const available = grips.length > 0;
  let shown = null;
  const hands = {
    get available() { return available; },
    /** Grip hands while holding a weapon, the relaxed hands otherwise. */
    show(holding) {
      const grip = Boolean(holding);
      if (!available || shown === grip) return;
      shown = grip;
      for (const node of grips) node.visible = grip;
      for (const node of open) node.visible = !grip;
    },
  };
  hands.show(false);
  return hands;
}
