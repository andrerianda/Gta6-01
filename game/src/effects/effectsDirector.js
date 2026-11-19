// The effects director: what the effects system runs. It owns the particle and decal pools with
// their renderers, the painted atlases and the passing lights, turns a spawn request into the
// recipe's particles, light, mark, shake and sustained emitter, steps everything each frame, and
// before each picture writes the pools into the GPU buffers lit by the atmosphere's state.
// Independent of the engine (a preview page drives it the same way the game does).

import { createDebrisChunks } from './debrisChunks.js';
import { createDecalPool } from './decalPool.js';
import { createDecalRenderer } from './decalRenderer.js';
import { BURN_STAGES, DECAL_CELLS, EFFECT_RECIPES, STYLE_LIST, effectIdFor } from './effectCatalogue.js';
import { createEffectLights } from './effectLights.js';
import { spawnEffectBursts } from './effectSpawning.js';
import { createEffectTextures } from './effectTextures.js';
import { createParticlePool } from './particlePool.js';
import { createParticleRenderer } from './particleRenderer.js';
import { createShellCasings } from './shellCasings.js';
import { createTracerStreaks } from './tracerStreaks.js';

const SUSTAIN_SLOTS = 12;
const LIGHT_SCALE = 0.3;
/** A rocket puff farther than this from the last one starts a new trail (puffs are ~1.9 m apart). */
const ROCKET_PUFF_GAP = 2.6;
/** Metres from the launcher over which a rocket shows only its motor's flame, no smoke yet. */
const ROCKET_MOTOR_ONLY = 3.5;
const FILL_SCALE = 0.55;
/** Step and longest span of the simulation a started fire runs at once (burn's `warm`). */
const WARM_STEP = 1 / 15;
const WARM_MAX = 20;

/**
 * @typedef {Object} EffectsDirectorOptions
 * @property {Document} document For painting the atlases.
 * @property {THREE.Object3D} parent Where the meshes go (the effects layer).
 * @property {object | null} atmosphere The atmosphere facade: lights and `state`.
 * @property {number} maxParticles @property {number} maxDecals Budgets of the quality tier.
 * @property {() => number} random Uniform 0..1 (seeded).
 * @property {(x: number, z: number) => number} [groundHeightAt] Ground under a point; default 0.
 * @property {(strength: number, seconds: number) => void} [shake] Camera shake, when there is one.
 * @property {() => {x: number, z: number} | null} [listener] Where the camera's subject is, for shakes.
 * @property {number} [cellSize] Atlas cell pixels (256; 128 on low quality).
 * @property {number} [maxDebrisPerKind] 3D debris chunks of each kind alive at once (24).
 * @property {number} [maxCasings] Spent cases on the ground at once (40).
 * @property {(vehicleId: *, anchor: string) => ({x: number, y: number, z: number} | null)} [vehicleAnchor]
 *   Where on a vehicle a fire burns ('engine_bay' or 'body'), for burn({vehicleId}).
 */

/**
 * Creates the effects director.
 * @param {EffectsDirectorOptions} options
 */
