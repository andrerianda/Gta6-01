// The night lights of MARAZUL. Other systems register every lamp they own (street lamps, shop
// fronts, neon, headlamps, emergency light bars) and this manager decides, each frame, how each is
// shown: the nearest and most important few get a real spot or point light that illuminates the
// materials around them; all of them get a glow sprite; those near the camera that have no real
// light get a soft pool of light on the ground and, in haze or rain, a visible beam.
//
// The number of real lights is fixed per quality level, so lit shaders never recompile when lamps
// come and go, and a lamp fades between "real" and "pool" over a quarter of a second, so the swap
// is invisible.
//
//   const lamp = lights.add({ kind: 'spot', position: [12, 8, -40], direction: [0, -1, 0],
//                             color: 0xffd9a0, intensity: 320, range: 26, groundY: 0.1 });
//   lamp.position.set(...)        // moving lights: just move the handle's vectors
//   lights.remove(lamp);
//
// Intensities are in candela in the game's exposure scale: a street lamp (8 m mast) is about 500,
// a shop front 100 to 150, a dipped headlamp 900 in a narrow cone (angle 0.24, aimed 4 degrees
// down), a neon sign 150, an emergency strobe 250. `groundY` must be the height of the ground
// under the light: the pool and the wet-road reflection are drawn there.

import * as THREE from 'three';
import { createLightGlowLayer, MAX_CONES, MAX_GLOWS, MAX_POOLS } from './lightGlowLayer.js';
import { LOCAL_LIGHT_BUDGETS, scoreLocalLight, selectTopScores } from './localLightBudget.js';

/**
 * @typedef {Object} LocalLightDescription
 * @property {'point' | 'spot'} [kind] Default 'point'.
 * @property {THREE.Vector3 | number[]} position World position of the source.
 * @property {THREE.Vector3 | number[]} [direction] Unit direction of a spot's beam; default straight down.
 * @property {THREE.ColorRepresentation} [color] Default warm white.
 * @property {number} [intensity] Candela; default 300.
 * @property {number} [range] Metres the light reaches; default 24.
 * @property {number} [angle] Half angle of a spot's cone in radians; default 1.0.
 * @property {number} [penumbra] Softness of the cone's edge, 0 to 1; default 0.6.
 * @property {number} [importance] Priority for a real light; 1 is an ordinary lamp, 3 the player's headlamps.
 * @property {boolean} [nightOnly] True (default) switches the light on at dusk and off at dawn.
 * @property {number} [groundY] Height of the ground under the light, for its pool; default 0.
 * @property {boolean} [pool] Draw a ground pool when the light is not real; default true.
 * @property {number} [glow] Brightness of the glow sprite; 0 hides it; default 1.
 * @property {number} [glowSize] Radius of the glow sprite in metres; default from the intensity.
 * @property {number} [beam] Visibility of the beam cone in haze, 0 (none, default) to 1.
 * @property {{period: number, duty: number, phase?: number}} [blink] Strobe: seconds per cycle,
 *   fraction of it lit, and a phase offset (0..1) to alternate two lights.
 * @property {number} [flicker] 0 (steady, default) to 1 (a failing tube).
 */

/**
 * @typedef {Object} LocalLight A registered light. The owner may change any public field at any
 *   time; `position`, `direction` and `color` are live objects.
 * @property {'point' | 'spot'} kind
 * @property {THREE.Vector3} position
 * @property {THREE.Vector3} direction
 * @property {THREE.Color} color
 * @property {number} intensity
 * @property {number} range
 * @property {number} angle
 * @property {number} penumbra
 * @property {number} importance
 * @property {boolean} nightOnly
 * @property {boolean} enabled
 * @property {number} groundY
 * @property {boolean} pool
 * @property {number} glow
 * @property {number} glowSize
 * @property {number} beam
 * @property {{period: number, duty: number, phase: number} | null} blink
 * @property {number} flicker
 */

