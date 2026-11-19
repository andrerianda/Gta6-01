// The game context: the one object every system factory receives. It carries the engine's shared
// services (events, commands, entities, state, input, clock, quality, jobs, the renderer's scene
// and camera, the asset library, the atmosphere) and the lookup of other systems by name. A
// system keeps the context and never reaches for a global.
//
//   export function createTrafficSystem(context) {
//     const { events, entities, quality, content } = context;
//     return { name: 'traffic', fixedUpdate(dt) { ... context.systems.get('vehicles') ... } };
//   }

/**
 * @typedef {Object} GameContext
 * @property {ReturnType<import('../content/contentRegistry.js').createContentRegistry>} content
 *   The catalogs: content.get('vehicleCatalog'), content.find(name), content.missing.
 * @property {import('../boot/launchOptions.js').LaunchOptions} launch The page's query options.
 * @property {number | string} seed The world seed (launch.seed).
 * @property {(label: string) => import('../random/seededRandom.js').SeededRandom} random A
 *   seeded generator for a named purpose, derived from the world seed: the same label gives the
 *   same stream in every run.
 * @property {ReturnType<import('../diagnostics/logger.js').createLogger>} log The root logger;
 *   take `context.log.child('<system name>')`.
 * @property {(fault: {system: string, phase: string, error: Error}) => void} reportFault Shows a
 *   fault on the error overlay and logs it.
 * @property {ReturnType<import('../events/eventBus.js').createEventBus>} events The event bus;
 *   topics are GAME_EVENTS (core/events/gameEvents.js).
 * @property {ReturnType<import('../events/commandQueue.js').createCommandQueue>} commands The
 *   command queue; names are GAME_COMMANDS (core/events/gameCommands.js).
 * @property {ReturnType<import('../entities/entityRegistry.js').createEntityRegistry>} entities
 *   Every dynamic thing in the world, with spatial queries.
 * @property {ReturnType<import('../state/gameStateMachine.js').createGameStateMachine>} state
 *   The game state machine (core/state/gameStates.js).
 * @property {ReturnType<import('../input/inputActionMap.js').createInputActionMap>} input The
 *   action map: pressed, held, released, axis, labelFor.
 * @property {ReturnType<import('../input/gameInput.js').createGameInput>} controls Contexts,
 *   rebinding and the keyboard and mouse device (pointer lock).
 * @property {ReturnType<import('../time/gameClock.js').createGameClock>} clock The in-game clock.
 * @property {ReturnType<import('../quality/gameSettings.js').createGameSettings>} settings The
 *   player's settings.
 * @property {ReturnType<import('../storage/persistentStorage.js').createPersistentStorage>} storage
 *   Persistent storage for the save system.
 * @property {ReturnType<import('../quality/activeQuality.js').createActiveQuality>} quality The
 *   quality tier in use: quality.tier is the row of core/quality/qualityTiers.js.
 * @property {ReturnType<import('../jobs/frameBudgetJobQueue.js').createFrameBudgetJobQueue>} jobs
 *   Sliced background generation.
 * @property {ReturnType<import('../jobs/backgroundWorkTracker.js').createBackgroundWorkTracker>} work
 *   What is still loading or streaming; automation waits on it.
 * @property {ReturnType<import('../renderer/rendererBootstrap.js').createRendererBootstrap>} view
 *   The renderer, scene, camera and layer groups (view.layers.world, dynamic, effects, sky).
 * @property {FrameFocus} focus What the camera follows this frame; written by the camera or
 *   player system, read by the render pipeline, city streaming and audio.
 * @property {SimulationInfo} simulation The loop's counters and the slow-motion factor.
 * @property {{get: (name: string) => any, find: (name: string) => any, has: (name: string) => boolean,
 *   names: () => string[]}} systems Other systems by name (use after init has begun).
 * @property {ReturnType<import('../automation/showcaseSceneRegistry.js').createShowcaseSceneRegistry>} showcase
 *   The showcase scenes for automated screenshots.
 * @property {{document: Document | null, element: (id: string) => HTMLElement}} page The page and
 *   its static containers by id (game/index.html).
 * @property {boolean} softwareRenderer True when WebGL runs on the CPU (automation).
 * @property {import('../../assets/AssetLibrary.js').AssetLibrary | null} assets The asset
 *   library with every model loaded; set before any system's init().
 * @property {any} atmosphere The atmosphere facade (render/lighting/atmosphere.js); set by the
 *   world render pipeline in its init(), so depend on 'worldRenderPipeline' to use it.
 */

/**
 * @typedef {Object} FrameFocus
 * @property {{x: number, y: number, z: number}} position Metres; the followed subject.
 * @property {number} groundLevel The ground height near it.
 * @property {number} speed Its speed in metres per second.
 * @property {number} radius Its size in metres.
 * @property {number} depthOfField 0 none to 1.5 strong (cutscenes).
 * @property {number | undefined} distance Focus distance for depth of field; default the subject.
 * @property {number | undefined} range The sharp range around the focus distance.
 */

/**
 * @typedef {Object} SimulationInfo
 * @property {number} stepSeconds The fixed step (1/60 s).
 * @property {number} stepCount Fixed steps run since the start.
 * @property {number} time Simulated seconds since the start.
 * @property {number} slowMotion A factor systems may set (1 normal, 0.3 slow motion); it
 *   multiplies the time scale of the current game state.
 */

/**
 * Assembles the context from the engine's parts and checks that none is missing.
 * @param {Partial<GameContext>} parts Every service but assets and atmosphere, which arrive
 *   during the boot.
 * @returns {GameContext}
 */
export function createGameContext(parts) {
  const absent = REQUIRED_CONTEXT_PARTS.filter((name) => parts[name] === undefined || parts[name] === null);
  if (absent.length > 0) {
    throw new Error(`the game context is missing: ${absent.join(', ')}`);
  }
  const context = { assets: null, atmosphere: null, softwareRenderer: false, ...parts };
  return /** @type {GameContext} */ (Object.seal(context));
}

/** The services the engine must hand in before any system is created. */
export const REQUIRED_CONTEXT_PARTS = Object.freeze([
  'content', 'launch', 'seed', 'random', 'log', 'reportFault', 'events', 'commands', 'entities',
  'state', 'input', 'controls', 'clock', 'settings', 'storage', 'quality', 'jobs', 'work', 'view',
  'focus', 'simulation', 'systems', 'showcase', 'page',
]);

/**
 * A fresh focus record at the origin.
 * @returns {FrameFocus}
 */
export function createFrameFocus() {
  return {
    position: { x: 0, y: 0, z: 0 },
    groundLevel: 0,
    speed: 0,
    radius: 2,
    depthOfField: 0,
    distance: undefined,
    range: undefined,
  };
}
