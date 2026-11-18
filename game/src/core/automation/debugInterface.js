// The debug object of the game, published as `window.MARAZUL`: how a script (the screenshot
// tools, a test, a developer's console) waits for readiness, advances the simulation
// deterministically, sets the time of day and the weather, moves the player, runs showcase
// scenes and reads a summary of the game. Normal play never depends on it.
//
//   await MARAZUL.whenReady();
//   MARAZUL.setTime(18.83);  MARAZUL.teleport({ x: 120, z: -40 });
//   MARAZUL.advance(2.5);    await MARAZUL.render();    MARAZUL.summary();
import { GAME_COMMANDS } from '../events/gameCommands.js';

/**
 * Creates the debug object for an engine.
 * @param {ReturnType<import('../gameEngine.js').createGameEngine>} engine The engine.
 * @returns {ReturnType<typeof buildDebugInterface>}
 */
export function createDebugInterface(engine) {
  return buildDebugInterface(engine);
}

function buildDebugInterface(engine) {
  const context = engine.context;
  const round = (value) => Math.round(value * 1000) / 1000;

  return {
    /** The game context, for exploring from the console. */
    context,
    /** True once the first complete frame is on the canvas. */
    get ready() { return engine.ready; },

    /**
     * Resolves with the summary once the game is ready (the boot finished and drew its frame).
     * @returns {Promise<object>}
     */
    async whenReady() {
      await engine.start();
      return summary();
    },

    /**
     * Waits until models, city streaming and background jobs have finished.
     * @param {number} [timeoutMilliseconds] Give up after this long; default two minutes.
     * @returns {Promise<boolean>} True when idle.
     */
    whenIdle: (timeoutMilliseconds) => engine.whenIdle(timeoutMilliseconds),

    /**
     * Advances the simulation in fixed 1/60 s steps without drawing.
     * @param {number} seconds Simulated seconds.
     * @returns {{steps: number, stepCount: number, simulationTime: number}}
     */
    advance(seconds) {
      const steps = engine.advance(seconds);
      return { steps, stepCount: engine.loop.stepCount, simulationTime: round(engine.loop.simulationTime) };
    },

    /**
     * Settles the image and draws one frame; resolves when the browser has shown it.
     * @returns {Promise<void>}
     */
    render: () => engine.presentSettledFrame(),

    /** Sets the clock: hours 0..24. A cut, not a fade. */
    setTime: (hours, day) => context.commands.run(GAME_COMMANDS.TIME_SET, { hours, day }),
    /** Sets the weather: clear, hazy, overcast, rain or storm; at once unless seconds is given. */
    setWeather: (weather, seconds = 0) => context.commands.run(GAME_COMMANDS.WEATHER_SET, { weather, seconds }),
    /** Switches the quality tier. */
    setQuality: (tier) => context.quality.set(tier, 'debug'),
    /** Moves the player: position in metres ({x, z} or {x, y, z}) and an optional heading. */
    teleport: (position, heading) => context.commands.run(GAME_COMMANDS.PLAYER_TELEPORT, { position, heading }),

    /** Holds an action down (or releases it), as if its key were pressed. */
    press: (action, down = true) => context.input.setVirtual(action, down),
    /** Enters a game state by name (core/state/gameStates.js). */
    enterState: (name, payload) => context.state.enter(name, payload),
    /** Runs a command now and returns its result. */
    command: (name, payload) => context.commands.run(name, payload),

    /** The registered showcase scenes: [{ name, title, description }]. */
    listShots: () => context.showcase.list(),
    /**
     * Runs a showcase scene to its picture.
     * @param {string} name The scene's name.
     * @param {{seed?: number | string}} [options]
     * @returns {Promise<object>} The summary afterwards.
     */
    async runShot(name, options = {}) {
      await engine.runShowcaseScene(name, { seed: options.seed });
      return summary();
    },

    /** Withholds or resumes the frame loop (it is held after the ready frame under a software renderer). */
    hold: () => engine.scheduler.hold(),
    resume: () => engine.scheduler.resume(),

    summary,
    /** The recent log entries at or above a level. */
    log: (minimumLevel = 'info') => context.log.history(minimumLevel),
  };

  /**
   * A summary of the game for scripts: state, clock, player, entity counts, systems, faults.
   * @returns {object} Plain data, safe to serialise.
   */
  function summary() {
    const player = context.entities.firstWithTag('player');
    const pipeline = context.systems.find('worldRenderPipeline');
    return {
      ready: engine.ready,
      state: context.state.current,
      seed: context.seed,
      quality: context.quality.name,
      softwareRenderer: context.softwareRenderer,
      clock: { timeOfDay: round(context.clock.timeOfDay), day: context.clock.day, label: context.clock.label() },
      weather: pipeline && pipeline.weather ? pipeline.weather : null,
      simulation: { stepCount: engine.loop.stepCount, time: round(engine.loop.simulationTime) },
      inputContext: context.input.context,
      player: player
        ? {
          id: player.id,
          kind: player.kind,
          position: { x: round(player.position.x), y: round(player.position.y), z: round(player.position.z) },
          heading: round(player.heading ?? 0),
        }
        : null,
      entities: context.entities.countByKind(),
      systems: engine.systems.status().map((entry) => `${entry.name}:${entry.status}`),
      faults: engine.errorOverlay.faults().map((fault) => `${fault.system} ${fault.phase}: ${fault.error?.message ?? fault.message ?? ''}`),
      pendingWork: context.work.pendingCount,
      missingCatalogs: [...context.content.missing],
      showcaseScenes: context.showcase.names(),
    };
  }
}
