// The cinematic director: plays the story's scenes in the engine. A scene is a timeline of cues
// (camera tracks, first-person shots through a helmet visor, actors on their marks with gestures,
// fades, title cards, timed voiced lines, sounds, named marks) built by the scene's own module in
// story/scenes/; Enter or Space skips, and a skipped scene still fires its essential cues.
// Commands: CINEMATIC_PLAY {sceneId, params?}, CINEMATIC_SKIP, CINEMATIC_RESUME {token?}.
// Publishes: CINEMATIC_STARTED, CINEMATIC_CUE, CINEMATIC_ENDED {skipped}.
// Members: playing (scene id or null), time (seconds), register(scene), play(sceneId, params) ->
// Promise<{skipped}>, seek(seconds, hold?), skip(), resume(token?), clearVeil(seconds?).
// The page's ?scene=<id> plays that scene once the game is ready; &sceneat=<seconds> holds it there.
// Implementation: cinematics/cinematicRuntime.js and its neighbours (the pure script builder is
// sceneScript.js, the pure clock cinematicTimeline.js); the built-in scene is `cinematic_demo`.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { GAME_EVENTS } from '../core/events/gameEvents.js';

/**
 * Creates the cinematic director system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createCinematicDirectorSystem(context) {
  /** @type {Map<string, {id: string, build: Function}>} */
  const scenes = new Map();
  const undo = [];
  let runtime = null;
  /** The scene the page asked for (?scene=), played once it is registered and the game is ready. */
  let launchScene = null;

  function playLaunchScene() {
    const { scene, sceneAt } = launchScene;
    launchScene = null;
    runtime.play(scene, {});
    if (sceneAt === null || sceneAt === undefined) return;
    runtime.seek(sceneAt, true);
    const page = context.page?.document;
    if (page) page.title = `MARAZUL - ${scene} @ ${sceneAt} s`;
  }

  return {
    name: 'cinematics',
    runsWhen: 'always',
    get playing() { return runtime ? runtime.playing : null; },
    get time() { return runtime ? runtime.time : 0; },
    /** Registers a scene: { id, build(params, tools) -> SceneScript }. A later one of the same id replaces it. */
    register(scene) { if (scene && scene.id) scenes.set(scene.id, scene); },
    play(sceneId, params) { return runtime ? runtime.play(sceneId, params) : Promise.resolve({ skipped: true }); },
    seek(seconds, hold = true) { return runtime ? runtime.seek(seconds, hold) : false; },
    skip() { if (runtime) runtime.skip(); },
    resume(token) { return runtime ? runtime.resume(token) : false; },
    clearVeil(seconds) { if (runtime) runtime.clearVeil(seconds); },

    async init(progress) {
      const { createCinematicRuntime } = await import('./cinematicRuntime.js');
      runtime = createCinematicRuntime(context, scenes);
      const { commands } = context;
      undo.push(commands.handle(GAME_COMMANDS.CINEMATIC_PLAY, ({ sceneId, params } = {}) => {
        if (!scenes.has(sceneId)) return false;
        runtime.play(sceneId, params);
        return true;
      }));
      undo.push(commands.handle(GAME_COMMANDS.CINEMATIC_SKIP, () => { runtime.skip(); }));
      undo.push(commands.handle(GAME_COMMANDS.CINEMATIC_RESUME, ({ token } = {}) => { runtime.resume(token ?? null); }));
      progress(1, 'cinematics');
    },

    start() {
      const { launch } = context;
      if (!launch?.scene) return;
      undo.push(context.events.on(GAME_EVENTS.GAME_READY, () => { launchScene = { scene: launch.scene, sceneAt: launch.sceneAt ?? null }; }));
    },

    update(deltaSeconds) {
      if (!runtime) return;
      if (launchScene && scenes.has(launchScene.scene)) playLaunchScene();
      runtime.update(deltaSeconds);
    },

    dispose() {
      for (const off of undo) if (typeof off === 'function') off();
      if (runtime) runtime.dispose();
      runtime = null;
      scenes.clear();
    },
  };
}