export function createEffectsDirector(options) {
  const { parent, atmosphere, random } = options;
  const groundHeightAt = options.groundHeightAt ?? (() => 0);
  const textures = createEffectTextures(options.document, options.cellSize ?? 256);
  const lights = createEffectLights(atmosphere);
  const debris = createDebrisChunks(parent, random, options.maxDebrisPerKind ?? 24);
  const casings = createShellCasings(parent, random, options.maxCasings ?? 40);
  const tracers = createTracerStreaks(32);
  parent.add(tracers.mesh);
  // a picture can hold the effects still: ageing stops `freezeIn` seconds of effect time later
  let frozen = false;
  let freezeIn = -1;
  // freeze(after, next): the effect whose next spawn starts the count, and the count
  let armedId = null;
  let armedAfter = 0;
  // effect time, for the flames' flicker (it stops while frozen)
  let clock = 0;
  // a rocket's trail: where it began and its last puff. Its first metres are only the motor's
  // flame (a sustainer lights clear of the shooter), so from the aim camera the trail does not
  // start as a cloud round the launcher.
  const trail = { x: 0, y: 0, z: 0, lastX: 0, lastY: -1e9, lastZ: 0 };
  let particles = null;
  let decals = null;
  let particleRenderer = null;
  let decalRenderer = null;
  const sustained = Array.from({ length: SUSTAIN_SLOTS }, () => ({
    active: false, recipe: null, x: 0, y: 0, z: 0, scale: 1, floorY: 0, remaining: 0, interval: 0.4, timer: 0, total: 1, hold: 0,
  }));

  /** Advances everything by `dt` seconds (no freeze check: update() and burn's warm-up call it). */
  function step(dt) {
    clock += dt;
    for (const s of sustained) {
      if (!s.active) continue;
      s.remaining -= dt;
      if (s.remaining <= 0) { s.active = false; continue; }
      s.timer -= dt;
      if (s.timer > 0) continue;
      s.timer += s.interval;
      // a burning wreck dies down over its last third; a fire started at a stage holds it
      const strength = s.hold > 0 ? s.hold : Math.min(1, (s.remaining / s.total) * 3);
      runRecipe(s.recipe, s.x, s.y, s.z, 0, 1, 0, s.scale * (0.55 + 0.45 * strength), s.floorY);
    }
    const wind = atmosphere?.state?.wind;
    particles.step(dt, STYLE_LIST, wind ? wind.x : 1, wind ? wind.z : 0);
    decals.step(dt);
    lights.update(dt);
    debris.update(dt);
    casings.update(dt);
    tracers.update(dt);
  }

  function build(maxParticles, maxDecals) {
    if (particleRenderer) { particleRenderer.mesh.removeFromParent(); particleRenderer.dispose(); }
    if (decalRenderer) { decalRenderer.mesh.removeFromParent(); decalRenderer.dispose(); }
    particles = createParticlePool(maxParticles);
    decals = createDecalPool(maxDecals);
    particleRenderer = createParticleRenderer(particles, textures.particles);
    decalRenderer = createDecalRenderer(decals, textures.decals);
    parent.add(decalRenderer.mesh, particleRenderer.mesh);
  }
  build(options.maxParticles, options.maxDecals);

  function runRecipe(recipe, x, y, z, dx, dy, dz, scale, floorY, paint) {
    spawnEffectBursts(particles, recipe, x, y, z, dx, dy, dz, scale, floorY, random);
    if (recipe.chunks) debris.burst(recipe.chunks, x, y, z, scale, floorY, paint);
    if (recipe.light) lights.flash(recipe.light, x, y, z, floorY, scale);
  }

  const director = {
    /**
     * Shows an effect (the EFFECT_SPAWN payload).
     * @param {{effectId: string, position: {x: number, y: number, z: number}, direction?: {x: number, y: number, z: number}, scale?: number, colour?: string | number}} request
     *   For bullet impacts `direction` is the surface normal; for a muzzle flash and a tracer the
     *   aim; for a tracer `scale` is its length in metres. `colour` (a car's paint, '#rrggbb' or
     *   a number) paints the body panels an explosion throws.
     * @returns {boolean} False for an unknown effect.
     */
    spawn(request) {
      const p = request?.position;
      if (!p) return false;
      const d = request.direction;
      let dx = 0; let dy = 1; let dz = 0;
      if (d) {
        const l = Math.hypot(d.x, d.y, d.z);
        if (l > 1e-6) { dx = d.x / l; dy = d.y / l; dz = d.z / l; }
      }
      let effectId = effectIdFor(request.effectId, dy, Boolean(d));
      if (effectId === 'rocket_trail') {
        if (Math.hypot(p.x - trail.lastX, p.y - trail.lastY, p.z - trail.lastZ) > ROCKET_PUFF_GAP) {
          trail.x = p.x; trail.y = p.y; trail.z = p.z;
        }
        trail.lastX = p.x; trail.lastY = p.y; trail.lastZ = p.z;
        if (Math.hypot(p.x - trail.x, p.y - trail.y, p.z - trail.z) < ROCKET_MOTOR_ONLY) effectId = 'rocket_motor';
      }
      const recipe = EFFECT_RECIPES[effectId];
      if (!recipe) return false;
      // a rocket trail mapped from combat's 'engine_smoke' puffs keeps its own size (scale 1)
      const scale = effectId === 'rocket_trail' || effectId === 'rocket_motor' ? 1 : request.scale > 0 ? request.scale : 1;
      const floorY = groundHeightAt(p.x, p.z);
      if (armedId === effectId) {
        armedId = null;
        if (armedAfter > 0) freezeIn = armedAfter; else frozen = true;
      }
      if (effectId === 'tracer') {
        // a tracer's scale is its length (to the hit point); 60 m when none is given
        const length = request.scale > 0 ? request.scale : 60;
        tracers.add(p.x, p.y, p.z, p.x + dx * length, p.y + dy * length, p.z + dz * length);
        return true;
      }
      const c = request.colour;
      const paint = typeof c === 'number' ? c : typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? parseInt(c.slice(1), 16) : undefined;
      runRecipe(recipe, p.x, p.y, p.z, dx, dy, dz, scale, floorY, paint);
      if (recipe.decal) placeDecal(recipe.decal, p, dx, dy, dz, scale, floorY);
      if (recipe.shake && options.shake) {
        const at = options.listener?.();
        const distance = at ? Math.hypot(at.x - p.x, at.z - p.z) : 0;
        const falloff = 1 - distance / recipe.shake.range;
        if (falloff > 0) options.shake(recipe.shake.strength * falloff, recipe.shake.seconds);
      }
      if (recipe.sustain) {
        const slot = sustained.find((s) => !s.active) ?? sustained[0];
        slot.active = true;
        slot.recipe = EFFECT_RECIPES[recipe.sustain.effectId];
        slot.x = p.x; slot.y = p.y; slot.z = p.z;
        slot.scale = scale;
        slot.floorY = floorY;
        slot.total = recipe.sustain.seconds;
        slot.remaining = recipe.sustain.seconds;
        slot.interval = recipe.sustain.interval;
        slot.timer = recipe.sustain.startDelay ?? 0;
        slot.hold = 0;
      }
      return true;
    },

    /**
     * Throws a spent case (shellCasings.js): its kind ('pistol', 'steel', 'rifle', 'magnum',
     * 'shell'), the ejection port, the unit direction the cases fly and the flat aim.
     */
    eject(kind, x, y, z, ex, ey, ez, ax, az) {
      return casings.eject(kind, x, y, z, ex, ey, ez, ax, az, groundHeightAt(x, z));
    },

    /** Leaves a mark: a DECAL_CELLS name, a centre on the surface, its normal, angle and size. */
    addDecal(cellName, x, y, z, nx, ny, nz, angle, width, length, opacity = 0.9, life = 120) {
      return decals.add(DECAL_CELLS[cellName] ?? 0, x, y, z, nx, ny, nz, angle, width, length, opacity, life);
    },

    /** Advances particles, marks, lights and sustained emitters by `dt` seconds. */
    update(dt) {
      if (!(dt > 0) || frozen) return;
      if (freezeIn >= 0) {
        if (dt >= freezeIn) { dt = freezeIn; frozen = true; freezeIn = -1; } else freezeIn -= dt;
        if (!(dt > 0)) return;
      }
      step(dt);
    },

    /**
     * Starts a fire that burns on at a set stage (command 'effects/burn'), for a picture or a
     * scripted scene: {position | vehicleId, stage?, seconds?, scale?, warm?}. `stage` is a
     * BURN_STAGES name: 'smoking', 'burning' (flames from the engine bay), 'blazing' (the whole
     * car alight under a tall smoke column; the default) or 'dying'. With `vehicleId` it burns at
     * that vehicle's engine bay or body (the vehicle is not damaged: the fleet's damage() does
     * that). It holds its stage for `seconds` (default 600), and `warm` seconds (default 8, at
     * most 20) are simulated at once so the flames and the column already stand.
     * @returns {number} The fire's slot (for extinguish), or -1 without a place.
     */
    burn(request) {
      const stage = BURN_STAGES[request?.stage] ?? BURN_STAGES.blazing;
      const p = request?.vehicleId != null && options.vehicleAnchor
        ? options.vehicleAnchor(request.vehicleId, stage.anchor) : request?.position;
      if (!p) return -1;
      const index = Math.max(0, sustained.findIndex((s) => !s.active));
      const slot = sustained[index];
      slot.active = true;
      slot.recipe = EFFECT_RECIPES[stage.effectId];
      slot.x = p.x; slot.y = p.y; slot.z = p.z;
      slot.scale = request.scale > 0 ? request.scale : stage.scale ?? 1;
      slot.floorY = groundHeightAt(p.x, p.z);
      slot.total = request.seconds > 0 ? request.seconds : 600;
      slot.remaining = slot.total;
      slot.interval = stage.interval;
      slot.timer = 0;
      slot.hold = stage.strength;
      const warm = Math.min(WARM_MAX, request.warm >= 0 ? request.warm : 8);
      for (let t = 0; t < warm; t += WARM_STEP) step(WARM_STEP);
      return index;
    },

    /** Puts out a fire burn() started (its slot), or every sustained fire without an index. */
    extinguish(index) {
      for (let i = 0; i < SUSTAIN_SLOTS; i += 1) if (index == null || i === index) sustained[i].active = false;
    },

    /**
     * Holds every effect still (particles, chunks, marks, lights, burning wrecks) once `after`
     * more seconds of effect time have passed (0: now), until thaw(). Effects spawned meanwhile
     * appear and hold too. With `next` (an effect id or alias, such as 'muzzle_flash'), the
     * count starts only when that effect is next spawned, so a scene can hold the flash of a shot
     * whose exact step it does not know. For pictures: a muzzle flash lives 0.06 s.
     * @param {number} [after] Seconds of effect time. @param {string} [next] Effect id to wait for.
     */
    freeze(after = 0, next) {
      armedId = next ? effectIdFor(next, 1) : null;
      armedAfter = Math.max(0, after);
      if (armedId) { frozen = false; freezeIn = -1; } else if (after > 0) { frozen = false; freezeIn = after; } else { frozen = true; freezeIn = -1; }
    },

    /** Lets the effects age again. */
    thaw() {
      frozen = false;
      freezeIn = -1;
      armedId = null;
    },

    /** True while held by freeze(). */
    get frozen() { return frozen; },

    /** Writes the pools into the GPU buffers for `camera`, lit by the atmosphere now. */
    prepare(camera) {
      const state = atmosphere?.state;
      if (state) {
        const u = particleRenderer.uniforms;
        u.uKeyDirection.value.copy(state.keyDirection);
        u.uKeyLight.value.copy(state.keyColor).multiplyScalar(state.keyIntensity * LIGHT_SCALE);
        u.uSkyLight.value.copy(state.ambientSkyColor).multiplyScalar(state.ambientIntensity * FILL_SCALE);
        u.uGroundLight.value.copy(state.ambientGroundColor).multiplyScalar(state.ambientIntensity * FILL_SCALE);
        u.uFogColor.value.copy(state.fogColor);
        u.uFogDensity.value = state.fogDensity;
      }
      particleRenderer.uniforms.uTime.value = clock % 1000;
      particleRenderer.draw(STYLE_LIST, camera);
      decalRenderer.sync();
      tracers.prepare();
    },

    /** Rebuilds the pools for new budgets (a quality change); what was showing is dropped. */
    setBudgets(maxParticles, maxDecals) {
      if (maxParticles === particles.capacity && maxDecals === decals.capacity) return;
      build(maxParticles, maxDecals);
    },

    /** Removes every particle, mark and sustained emitter. */
    clear() {
      particles.clear();
      decals.clear();
      debris.clear();
      casings.clear();
      tracers.clear();
      for (const s of sustained) s.active = false;
    },

    /** Counts for the debug object and tests. */
    stats() {
      let burning = 0;
      for (const s of sustained) if (s.active) burning += 1;
      return {
        particles: particles.count, particleCapacity: particles.capacity, dropped: particles.dropped,
        decals: decals.count, decalCapacity: decals.capacity, lights: lights.activeCount(), sustained: burning,
        chunks: debris.count, casings: casings.count, tracers: tracers.count, frozen,
      };
    },

    dispose() {
      particleRenderer.mesh.removeFromParent();
      decalRenderer.mesh.removeFromParent();
      particleRenderer.dispose();
      decalRenderer.dispose();
      debris.dispose();
      casings.dispose();
      tracers.dispose();
      lights.dispose();
      textures.particles.dispose();
      textures.decals.dispose();
    },
  };

  function placeDecal(spec, p, dx, dy, dz, scale, floorY) {
    const size = (spec.size[0] + (spec.size[1] - spec.size[0]) * random()) * (spec.cell === 'scorch' ? scale : 1);
    const angle = random() * Math.PI * 2;
    const onGround = spec.ground || spec.cell === 'scorch' || dy > 0.8;
    if (onGround) {
      const ox = spec.ground ? (random() - 0.5) * 0.6 : 0;
      const oz = spec.ground ? (random() - 0.5) * 0.6 : 0;
      decals.add(DECAL_CELLS[spec.cell], p.x + ox, floorY, p.z + oz, 0, 1, 0, angle, size, size, spec.opacity, spec.life);
    } else {
      decals.add(DECAL_CELLS[spec.cell], p.x, p.y, p.z, dx, dy, dz, angle, size, size, spec.opacity, spec.life);
    }
  }

  return director;
}