const FADE_SECONDS = 0.25;
const GLOW_DISTANCE = 2600;
const POOL_DISTANCE = 260;
const CONE_DISTANCE = 140;
const STREAK_DISTANCE = 220;
/** Radiance of asphalt per unit of irradiance: the albedo the fake pools assume, over pi. */
const POOL_REFLECTANCE = 0.03;
/** Owner, 18 Nov: a night street is discrete warm pools that fall off within 6 to 10 m with dark
 * ground between them, not a continuous wash. A pool is at most this wide (metres, radius)... */
const POOL_MAX_RADIUS = 8;
/** ...and falls off like a lamp at most this high over it, so it is bright under the lamp only. */
const POOL_SHAPE_HEIGHT = 4.5;
/** Wet streaks: narrower and fainter than a mirror would make them, so they read as streaks. */
const STREAK_WIDTH = 0.5;
const STREAK_STRENGTH = 0.6;

/**
 * Creates the local light manager and adds its real lights and its glow layer to the scene.
 * @param {THREE.Scene} scene The game scene.
 * @param {keyof typeof LOCAL_LIGHT_BUDGETS} [quality] The starting real-light budget.
 * @returns {{
 *   group: THREE.Group,
 *   count: number,
 *   realSpotCount: number,
 *   realPointCount: number,
 *   glowCount: number,
 *   poolCount: number,
 *   beamCount: number,
 *   add: (description: LocalLightDescription) => LocalLight,
 *   remove: (light: LocalLight) => void,
 *   clear: () => void,
 *   setQuality: (level: keyof typeof LOCAL_LIGHT_BUDGETS) => void,
 *   update: (deltaSeconds: number, camera: THREE.PerspectiveCamera, frame: {nightFactor: number, time: number, exposure: number, beamVisibility: number, wetness: number, viewportHeight: number}) => void,
 *   describeRealLights: () => {kind: string, light: LocalLight, weight: number}[],
 *   dispose: () => void,
 * }}
 */
