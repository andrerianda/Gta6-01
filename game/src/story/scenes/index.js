// The scenes of the final arc, registered with the cinematic director: the midnight call, the
// decision, the new face, the dark hangar's reveal, the walk-out, boarding, the exterior cuts of
// the flight, the flashback, the time skip, the handover and the epilogue with the closing card
// and the credits. Each module exports one or more scenes { id, build(params, tools) }.

const SCENE_MODULES = Object.freeze([
  () => import('./midnightCall.js'),
  () => import('./theDecision.js'),
  () => import('./newFace.js'),
  () => import('./hangarReveal.js'),
  () => import('./walkOut.js'),
  () => import('./boarding.js'),
  () => import('./flightCuts.js'),
  () => import('./flashback.js'),
  () => import('./timeSkip.js'),
  () => import('./handover.js'),
  () => import('./epilogue.js'),
]);

/**
 * Registers every story scene with the cinematic director.
 * @param {{register: (scene: {id: string, build: Function}) => void}} cinematics The `cinematics` system.
 * @param {(error: unknown) => void} [onFault] Told when a scene module does not load.
 * @returns {Promise<number>} How many scenes were registered.
 */
export async function registerStoryScenes(cinematics, onFault = () => {}) {
  let count = 0;
  for (const load of SCENE_MODULES) {
    try {
      const module = await load();
      for (const scene of Object.values(module)) {
        if (scene && typeof scene.id === 'string' && typeof scene.build === 'function') { cinematics.register(scene); count += 1; }
      }
    } catch (error) {
      onFault(error);
    }
  }
  return count;
}
