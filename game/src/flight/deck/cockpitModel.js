// The cockpit model in the scene: the full interior the pilot sees from the seat (an asset of
// COCKPIT_ASSETS, built in Blender in the aircraft's own frame), fetched when the lead boards,
// parented under the aircraft's drawn root at identity and shown only in the cockpit view.
// While it shows:
// - the aircraft's own low-detail interior, its panel quad, an opening canopy and its dark glass
//   are not drawn (the wings and the nose stay, to be seen through the windows);
// - light: the cockpit's materials take the scene's sun, sky and environment like everything else,
//   plus a fill of their own tied to the sky's colour (a uniform on the cockpit's materials only: no
//   scene light is added, so no shader recompiles); two small real lights of the atmosphere's fixed
//   pool sit at the `glow_panel` and `glow_console` anchors and throw the instruments' colour on
//   the panel surround, the glare shield and the gloves, stronger at night; where the shadow maps
//   are fine enough the interior casts the sun's shadows itself (the frames fall across the dash)
//   and the aircraft's merged shadow caster, whose glass is solid, rests;
// - the canopy glass reflects the sky faintly and never darkens the view;
// - the instrument faces and the combiner HUD are live canvases (cockpitDisplays.js);
// - the stick tilts with the pilot's pitch and roll (a yoke turns its wheel and slides instead),
//   the throttles turn with the lever, the hands
//   ride them and sway a little with breath and with the airframe on the takeoff roll.
// Everything is tolerant: a missing file, node or atmosphere leaves today's view untouched.
import * as THREE from 'three';
import { AssetLibrary } from '../../assets/AssetLibrary.js';
import { COCKPIT_ASSETS, COCKPIT_OF_AIRCRAFT } from '../../assets/registry/aircraft.js';
import { COCKPIT_RENDER_ORDER, createCockpitDisplays, createCombinerHud, meshesNamed } from './cockpitDisplays.js';
import {
  COCKPIT_LIGHTING, COCKPIT_MOTION, COCKPIT_NODES, EXTERIOR_HIDDEN, cabinVibration, cockpitFramingOf, controlAngles, easeControlPose,
  interiorLightOf, swayOffset,
} from './cockpitTuning.js';

/** A material that draws nothing and casts nothing: what a hidden exterior part wears. */
const HIDDEN = new THREE.MeshBasicMaterial({ name: 'cockpit_view_hidden', visible: false });
const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);
const NO_FRAMING = Object.freeze({ x: null, y: null, z: null, fovDegrees: null, gazeRadians: null });
/** @type {WeakMap<object, {fill: {value: THREE.Color}, glass: THREE.Material[]}>} */
const preparedAssets = new WeakMap();

/** The first node of that name under an instance (the loader keeps the file's name in userData too). */
function nodeNamed(instance, name) {
  let found = null;
  instance.traverse((node) => { if (!found && (node.name === name || node.userData?.name === name)) found = node; });
  return found;
}

/** A node's place in the instance's frame. */
function placeInModel(node, instance, out) {
  out.set(0, 0, 0);
  for (let each = node; each && each !== instance; each = each.parent) {
    each.updateMatrix();
    out.applyMatrix4(each.matrix);
  }
  return out;
}

/**
 * Prepares a cockpit asset's materials once: the fill uniform on the lit ones, the canopy glass.
 * @param {import('../../assets/Asset.js').Asset} asset
 */
