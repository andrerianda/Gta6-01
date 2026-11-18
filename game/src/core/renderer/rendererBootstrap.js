// The renderer bootstrap: creates the WebGL2 renderer on the viewport canvas, the scene with its
// layer groups and the game camera, keeps the drawing buffer fitted to the window and the device
// pixel ratio, and owns the hook through which the atmosphere and image pipeline takes over the
// final render. Until the world render pipeline plugs itself in, frames are drawn plainly.
//
//   const view = createRendererBootstrap({ canvas, pixelRatioCap: 1.5 });
//   view.layers.world.add(cityMesh);                 // static world, dynamic, effects, sky
//   view.setFrameRenderer((delta, alpha) => { atmosphere.update(delta, frame); atmosphere.render(); });
//   view.renderFrame(delta, alpha);                  // the loop calls this once per drawn frame
import * as THREE from 'three';
import { pixelRatioFor } from '../quality/qualityTiers.js';

/**
 * @typedef {Object} SceneLayers The groups every system adds its objects to.
 * @property {THREE.Group} world Static world: terrain, roads, buildings, props, vegetation.
 * @property {THREE.Group} dynamic Things that move: vehicles, characters, pickups, loose props.
 * @property {THREE.Group} effects Particles, decals, tracers, markers.
 * @property {THREE.Group} sky Far backdrop objects that cast no shadow (distant skyline, birds,
 *   aircraft); the atmosphere keeps its own sky dome, lights and water beside these groups.
 */

/**
 * Creates the renderer, scene and camera.
 * @param {Object} options
 * @param {HTMLCanvasElement} options.canvas The viewport canvas.
 * @param {number} [options.pixelRatioCap] The device pixel ratio is clamped to this; default 1.5.
 * @param {number} [options.fieldOfView] Vertical field of view in degrees; default 58.
 * @param {boolean} [options.preserveDrawingBuffer] Keep the frame readable after it is shown
 *   (automation holds one frame for a screenshot); default false.
 * @returns {ReturnType<typeof buildRendererBootstrap>}
 */
export function createRendererBootstrap(options) {
  return buildRendererBootstrap(options);
}

/** The camera's clip planes: the sea reaches 7.6 km, so the far plane lies beyond it. */
export const CAMERA_NEAR_METRES = 0.25;
export const CAMERA_FAR_METRES = 9000;

