// The game engine of MARAZUL: builds the shared services (events, commands, entities, state,
// input, clock, quality, jobs, renderer), hands them to every system as one game context, boots
// the game behind the loading screen (models through the asset library, then the systems in
// dependency order), and runs the fixed-step loop: 60 Hz simulation, variable rendering.
//
//   const engine = createGameEngine({ window, document, content, systemFactories });
//   await engine.start();          // resolves when the first complete frame is on the canvas
//
// Per fixed step:  commands -> systems.fixedUpdate -> entity grid -> queued events
// Per frame:       state timer -> commands -> systems.update -> systems.lateUpdate -> jobs -> events
// Then the frame is drawn through the atmosphere pipeline (render/worldRenderPipeline.js).
import { createDebugInterface } from './automation/debugInterface.js';
import { createShowcaseSceneRegistry } from './automation/showcaseSceneRegistry.js';
import { preloadGameAssets, splitBootAssetIds } from './boot/assetPreload.js';
import { parseLaunchOptions } from './boot/launchOptions.js';
import { createLoadingScreen } from './boot/loadingScreen.js';
import { setDevelopmentChecks } from './diagnostics/assertions.js';
import { createErrorOverlay } from './diagnostics/errorOverlay.js';
import { createLogger } from './diagnostics/logger.js';
import { createFrameProfiler, nearShadowReachOf, shadowReachOf } from './diagnostics/frameProfiler.js';
import { createPerformanceOverlay } from './diagnostics/performanceOverlay.js';
import { createSceneCostCensus } from './diagnostics/sceneCostCensus.js';
import { createEntityRegistry } from './entities/entityRegistry.js';
import { createCommandQueue } from './events/commandQueue.js';
import { createEventBus } from './events/eventBus.js';
import { GAME_COMMANDS } from './events/gameCommands.js';
import { GAME_EVENTS, GAME_EVENT_TOPICS } from './events/gameEvents.js';
import { createGameInput } from './input/gameInput.js';
import { createBackgroundWorkTracker } from './jobs/backgroundWorkTracker.js';
import { createFrameBudgetJobQueue } from './jobs/frameBudgetJobQueue.js';
import { createFixedStepGameLoop } from './loop/fixedStepGameLoop.js';
import { createFrameScheduler } from './loop/frameScheduler.js';
import { createActiveQuality } from './quality/activeQuality.js';
import { createGameSettings } from './quality/gameSettings.js';
import { measureGpuBenchmark } from './quality/gpuBenchmark.js';
import { chooseQualityTierFromBenchmark, resolveQualityTier } from './quality/qualityAutoSelection.js';
import { isQualityTierName } from './quality/qualityTiers.js';
import { createSeededRandom, deriveSeed } from './random/seededRandom.js';
import { createRendererBootstrap } from './renderer/rendererBootstrap.js';
import { warmUpGpuResources } from './renderer/gpuResourceWarmup.js';
import { isSoftwareRenderer } from './renderer/softwareRendererDetection.js';
import { watchWebglContextLoss } from './renderer/webglContextLoss.js';
import { applyGameStateEffects } from './state/gameStateEffects.js';
import { createGameStateMachine } from './state/gameStateMachine.js';
import { GAME_STATE } from './state/gameStates.js';
import { createPersistentStorage } from './storage/persistentStorage.js';
import { createFrameFocus, createGameContext } from './systems/gameContext.js';
import { createSystemRegistry } from './systems/systemRegistry.js';
import { createGameClock, newGameStartHour } from './time/gameClock.js';

/**
 * Creates the engine. Nothing loads until start().
 * @param {Object} options
 * @param {Window} options.window The page's window.
 * @param {Document} options.document The page (game/index.html).
 * @param {ReturnType<import('./content/contentRegistry.js').createContentRegistry>} options.content
 *   The content registry.
 * @param {import('./systems/gameSystemContract.js').GameSystemFactory[]} options.systemFactories
 *   The system manifest, in update order.
 * @returns {ReturnType<typeof buildGameEngine>}
 */
export function createGameEngine(options) {
  return buildGameEngine(options);
}

