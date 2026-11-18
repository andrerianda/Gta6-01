// The passing lights of the world effects: a few lights registered once with the atmosphere
// (atmosphere.addLight) and lent to fires, explosions and muzzle flashes. A fire that keeps
// sending pulses keeps its light and flickers; an explosion takes the strongest light for a
// moment and lets it die away. Idle lights are switched off, never removed, so the light manager
// sees a fixed set and no shader recompiles.

const SLOT_COUNT = 6;
const FADE_OUT = 0.3;

/**
 * Creates the effect lights.
 * @param {object | null} atmosphere The atmosphere facade (null in a test or a page without one).
 */
export function createEffectLights(atmosphere) {
  const slots = [];
  for (let i = 0; i < SLOT_COUNT; i += 1) {
    const light = atmosphere?.addLight?.({
      kind: 'point', position: [0, -500, 0], color: 0xff9040, intensity: 0, range: 10,
      importance: 1, nightOnly: false, groundY: 0, pool: true, glow: 0.8,
    }) ?? null;
    if (light) light.enabled = false;
    slots.push({ light, active: false, age: 0, hold: 0, peak: 0, decay: false, flicker: 0, phase: i * 1.7, x: 0, y: 0, z: 0 });
  }

  return {
    /**
     * Shows a light for an effect. A light already shining within 2.5 m is refreshed instead.
     * @param {{color: number[], intensity: number, range: number, seconds: number, flicker?: number, lift?: number, decay?: boolean}} recipe
     */
    flash(recipe, x, y, z, groundY, scale = 1) {
      const decay = recipe.decay ?? (recipe.seconds < 0.2 || recipe.intensity > 3000);
      const lift = (recipe.lift ?? 0) * scale;
      let slot = null;
      for (const s of slots) {
        if (s.active && !s.decay && !decay && Math.abs(s.x - x) < 2.5 && Math.abs(s.z - z) < 2.5) { slot = s; break; }
      }
      if (!slot) slot = slots.find((s) => !s.active) ?? weakest(slots);
      slot.active = true;
      slot.age = 0;
      slot.hold = recipe.seconds;
      slot.peak = recipe.intensity * scale;
      slot.decay = decay;
      slot.flicker = recipe.flicker ?? 0;
      slot.x = x; slot.y = y + lift; slot.z = z;
      const light = slot.light;
      if (!light) return;
      light.enabled = true;
      light.position.set(x, y + lift, z);
      light.color.setRGB(recipe.color[0], recipe.color[1], recipe.color[2]);
      light.range = recipe.range * Math.sqrt(scale);
      light.groundY = groundY;
      light.importance = decay ? 3 : 1.6;
      light.glowSize = Math.min(6, 0.6 + Math.sqrt(recipe.intensity * scale) * 0.03);
    },

    /** Advances envelopes and flicker. */
    update(dt) {
      for (const s of slots) {
        if (!s.active) continue;
        s.age += dt;
        let level;
        if (s.decay) {
          const t = s.age / Math.max(0.01, s.hold);
          level = t >= 1 ? 0 : (1 - t) * (1 - t);
        } else {
          level = s.age < s.hold ? 1 : 1 - (s.age - s.hold) / FADE_OUT;
        }
        if (level <= 0) {
          s.active = false;
          if (s.light) { s.light.enabled = false; s.light.intensity = 0; }
          continue;
        }
        if (s.flicker > 0) {
          const w = s.age * 1 + s.phase;
          const wobble = 0.5 * Math.sin(w * 13.1) + 0.3 * Math.sin(w * 23.7 + 1.3) + 0.2 * Math.sin(w * 41.9 + 2.1);
          level *= 1 + wobble * s.flicker * 0.6;
        }
        if (s.light) s.light.intensity = s.peak * Math.max(0, level);
      }
    },

    /** Lights shining now. */
    activeCount() {
      let n = 0;
      for (const s of slots) if (s.active) n += 1;
      return n;
    },

    dispose() {
      for (const s of slots) if (s.light) atmosphere?.removeLight?.(s.light);
      slots.length = 0;
    },
  };
}

function weakest(slots) {
  let best = slots[0];
  for (const s of slots) if (s.peak < best.peak) best = s;
  return best;
}
