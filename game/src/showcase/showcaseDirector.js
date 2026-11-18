// The showcase director: registers the scenes of the bounty's screenshots (?shot=<name>) with the
// engine's showcase registry. Each scene, a file of its own beside this one, sets the real game up
// through its systems and plays the real rules forward to a picture:
//   cover-golden-hour     the lead beside a red coupe on Bulevar Dorado, the sun setting at the end
//                         of the street (goldenHourCover.js)
//   police-chase-dusk     three stars, the coupe drifting with a cruiser alongside and three on its
//                         tail on Gran Via (duskPoliceChase.js)
//   mission-firefight     a mission objective, the lead aiming at an exploding car (missionFirefight.js)
//   skyline-from-the-sea  the pier, beach, hotels and towers from offshore at dusk (skylineFromTheSea.js,
//                         with two alternative views: skyline-bay-dusk and skyline-causeway-dusk)
// shots.json at the repository root lists the scenes of the final pictures, and
// tools/take-screenshots.mjs captures them. Shared staging helpers: showcaseStaging.js.
// Its contract is docs/ARCHITECTURE.md, "showcase".

/**
 * Creates the showcase director system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createShowcaseDirectorSystem(context) {
  /** @type {(() => void)[]} Removers of the registered scenes. */
  const removers = [];

  return {
    name: 'showcase',
    runsWhen: 'always',

    async init(progress) {
      const [cover, chase, mission, skyline] = await Promise.all([
        import('./goldenHourCover.js'),
        import('./duskPoliceChase.js'),
        import('./missionFirefight.js'),
        import('./skylineFromTheSea.js'),
      ]);
      removers.push(
        cover.registerGoldenHourCover(context),
        chase.registerDuskPoliceChase(context),
        mission.registerMissionFirefight(context),
        skyline.registerSkylineFromTheSea(context),
      );
      progress(1, 'showcase scenes');
    },

    /** The director's scenes in the order of the final pictures. */
    scenes: SHOWCASE_DIRECTOR_SCENES,

    dispose() {
      for (const remove of removers.splice(0)) if (typeof remove === 'function') remove();
    },
  };
}

/** The director's scenes in the order of the final pictures (shots.json follows it). */
export const SHOWCASE_DIRECTOR_SCENES = Object.freeze(['cover-golden-hour', 'police-chase-dusk', 'mission-firefight', 'skyline-from-the-sea']);
