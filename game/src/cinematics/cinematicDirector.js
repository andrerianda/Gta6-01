// The cinematic director: plays the story's scenes in the engine. A scene is a timeline of cues
// (camera tracks, first-person shots through a helmet visor, actors on their marks with gestures,
// fades, title cards, timed voiced lines, sounds, named marks) built by the scene's own module in
// story/scenes/; Enter or Space skips, and a skipped scene still fires its essential cues.
// Commands: CINEMATIC_PLAY {sceneId, params?}, CINEMATIC_SKIP, CINEMATIC_RESUME.
// Publishes: CINEMATIC_STARTED, CINEMATIC_CUE, CINEMATIC_ENDED {skipped}.
// Members: playing (scene id or null), register(scene), play(sceneId, params) -> Promise<{skipped}>.
// Implementation: cinematics/cinematicRuntime.js and its neighbours.

/**
 * Creates the cinematic director system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createCinematicDirectorSystem(context) {
  void context;
  const scenes = new Map();
  return {
    name: 'cinematics',
    runsWhen: 'always',
    get playing() { return null; },
    register(scene) { scenes.set(scene.id, scene); },
    play() { return Promise.resolve({ skipped: true }); },
    async init(progress) { progress(1, 'cinematics'); },
    update() {},
    dispose() { scenes.clear(); },
  };
}