function prepareCockpitAsset(asset) {
  let prepared = preparedAssets.get(asset);
  if (prepared) return prepared;
  prepared = { fill: { value: new THREE.Color(0, 0, 0) }, glass: [] };
  const unlit = new Set();
  const glass = new Set();
  for (const mesh of meshesNamed(asset.scene, COCKPIT_NODES.glass)) glass.add(mesh.material);
  for (const mesh of meshesNamed(asset.scene, COCKPIT_NODES.combiner)) unlit.add(mesh.material);
  asset.scene.traverse((node) => {
    if (node.isMesh && (node.material?.name === 'screen_live' || node.material?.name === 'hud_glass')) unlit.add(node.material);
    if (node.isMesh && node.material?.name === 'canopy_glass') glass.add(node.material);
  });
  for (const material of glass) {
    material.transparent = true;
    material.depthWrite = false;
    material.side = THREE.DoubleSide;
    material.opacity = Math.min(material.opacity ?? 1, COCKPIT_LIGHTING.glassOpacity);
    if ('roughness' in material) material.roughness = Math.min(material.roughness, 0.08);
    if ('metalness' in material) material.metalness = 0;
    material.userData.role = 'glass';
    prepared.glass.push(material);
  }
  for (const material of asset.allMaterials()) {
    if (glass.has(material) || unlit.has(material) || !material.isMeshStandardMaterial) continue;
    const fill = prepared.fill;
    if (material.aoMap) material.aoMapIntensity = COCKPIT_LIGHTING.occlusionStrength;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uCockpitFill = fill;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uCockpitFill;')
        .replace('#include <lights_fragment_begin>', '#include <lights_fragment_begin>\n#if defined( RE_IndirectDiffuse )\n\tirradiance += uCockpitFill;\n#endif');
    };
    material.customProgramCacheKey = () => 'cockpit-fill';
    material.needsUpdate = true;
  }
  preparedAssets.set(asset, prepared);
  return prepared;
}

/**
 * Creates the cockpit models of the flight deck.
 * @param {import('../../core/systems/gameContext.js').GameContext} context
 * @returns {{has: (aircraftId: string) => boolean, ready: (aircraftId: string) => boolean,
 *   request: (aircraftId: string) => Promise<boolean>, attach: Function, release: (aircraftId: string) => void,
 *   dispose: () => void}}
 */
export function createCockpitModels(context) {
  const log = context.log?.child?.('cockpit') ?? null;
  /** @type {AssetLibrary | null} */
  let library = null;
  const failed = new Set();
  const pending = new Map();
  /** The models someone flies or is about to (asked for and not released). */
  const wanted = new Set();

  const idOf = (aircraftId) => (aircraftId && Object.hasOwn(COCKPIT_OF_AIRCRAFT, aircraftId) ? COCKPIT_OF_AIRCRAFT[aircraftId] : null);

  function libraryNow() {
    if (!library) {
      const main = context.assets ?? null;
      library = new AssetLibrary({
        registry: COCKPIT_ASSETS, renderer: context.view?.renderer ?? undefined, baseUrl: main?.baseUrl,
        environmentIntensity: main?.materialOptions?.environmentIntensity, glassEnvironmentIntensity: main?.materialOptions?.glassEnvironmentIntensity,
      });
    }
    return library;
  }

  /** True when the sun's shadow maps are fine enough for the frames to shadow the dash. */
  function frameShadowsWanted() {
    const quality = context.quality?.tier?.atmosphere;
    const shadows = typeof quality === 'string' ? quality : quality?.shadows ?? quality?.level ?? 'high';
    return COCKPIT_LIGHTING.frameShadowQualities.includes(shadows);
  }

  return {
    /** True when the aircraft has a cockpit model registered (and it has not failed to load). */
    has(aircraftId) {
      const id = idOf(aircraftId);
      return id !== null && Object.hasOwn(COCKPIT_ASSETS, id) && !failed.has(id);
    },
    /** True when the aircraft's cockpit model is in memory. */
    ready(aircraftId) {
      const id = idOf(aircraftId);
      return id !== null && library !== null && library.has(id);
    },
    /**
     * Fetches the aircraft's cockpit model (once). Resolves false when it has none or it failed.
     * @param {string} aircraftId The aircraft's asset id.
     */
    request(aircraftId) {
      const id = idOf(aircraftId);
      if (id === null || !Object.hasOwn(COCKPIT_ASSETS, id) || failed.has(id)) return Promise.resolve(false);
      const assets = libraryNow();
      wanted.add(id);
      if (assets.has(id)) return Promise.resolve(true);
      if (!pending.has(id)) {
        pending.set(id, assets.load([id]).then(() => {
          // (the lead may have left the aircraft while the file was on its way)
          if (!wanted.has(id)) { assets.dispose(id); return false; }
          try { assets.warmUp([id]); } catch { /* the textures upload on first use instead */ }
          return true;
        }).catch((error) => {
          failed.add(id);
          log?.warn?.(`cockpit model "${id}" unavailable, keeping the aircraft's own interior: ${error?.message ?? error}`);
          return false;
        }).finally(() => pending.delete(id)));
      }
      return pending.get(id);
    },
    /** Frees the aircraft's cockpit model (its instances must be disposed first). */
    release(aircraftId) {
      const id = idOf(aircraftId);
      if (id === null) return;
      wanted.delete(id);
      if (library && library.has(id)) library.dispose(id);
    },
    /**
     * Puts the loaded cockpit model on an aircraft.
     * @param {string} aircraftId The aircraft's asset id.
     * @param {THREE.Object3D} root The aircraft's drawn root (vehicles.modelOf).
     * @param {string} cockpitKind The catalog's flight.cockpit.
     * @param {{stallClean: number, stallFlaps: number, neverExceed: number} | null} speeds Airspeed arcs, knots.
     * @returns {ReturnType<typeof attachCockpit> | null} Null when the model is not in memory.
     */
    attach(aircraftId, root, cockpitKind, speeds) {
      const id = idOf(aircraftId);
      if (id === null || !library || !library.has(id) || !root) return null;
      try {
        return attachCockpit(context, library.get(id), root, cockpitKind, speeds, frameShadowsWanted());
      } catch (error) {
        failed.add(id);
        log?.warn?.(`cockpit model "${id}" could not be attached: ${error?.message ?? error}`);
        return null;
      }
    },
    dispose() {
      if (library) library.disposeAll();
      library = null;
    },
  };
}

