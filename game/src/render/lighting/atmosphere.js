// ATMOSPHERE FACADE: the one object through which the engine drives MARAZUL's sky, light, weather,
// water and image pipeline.
//
//   import { createAtmosphere } from './render/lighting/atmosphere.js';
//
//   const atmosphere = createAtmosphere(renderer, scene, camera, { quality: 'high' });
//
//   // every frame
//   atmosphere.update(dt, { timeOfDay: 18.8, weather: 'clear', focus: { position: player.position } });
//   atmosphere.render();                       // instead of renderer.render(scene, camera)
//
// update(dt, frame)
//   frame.timeOfDay   clock hours 0..24 (sunrise 06:30, sunset 19:30)
//   frame.weather     'clear' | 'hazy' | 'overcast' | 'rain' | 'storm'; a change blends over
//                     frame.weatherSeconds (default 30)
//   frame.focus       { position, groundLevel, speed, radius, depthOfField, distance, range }:
//                     what the camera follows (keeps it sharp in motion blur), the ground height
//                     near it, its speed in m/s (motion blur starts above 12), and for cutscenes a
//                     depth-of-field strength 0..1.5 with an optional focus distance and sharp range
// render()            draws the frame to the canvas through the post-processing chain
// state               read-only environment for other systems (see AtmosphereState below): sun
//                     direction and colour, ambient, night factor, wetness, wind, fog, exposure
// addLight(desc) / removeLight(light)
//                     register night lights (localLightManager.js describes the fields)
// addWater(options) / captureWaterDepth(region) / getWaveHeight(x, z)
//                     the sea exists from the start; rivers, basins and pools are added here
// setWeather(name, seconds), triggerLightning(), onThunder = (strike) => {}
// setQuality('low' | 'medium' | 'high' | 'ultra' | { level, ...switches }), setEffect(name, on)
// settle(frame)       jump to the steady state of a frame at once (after a cut or a jump of the
//                     clock, before a screenshot): fades done, all shadow cascades and the
//                     environment map redrawn; then call render()
// resize()            call after the canvas size or pixel ratio changed (also detected lazily)
// dispose()
//
// Create the atmosphere before the first frame is drawn: it patches two three.js shader chunks
// (sun shadow cascades, cheap idle lights) that only affect materials compiled afterwards.
//
// What other systems do with it
//   materials   leave lighting to the scene: no baked sun, no own tone mapping. Ground, walls and
//               vehicles call applyWetSurface(material, { porosity, puddles }) from
//               ../weather/wetSurface.js once; windows, signs and lamp glass scale their
//               emissiveIntensity by state.nightFactor each frame
//   lamps       addLight() once per lamp with its groundY; move headlamps by moving the handle
//   boats       getWaveHeight(x, z), or water.heightAt(x, z) for a river or basin
//   vegetation  state.wind, state.windGust, state.windTime
//   audio       onThunder; state.rain and state.windSpeed for ambience
//   screenshots settle(frame) then render(); in software rendering a frame takes seconds
//
// What the facade owns in the scene: the sky dome, the key light with its shadow cascades (the
// only shadow-casting directional lights allowed), a hemisphere fill light, scene.environment,
// the real local lights and their glow layer, the water bodies and the rain. It never touches
// other objects. The renderer's own tone mapping is not used: the scene is drawn into an HDR
// target and tone mapped by the pipeline (materials must leave `toneMapped` at its default).