/** The ids of the page elements the engine itself uses (game/index.html). */
export const ENGINE_PAGE_ELEMENTS = Object.freeze({
  viewport: 'game-viewport',
  loadingBar: 'loading-progress-bar',
  loadingStatus: 'loading-status',
  loadingPercent: 'loading-percent',
  loadingTip: 'loading-tip',
});

/** Milliseconds of background jobs a frame may run. */
export const JOB_BUDGET_MILLISECONDS = 3;

function buildGameEngine(options) {
  const win = options.window;
  const doc = options.document;
  const content = options.content;
  /** When the page's scripts had loaded and the engine began, ms since navigation. */
  const scriptsLoaded = Math.round(win.performance?.now() ?? 0);
  const launch = parseLaunchOptions(win.location ? win.location.search : '');
  setDevelopmentChecks(launch.debug);

  // Diagnostics first: everything after this can report a fault by name.
  const errorOverlay = createErrorOverlay(doc.body);
  const log = createLogger({ consoleLevel: launch.debug ? 'debug' : 'error' });
  const reportFault = (fault) => {
    errorOverlay.report(fault);
    log.child(fault.system).error(`${fault.phase}: ${fault.error.message}`, fault.error);
  };
  const asError = (value) => (value instanceof Error ? value : new Error(String(value)));
  win.addEventListener('error', (event) => {
    errorOverlay.report({ system: 'page', phase: 'error', error: asError(event.error ?? event.message) });
  });
  win.addEventListener('unhandledrejection', (event) => {
    errorOverlay.report({ system: 'page', phase: 'promise', error: asError(event.reason) });
  });

  // Shared services.
  const storage = createPersistentStorage({ namespace: 'marazul' });
  const events = createEventBus({
    knownTopics: GAME_EVENT_TOPICS,
    onUnknownTopic: (topic) => log.warn(`the event topic "${topic}" is not in the catalogue`),
    onHandlerError: ({ topic, error }) => reportFault({ system: 'events', phase: topic, error }),
  });
  const commands = createCommandQueue({
    onUnhandled: (name) => log.warn(`the command "${name}" has no handler yet`),
    onHandlerError: ({ command, error }) => reportFault({ system: 'commands', phase: command, error }),
  });
  const settings = createGameSettings({
    storage,
    onChanged: (change) => events.emit(GAME_EVENTS.SETTINGS_CHANGED, change),
  });
  const entities = createEntityRegistry({
    onAdded: (entity) => events.emit(GAME_EVENTS.ENTITY_ADDED, { entity }),
    onRemoved: (entity) => events.emit(GAME_EVENTS.ENTITY_REMOVED, { entity }),
  });
  const state = createGameStateMachine({
    onChanged: (change) => events.emit(GAME_EVENTS.GAME_STATE_CHANGED, change),
    onRefused: (message) => log.warn(message),
  });
  const clock = createGameClock({
    startHour: newGameStartHour(options.content),
    onHourChanged: (event) => events.emit(GAME_EVENTS.CLOCK_HOUR_CHANGED, event),
    onDayChanged: (event) => events.emit(GAME_EVENTS.CLOCK_DAY_CHANGED, event),
    onDayPhaseChanged: (event) => events.emit(GAME_EVENTS.DAY_PHASE_CHANGED, event),
  });
  const jobs = createFrameBudgetJobQueue({
    onJobError: ({ label, owner, error }) => reportFault({ system: owner || 'jobs', phase: `job ${label}`, error }),
  });
  const work = createBackgroundWorkTracker();
  work.addSource('jobs', () => jobs.pendingCount);
  const showcase = createShowcaseSceneRegistry();

  // The page and the renderer.
  const page = {
    document: doc,
    /** A static container of index.html by id; throws with the id when the page lacks it. */
    element(id) {
      const element = doc.getElementById(id);
      if (!element) throw new Error(`game/index.html has no element with the id "${id}"`);
      return element;
    },
  };
  const canvas = /** @type {HTMLCanvasElement} */ (page.element(ENGINE_PAGE_ELEMENTS.viewport));
  const loadingScreen = createLoadingScreen({
    bar: doc.getElementById(ENGINE_PAGE_ELEMENTS.loadingBar),
    status: doc.getElementById(ENGINE_PAGE_ELEMENTS.loadingStatus),
    percent: doc.getElementById(ENGINE_PAGE_ELEMENTS.loadingPercent),
    tip: doc.getElementById(ENGINE_PAGE_ELEMENTS.loadingTip),
  });
  const view = createRendererBootstrap({ canvas, fieldOfView: settings.get('graphics.fieldOfView') });
  const softwareRenderer = isSoftwareRenderer(view.renderer);
  view.onResize((size) => events.emit(GAME_EVENTS.VIEWPORT_RESIZED, size));
  win.addEventListener('resize', () => view.resize());
  watchWebglContextLoss({
    canvas,
    view,
    onLost: () => {
      events.emit(GAME_EVENTS.RENDER_CONTEXT_LOST, {});
      // Nothing can be drawn until the context returns: do not let the world run on unseen.
      if (state.is(GAME_STATE.PLAYING)) commands.send(GAME_COMMANDS.GAME_PAUSE, {});
    },
    onRestored: () => events.emit(GAME_EVENTS.RENDER_CONTEXT_RESTORED, {}),
  });

  // The quality tier: the query string, then the player's setting, then the first-run benchmark.
  let detectedTier = settings.get('graphics.detectedQuality');
  if (!detectedTier && !softwareRenderer) {
    try {
      detectedTier = chooseQualityTierFromBenchmark({ ...measureGpuBenchmark(view.renderer), softwareRenderer });
      settings.set('graphics.detectedQuality', detectedTier);
    } catch (error) {
      // A driver that cannot run the benchmark still plays the game, at the middle tier.
      detectedTier = 'medium';
      log.warn(`the GPU benchmark failed: ${asError(error).message}`);
    }
  }
  const resolvedTier = resolveQualityTier({
    requested: launch.quality,
    setting: settings.get('graphics.quality'),
    detected: detectedTier,
    softwareRenderer,
    isTierName: isQualityTierName,
  });
  const quality = createActiveQuality({
    name: resolvedTier.tier,
    source: resolvedTier.source,
    onChanged: (change) => {
      view.setPixelRatioCap(change.quality.pixelRatioCap);
      events.emit(GAME_EVENTS.QUALITY_CHANGED, { tier: change.tier, quality: change.quality });
    },
  });
  view.setPixelRatioCap(quality.tier.pixelRatioCap);
  events.on(GAME_EVENTS.SETTINGS_CHANGED, ({ key, value }) => {
    if (key === 'graphics.quality') quality.set(value === 'auto' ? detectedTier || 'high' : value);
  });

  // Input.
  const controls = createGameInput({
    target: win,
    canvas,
    settings,
    playerControls: content.find('playerControls'),
    onContextChanged: (change) => events.emit(GAME_EVENTS.INPUT_CONTEXT_CHANGED, change),
    onBindingChanged: (change) => events.emit(GAME_EVENTS.INPUT_BINDING_CHANGED, change),
    onPointerLockChanged: (locked) => {
      // Esc frees the mouse: while playing that opens the pause menu.
      if (!locked && state.is(GAME_STATE.PLAYING)) commands.send(GAME_COMMANDS.GAME_PAUSE, {});
    },
  });
  const input = controls.actions;

  // The systems and the loop.
  const systems = createSystemRegistry({ reportFault, isSimulating: () => state.simulates });
  const loop = createFixedStepGameLoop({ fixedStep: runFixedStep, frame: runFrame, render: drawFrame });
  const simulation = {
    stepSeconds: loop.stepSeconds,
    get stepCount() { return loop.stepCount; },
    get time() { return loop.simulationTime; },
    slowMotion: 1,
  };
  const sceneCensus = createSceneCostCensus(view);
  const sceneCost = (options) => sceneCensus.take(options ?? {
    shadowDistance: shadowReachOf(quality.tier),
    nearShadowDistance: nearShadowReachOf(quality.tier),
  });
  const performanceOverlay = createPerformanceOverlay(doc.body, {
    drawStatistics: () => view.drawStatistics(),
    entityCounts: () => entities.countByKind(),
    systemStatus: () => systems.status(),
    headline: () => [state.current, clock.label(), quality.name],
    pendingWork: () => work.pendingCount,
    renderScale: () => quality.renderScale,
    sceneCost,
  });
  if (launch.debug) performanceOverlay.setVisible(true);
  const profiler = createFrameProfiler({
    systemStatus: () => systems.status(),
    advance: (seconds) => loop.advance(seconds),
    drawFrame: () => view.renderFrame(1 / 60, 1),
    drawStatistics: () => view.drawStatistics(),
    census: sceneCost,
    quality: () => quality,
  });

  const context = createGameContext({
    content,
    launch,
    seed: launch.seed,
    random: (label) => createSeededRandom(deriveSeed(launch.seed, label)),
    log,
    reportFault,
    events,
    commands,
    entities,
    state,
    input,
    controls,
    clock,
    settings,
    storage,
    quality,
    jobs,
    work,
    view,
    focus: createFrameFocus(),
    simulation,
    systems: { get: systems.get, find: systems.find, has: systems.has, names: systems.names },
    showcase,
    page,
    softwareRenderer,
  });
  applyGameStateEffects({ state, controls, body: doc.body });

  const scheduler = createFrameScheduler({
    requestFrame: (callback) => win.requestAnimationFrame(callback),
    cancelFrame: (handle) => win.cancelAnimationFrame(handle),
    onFrame: (milliseconds) => loop.tick(milliseconds / 1000),
    onResume: () => loop.resetClock(),
  });
  const settledTiming = { realDelta: 0, delta: 0, alpha: 1, steps: 0, virtual: true };
  let started = null;

  const engine = {
    context,
    loop,
    scheduler,
    systems,
    errorOverlay,
    performanceOverlay,
    /** Measures CPU per system, draw calls, triangles and the cost by group (frameProfiler.js). */
    profile: profiler.profile,
    /** The draw calls, triangles and shadow casters of each group of objects in view now. */
    sceneCost,
    /** True once the first complete frame is on the canvas. */
    ready: false,
    /**
     * When each boot phase ended, in milliseconds since the page started loading (engineStart,
     * models, systems, streaming, shaders, firstFrame, ready), and the shader programs linked by
     * the warm-up and in all after the first frame. MARAZUL.summary().boot reads it.
     */
    bootTimings: { scriptsLoaded, programsWarmed: 0, warmupTimedOut: false, programsAfterFirstFrame: 0 },
    start,
    advance,
    drawSettledFrame,
    presentSettledFrame,
    whenIdle,
    runShowcaseScene,
    dispose,
  };
  const debug = createDebugInterface(engine);
  win.MARAZUL = debug;
  commands.handle(GAME_COMMANDS.SHOWCASE_RUN, ({ name, seed }) => runShowcaseScene(name, { seed }));

  function runFixedStep(stepSeconds) {
    input.beginFixedStep();
    commands.flush();
    systems.fixedUpdate(stepSeconds);
    entities.refreshAll();
    events.flush();
    input.endFixedStep();
  }

  function runFrame(timing) {
    loop.timeScale = state.timeScale * simulation.slowMotion;
    state.tick(timing.realDelta);
    if (input.pressed('togglePerformanceOverlay')) performanceOverlay.toggle();
    commands.flush();
    systems.update(timing.realDelta, timing.delta, timing.alpha);
    systems.lateUpdate(timing.realDelta, timing.delta, timing.alpha);
    jobs.run(JOB_BUDGET_MILLISECONDS);
    events.flush();
    input.endFrame();
    systems.endFrame();
  }

  function drawFrame(timing) {
    view.renderFrame(timing.realDelta, timing.alpha);
    performanceOverlay.sample({ frameMilliseconds: timing.realDelta * 1000, steps: timing.steps });
  }

  /**
   * Boots the game: loading screen, models, systems, the first complete frame, the frame loop.
   * @returns {Promise<void>} Resolves when `window.__gameReady` is true (or the boot failed and
   *   the error overlay says why).
   */
  function start() {
    if (!started) {
      started = boot().catch((error) => {
        reportFault({ system: 'engine', phase: 'boot', error: asError(error) });
        loadingScreen.set(1, 'MARAZUL could not start');
      });
    }
    return started;
  }

  /** Records when a boot phase ended, in milliseconds since the page started loading. */
  function markBoot(phase) {
    engine.bootTimings[phase] = Math.round(win.performance?.now() ?? 0);
  }

  async function boot() {
    markBoot('engineStart');
    state.enter(GAME_STATE.LOADING);
    const progress = (fraction, label) => {
      loadingScreen.set(fraction, label);
      events.emit(GAME_EVENTS.LOADING_PROGRESS, { fraction: loadingScreen.fraction, label: loadingScreen.label });
    };
    progress(0.02, 'Starting the engine');
    await nextAnimationFrame();

    const { AssetLibrary } = await import('../assets/index.js');
    context.assets = new AssetLibrary({ renderer: view.renderer, anisotropy: quality.tier.anisotropy });
    systems.createAll(options.systemFactories, context);

    const modelsLoaded = work.begin('models');
    const modelStage = loadingScreen.stage(0.04, 0.5);
    // Only the models the first view needs load before the first frame; the craft, responders and
    // long guns stream in behind the first minutes of play (a showcase picture loads everything).
    const bootModels = splitBootAssetIds(context.assets.registry, {
      includeDevelopmentAssets: launch.debug,
      everythingFirst: Boolean(launch.shot),
    });
    engine.bootTimings.modelsFirstView = bootModels.firstView.length;
    const preload = await preloadGameAssets({
      assets: context.assets,
      ids: bootModels.firstView,
      onProgress: ({ fraction, id }) => {
        modelStage(fraction, id ? `Loading models: ${id.replace(/_/g, ' ')}` : 'Loading models');
        events.emit(GAME_EVENTS.LOADING_PROGRESS, { fraction: loadingScreen.fraction, label: loadingScreen.label });
      },
    });
    modelsLoaded();
    markBoot('models');
    for (const failure of preload.failed) reportFault({ system: 'assets', phase: 'load', error: failure.error });

    const systemStage = loadingScreen.stage(0.5, 0.96);
    await systems.initialiseAll(({ fraction, label }) => {
      systemStage(fraction, `Building the city: ${label}`);
      events.emit(GAME_EVENTS.LOADING_PROGRESS, { fraction: loadingScreen.fraction, label: loadingScreen.label });
    });
    markBoot('systems');
    await whenIdle();
    progress(1, 'Welcome to Marazul');
    markBoot('streaming');

    if (launch.shot) {
      await runShowcaseScene(launch.shot, { seed: launch.seed, draw: false });
    } else {
      state.enter(launch.autostart ? GAME_STATE.PLAYING : GAME_STATE.START_MENU);
    }
    // Link every shader program side by side and upload the textures before the first frame (the
    // frame would otherwise do them one by one), with the lights of that frame already set.
    runFrame(settledTiming);
    systems.find('worldRenderPipeline')?.requestSettle?.();
    try {
      const warmup = await warmUpGpuResources(view.renderer, view.scene, view.camera, {
        drawFrame: () => view.renderFrame(0, 1),
      });
      engine.bootTimings.programsWarmed = warmup.programs;
      engine.bootTimings.texturesWarmed = warmup.textures;
      engine.bootTimings.textureMilliseconds = warmup.textureMilliseconds;
      engine.bootTimings.warmupTimedOut = warmup.timedOut;
    } catch (error) {
      log.warn(`the GPU warm-up failed: ${asError(error).message}`);
    }
    markBoot('shaders');
    drawSettledFrame();
    markBoot('firstFrame');
    engine.bootTimings.programsAfterFirstFrame = view.renderer.info.programs?.length ?? 0;
    events.emit(GAME_EVENTS.GAME_READY, { seed: launch.seed });
    await nextAnimationFrame();
    await nextAnimationFrame();
    markBoot('ready');
    engine.ready = true;
    win.__gameReady = true;
    win.__previewReady = true;

    // A showcase scene's picture is held on every renderer (on a GPU the game would otherwise play
    // on for seconds before a capture and the scene's subject leave the frame); under a software
    // renderer every picture is held. A key or a click (or MARAZUL.resume()) lets the game run.
    if (launch.shot || softwareRenderer) holdUntilInput();
    scheduler.start();
    streamDeferredModels(bootModels.deferred);
  }

  /**
   * Loads the models left out of the first view while the game runs (tracked as background work,
   * so whenIdle() and showcase scenes wait for them); bootTimings.deferredModels says when they
   * were in.
   * @param {string[]} ids The deferred model ids.
   */
  function streamDeferredModels(ids) {
    if (ids.length === 0) return;
    const streamed = preloadGameAssets({ assets: context.assets, ids }).then((result) => {
      for (const failure of result.failed) reportFault({ system: 'assets', phase: 'load', error: failure.error });
      engine.bootTimings.modelsDeferred = result.loaded.length;
      markBoot('deferredModels');
    });
    work.track(streamed, 'deferred models').catch((error) => {
      reportFault({ system: 'assets', phase: 'load', error: asError(error) });
    });
  }

  /** Holds the picture until the player (or a script) acts. */
  function holdUntilInput() {
    scheduler.hold();
    const resume = () => {
      win.removeEventListener('keydown', resume, true);
      win.removeEventListener('pointerdown', resume, true);
      scheduler.resume();
    };
    win.addEventListener('keydown', resume, true);
    win.addEventListener('pointerdown', resume, true);
  }

  /**
   * Deterministic mode: runs the simulation forward in fixed steps without drawing.
   * @param {number} seconds Simulated seconds.
   * @returns {number} The steps run.
   */
  function advance(seconds) {
    return loop.advance(seconds);
  }

  /** Waits until models, streaming and background jobs have finished. */
  function whenIdle(timeoutMilliseconds = 120000) {
    return work.whenIdle({ pump: () => jobs.drain(40), timeoutMilliseconds });
  }

  /**
   * Draws one complete frame now: the per-frame work of every system with no time passing, the
   * atmosphere settled (shadows, environment, fades), then the picture.
   */
  function drawSettledFrame() {
    runFrame(settledTiming);
    const pipeline = systems.find('worldRenderPipeline');
    if (pipeline && typeof pipeline.requestSettle === 'function') pipeline.requestSettle();
    view.renderFrame(0, 1);
  }

  /**
   * Draws a settled frame and waits until the browser has shown it.
   * @returns {Promise<void>}
   */
  async function presentSettledFrame() {
    drawSettledFrame();
    await nextAnimationFrame();
    await nextAnimationFrame();
  }

  /**
   * Runs a showcase scene: the scene sets the game up and plays it forward, then streaming is
   * awaited and the settled frame drawn.
   * @param {string} name The scene's name.
   * @param {{seed?: number | string, draw?: boolean}} [sceneOptions] The seed (default the
   *   page's) and whether to draw the frame afterwards (default true).
   * @returns {Promise<boolean>} False when there is no such scene or it failed.
   */
  async function runShowcaseScene(name, sceneOptions = {}) {
    const seed = sceneOptions.seed ?? launch.seed;
    if (state.is(GAME_STATE.LOADING)) state.enter(GAME_STATE.PLAYING);
    const scene = showcase.get(name);
    let ok = scene !== null;
    if (!scene) {
      reportFault({
        system: 'showcase',
        phase: 'run',
        error: new Error(`no showcase scene named "${name}"; registered: ${showcase.names().join(', ') || 'none'}`),
      });
    } else {
      try {
        await scene.run(context, {
          seed,
          random: createSeededRandom(deriveSeed(seed, `showcase:${name}`)),
          advance,
          whenIdle,
        });
      } catch (error) {
        ok = false;
        reportFault({ system: 'showcase', phase: name, error: asError(error) });
      }
    }
    await whenIdle();
    if (sceneOptions.draw !== false) await presentSettledFrame();
    return ok;
  }

  /** Stops the loop and frees every system and the renderer. */
  function dispose() {
    scheduler.stop();
    systems.disposeAll();
    controls.dispose();
    view.dispose();
  }

  function nextAnimationFrame() {
    return new Promise((resolve) => {
      win.requestAnimationFrame(() => resolve());
    });
  }

  return engine;
}