/**
 * One cockpit model on one aircraft.
 * @param {import('../../core/systems/gameContext.js').GameContext} context
 * @param {import('../../assets/Asset.js').Asset} asset The cockpit asset.
 * @param {THREE.Object3D} root The aircraft's drawn root.
 * @param {string} cockpitKind
 * @param {object | null} speeds
 * @param {boolean} frameShadows The interior casts the sun's shadows.
 */
function attachCockpit(context, asset, root, cockpitKind, speeds, frameShadows) {
  const prepared = prepareCockpitAsset(asset);
  const document = context.page.document;
  const instance = asset.instantiate();
  instance.name = 'cockpit_interior';
  instance.visible = false;

  // The eye and the lens.
  const eyeNode = nodeNamed(instance, COCKPIT_NODES.eye);
  const place = new THREE.Vector3();
  const framing = cockpitFramingOf(asset.extras, eyeNode ? placeInModel(eyeNode, instance, place).clone() : null, NO_FRAMING);
  const eye = framing.x === null ? null : new THREE.Vector3(framing.x, framing.y, framing.z);

  // Shadows: the glass never casts; the rest casts only where the maps are fine enough.
  const glassMeshes = meshesNamed(instance, COCKPIT_NODES.glass);
  instance.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = frameShadows && !prepared.glass.includes(node.material);
    node.receiveShadow = true;
    node.frustumCulled = false; // the camera sits inside it
  });
  for (const mesh of glassMeshes) {
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.renderOrder = COCKPIT_RENDER_ORDER.canopy;
  }

  // The live glass.
  const anisotropy = Math.min(8, context.view?.renderer?.capabilities?.getMaxAnisotropy?.() ?? 1);
  const displays = createCockpitDisplays(document, instance, cockpitKind, speeds, anisotropy);
  const combiner = createCombinerHud(document, instance, eye ?? fallbackEyeOf(instance, place));

  // The controls and the hands.
  const mover = (name) => {
    const node = nodeNamed(instance, name);
    return node ? { node, rest: node.quaternion.clone(), at: node.position.clone() } : null;
  };
  const stick = mover(COCKPIT_NODES.stick);
  const throttles = mover(COCKPIT_NODES.throttles);
  const handStick = mover(COCKPIT_NODES.handStick);
  const handThrottle = mover(COCKPIT_NODES.handThrottle);
  const pose = { pitch: 0, roll: 0, throttle: 0 };
  const angles = { stickX: 0, stickZ: 0, throttleX: 0, yokeZ: 0, yokePull: 0 };
  // A yoke (its origin at the wheel's hub) turns about its column, along the nose, and slides in and out.
  const yoke = Boolean(stick && asset.extras?.stick_kind === 'yoke');
  const sway = { x: 0, y: 0, z: 0 };
  const turnA = new THREE.Quaternion();
  const turnB = new THREE.Quaternion();

  // The instruments' glow: two lights of the atmosphere's fixed pool, parked dark until shown.
  const atmosphere = context.atmosphere ?? null;
  const glows = [];
  for (const [name, key] of [[COCKPIT_NODES.glowPanel, 'glowPanel'], [COCKPIT_NODES.glowConsole, 'glowConsole']]) {
    const node = nodeNamed(instance, name);
    if (!node || typeof atmosphere?.addLight !== 'function') continue;
    const light = atmosphere.addLight({
      kind: 'point', position: [0, -500, 0], color: 0xffffff, intensity: 0, range: COCKPIT_LIGHTING.glowRange,
      importance: COCKPIT_LIGHTING.glowImportance, nightOnly: false, pool: false, glow: 0, beam: 0,
    });
    if (!light) continue;
    light.enabled = false;
    glows.push({ light, key, local: placeInModel(node, instance, place).clone() });
  }

  // What of the aircraft's own model rests while the cockpit shows.
  const hiddenNodes = [];
  const hiddenGlass = [];
  let shadowCaster = null;
  const walk = (node) => {
    if (node === instance) return;
    if (EXTERIOR_HIDDEN.nodes.includes(node.name)) hiddenNodes.push({ node, visible: node.visible });
    if (node.isMesh && node.name === 'shadow_caster') shadowCaster = { mesh: node, material: node.material };
    else if (node.isMesh && !Array.isArray(node.material) && EXTERIOR_HIDDEN.glassMaterial.test(node.material?.name ?? '')) {
      hiddenGlass.push({ mesh: node, material: node.material });
    }
    for (const child of node.children) walk(child);
  };
  walk(root);
  root.add(instance);

  const light = { fill: [0, 0, 0], glow: [0, 0, 0], glowPanel: 0, glowConsole: 0, display: 1, hud: 1, glassReflection: 1 };
  let shown = false;
  let live = true;
  let time = 0;

  function setShown(on) {
    if (!live || on === shown) return;
    shown = on;
    instance.visible = on;
    for (const each of hiddenNodes) each.node.visible = on ? false : each.visible;
    for (const each of hiddenGlass) {
      if (on) { each.material = each.mesh.material === HIDDEN ? each.material : each.mesh.material; each.mesh.material = HIDDEN; }
      else if (each.mesh.material === HIDDEN) each.mesh.material = each.material;
    }
    if (shadowCaster && frameShadows) {
      if (on) shadowCaster.mesh.material = HIDDEN;
      else if (shadowCaster.mesh.material === HIDDEN) shadowCaster.mesh.material = shadowCaster.material;
    }
    for (const glow of glows) {
      glow.light.enabled = on;
      if (!on) { glow.light.intensity = 0; glow.light.position.set(0, -500, 0); }
    }
  }

  return {
    /** The instance under the aircraft's root. */
    instance,
    /** The pilot's eye in the aircraft's frame, the lens (degrees) and the resting gaze (radians); null fields fall back. */
    framing: { eye, fovDegrees: framing.fovDegrees, gazeRadians: framing.gazeRadians },
    /** True when the model has a combiner glass (the screen then paints no ladder or tapes). */
    hasCombiner: combiner !== null,
    hasDisplays: displays !== null,
    frameShadows,
    get shown() { return shown; },
    setShown,
    /** Repaints the instrument faces (the panel rate). */
    paintDisplays(readout, extra) { if (displays) displays.paint(readout, extra); },
    /** Repaints the combiner's symbology (every frame, for the ladder). */
    paintCombiner(readout, options) { if (combiner) combiner.paint(readout, options); },
    /**
     * Light, controls and hands for this frame. Call after the aircraft's root has its pose of the
     * frame (a late update): the glow lights are placed from it.
     * @param {number} dt Frame seconds.
     * @param {object | null} readout The instrument readout.
     * @param {{pitch?: number, roll?: number, throttle?: number} | null} input The aircraft's controls.
     */
    update(dt, readout, input) {
      if (!live || !shown) return;
      time += dt;
      interiorLightOf(atmosphere?.state ?? null, cockpitKind, light);
      prepared.fill.value.setRGB(light.fill[0], light.fill[1], light.fill[2]);
      for (const material of prepared.glass) material.envMapIntensity = light.glassReflection;
      if (displays) displays.setLevel(light.display);
      if (combiner) combiner.setLevel(light.hud);
      for (const glow of glows) {
        glow.light.position.copy(glow.local).applyQuaternion(root.quaternion).add(root.position);
        glow.light.color.setRGB(light.glow[0], light.glow[1], light.glow[2]);
        glow.light.intensity = light[glow.key];
      }
      // Stick: tilted in the aircraft's frame; throttles: turned about their own X.
      easeControlPose(pose, input, dt);
      controlAngles(pose, angles);
      if (yoke) {
        turnB.setFromAxisAngle(AXIS_Z, angles.yokeZ);
        stick.node.quaternion.copy(turnB).multiply(stick.rest);
        stick.node.position.set(stick.at.x, stick.at.y, stick.at.z + angles.yokePull);
      } else if (stick) {
        turnA.setFromAxisAngle(AXIS_X, angles.stickX);
        turnB.setFromAxisAngle(AXIS_Z, angles.stickZ);
        stick.node.quaternion.copy(turnA).multiply(turnB).multiply(stick.rest);
      }
      if (throttles) throttles.node.quaternion.copy(throttles.rest).multiply(turnA.setFromAxisAngle(AXIS_X, angles.throttleX));
      const vibration = cabinVibration(readout);
      if (handStick) {
        swayOffset(time, vibration, 0, COCKPIT_MOTION.handShake, COCKPIT_MOTION.breath, sway);
        handStick.node.position.set(handStick.at.x + sway.x, handStick.at.y + sway.y, handStick.at.z + sway.z);
      }
      if (handThrottle) {
        swayOffset(time, vibration, 1, COCKPIT_MOTION.handShake, COCKPIT_MOTION.breath, sway);
        handThrottle.node.position.set(handThrottle.at.x + sway.x, handThrottle.at.y + sway.y, handThrottle.at.z + sway.z);
      }
      swayOffset(time, vibration, 2, COCKPIT_MOTION.cabinShake, 0, sway);
      instance.position.set(sway.x, sway.y, sway.z);
    },
    /** Takes the model off the aircraft; everything of the aircraft's own comes back. */
    dispose() {
      if (!live) return;
      setShown(false);
      live = false;
      instance.removeFromParent();
      if (displays) displays.dispose();
      if (combiner) combiner.dispose();
      if (typeof atmosphere?.removeLight === 'function') for (const glow of glows) atmosphere.removeLight(glow.light);
    },
  };
}

/** Where the eye is taken to be when the model names none: its bounds' middle, a little up and back. */
function fallbackEyeOf(instance, scratch) {
  const box = new THREE.Box3().setFromObject(instance);
  if (box.isEmpty()) return { x: 0, y: 1.2, z: 0 };
  box.getCenter(scratch);
  return { x: scratch.x, y: scratch.y + 0.35, z: scratch.z + 0.3 };
}