export function createLocalLightManager(scene, quality = 'high') {
  const group = new THREE.Group();
  group.name = 'marazul-local-lights';
  scene.add(group);
  const glowLayer = createLightGlowLayer();
  group.add(glowLayer.group);

  /** @type {LocalLight[]} */
  const lights = [];
  const spotSlots = [];
  const pointSlots = [];
  let scores = new Float32Array(256);
  const chosen = new Int32Array(32);
  const pending = [];
  const view = { x: 0, y: 0, z: 0, forwardX: 0, forwardY: 0, forwardZ: -1 };
  const forward = new THREE.Vector3();
  let nextSeed = 1;

  const manager = {
    group,
    count: 0,
    realSpotCount: 0,
    realPointCount: 0,
    glowCount: 0,
    poolCount: 0,
    beamCount: 0,
    add,
    remove,
    clear,
    setQuality,
    update,
    describeRealLights,
    dispose,
  };

  /** Registers a light and returns its live handle. */
  function add(description) {
    const seed = nextSeed;
    nextSeed += 1;
    const intensity = description.intensity ?? 300;
    const light = {
      kind: description.kind === 'spot' ? 'spot' : 'point',
      position: toVector(description.position, 0, 0, 0),
      direction: toVector(description.direction, 0, -1, 0).normalize(),
      color: new THREE.Color(description.color ?? 0xffe2b8),
      intensity,
      range: description.range ?? 24,
      angle: description.angle ?? 1.0,
      penumbra: description.penumbra ?? 0.6,
      importance: description.importance ?? 1,
      nightOnly: description.nightOnly ?? true,
      enabled: true,
      groundY: description.groundY ?? 0,
      pool: description.pool ?? true,
      glow: description.glow ?? 1,
      glowSize: description.glowSize ?? 0.32 + 0.016 * Math.sqrt(intensity),
      beam: description.beam ?? 0,
      blink: description.blink
        ? { period: description.blink.period, duty: description.blink.duty, phase: description.blink.phase ?? 0 }
        : null,
      flicker: description.flicker ?? 0,
      // Internal state.
      index: lights.length,
      slot: null,
      level: 0,
      // Lamps do not all switch on at the same instant at dusk.
      threshold: 0.3 + 0.35 * fract(seed * 0.6180339887),
      seed,
    };
    lights.push(light);
    manager.count = lights.length;
    if (lights.length > scores.length) scores = new Float32Array(scores.length * 2);
    return light;
  }

  /** Unregisters a light. */
  function remove(light) {
    const index = light.index;
    if (index < 0 || lights[index] !== light) return;
    if (light.slot) {
      light.slot.owner = null;
      light.slot.weight = 0;
      light.slot = null;
    }
    const last = lights.pop();
    if (last !== light) {
      lights[index] = last;
      last.index = index;
    }
    light.index = -1;
    manager.count = lights.length;
  }

  /** Unregisters every light. */
  function clear() {
    while (lights.length > 0) remove(lights[lights.length - 1]);
  }

  /** Sets the real-light budget. Lit shaders recompile once because the light counts change. */
  function setQuality(level) {
    const budget = LOCAL_LIGHT_BUDGETS[level] ?? LOCAL_LIGHT_BUDGETS.high;
    resizeSlots(spotSlots, budget.spots, true);
    resizeSlots(pointSlots, budget.points, false);
    manager.realSpotCount = budget.spots;
    manager.realPointCount = budget.points;
  }

  function resizeSlots(slots, count, isSpot) {
    while (slots.length > count) {
      const slot = slots.pop();
      if (slot.owner) slot.owner.slot = null;
      group.remove(slot.light);
      if (isSpot) group.remove(slot.light.target);
      slot.light.dispose();
    }
    while (slots.length < count) {
      const light = isSpot ? new THREE.SpotLight(0xffffff, 0, 30, 1, 0.6, 2) : new THREE.PointLight(0xffffff, 0, 30, 2);
      light.castShadow = false;
      light.position.set(0, -1000, 0);
      group.add(light);
      if (isSpot) group.add(light.target);
      slots.push({ light, owner: null, weight: 0, keep: false });
    }
  }

  /**
   * Chooses the real lights and rebuilds the glow layer. Call once per frame before rendering.
   * @param {number} deltaSeconds Time step.
   * @param {THREE.PerspectiveCamera} camera The game camera (world matrix current).
   * @param {{nightFactor: number, time: number, exposure: number, beamVisibility: number, wetness: number, viewportHeight: number}} frame
   *   The night factor (0 day .. 1 night), a clock in seconds, the frame's exposure, how visible
   *   beams are in the air (0 clear .. 1 thick rain), how wet the ground is (0..1) and the
   *   picture height in pixels.
   */
  function update(deltaSeconds, camera, frame) {
    view.x = camera.matrixWorld.elements[12];
    view.y = camera.matrixWorld.elements[13];
    view.z = camera.matrixWorld.elements[14];
    camera.getWorldDirection(forward);
    view.forwardX = forward.x;
    view.forwardY = forward.y;
    view.forwardZ = forward.z;

    // 1. Each light's level right now.
    for (let i = 0; i < lights.length; i += 1) {
      const light = lights[i];
      let level = light.enabled ? light.intensity : 0;
      if (level > 0 && light.nightOnly) {
        level *= smoothstep(light.threshold, light.threshold + 0.1, frame.nightFactor);
      }
      if (level > 0 && light.blink) {
        const cycle = fract(frame.time / light.blink.period + light.blink.phase);
        level *= cycle < light.blink.duty ? 1 : 0;
      }
      if (level > 0 && light.flicker > 0) {
        const noise = Math.sin(frame.time * 31 + light.seed * 12.9898) * Math.sin(frame.time * 17.3 + light.seed * 4.1);
        level *= 1 - light.flicker * (noise > 0.35 ? 0.85 : 0);
      }
      light.level = level;
    }

    // 2. The real lights.
    assignSlots('spot', spotSlots, deltaSeconds);
    assignSlots('point', pointSlots, deltaSeconds);

    // 3. Sprites, pools and beams for everything in range.
    writeGlowLayer(camera, frame);
  }

  function assignSlots(kind, slots, deltaSeconds) {
    const count = lights.length;
    for (let i = 0; i < count; i += 1) {
      const light = lights[i];
      scores[i] =
        light.kind === kind
          ? scoreLocalLight(
              light.position.x, light.position.y, light.position.z,
              light.range, light.level, light.importance, light.slot !== null, view,
            )
          : 0;
    }
    const kept = selectTopScores(scores, count, Math.min(slots.length, chosen.length), chosen);

    for (let s = 0; s < slots.length; s += 1) slots[s].keep = false;
    pending.length = 0;
    for (let k = 0; k < kept; k += 1) {
      const light = lights[chosen[k]];
      if (light.slot) light.slot.keep = true;
      else pending.push(light);
    }

    const fade = deltaSeconds / FADE_SECONDS;
    for (let s = 0; s < slots.length; s += 1) {
      const slot = slots[s];
      if (!slot.owner) continue;
      if (slot.keep) {
        slot.weight = Math.min(1, slot.weight + fade);
      } else {
        slot.weight -= fade;
        if (slot.weight <= 0) {
          slot.owner.slot = null;
          slot.owner = null;
          slot.weight = 0;
        }
      }
    }
    for (let p = 0; p < pending.length; p += 1) {
      for (let s = 0; s < slots.length; s += 1) {
        const slot = slots[s];
        if (slot.owner) continue;
        slot.owner = pending[p];
        slot.weight = 0;
        pending[p].slot = slot;
        break;
      }
    }

    for (let s = 0; s < slots.length; s += 1) {
      const slot = slots[s];
      const real = slot.light;
      const owner = slot.owner;
      if (!owner || owner.level <= 0) {
        real.intensity = 0;
        continue;
      }
      real.position.copy(owner.position);
      real.color.copy(owner.color);
      real.intensity = owner.level * slot.weight;
      real.distance = owner.range;
      if (real.isSpotLight) {
        real.angle = Math.min(owner.angle, 1.5);
        real.penumbra = owner.penumbra;
        real.target.position.copy(owner.position).add(owner.direction);
      }
    }
  }

  function writeGlowLayer(camera, frame) {
    const { glowPlace, glowColor, poolPlace, poolShape, poolColor, coneApex, coneAxis, coneColor } = glowLayer;
    // Sources stay readable at any exposure: dimmer in the bright day, never blinding at night.
    const glowScale = 2.4 / Math.pow(Math.max(frame.exposure, 0.05), 0.7);
    let glows = 0;
    let pools = 0;
    let cones = 0;

    for (let i = 0; i < lights.length; i += 1) {
      const light = lights[i];
      if (light.level <= 0) continue;
      const dx = light.position.x - view.x;
      const dy = light.position.y - view.y;
      const dz = light.position.z - view.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const on = Math.min(1, light.level / Math.max(light.intensity, 1e-3));
      const r = light.color.r;
      const g = light.color.g;
      const b = light.color.b;

      if (light.glow > 0 && distance < GLOW_DISTANCE && glows < MAX_GLOWS) {
        const far = 1 - smoothstep(GLOW_DISTANCE * 0.7, GLOW_DISTANCE, distance);
        const strength = light.glow * on * glowScale * far;
        glowPlace[glows * 4] = light.position.x;
        glowPlace[glows * 4 + 1] = light.position.y;
        glowPlace[glows * 4 + 2] = light.position.z;
        glowPlace[glows * 4 + 3] = light.glowSize;
        glowColor[glows * 3] = r * strength;
        glowColor[glows * 3 + 1] = g * strength;
        glowColor[glows * 3 + 2] = b * strength;
        glows += 1;
      }

      const realWeight = light.slot ? light.slot.weight : 0;
      if (light.pool && realWeight < 0.999 && distance < POOL_DISTANCE && pools < MAX_POOLS) {
        const near = (1 - smoothstep(POOL_DISTANCE * 0.6, POOL_DISTANCE, distance)) * (1 - realWeight);
        const height = Math.max(0.3, light.position.y - light.groundY);
        const downward = light.kind === 'point' || light.direction.y < -0.55;
        if (downward) {
          // A lamp over the ground: a round pool under it, as wide as its cone or reach allows.
          const reach = Math.sqrt(Math.max(light.range * light.range - height * height, 0));
          const radius = Math.min(
            POOL_MAX_RADIUS,
            light.kind === 'spot' ? Math.min(reach, height * Math.tan(Math.min(light.angle, 0.9)) * 0.95) : Math.min(reach, height * 2.4),
          );
          if (radius > 0.2) {
            const peak = (light.level / (height * height)) * POOL_REFLECTANCE * near;
            poolPlace[pools * 4] = light.position.x - (light.direction.x / Math.min(light.direction.y, -0.2)) * height * (light.kind === 'spot' ? 1 : 0);
            poolPlace[pools * 4 + 1] = light.groundY;
            poolPlace[pools * 4 + 2] = light.position.z - (light.direction.z / Math.min(light.direction.y, -0.2)) * height * (light.kind === 'spot' ? 1 : 0);
            poolPlace[pools * 4 + 3] = 0;
            poolShape[pools * 4] = radius;
            poolShape[pools * 4 + 1] = radius;
            poolShape[pools * 4 + 2] = Math.min(height, POOL_SHAPE_HEIGHT) / radius;
            poolShape[pools * 4 + 3] = 0;
            poolColor[pools * 3] = r * peak;
            poolColor[pools * 3 + 1] = g * peak;
            poolColor[pools * 3 + 2] = b * peak;
            pools += 1;
          }
        } else {
          // A beam thrown forward (headlamps): a long pool on the road ahead.
          const horizontal = Math.hypot(light.direction.x, light.direction.z);
          if (horizontal > 0.05 && height < 4) {
            const length = Math.min(light.range * 0.75, 30);
            const peak = light.level * 0.00016 * near;
            poolPlace[pools * 4] = light.position.x + (light.direction.x / horizontal) * length * 0.5;
            poolPlace[pools * 4 + 1] = light.groundY;
            poolPlace[pools * 4 + 2] = light.position.z + (light.direction.z / horizontal) * length * 0.5;
            poolPlace[pools * 4 + 3] = Math.atan2(light.direction.z, light.direction.x);
            poolShape[pools * 4] = length * 0.5;
            poolShape[pools * 4 + 1] = Math.min(3.4, Math.max(1.1, length * 0.5 * Math.tan(Math.min(light.angle, 0.8) * 0.6)));
            poolShape[pools * 4 + 2] = 0;
            poolShape[pools * 4 + 3] = 0;
            poolColor[pools * 3] = r * peak;
            poolColor[pools * 3 + 1] = g * peak;
            poolColor[pools * 3 + 2] = b * peak;
            pools += 1;
          }
        }
      }

      // On wet ground every lamp the camera can see leaves a streak of reflection that runs from
      // under the lamp toward the viewer. A real light makes its own highlight on the gloss.
      const cameraHeight = view.y - light.groundY;
      const lampHeight = light.position.y - light.groundY;
      if (
        frame.wetness > 0.05 && light.glow > 0 && realWeight < 0.999 && distance < STREAK_DISTANCE &&
        cameraHeight > 0.3 && lampHeight > 0.15 && pools < MAX_POOLS
      ) {
        // Where the mirror image of the lamp is seen on the ground plane.
        const t = cameraHeight / (cameraHeight + lampHeight);
        const px = view.x + dx * t;
        const pz = view.z + dz * t;
        const reach = Math.hypot(px - view.x, pz - view.z);
        if (reach > 0.5) {
          const near = 1 - smoothstep(STREAK_DISTANCE * 0.6, STREAK_DISTANCE, distance);
          const grazing = Math.min(1, reach / (cameraHeight * 6));
          const strength = STREAK_STRENGTH * light.glow * on * glowScale * frame.wetness * near * (1 - realWeight) * (0.2 + 0.55 * grazing);
          poolPlace[pools * 4] = px;
          poolPlace[pools * 4 + 1] = light.groundY;
          poolPlace[pools * 4 + 2] = pz;
          poolPlace[pools * 4 + 3] = Math.atan2(pz - view.z, px - view.x);
          // Gloss spreads the mirror image along the line of sight: the flatter the view, the longer.
          poolShape[pools * 4] = Math.min((0.07 * reach * reach) / cameraHeight, reach * 0.85, 45);
          poolShape[pools * 4 + 1] = STREAK_WIDTH * (light.glowSize * 1.5 + 0.035 * reach);
          poolShape[pools * 4 + 2] = -1;
          poolShape[pools * 4 + 3] = 0;
          poolColor[pools * 3] = r * strength;
          poolColor[pools * 3 + 1] = g * strength;
          poolColor[pools * 3 + 2] = b * strength;
          pools += 1;
        }
      }

      if (light.kind === 'spot' && light.beam > 0 && frame.beamVisibility > 0.01 && distance < CONE_DISTANCE && cones < MAX_CONES) {
        const near = 1 - smoothstep(CONE_DISTANCE * 0.6, CONE_DISTANCE, distance);
        const strength = light.beam * frame.beamVisibility * near * on * (0.05 + 0.00012 * light.intensity) * glowScale;
        coneApex[cones * 4] = light.position.x;
        coneApex[cones * 4 + 1] = light.position.y;
        coneApex[cones * 4 + 2] = light.position.z;
        coneApex[cones * 4 + 3] = Math.min(light.range * 0.7, 22);
        coneAxis[cones * 4] = light.direction.x;
        coneAxis[cones * 4 + 1] = light.direction.y;
        coneAxis[cones * 4 + 2] = light.direction.z;
        coneAxis[cones * 4 + 3] = Math.tan(Math.min(light.angle, 0.9));
        coneColor[cones * 3] = r * strength;
        coneColor[cones * 3 + 1] = g * strength;
        coneColor[cones * 3 + 2] = b * strength;
        cones += 1;
      }
    }
    glowLayer.commit(glows, pools, cones, camera, frame.viewportHeight);
    manager.glowCount = glows;
    manager.poolCount = pools;
    manager.beamCount = cones;
  }

  /**
   * Lists the lights that hold a real slot right now, for debug overlays (allocates; not for
   * per-frame use).
   * @returns {{kind: string, light: LocalLight, weight: number}[]}
   */
  function describeRealLights() {
    const list = [];
    for (const slot of spotSlots) if (slot.owner) list.push({ kind: 'spot', light: slot.owner, weight: slot.weight });
    for (const slot of pointSlots) if (slot.owner) list.push({ kind: 'point', light: slot.owner, weight: slot.weight });
    return list;
  }

  /** Removes everything from the scene and frees GPU resources. */
  function dispose() {
    clear();
    resizeSlots(spotSlots, 0, true);
    resizeSlots(pointSlots, 0, false);
    glowLayer.dispose();
    scene.remove(group);
  }

  setQuality(quality);
  return manager;
}

function toVector(value, x, y, z) {
  if (value && value.isVector3) return value.clone();
  if (Array.isArray(value)) return new THREE.Vector3(value[0], value[1], value[2]);
  return new THREE.Vector3(x, y, z);
}

function fract(value) {
  return value - Math.floor(value);
}

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
