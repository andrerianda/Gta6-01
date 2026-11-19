// The wanted level: turns crimes into heat and heat into stars. Crimes count when a witness or
// an officer sees them; the level rises through five stars at the thresholds of
// catalog/wantedLevels.js, holds while the police see the lead, starts the search (blinking
// stars) once they lose sight, and clears by escaping the search, a respray, a bribe, being
// busted or being wasted. The rules are pure (crimeHeat.js, witnessRules.js, Node-tested in
// tools/tests/police/); wantedLevelRuntime.js wires them to the events of docs/ARCHITECTURE.md.
//
// Members: level (0..5), heat, searching, lastKnownPosition {x, y, z}, searchRadius,
//   searchSecondsLeft(), report({crimeId, offenderId?, victimId?, position?}), setLevel(level),
//   clear(reason), loseStars(count).
// Commands: CRIME_REPORT, WANTED_SET_LEVEL (the debug command:
//   MARAZUL.command('wanted/setLevel', {level: 3})), WANTED_CLEAR.
// Publishes: CRIME_WITNESSED, WANTED_LEVEL_CHANGED, WANTED_SEARCH_STARTED, WANTED_CLEARED, and
//   CRIME_COMMITTED for the crimes it spots itself until combat and pedestrians publish theirs.

/**
 * Creates the wanted level system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createWantedLevelSystem(context) {
  let runtime = null;

  const system = {
    name: 'wantedLevel',

    async init(progress) {
      const { createWantedLevelRuntime } = await import('./wantedLevelRuntime.js');
      runtime = createWantedLevelRuntime(context);
      progress(1, 'wanted level');
    },

    start() {
      runtime.start();
    },

    fixedUpdate(stepSeconds) {
      runtime.fixedUpdate(stepSeconds);
    },

    dispose() {
      runtime?.dispose();
    },

    /** Stars, 0 to 5. */
    get level() { return runtime ? runtime.state.level : 0; },
    /** The heat meter behind the stars. */
    get heat() { return runtime ? runtime.state.heat : 0; },
    /** True while the police search for a lead they have lost (the stars blink). */
    get searching() { return runtime ? runtime.state.searching : false; },
    /** Where the police last saw the lead. */
    get lastKnownPosition() { return runtime ? runtime.state.lastKnown : null; },
    /** The radius of the search circle at this level (metres). */
    get searchRadius() { return runtime ? runtime.levelInfo().searchRadius : 0; },
    /** Seconds of searching left before the stars clear. */
    searchSecondsLeft: () => (runtime ? runtime.searchSecondsLeft() : 0),
    /** Reports a crime (same as CRIME_REPORT). */
    report: (crime) => runtime?.report(crime),
    /** Sets the stars outright (debug, missions). */
    setLevel: (level) => runtime?.setLevel(level),
    /** Clears every star when the reason allows it at this level. */
    clear: (reason) => runtime?.clear(reason) ?? false,
    /** Removes stars (a change of clothes). */
    loseStars: (count) => runtime?.loseStars(count),
  };
  return system;
}
