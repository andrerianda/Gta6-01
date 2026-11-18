// The rendered sound bank: the combat and breakage one-shots (combatSoundRecipes.js) turned into
// AudioBuffers once, a couple of variants each, so playing one is a single buffer source (no
// live oscillators or filters per shot: the per-frame audio CPU stays small in a firefight).
// Gunshots are rendered per weapon from the catalog's sound spec and class. Rendering is spread
// over the first frames after the audio starts (prerender(ms) each frame); anything asked for
// before its turn is rendered on the spot.
import { COMBAT_SOUND_RECIPES, renderGunshot, gunshotClassOf } from './combatSoundRecipes.js';

const VARIANTS = 2;

/**
 * Creates the bank on a context.
 * @param {BaseAudioContext} ctx
 * @param {Record<string, object>} weapons WEAPON_CATALOG
 */
export function createRenderedSoundBank(ctx, weapons = {}) {
  const rate = ctx.sampleRate;
  const buffers = new Map();
  const pending = [];
  for (const [id, weapon] of Object.entries(weapons)) if (weapon.sound?.kind === 'gunshot') pending.push(`shot:${id}`);
  pending.push(...Object.keys(COMBAT_SOUND_RECIPES));
  let renderedMs = 0;
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  function toBuffer(pcm) {
    const buffer = ctx.createBuffer(1, pcm.data.length, rate);
    buffer.getChannelData(0).set(pcm.data);
    return buffer;
  }

  function render(name) {
    const started = now();
    const variants = [];
    if (name.startsWith('shot:')) {
      const weapon = weapons[name.slice(5)];
      const kind = gunshotClassOf(weapon);
      for (let v = 0; v < VARIANTS; v += 1) variants.push(toBuffer(renderGunshot(weapon?.sound, kind, rate, 11 + v * 17)));
    } else {
      const recipe = COMBAT_SOUND_RECIPES[name];
      if (!recipe) return null;
      const count = name.startsWith('casing') || name === 'grenade_bounce' || name.startsWith('glass') ? VARIANTS : 1;
      for (let v = 0; v < count; v += 1) variants.push(toBuffer(recipe(rate, 5 + v * 23)));
    }
    buffers.set(name, variants);
    renderedMs += now() - started;
    return variants;
  }

  const bank = {
    /** Milliseconds spent rendering so far (the debug object, tests). */
    get renderedMs() { return renderedMs; },
    /** Names still waiting to be rendered. */
    get pending() { return pending.length; },

    /** True when the bank can play this name (a recipe, or `shot:<weapon id>` of a gun). */
    has(name) { return buffers.has(name) || pending.includes(name) || Boolean(COMBAT_SOUND_RECIPES[name]); },

    /** The buffer variants of a name, rendered now if they were not yet. */
    get(name) { return buffers.get(name) ?? render(name); },

    /**
     * Plays a variant into `out` at time `t`.
     * @param {AudioNode} out
     * @param {number} t
     * @param {string} name
     * @param {{gain?: number, pitch?: number, variant?: number}} [o]
     * @returns {AudioBufferSourceNode | null}
     */
    play(out, t, name, o = {}) {
      const variants = bank.get(name);
      if (!variants || variants.length === 0) return null;
      const source = ctx.createBufferSource();
      source.buffer = variants[(o.variant ?? Math.floor(Math.random() * variants.length)) % variants.length];
      source.playbackRate.value = o.pitch ?? 1;
      if (o.gain !== undefined && o.gain !== 1) {
        const gain = ctx.createGain();
        gain.gain.value = o.gain;
        source.connect(gain).connect(out);
      } else {
        source.connect(out);
      }
      source.start(t);
      return source;
    },

    /** Renders queued sounds until `budgetMs` milliseconds have passed (call once a frame). */
    prerender(budgetMs = 1.5) {
      const started = now();
      while (pending.length > 0 && now() - started < budgetMs) {
        const name = pending.shift();
        if (!buffers.has(name)) render(name);
      }
    },
  };
  return bank;
}
