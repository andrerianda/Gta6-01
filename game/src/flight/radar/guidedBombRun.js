// The Manta Sombra's one guided bomb in the game: the targeting mode (the seeker designates the
// nearest radar emitter ahead; only the unmanned coastal tower may be bombed), the release cue,
// the release itself (refused outside the envelope, on an invalid target or without a bomb), the
// bay that stands open while the bomb is armed, the fall (guidedBombFlight.js) and the impact.
// It fills the data of the green targeting screen (deck/targetingDisplay.js). No three.js here:
// the dropped bomb's model belongs to radarEmitterModels.js.
import { GAME_COMMANDS } from '../../core/events/gameCommands.js';
import { GAME_EVENTS } from '../../core/events/gameEvents.js';
import { WORLD_FLAGS } from '../../core/state/worldFlags.js';
import { bombImpact, createBombState, createReleaseSolution, designateTarget, isValidBombTarget, releaseBomb, releaseSolution, stepBomb } from './guidedBombFlight.js';

/** The aircraft that carries the bomb, and the relief grid of the targeting screen. */
export const BOMB_CARRIER = 'manta_sombra';
const GRID = Object.freeze({ size: 25, spacing: 50 });
const BAY_OPEN_AFTER_RELEASE = 4;
const RESULT_SECONDS = 9;

/**
 * Creates the bomb run.
 * @param {import('../../core/systems/gameContext.js').GameContext} context
 * @param {{candidates: () => Array<object>, groundHeightAt: (x: number, z: number) => number,
 *   onHit: (target: object, position: {x: number, y: number, z: number}, vehicleId: unknown) => void}} env
 *   `candidates` are the radar emitters ({id, name, kind, x, z, aimY, alive}); `onHit` destroys one.
 */
