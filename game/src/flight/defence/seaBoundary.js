// The closed sea around Marazul as a state machine: how far the lead's aircraft is from the middle
// of the chart decides whether he is inside, warned, in violation (the patrol is sent), fair game
// (weapons free) or past the hard limit (brought down). Back inside the `clear` radius it is over.
// With the sea open the state is 'open' and nothing happens. Pure: no imports, no allocation per step.

/** The boundary states of AIRSPACE_BOUNDARY_CHANGED. */
export const BOUNDARY_STATES = Object.freeze(['inside', 'warned', 'violated', 'open']);

/** Metres a craft must come back inside the weapons-free radius before the patrol holds fire again. */
const WEAPONS_FREE_HYSTERESIS = 300;

/**
 * Creates the boundary watch.
 * @param {{clear: number, warn: number, intercept: number, weaponsFree: number, hardLimit: number}} radii Chart radii.
 * @param {{warningEvery?: number}} [options] Seconds between repeats of the radio warning.
 * @returns {{state: string, weaponsFree: boolean, distance: number, distanceToReturn: number, reset: () => void,
 *   update: (distance: number, deltaSeconds: number, conditions?: {open?: boolean, silenced?: boolean, warningOnly?: boolean})
 *   => {changed: boolean, previous: string, warn: boolean, scramble: boolean, weaponsFreeBegan: boolean, cleared: boolean, bringDown: boolean}}}
 */
export function createSeaBoundary(radii, options = {}) {
  const warningEvery = options.warningEvery ?? 12;
  const step = { changed: false, previous: 'inside', warn: false, scramble: false, weaponsFreeBegan: false, cleared: false, bringDown: false };
  let warningTimer = 0;
  let broughtDown = false;

  const boundary = {
    /** 'inside' | 'warned' | 'violated' | 'open'. */
    state: 'inside',
    /** True beyond the weapons-free radius (the patrol may fire without further orders). */
    weaponsFree: false,
    /** Horizontal metres from the chart's centre at the last update. */
    distance: 0,
    /** Metres to fly back to be inside the clear radius (0 when inside it). */
    distanceToReturn: 0,

    reset() {
      boundary.state = 'inside';
      boundary.weaponsFree = false;
      boundary.distance = boundary.distanceToReturn = 0;
      warningTimer = 0;
      broughtDown = false;
    },

    /**
     * Advances the watch. The returned record is reused: `warn` asks for the radio warning now,
     * `scramble` is the moment the violation begins, `bringDown` the moment the hard limit is passed.
     */
    update(distance, deltaSeconds, conditions) {
      const open = Boolean(conditions && conditions.open);
      const silenced = Boolean(conditions && conditions.silenced);
      const warningOnly = Boolean(conditions && conditions.warningOnly);
      const previous = boundary.state;
      step.warn = step.scramble = step.weaponsFreeBegan = step.cleared = step.bringDown = false;
      boundary.distance = distance;
      boundary.distanceToReturn = distance > radii.clear ? distance - radii.clear : 0;

      let next = previous;
      if (open) next = 'open';
      else if (silenced) next = 'inside';
      else {
        if (previous === 'open') next = 'inside';
        if (next === 'inside' && distance > radii.warn) next = 'warned';
        if (next === 'warned' && distance > radii.intercept && !warningOnly) next = 'violated';
        if (next === 'violated' && (distance < radii.warn || warningOnly)) next = 'warned';
        if (next === 'warned' && distance < radii.clear) next = 'inside';
      }

      const wasFree = boundary.weaponsFree;
      if (next !== 'violated') boundary.weaponsFree = false;
      else if (distance > radii.weaponsFree) boundary.weaponsFree = true;
      else if (distance < radii.weaponsFree - WEAPONS_FREE_HYSTERESIS) boundary.weaponsFree = false;
      step.weaponsFreeBegan = boundary.weaponsFree && !wasFree;

      if (next === 'warned' || next === 'violated') {
        if (previous !== 'warned' && previous !== 'violated') warningTimer = 0;
        warningTimer -= deltaSeconds;
        if (warningTimer <= 0) {
          warningTimer = warningEvery;
          step.warn = true;
        }
        if (next === 'violated' && distance > radii.hardLimit && !broughtDown) {
          broughtDown = true;
          step.bringDown = true;
        }
      } else broughtDown = false;

      step.scramble = next === 'violated' && previous !== 'violated';
      step.cleared = next === 'inside' && (previous === 'warned' || previous === 'violated');
      step.changed = next !== previous;
      step.previous = previous;
      boundary.state = next;
      return step;
    },
  };
  return boundary;
}