import * as THREE from 'three';
import { supersampleFactorOf } from '../../core/quality/qualityTiers.js';
import { createPostPipeline } from '../postfx/postPipeline.js';
import { createAltitudeLook, describeAltitude } from '../sea/seaHorizonMaths.js';
import { LOOK_COLOR_FIELDS, LOOK_SCALAR_FIELDS, createAtmosphereLook, nearestLookName, sampleAtmosphereLook } from '../sky/atmosphereLooks.js';
import { createCloudDrift } from '../sky/cloudDeck.js';
import { createTilingNoiseTexture } from '../sky/noiseTextures.js';
import { createSkyDome, writeSkyUniforms } from '../sky/skyDome.js';
import { captureWaterDepthMap } from '../water/waterDepthMap.js';
import { createWaterShared, createWaterSurface } from '../water/waterSurface.js';
import { createLightningModel } from '../weather/lightningModel.js';
import { createRainEffect } from '../weather/rainEffect.js';
import { createWeatherModel } from '../weather/weatherModel.js';
import { WET_SURFACE_UNIFORMS } from '../weather/wetSurface.js';
import { createWindModel } from '../weather/windModel.js';
import { isSoftwareRenderer, resolveAtmosphereQuality } from './atmosphereQuality.js';
import { createAtmosphereState, resolveKeyLight } from './atmosphereState.js';
import { createLocalLightManager } from './localLightManager.js';
import { createSkyEnvironment } from './skyEnvironment.js';
import { createSunShadowRig } from './sunShadowRig.js';

/**
 * How dark the moon's shadows get (0 none, 1 as dark as the sun's). Owner, 18 Nov: none at street
 * level (they read as crisp frond bands on the pavement); the moon stays a faint cool fill, and at
 * 0 the shadow maps are not drawn at all while the moon is the key.
 */
const MOON_SHADOW_STRENGTH = 0;

/** @typedef {import('./atmosphereState.js').AtmosphereState} AtmosphereState */

/**
 * Creates the atmosphere.
 * @param {THREE.WebGLRenderer} renderer The game's renderer.
 * @param {THREE.Scene} scene The game scene.
 * @param {THREE.PerspectiveCamera} camera The game camera.
 * @param {Object} [options]
 * @param {string | Object} [options.quality] A quality level or overrides (atmosphereQuality.js).
 * @param {string} [options.weather] The starting weather; default 'clear'.
 * @param {number} [options.timeOfDay] The starting clock time; default 18.8.
 * @param {boolean} [options.sea] Create the open sea at level 0; default true.
 * @returns {ReturnType<typeof buildAtmosphere>}
 */
export function createAtmosphere(renderer, scene, camera, options = {}) {
  return buildAtmosphere(renderer, scene, camera, options);
}

