// The world render pipeline: owns the one atmosphere instance (sky, sun and shadows, weather,
// water, post-processing; render/lighting/atmosphere.js) and draws every frame through it. Other
// systems reach the atmosphere as `context.atmosphere` (lights, water, wet surfaces, wind) and
// depend on 'worldRenderPipeline' to do so. The clock and the weather are driven by the
// timeAndWeather system; the focus is `context.focus`, written by the camera.
import { GAME_EVENTS } from '../core/events/gameEvents.js';
import { createDynamicResolution } from '../core/quality/dynamicResolution.js';

/**
 * Creates the world render pipeline system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem & {atmosphere: any,
 *   weather: string, setWeather: (name: string, seconds?: number) => void, requestSettle: () => void}}
 */
export function createWorldRenderPipelineSystem(context) {
  const { view, clock, events, quality } = context;
  /** The frame description handed to the atmosphere; one object, reused. */
  const frame = { timeOfDay: clock.timeOfDay, weather: 'clear', weatherSeconds: 30, focus: context.focus };
  const resolution = createDynamicResolution({ minScale: quality.tier.minRenderScale });
  /** @type {any} */
  let atmosphere = null;
  let settleNextFrame = true;
  /** Seconds left in which the render scale ignores frames while the city streams in. */
  let streamingHold = STREAMING_HOLD_SECONDS;
  const subscriptions = [];

  const system = {
    name: 'worldRenderPipeline',
    runsWhen: /** @type {'always'} */ ('always'),
    loadWeight: 3,
    /** The atmosphere facade; null until init() has run. */
    atmosphere: null,
    /** The dynamic resolution controller (core/quality/dynamicResolution.js), for diagnostics. */
    resolution,
    /** The weather in force: clear, hazy, overcast, rain or storm. */
    weather: context.launch.weather && WEATHER_NAMES.includes(context.launch.weather) ? context.launch.weather : 'clear',

    async init(progress) {
      progress(0.1, 'sky and light');
      const { createAtmosphere } = await import('./lighting/atmosphere.js');
      atmosphere = createAtmosphere(view.renderer, view.scene, view.camera, {
        quality: quality.tier.atmosphere,
        weather: system.weather,
        timeOfDay: clock.timeOfDay,
      });
      system.atmosphere = atmosphere;
      context.atmosphere = atmosphere;
      frame.weather = system.weather;
      atmosphere.onThunder = (strike) => events.emit(GAME_EVENTS.THUNDER_STRUCK, strike);
      view.setFrameRenderer(drawThroughAtmosphere);
      subscriptions.push(
        view.onResize(() => atmosphere.resize()),
        events.on(GAME_EVENTS.QUALITY_CHANGED, (change) => {
          resolution.minScale = change.quality.minRenderScale;
          resolution.reset();
          atmosphere.setQuality(change.quality.atmosphere);
          settleNextFrame = true;
        }),
        events.on(GAME_EVENTS.CAMERA_CUT, requestSettle),
        events.on(GAME_EVENTS.PLAYER_TELEPORTED, requestSettle),
        events.on(GAME_EVENTS.RENDER_CONTEXT_RESTORED, requestSettle),
      );
      progress(1, 'sky and light');
    },

    /** Follows the frame time with the render scale, on tiers that allow it. */
    update(realDelta) {
      if (!atmosphere || context.softwareRenderer || realDelta <= 0) return;
      if (!quality.tier.dynamicResolution || !context.settings.get('graphics.dynamicResolution')) return;
      // The burst of streaming after the boot, a teleport or a camera cut is not the steady
      // load: wait for it to finish (at most STREAMING_HOLD_SECONDS) before judging the frames.
      if (streamingHold > 0) {
        streamingHold -= realDelta;
        if (streamingHold > 0 && context.work.pendingCount > 0) return;
        streamingHold = 0;
        resolution.reset(resolution.scale);
      }
      const scale = resolution.sample(realDelta * 1000);
      if (scale === null) return;
      quality.renderScale = scale;
      const level = quality.tier.atmosphere;
      atmosphere.setQuality(typeof level === 'string' ? { level, renderScale: scale } : { ...level, renderScale: scale });
    },

    setWeather,
    requestSettle,

    dispose() {
      for (const unsubscribe of subscriptions) unsubscribe();
      view.setFrameRenderer(null);
      if (atmosphere) atmosphere.dispose();
      atmosphere = null;
      system.atmosphere = null;
      context.atmosphere = null;
    },
  };

  /**
   * Changes the weather.
   * @param {string} name clear, hazy, overcast, rain or storm.
   * @param {number} [seconds] How long the change blends; 0 cuts. Default 30.
   */
  function setWeather(name, seconds = 30) {
    if (!WEATHER_NAMES.includes(name) || name === system.weather) return;
    const previous = system.weather;
    system.weather = name;
    frame.weather = name;
    frame.weatherSeconds = seconds;
    if (atmosphere) atmosphere.setWeather(name, seconds);
    if (seconds <= 0) settleNextFrame = true;
    events.emit(GAME_EVENTS.WEATHER_CHANGED, { weather: name, previous, seconds });
  }

  /**
   * Makes the next frame jump to its steady state (after a cut, a jump of the clock, before a
   * screenshot). The atmosphere's published state (sun, nightFactor, exposure, ...) follows the
   * clock at once, without waiting for that frame, so a TIME_SET is seen by the next reader.
   */
  function requestSettle() {
    settleNextFrame = true;
    streamingHold = STREAMING_HOLD_SECONDS;
    if (!atmosphere) return;
    frame.timeOfDay = clock.timeOfDay;
    atmosphere.update(0, frame);
  }

  function drawThroughAtmosphere(delta) {
    frame.timeOfDay = clock.timeOfDay;
    if (settleNextFrame) {
      settleNextFrame = false;
      atmosphere.settle(frame);
    } else {
      atmosphere.update(delta, frame);
    }
    atmosphere.render();
  }

  return system;
}

/** Longest wait for streaming to finish before the render scale judges the frames again. */
const STREAMING_HOLD_SECONDS = 12;

/** The weather names the atmosphere knows. */
export const WEATHER_NAMES = Object.freeze(['clear', 'hazy', 'overcast', 'rain', 'storm']);
