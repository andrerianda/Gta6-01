// The cutscene player: scripted scenes between and inside missions. It stages the lead at the
// scene's place, shows the letterbox (the cutscene game state), cuts and moves the camera
// through the follow camera (CAMERA_CUT_TO, CAMERA_RELEASE), and speaks the catalog's dialogue
// lines as subtitles under the letterbox, one shot per line (cutsceneShots.js plans them,
// cutsceneDirector.js plays them). Enter or Space skips.
// Commands: CUTSCENE_PLAY {cutsceneId, missionId?, lines?: [{speaker, line}], stage?:
// {position, heading}}; CUTSCENE_SKIP. Publishes CUTSCENE_STARTED, CUTSCENE_ENDED {skipped},
// DIALOGUE_LINE_SPOKEN; enters cutscene and returns to playing. Member: playing (id or null).
import { GAME_COMMANDS } from '../core/events/gameCommands.js';

/**
 * Creates the cutscene player system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createCutscenePlayerSystem(context) {
  let director = null;
  const stops = [];

  return {
    name: 'cutscenes',
    dependsOn: ['followCamera'],
    get playing() { return director ? director.playing : null; },

    async init(progress) {
      const { createCutsceneDirector } = await import('./cutsceneDirector.js');
      director = createCutsceneDirector(context);
      stops.push(
        context.commands.handle(GAME_COMMANDS.CUTSCENE_PLAY, (request) => director.play(request)),
        context.commands.handle(GAME_COMMANDS.CUTSCENE_SKIP, () => director.skip()),
      );
      progress(1, 'cutscenes');
    },

    update(deltaSeconds) {
      director.update(deltaSeconds);
    },

    dispose() {
      for (const stop of stops.splice(0)) if (typeof stop === 'function') stop();
      director?.dispose();
    },
  };
}