function buildAtmosphere(renderer, scene, camera, options) {
  const software = isSoftwareRenderer(renderer);
  const quality = resolveAtmosphereQuality(options.quality ?? 'high');

  const noiseTexture = createTilingNoiseTexture(256);
  const sky = createSkyDome(renderer, noiseTexture);
  const skyUniforms = sky.uniforms;
  const cloudDrift = createCloudDrift();
  skyUniforms.uCloudOffset.value.fromArray(cloudDrift.offset);

  const group = new THREE.Group();
  group.name = 'marazul-atmosphere';
  group.add(sky.mesh);
  const hemisphere = new THREE.HemisphereLight(0xffffff, 0xffffff, 0.4);
  hemisphere.name = 'marazul-fill-light';
  group.add(hemisphere);
  scene.add(group);

  const shadowRig = createSunShadowRig(renderer, scene, quality.shadows);
  const environment = createSkyEnvironment(renderer, sky, {
    size: quality.environmentSize,
    minInterval: software ? 6 : 1.5,
  });
  const lights = createLocalLightManager(scene, quality.localLights);
  const pipeline = createPostPipeline(renderer, skyUniforms, noiseTexture);

  const weather = createWeatherModel(options.weather ?? 'clear');
  const wind = createWindModel();
  const lightning = createLightningModel();
  const rain = createRainEffect(quality.rainDrops);
  group.add(rain.group);

  const waterShared = createWaterShared(noiseTexture, environment.cubeTexture);
  /** @type {ReturnType<typeof createWaterSurface>[]} */
  const waters = [];
  let sea = null;
  let waterDepth = null;

  WET_SURFACE_UNIFORMS.uWetNoise.value = noiseTexture;
  WET_SURFACE_UNIFORMS.uWetRipples.value = waterShared.uRipples.value;

  const look = createAtmosphereLook();
  /** What the camera's height does to the picture (render/sea/seaHorizonMaths.js); one record, reused. */
  const altitude = createAltitudeLook();
  const state = createAtmosphereState(skyUniforms, options.timeOfDay ?? 18.8, weather.name);

  /** The values handed to the post-processing chain each frame (see PostFrame in postPipeline.js). */
  const postFrame = {
    exposure: 1,
    bloom: 0.5,
    hazeDensity: 0.0004,
    hazeHeight: 260,
    heatHaze: 0,
    groundLevel: 0,
    time: 0,
    sunDirection: state.sunDirection,
    shaftColor: new THREE.Color(0, 0, 0),
    flareStrength: 0,
    flareColor: new THREE.Color(1, 1, 1),
    depthOfField: false,
    focus: { distance: 10, aperture: 0, range: 1 },
    motionBlur: 0,
    subjectPosition: new THREE.Vector3(),
    subjectRadius: 3,
    vignette: 0.22,
    grain: 0.02,
    fade: 1,
    occlusionStrength: 1,
  };
  const lightFrame = { nightFactor: 0, time: 0, exposure: 1, beamVisibility: 0, wetness: 0, viewportHeight: 1080 };

  // Scratch values.
  const scratchColor = new THREE.Color();
  const rainColor = new THREE.Color();
  const bufferSize = new THREE.Vector2();
  const directFog = new THREE.FogExp2(0xffffff, 0.0005);
  let clock = 0;
  let realClock = 0;
  let environmentReady = false;
  let currentWeather = weather.name;

  const atmosphere = {
    state,
    /** The camera's height and what it does to horizon, sky and clouds (AltitudeLook), read-only. */
    altitude,
    /** The sky's uniforms (haze colours, cloud deck), for layers that must match the dome. */
    skyUniforms,
    quality,
    group,
    lights,
    weatherModel: weather,
    pipeline,
    isSoftwareRenderer: software,
    /** 1 shows the picture, 0 is black: for cuts and loading. */
    fade: 1,
    /** Called with a LightningStrike when thunder should be heard. */
    onThunder: null,
    /**
     * Opt-in, for a staged still only: fields of an AtmosphereLook that replace the hour's look
     * every frame (e.g. { zenithTint: [..], hazeDensity: 0.0001 }), plus `duskLampCap` (the most the
     * city's dusk lamps and lit windows may be on, 0..1, written to state.duskLampCap for
     * cityDressing) and `hours` (when given, the override holds only within 15 minutes of that
     * clock time, so a later scene that sets another hour is not touched). null (the default)
     * changes nothing.
     */
    lookOverride: null,
    update,
    render,
    addLight: (description) => lights.add(description),
    removeLight: (light) => lights.remove(light),
    addWater,
    removeWater,
    captureWaterDepth,
    getWaveHeight,
    setWeather,
    triggerLightning: (distance, azimuth) => lightning.trigger(distance, azimuth),
    setQuality,
    setEffect,
    refreshEnvironment,
    settle,
    resize,
    dispose,
  };
  lightning.onThunder = (strike) => {
    if (atmosphere.onThunder) atmosphere.onThunder(strike);
  };

  if (options.sea !== false) sea = addWater({ kind: 'sea', level: 0 });
  applyQuality();

  /**
   * Advances the atmosphere and prepares every light and uniform for the frame.
   * @param {number} deltaSeconds Time step in seconds.
   * @param {Object} [frame]
   * @param {number} [frame.timeOfDay] Clock hours 0..24; keeps the previous value when omitted.
   * @param {string} [frame.weather] Weather state to approach.
   * @param {number} [frame.weatherSeconds] Duration of a weather change; default 30.
   * @param {Object} [frame.focus] The camera's subject (see the header of this file).
   */
  function update(deltaSeconds, frame = {}) {
    const dt = Math.min(Math.max(deltaSeconds, 0), 0.25);
    clock += dt;
    realClock += Math.max(deltaSeconds, 0);
    if (frame.timeOfDay !== undefined) state.timeOfDay = ((frame.timeOfDay % 24) + 24) % 24;
    if (frame.weather !== undefined && frame.weather !== currentWeather) {
      currentWeather = frame.weather;
      weather.setWeather(frame.weather, frame.weatherSeconds ?? 30);
    }
    const hours = state.timeOfDay;
    camera.updateMatrixWorld();

    // ---- weather, wind, lightning ----
    weather.update(dt);
    const w = weather.current;
    wind.update(dt, w.windSpeed);
    lightning.update(dt, w.lightningRate);
    cloudDrift.update(dt, wind.x, wind.z);
    const flash = lightning.flash;

    // ---- the look of the hour, bent by the weather ----
    sampleAtmosphereLook(hours, look);
    const override = lookOverrideAt(atmosphere.lookOverride, hours);
    if (override) overrideLook(look, override);
    state.duskLampCap = override && Number.isFinite(override.duskLampCap) ? override.duskLampCap : null;
    state.lookName = nearestLookName(hours);
    const clearSun = resolveKeyLight(state, look, w);
    // A stroke lights the clouds and the city about as bright as an overcast noon looks, whatever
    // the exposure of the hour: scale it by the exposure so that it never whites the picture out.
    const flashLight = flash / Math.max(state.exposure, 0.3);

    // ---- fill light ----
    state.ambientSkyColor.setRGB(look.ambientSky[0], look.ambientSky[1], look.ambientSky[2]).lerp(scratchColor.setRGB(0.8, 0.86, 0.95), w.overcast * 0.75);
    state.ambientGroundColor.setRGB(look.ambientGround[0], look.ambientGround[1], look.ambientGround[2]).lerp(scratchColor.setRGB(0.6, 0.6, 0.6), w.overcast * 0.6);
    state.ambientIntensity = look.ambientIntensity * w.ambientScale;
    hemisphere.color.copy(state.ambientSkyColor);
    hemisphere.groundColor.copy(state.ambientGroundColor);
    hemisphere.intensity = state.ambientIntensity + flashLight * 1.5;
    if (flash > 0) hemisphere.color.lerp(scratchColor.setRGB(0.8, 0.88, 1.0), Math.min(1, flash * 2));

    // ---- the view from altitude: the horizon sinks, the dome darkens, the clouds fall below ----
    describeAltitude(camera.matrixWorld.elements[13], altitude);
    skyUniforms.uHorizonSin.value = altitude.horizonSine;
    skyUniforms.uAirAbove.value = altitude.airAbove;
    skyUniforms.uCloudBelow.value = altitude.cloudsFromBelow;
    skyUniforms.uCirrusBelow.value = altitude.cirrusFromBelow;
    waterShared.uHorizonSin.value = altitude.horizonSine;
    waterShared.uFarCalm.value = altitude.farCalm;
    postFrame.highAir = altitude.highAir;

    // ---- sky and image-based lighting ----
    writeSkyUniforms(skyUniforms, look, w, state, clearSun, clock, cloudDrift.offset, flashLight * 0.5, lightning);
    scene.environmentIntensity = look.envIntensity * (environment.supported ? 1 : 0);
    // Refresh the environment map when the hour or the weather has moved enough to matter.
    const signature =
      Math.floor(hours * 30) * 4096 +
      Math.round(w.overcast * 24) * 128 +
      Math.round(w.cloudCover * 12) * 8 +
      Math.round(w.cloudDarkness * 6) +
      Math.round((1 - altitude.airAbove) * 12) * 16777216;
    if (!environmentReady) {
      environment.refreshNow();
      environmentReady = true;
      if (environment.texture) scene.environment = environment.texture;
    } else {
      environment.update(realClock, signature);
    }

    // ---- key light and shadows ----
    const softness = look.shadowSoftness * (1 + 3 * w.sunOcclusion);
    // The moon's shadows stay faint: night streets are lit by lamps, not by crisp frond shadows.
    shadowRig.update(camera, state.keyDirection, state.keyColor, state.keyIntensity, softness, state.keyIsSun ? 1 : MOON_SHADOW_STRENGTH);

    // ---- haze ----
    state.fogDensity = look.hazeDensity * w.hazeScale;
    state.fogHeight = look.hazeHeight * (1 + 0.5 * w.overcast);

    // ---- wetness, wind ----
    state.wetness = weather.wetness;
    state.puddles = weather.puddles;
    state.rain = w.rain;
    state.wind.set(wind.x, 0, wind.z);
    state.windSpeed = wind.speed;
    state.windGust = wind.gust;
    state.windTime = wind.time;
    state.cloudCover = w.cloudCover;
    state.overcast = w.overcast;
    state.lightningFlash = flash;
    state.weather = weather.name;
    state.waveScale = w.waveScale;
    WET_SURFACE_UNIFORMS.uWetness.value = weather.wetness;
    WET_SURFACE_UNIFORMS.uPuddles.value = weather.puddles;
    WET_SURFACE_UNIFORMS.uWetRain.value = w.rain;
    WET_SURFACE_UNIFORMS.uWetTime.value = clock;

    // ---- focus ----
    const focus = frame.focus;
    const groundLevel = focus?.groundLevel ?? (focus?.position ? focus.position.y : 0);
    if (focus?.position) postFrame.subjectPosition.copy(focus.position);
    postFrame.subjectRadius = focus?.radius ?? 3;
    const speed = focus?.speed ?? 0;
    postFrame.motionBlur = quality.motionBlur ? Math.min(0.6, Math.max(0, (speed - 12) / 45)) : 0;
    const aperture = focus?.depthOfField ?? 0;
    postFrame.depthOfField = aperture > 0.01;
    if (postFrame.depthOfField) {
      const distance = focus.distance ?? (focus.position ? camera.position.distanceTo(focus.position) : 10);
      postFrame.focus.distance = distance;
      postFrame.focus.aperture = aperture;
      postFrame.focus.range = focus.range ?? 0.4 + distance * 0.12;
    }

    // ---- local lights, rain, water ----
    renderer.getDrawingBufferSize(bufferSize);
    lightFrame.nightFactor = state.nightFactor;
    lightFrame.time = clock;
    lightFrame.exposure = state.exposure;
    lightFrame.beamVisibility = Math.min(1, Math.max(0, (state.fogDensity - 0.0005) / 0.002) + w.rain * 0.9);
    lightFrame.wetness = weather.wetness;
    // In screen pixels: a supersampled frame (cinematic) keeps far lamps' smallest size on screen.
    lightFrame.viewportHeight = bufferSize.y / supersampleFactorOf(renderer.getPixelRatio(), globalThis.devicePixelRatio || 1);
    lights.update(dt, camera, lightFrame);

    // Drops are seen by the light they refract: a fraction of the sky's, more in a lightning flash.
    rainColor.copy(skyUniforms.uHorizonColor.value).multiplyScalar(0.55).lerp(state.ambientSkyColor, 0.25);
    // No rain falls on a camera that has climbed through the cloud deck.
    rain.update(dt, w.rain * altitude.cloudsFromBelow, wind.x, wind.z, groundLevel, rainColor, 1 + flashLight * 3 + state.nightFactor * 2);

    waterShared.uTime.value = clock;
    waterShared.uKeyDirection.value.copy(state.keyDirection);
    waterShared.uKeyColor.value.copy(state.keyColor).multiplyScalar(state.keyIntensity);
    addScaledColor(
      waterShared.uAmbientColor.value.copy(skyUniforms.uHorizonColor.value).multiplyScalar(0.85),
      state.ambientSkyColor,
      state.ambientIntensity * 0.25,
    );
    waterShared.uRain.value = w.rain;
    const crestFoam = Math.min(1, Math.max(0, (w.waveScale - 1.15) / 1.1));
    for (let i = 0; i < waters.length; i += 1) waters[i].update(camera, w.waveScale, crestFoam);

    // ---- post-processing values ----
    postFrame.exposure = state.exposure;
    postFrame.bloom = look.bloom;
    postFrame.hazeDensity = state.fogDensity;
    postFrame.hazeHeight = state.fogHeight;
    postFrame.heatHaze = look.heatHaze * (1 - w.overcast) * (1 - weather.wetness);
    postFrame.groundLevel = groundLevel;
    postFrame.time = clock;
    const shaft = (0.24 * look.sunShafts * clearSun * (state.keyIsSun ? 1 : 0)) / Math.max(state.exposure, 0.05);
    postFrame.shaftColor.copy(state.sunColor).multiplyScalar(shaft);
    postFrame.flareStrength = look.sunDisc * clearSun * clearSun;
    postFrame.flareColor.copy(state.sunColor).multiplyScalar(1.0 / Math.max(state.exposure, 0.05));
    postFrame.fade = atmosphere.fade;
    postFrame.grain = 0.018 + 0.012 * state.nightFactor;

    const grade = pipeline.gradeUniforms;
    grade.uLift.value.fromArray(look.gradeLift);
    grade.uGamma.value.fromArray(look.gradeGamma);
    grade.uGain.value.fromArray(look.gradeGain);
    grade.uSaturation.value = look.saturation * w.saturationScale;
    grade.uContrast.value = look.contrast;
    grade.uShadowTint.value.fromArray(look.shadowTint);
    grade.uHighlightTint.value.fromArray(look.highlightTint);
    grade.uSplitToning.value = look.splitToning * (1 - 0.5 * w.overcast);
  }

  /** Draws the frame to the canvas (or to the render target that is current on the renderer). */
  function render() {
    if (pipeline.hdrSupported) {
      pipeline.render(scene, camera, postFrame);
      return;
    }
    // No float render targets: draw directly with three.js's tone mapping and simple fog.
    const previousFog = scene.fog;
    const previousToneMapping = renderer.toneMapping;
    const previousExposure = renderer.toneMappingExposure;
    directFog.color.copy(state.fogColor);
    directFog.density = state.fogDensity * 0.9;
    scene.fog = directFog;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    // three.js's filmic operator applies its own gain of 1 / 0.6; compensate so that mid tones
    // land where the pipeline's curve would put them.
    renderer.toneMappingExposure = state.exposure * 0.7 * atmosphere.fade;
    renderer.render(scene, camera);
    scene.fog = previousFog;
    renderer.toneMapping = previousToneMapping;
    renderer.toneMappingExposure = previousExposure;
  }

  /**
   * Adds a body of water (see createWaterSurface in waterSurface.js for the options).
   * @param {Object} waterOptions
   * @returns {ReturnType<typeof createWaterSurface>}
   */
  function addWater(waterOptions) {
    const water = createWaterSurface(waterShared, waterOptions);
    waters.push(water);
    group.add(water.mesh);
    return water;
  }

  /** Removes a body of water added with addWater(). */
  function removeWater(water) {
    const index = waters.indexOf(water);
    if (index === -1) return;
    waters.splice(index, 1);
    group.remove(water.mesh);
    water.dispose();
    if (water === sea) sea = null;
  }

  /**
   * Captures how deep the sea is over a region of the coast, so that the water turns clear over
   * the shallows and foams on the waterline. Call once the terrain is in the scene, and again if
   * the coast changes. Objects of the atmosphere are left out automatically.
   * @param {{minX: number, maxX: number, minZ: number, maxZ: number}} region World rectangle.
   * @param {{maxDepth?: number, resolution?: number, hide?: THREE.Object3D[]}} [captureOptions]
   */
  function captureWaterDepth(region, captureOptions = {}) {
    const hide = [group, lights.group, ...(captureOptions.hide ?? [])];
    waterDepth = captureWaterDepthMap(renderer, scene, region, {
      level: sea ? sea.level : 0,
      maxDepth: captureOptions.maxDepth,
      resolution: captureOptions.resolution,
      hide,
      target: waterDepth ? waterDepth.target : undefined,
    });
    waterShared.uDepthMap.value = waterDepth.texture;
    waterShared.uDepthBounds.value.copy(waterDepth.bounds);
    waterShared.uDepthMax.value = waterDepth.maxDepth;
    // From now on the sea reads its depth from the map.
    for (const water of waters) {
      if (water.kind === 'sea') water.uniforms.uConstantDepth.value = -1;
    }
  }

  /**
   * The world height of the sea surface at a horizontal position, now.
   * @param {number} x World X.
   * @param {number} z World Z.
   * @returns {number} World Y in metres (the rest level when there is no sea).
   */
  function getWaveHeight(x, z) {
    return sea ? sea.heightAt(x, z) : 0;
  }

  /**
   * Starts a weather change.
   * @param {string} name 'clear', 'hazy', 'overcast', 'rain' or 'storm'.
   * @param {number} [seconds] Duration of the blend; 0 switches at once. Default 30.
   */
  function setWeather(name, seconds = 30) {
    currentWeather = name;
    weather.setWeather(name, seconds);
    if (seconds === 0 && weather.current.rain > 0.05) weather.setWetness(1, 0.8);
  }

  /**
   * Changes the quality.
   * @param {string | Object} request A level name ('low', 'medium', 'high', 'ultra') or an object
   *   `{ level, ...switches }` (see atmosphereQuality.js).
   */
  function setQuality(request) {
    resolveAtmosphereQuality(request, quality);
    applyQuality();
  }

  /**
   * Switches one effect on or off: 'ambientOcclusion', 'bloom', 'sunShafts', 'heatHaze',
   * 'depthOfField', 'motionBlur', 'lensFlare', 'grade', 'grain', 'antialias', 'shadows'.
   * @param {string} name The effect.
   * @param {boolean} enabled
   */
  function setEffect(name, enabled) {
    if (name === 'shadows') {
      quality.shadows = enabled ? (quality.shadows === 'off' ? 'high' : quality.shadows) : 'off';
    } else if (name in quality) {
      quality[name] = enabled;
    }
    applyQuality();
  }

  function applyQuality() {
    shadowRig.setQuality(quality.shadows);
    lights.setQuality(quality.localLights);
    rain.setDropCount(quality.rainDrops);
    const settings = pipeline.settings;
    for (const key of Object.keys(settings)) {
      if (key in quality) settings[key] = quality[key];
    }
    pipeline.applySettings();
  }

  /** Recaptures the environment map at once (after a jump in time, before a screenshot). */
  function refreshEnvironment() {
    environment.refreshNow();
    if (environment.texture) scene.environment = environment.texture;
  }

  /**
   * Brings everything to its steady state for a frame description at once: light fades finish,
   * every shadow cascade is redrawn around the camera and the environment map is recaptured. Use
   * it after a cut, a teleport or a jump of the clock, and before a screenshot; follow it with
   * render(). The frame object is the one update() takes.
   * @param {Object} [frame] See update().
   */
  function settle(frame = {}) {
    shadowRig.invalidate();
    update(0.25, frame);
    refreshEnvironment();
    shadowRig.invalidate();
    update(0.25, frame);
  }

  /** Re-reads the canvas size. The pipeline also notices a changed size by itself. */
  function resize() {
    renderer.getDrawingBufferSize(bufferSize);
    pipeline.setSize(bufferSize.x, bufferSize.y);
  }

  /** Removes everything the atmosphere added to the scene and frees its GPU resources. */
  function dispose() {
    scene.remove(group);
    if (scene.environment === environment.texture) scene.environment = null;
    for (const water of waters) water.dispose();
    waters.length = 0;
    if (waterDepth) waterDepth.target.dispose();
    waterShared.dispose();
    rain.dispose();
    lights.dispose();
    shadowRig.dispose();
    environment.dispose();
    pipeline.dispose();
    sky.dispose();
    noiseTexture.dispose();
  }

  return atmosphere;
}

/** The look override in force at a clock time: the override, or null (none, or another hour). */
export function lookOverrideAt(override, hours) {
  if (!override || typeof override !== 'object') return null;
  if (!Number.isFinite(override.hours)) return override;
  const apart = Math.abs((((hours - override.hours) % 24) + 36) % 24 - 12);
  return apart <= 0.25 ? override : null;
}

/**
 * Writes the fields an override gives over a sampled look, in place (no allocation): finite
 * numbers for the scalar fields, three finite numbers for the colour fields; anything else is ignored.
 */
export function overrideLook(look, override) {
  for (const field of LOOK_SCALAR_FIELDS) {
    const value = override[field];
    if (Number.isFinite(value)) look[field] = value;
  }
  for (const field of LOOK_COLOR_FIELDS) {
    const value = override[field];
    if (Array.isArray(value) && value.length >= 3 && value.every(Number.isFinite)) {
      look[field][0] = value[0];
      look[field][1] = value[1];
      look[field][2] = value[2];
    }
  }
  return look;
}

/** target += color * scale, in place; returns target. */
function addScaledColor(target, color, scale) {
  target.r += color.r * scale;
  target.g += color.g * scale;
  target.b += color.b * scale;
  return target;
}
