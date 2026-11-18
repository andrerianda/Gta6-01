// The showcase director: registers the scenes of the bounty's screenshots (?shot=<name>) with the
// engine's showcase registry. Each scene, a file of its own beside this one, sets the real game up
// through its systems and plays the real rules forward to a picture, through the game's own
// cameras (the owner's rule):
//   cover-golden-hour     a police chase on Bulevar Dorado into the low sun, cruisers closing and a
//                         crashed cruiser burning on the palm median (goldenHourCover.js)
//   police-chase-dusk     the same chase on Gran Via just after sunset (duskPoliceChase.js, whose
//                         stagePoliceChase both scenes share)
//   mission-firefight     a mission shootout in Barrio Hierro, the lead in a two-handed stance
//                         aiming at the loading crew by their burning SUV (missionFirefight.js)
//   dusk-on-foot          the lead walking a crowded, damp Gran Via in the blue hour (duskOnFoot.js)
//   night-after-rain      the lead walking a soaked Gran Via at night (nightAfterRain.js; not judged:
//                         the owner keeps night out of the judged set)
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
      const [cover, chase, mission, dusk, night, skyline] = await Promise.all([
        import('./goldenHourCover.js'),
        import('./duskPoliceChase.js'),
        import('./missionFirefight.js'),
        import('./duskOnFoot.js'),
        import('./nightAfterRain.js'),
        import('./skylineFromTheSea.js'),
      ]);
      removers.push(
        cover.registerGoldenHourCover(context),
        chase.registerDuskPoliceChase(context),
        mission.registerMissionFirefight(context),
        dusk.registerDuskOnFoot(context),
        night.registerNightAfterRain(context),
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
export const SHOWCASE_DIRECTOR_SCENES = Object.freeze(['cover-golden-hour', 'mission-firefight', 'dusk-on-foot', 'skyline-from-the-sea']);