function buildRendererBootstrap(options) {
  const canvas = options.canvas;
  const context = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,            // the image pipeline anti-aliases the final picture
    depth: true,
    stencil: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: options.preserveDrawingBuffer === true,
  });
  if (!context) {
    throw new Error('This browser cannot give the game a WebGL2 context. MARAZUL needs WebGL2 (desktop Chrome with hardware acceleration).');
  }

  const renderer = new THREE.WebGLRenderer({ canvas, context });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // The scene is drawn into an HDR target and tone mapped once, by the image pipeline.
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // Several passes make one frame: the draw statistics are reset once per frame, by renderFrame().
  renderer.info.autoReset = false;
  // The shadow passes are counted apart, so the overlay can tell shadow casters from the view.
  const shadowCount = { calls: 0, triangles: 0 };
  const renderShadowMaps = renderer.shadowMap.render;
  renderer.shadowMap.render = function renderCountedShadowMaps(...shadowArguments) {
    const calls = renderer.info.render.calls;
    const triangles = renderer.info.render.triangles;
    renderShadowMaps.apply(this, shadowArguments);
    shadowCount.calls += renderer.info.render.calls - calls;
    shadowCount.triangles += renderer.info.render.triangles - triangles;
  };

  const scene = new THREE.Scene();
  scene.name = 'marazul-world';
  /** @type {SceneLayers} */
  const layers = {
    world: namedGroup('layer-static-world'),
    dynamic: namedGroup('layer-dynamic'),
    effects: namedGroup('layer-effects'),
    sky: namedGroup('layer-sky-backdrop'),
  };
  scene.add(layers.world, layers.dynamic, layers.effects, layers.sky);

  const camera = new THREE.PerspectiveCamera(options.fieldOfView ?? 58, 16 / 9, CAMERA_NEAR_METRES, CAMERA_FAR_METRES);
  camera.name = 'game-camera';
  camera.position.set(0, 3, 8);
  scene.add(camera);

  /** @type {Set<(size: {width: number, height: number, pixelRatio: number}) => void>} */
  const resizeListeners = new Set();
  /** @type {((delta: number, alpha: number) => void) | null} */
  let frameRenderer = null;
  const statistics = {
    drawCalls: 0, triangles: 0, shadowDrawCalls: 0, shadowTriangles: 0, geometries: 0, textures: 0, programs: 0,
  };

  const view = {
    canvas,
    renderer,
    scene,
    camera,
    layers,
    /** Viewport size in CSS pixels. */
    width: 0,
    height: 0,
    /** The pixel ratio in use (device ratio clamped to the cap). */
    pixelRatio: 1,
    pixelRatioCap: options.pixelRatioCap ?? 1.5,
    /** The backing store is at least this many pixels per CSS pixel (the cinematic tier: 2). */
    pixelRatioFloor: 1,
    /** True between a lost WebGL context and its restoration: nothing is drawn. */
    contextLost: false,
    /** Frames drawn since the start. */
    framesDrawn: 0,
    setFrameRenderer,
    renderFrame,
    resize,
    setPixelRatioCap,
    onResize,
    drawStatistics,
    dispose,
  };

  /**
   * Hands the final render to the atmosphere and image pipeline (or back, with null).
   * @param {((delta: number, alpha: number) => void) | null} render Draws one frame to the
   *   canvas; it receives the frame's real seconds and the interpolation alpha.
   */
  function setFrameRenderer(render) {
    frameRenderer = render;
  }

  /**
   * Draws one frame: through the plugged-in pipeline, or plainly while there is none.
   * @param {number} delta Real seconds since the previous drawn frame.
   * @param {number} alpha Interpolation factor between the last two fixed steps.
   */
  function renderFrame(delta, alpha) {
    if (view.contextLost) return;
    resize();
    renderer.info.reset();
    shadowCount.calls = 0;
    shadowCount.triangles = 0;
    if (frameRenderer) frameRenderer(delta, alpha);
    else renderer.render(scene, camera);
    view.framesDrawn += 1;
  }

  /**
   * Fits the drawing buffer and the camera to the canvas's size on the page. Cheap when nothing
   * changed; called before every frame and from the window's resize event.
   * @param {boolean} [force] Apply even when the size looks unchanged.
   * @returns {boolean} True when the size or the pixel ratio changed.
   */
  function resize(force = false) {
    const width = Math.max(1, canvas.clientWidth || canvas.width);
    const height = Math.max(1, canvas.clientHeight || canvas.height);
    const pixelRatio = pixelRatioFor(globalThis.devicePixelRatio || 1, view.pixelRatioCap, view.pixelRatioFloor);
    if (!force && width === view.width && height === view.height && pixelRatio === view.pixelRatio) return false;
    view.width = width;
    view.height = height;
    view.pixelRatio = pixelRatio;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const size = { width, height, pixelRatio };
    for (const listener of [...resizeListeners]) listener(size);
    return true;
  }

  /**
   * Changes the pixel ratio cap (a quality tier change).
   * @param {number} cap The new cap.
   */
  function setPixelRatioCap(cap, floor = 1) {
    view.pixelRatioCap = cap;
    view.pixelRatioFloor = floor;
    resize();
  }

  /**
   * Subscribes to size changes.
   * @param {(size: {width: number, height: number, pixelRatio: number}) => void} listener
   * @returns {() => void} Call it to unsubscribe.
   */
  function onResize(listener) {
    resizeListeners.add(listener);
    return () => resizeListeners.delete(listener);
  }

  /**
   * The draw statistics of the last frame: all passes together, and the share of the sun's
   * shadow passes in them. The same object every call.
   * @returns {{drawCalls: number, triangles: number, shadowDrawCalls: number, shadowTriangles: number,
   *   geometries: number, textures: number, programs: number}}
   */
  function drawStatistics() {
    statistics.drawCalls = renderer.info.render.calls;
    statistics.triangles = renderer.info.render.triangles;
    statistics.shadowDrawCalls = shadowCount.calls;
    statistics.shadowTriangles = shadowCount.triangles;
    statistics.geometries = renderer.info.memory.geometries;
    statistics.textures = renderer.info.memory.textures;
    statistics.programs = renderer.info.programs ? renderer.info.programs.length : 0;
    return statistics;
  }

  /** Frees the renderer. */
  function dispose() {
    resizeListeners.clear();
    frameRenderer = null;
    renderer.dispose();
  }

  resize(true);
  return view;
}

function namedGroup(name) {
  const group = new THREE.Group();
  group.name = name;
  return group;
}