export function createGuidedBombRun(context, env) {
  const { events, flags, commands } = context;
  const bomb = createBombState();
  const aimPoint = { x: 0, y: 0, z: 0 };
  const impact = { missDistance: 0, hit: false };
  const terrain = { heights: new Float32Array(GRID.size * GRID.size), size: GRID.size, spacing: GRID.spacing, x: 0, z: 0 };
  /** The targeting screen's data (deck/targetingDisplay.js TargetingData). */
  const data = {
    active: false, craft: { x: 0, y: 0, z: 0 }, target: null, targetName: '', valid: false, bombs: 0, solution: createReleaseSolution(),
    bombAway: false, bomb, timeToImpact: 0, result: '', terrain: null, timeSeconds: 0,
  };
  let wanted = false;       // the pilot switched the targeting mode on
  let target = null;        // the designated emitter record
  let bombTarget = null;    // the one the falling bomb was released on
  let gridFor = null;
  let bayTimer = 0;
  let resultTimer = 0;
  let carrierId = null;

  function spawn(effectId, x, y, z, scale) {
    if (commands?.has?.(GAME_COMMANDS.EFFECT_SPAWN)) commands.run(GAME_COMMANDS.EFFECT_SPAWN, { effectId, position: { x, y, z }, direction: { x: 0, y: 1, z: 0 }, scale });
  }

  function fillGrid(centre) {
    const half = (GRID.size - 1) / 2;
    terrain.x = centre.x;
    terrain.z = centre.z;
    for (let j = 0; j < GRID.size; j += 1) {
      for (let i = 0; i < GRID.size; i += 1) {
        const height = env.groundHeightAt(centre.x + (i - half) * GRID.spacing, centre.z + (j - half) * GRID.spacing);
        terrain.heights[j * GRID.size + i] = Number.isFinite(height) ? height : 0;
      }
    }
    gridFor = centre;
  }

  function land() {
    bombImpact(bomb, impact);
    const position = { x: bomb.x, y: bomb.y, z: bomb.z };
    const hit = impact.hit && isValidBombTarget(bombTarget);
    data.bombAway = false;
    data.result = hit ? 'TARGET DESTROYED' : 'MISS';
    resultTimer = RESULT_SECONDS;
    if (hit) env.onHit(bombTarget, position, carrierId);
    else {
      spawn('explosion', bomb.x, bomb.y + 1, bomb.z, 3);
      context.systems.find('physics')?.explode?.({ position, radius: 25, power: 30000, causeId: carrierId, weaponId: 'guided_bomb' });
    }
    events.emit(GAME_EVENTS.GUIDED_BOMB_IMPACT, { position, targetId: bombTarget?.id ?? null, hit, missDistance: impact.missDistance });
    bombTarget = null;
  }

  const run = {
    data,
    bomb,
    /** True while the targeting mode is wanted (shown only while a Manta Sombra is flown). */
    get targeting() { return wanted; },
    setTargeting(on) { wanted = Boolean(on); },
    /** The bomb bay stands open: armed on a valid target inside the envelope, and a few seconds after the release. */
    get bayOpen() { return bayTimer > 0 || (data.active && data.bombs > 0 && data.valid && data.solution.inEnvelope); },
    /** The designated emitter record, or null. */
    get target() { return target; },

    /**
     * One frame.
     * @param {number} dt
     * @param {object | null} craft The lead's aircraft ({id, typeId, x, y, z, vx, vy, vz, heading, roll}) or null.
     * @param {number} time Seconds.
     */
    update(dt, craft, time) {
      if (bayTimer > 0) bayTimer -= dt;
      if (resultTimer > 0) { resultTimer -= dt; if (resultTimer <= 0) data.result = ''; }
      if (bomb.active) {
        const ground = env.groundHeightAt(bomb.x, bomb.z);
        const landed = stepBomb(bomb, dt, Number.isFinite(ground) ? Math.max(0, ground) : 0);
        data.timeToImpact = bomb.timeToGo;
        if (landed) land();
      }
      const carrier = craft && craft.typeId === BOMB_CARRIER ? craft : null;
      const input = context.input;
      if (carrier && input && typeof input.pressed === 'function') {
        if (input.pressed('bombTargeting')) wanted = !wanted;
        if (input.pressed('bombRelease')) run.release(carrier);
      }
      data.active = Boolean(carrier) && wanted;
      data.bombs = flags.get(WORLD_FLAGS.GUIDED_BOMB_LOADED) ? 1 : 0;
      data.timeSeconds = time;
      if (!carrier) { target = null; data.target = null; data.valid = false; return; }
      carrierId = carrier.id;
      if (!data.active && !data.bombAway) { target = null; data.target = null; data.valid = false; data.solution.inEnvelope = false; return; }
      data.craft.x = carrier.x; data.craft.y = carrier.y - 2; data.craft.z = carrier.z;
      // The seeker stays on the bomb's target while it falls; otherwise it designates afresh.
      target = data.bombAway ? bombTarget ?? target : designateTarget(carrier, env.candidates());
      if (target) {
        aimPoint.x = target.x; aimPoint.y = target.aimY; aimPoint.z = target.z;
        data.target = aimPoint;
        data.targetName = target.name ?? target.id;
        if (gridFor !== target) fillGrid(target);
        data.terrain = terrain;
      } else {
        data.target = null;
        data.terrain = null;
      }
      data.valid = isValidBombTarget(target);
      releaseSolution(carrier, data.target, data.solution);
    },

    /**
     * Releases the bomb when everything allows it.
     * @param {object | null} craft The lead's aircraft.
     * @returns {boolean} True when the bomb left the bay.
     */
    release(craft) {
      if (!craft || craft.typeId !== BOMB_CARRIER || bomb.active) return false;
      if (!flags.get(WORLD_FLAGS.GUIDED_BOMB_LOADED)) return false;
      const chosen = designateTarget(craft, env.candidates());
      if (!isValidBombTarget(chosen)) return false; // only the radar tower: no bombing of city places
      aimPoint.x = chosen.x; aimPoint.y = chosen.aimY; aimPoint.z = chosen.z;
      releaseSolution(craft, aimPoint, data.solution);
      if (!data.solution.inEnvelope) return false;
      releaseBomb(bomb, craft, aimPoint);
      bombTarget = chosen;
      target = chosen;
      carrierId = craft.id;
      data.bombAway = true;
      data.result = '';
      bayTimer = BAY_OPEN_AFTER_RELEASE;
      flags.set(WORLD_FLAGS.GUIDED_BOMB_LOADED, false);
      events.emit(GAME_EVENTS.GUIDED_BOMB_RELEASED, { vehicleId: craft.id, position: { x: bomb.x, y: bomb.y, z: bomb.z }, targetId: chosen.id });
      return true;
    },

    /** Forgets a bomb in flight and the mode (a new game, a retry). */
    reset() {
      bomb.active = false;
      data.bombAway = false;
      data.result = '';
      bombTarget = null;
      target = null;
      bayTimer = 0;
      resultTimer = 0;
      wanted = false;
    },
  };
  return run;
}
