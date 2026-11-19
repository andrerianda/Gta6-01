// Getting away, as pure logic. Two small trackers of the final mission's middle:
// - the interception outcome: from the air guard's stage, the lead's place and what happened to
//   the aircraft it decides 'lost' (the pair searching or going home for six seconds), 'border'
//   (7000 m from Marazul's centre, where the pair turns back), 'shot_down', 'crashed' or
//   'turned_back' (he complied and was escorted home for more than twenty seconds);
// - the Garza Negra's climb gate: the height above the coastal radar's coverage and how far the
//   climb has come.
// Runs in Node (tools/tests/finalflight/).

export const ESCAPE_RULES = Object.freeze({
  lostSeconds: 6,
  turnedBackSeconds: 20,
  borderRadius: 7000,
  lowHeight: 120,
});

const AWAY = new Set(['searching', 'returning', 'idle']);
const ENGAGED = new Set(['scramble', 'intercept', 'formate', 'order', 'warningShots', 'fire', 'escort']);

/**
 * @param {{centre: {x: number, z: number}, borderRadius?: number}} options
 */
export function createInterceptionTracker(options) {
  const rules = ESCAPE_RULES;
  const border = options.borderRadius ?? rules.borderRadius;
  const tracker = {
    outcome: null,
    engaged: false,
    lostFor: 0,
    escortedFor: 0,
    distance: 0,
    /**
     * @param {{stage: string, x: number, z: number, shotDown?: boolean, crashed?: boolean}} sample
     * @returns {null | 'lost' | 'border' | 'shot_down' | 'crashed' | 'turned_back'}
     */
    update(sample, dt) {
      if (tracker.outcome) return tracker.outcome;
      if (sample.shotDown) return end('shot_down');
      if (sample.crashed) return end('crashed');
      tracker.distance = Math.hypot(sample.x - options.centre.x, sample.z - options.centre.z);
      if (ENGAGED.has(sample.stage)) tracker.engaged = true;
      tracker.escortedFor = sample.stage === 'escort' ? tracker.escortedFor + dt : 0;
      if (tracker.escortedFor > rules.turnedBackSeconds) return end('turned_back');
      if (tracker.distance >= border) return end('border');
      tracker.lostFor = tracker.engaged && AWAY.has(sample.stage) ? tracker.lostFor + dt : 0;
      if (tracker.lostFor >= rules.lostSeconds) return end('lost');
      return null;
    },
  };
  function end(outcome) {
    tracker.outcome = outcome;
    return outcome;
  }
  return tracker;
}

/** The Garza Negra's climb above the coastal radar: the gate and the start it is measured from. */
export const CLIMB_GATE = Object.freeze({ gateHeight: 5200, startHeight: 600 });

/**
 * @param {{gateHeight?: number, startHeight?: number}} [options] Metres above the sea.
 */
export function createClimbGate(options = {}) {
  const gateHeight = options.gateHeight ?? CLIMB_GATE.gateHeight;
  const startHeight = options.startHeight ?? CLIMB_GATE.startHeight;
  const gate = {
    gateHeight,
    through: false,
    remaining: gateHeight - startHeight,
    progress: 0,
    /** @param {number} height Metres above the sea. */
    update(height) {
      if (gate.through) return true;
      gate.remaining = Math.max(0, gateHeight - height);
      gate.progress = Math.min(1, Math.max(0, (height - startHeight) / (gateHeight - startHeight)));
      if (height >= gateHeight) gate.through = true;
      return gate.through;
    },
  };
  return gate;
}
