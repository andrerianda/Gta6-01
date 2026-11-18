// The effects director: what the effects system runs. It owns the particle and decal pools with
// their renderers, the painted atlases and the passing lights, turns a spawn request into the
// recipe's particles, light, mark, shake and sustained emitter, steps everything each frame, and
// before each picture writes the pools into the GPU buffers lit by the atmosphere's state.
// Independent of the engine (a preview page drives it the same way the game does).

import { createDecalPool } from './decalPool.js';
import { createDecalRenderer } from './decalRenderer.js';
import { DECAL_CELLS, EFFECT_RECIPES, STYLE_LIST } from './effectCatalogue.js';
import { createEffectLights } from './effectLights.js';
import { spawnEffectBursts, spawnTracer } from './effectSpawning.js';
import { createEffectTextures } from './effectTextures.js';
import { createParticlePool } from './particlePool.js';
import { createParticleRenderer } from './particleRenderer.js';

const SUSTAIN_SLOTS = 12;
const LIGHT_SCALE = 0.3;
const FILL_SCALE = 0.55;

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
  let particles = null;
  let decals = null;
  let particleRenderer = null;
  let decalRenderer = null;
  const sustained = Array.from({ length: SUSTAIN_SLOTS }, () => ({
    active: false, recipe: null, x: 0, y: 0, z: 0, scale: 1, floorY: 0, remaining: 0, interval: 0.4, timer: 0, total: 1,
  }));

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

  function runRecipe(recipe, x, y, z, dx, dy, dz, scale, floorY) {
    spawnEffectBursts(particles, recipe, x, y, z, dx, dy, dz, scale, floorY, random);
    if (recipe.light) lights.flash(recipe.light, x, y, z, floorY, scale);
  }

  const director = {
    /**
     * Shows an effect (the EFFECT_SPAWN payload).
     * @param {{effectId: string, position: {x: number, y: number, z: number}, direction?: {x: number, y: number, z: number}, scale?: number}} request
     *   For bullet impacts `direction` is the surface normal; for a muzzle flash and a tracer the
     *   aim; for a tracer `scale` is its length in metres.
     * @returns {boolean} False for an unknown effect.
     */
    spawn(request) {
      const recipe = EFFECT_RECIPES[request?.effectId];
      const p = request?.position;
      if (!recipe || !p) return false;
      const d = request.direction;
      let dx = 0; let dy = 1; let dz = 0;
      if (d) {
        const l = Math.hypot(d.x, d.y, d.z);
        if (l > 1e-6) { dx = d.x / l; dy = d.y / l; dz = d.z / l; }
      }
      const scale = request.scale > 0 ? request.scale : 1;
      const floorY = groundHeightAt(p.x, p.z);
      if (request.effectId === 'tracer') {
        spawnTracer(particles, p.x, p.y, p.z, dx, dy, dz, scale, floorY);
        return true;
      }
      runRecipe(recipe, p.x, p.y, p.z, dx, dy, dz, scale, floorY);
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
      }
      return true;
    },

    /** Leaves a mark: a DECAL_CELLS name, a centre on the surface, its normal, angle and size. */
    addDecal(cellName, x, y, z, nx, ny, nz, angle, width, length, opacity = 0.9, life = 120) {
      return decals.add(DECAL_CELLS[cellName] ?? 0, x, y, z, nx, ny, nz, angle, width, length, opacity, life);
    },

    /** Advances particles, marks, lights and sustained emitters by `dt` seconds. */
    update(dt) {
      if (!(dt > 0)) return;
      for (const s of sustained) {
        if (!s.active) continue;
        s.remaining -= dt;
        if (s.remaining <= 0) { s.active = false; continue; }
        s.timer -= dt;
        if (s.timer > 0) continue;
        s.timer += s.interval;
        // a burning wreck dies down over its last third
        const strength = Math.min(1, (s.remaining / s.total) * 3);
        runRecipe(s.recipe, s.x, s.y, s.z, 0, 1, 0, s.scale * (0.55 + 0.45 * strength), s.floorY);
      }
      const wind = atmosphere?.state?.wind;
      particles.step(dt, STYLE_LIST, wind ? wind.x : 1, wind ? wind.z : 0);
      decals.step(dt);
      lights.update(dt);
    },

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
      particleRenderer.draw(STYLE_LIST, camera);
      decalRenderer.sync();
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
      for (const s of sustained) s.active = false;
    },

    /** Counts for the debug object and tests. */
    stats() {
      let burning = 0;
      for (const s of sustained) if (s.active) burning += 1;
      return {
        particles: particles.count, particleCapacity: particles.capacity, dropped: particles.dropped,
        decals: decals.count, decalCapacity: decals.capacity, lights: lights.activeCount(), sustained: burning,
      };
    },

    dispose() {
      particleRenderer.mesh.removeFromParent();
      decalRenderer.mesh.removeFromParent();
      particleRenderer.dispose();
      decalRenderer.dispose();
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
