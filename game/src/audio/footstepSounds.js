// Footsteps by surface: a heel thump and a sole sound shaped for asphalt, concrete, grass, sand,
// dirt, wood and metal, louder and shorter when running, with a splash on wet ground. Also maps
// the city's street cross-section kinds and the plan's ground kinds onto those surfaces.
import { SOUND_PRIORITY } from './voicePriorityTable.js';

/** Surface recipes: thump (low-passed brown noise), sole (filtered white noise), ring tones. */
export const FOOTSTEP_SURFACES = Object.freeze({
  asphalt: { thump: [240, 0.07, 0.5], sole: ['bandpass', 1400, 0.9, 0.05, 0.16] },
  concrete: { thump: [300, 0.06, 0.45], sole: ['bandpass', 2600, 1.2, 0.035, 0.22] },
  grass: { thump: [170, 0.05, 0.22], sole: ['highpass', 3600, 0.7, 0.12, 0.1, 0.015] },
  sand: { thump: [150, 0.06, 0.18], sole: ['bandpass', 900, 0.6, 0.12, 0.2, 0.01] },
  dirt: { thump: [220, 0.06, 0.35], sole: ['bandpass', 1600, 0.8, 0.07, 0.18, 0.004] },
  wood: { thump: [180, 0.09, 0.4], sole: ['bandpass', 720, 3, 0.05, 0.3], ring: [[150, 0.1, 0.12]] },
  metal: { thump: [300, 0.05, 0.3], sole: ['bandpass', 2000, 2, 0.03, 0.1], ring: [[1250, 0.18, 0.04], [2930, 0.12, 0.025]] },
});

/** The street cross-section kind (openWorldCity.surfaceAt) to a footstep surface. */
const STREET_KIND = Object.freeze({
  carriageway: 'asphalt', junction: 'asphalt', crosswalk: 'asphalt',
  kerb: 'concrete', pavement: 'concrete', median: 'concrete', verge: 'grass',
});
/** The plan's ground kind (plan.surfaceAt) to a footstep surface ('water' under the feet is a deck). */
const GROUND_KIND = Object.freeze({ paved: 'concrete', dirt: 'dirt', grass: 'grass', sand: 'sand', water: 'wood' });

/**
 * The footstep surface for a street kind and a ground kind (either may be null).
 * @param {string|null|undefined} streetKind
 * @param {boolean} [planted] a planted median or verge
 * @param {string|null|undefined} groundKind
 */
export function footstepSurfaceOf(streetKind, planted, groundKind) {
  if (streetKind && streetKind !== 'ground') {
    if (streetKind === 'median' && planted) return 'grass';
    return STREET_KIND[streetKind] ?? 'concrete';
  }
  return GROUND_KIND[groundKind] ?? 'concrete';
}

/**
 * Creates the footstep player.
 * @param {ReturnType<import('./audioMixer.js').createAudioMixer>} mixer
 * @param {ReturnType<import('./synthesisVoices.js').createSynthesisVoices>} synth
 */
export function createFootstepSounds(mixer, synth) {
  const ctx = mixer.ctx;
  const spec = { bus: 'effects', priority: SOUND_PRIORITY.footstep, duration: 0.25, refDistance: 2.5, reverb: 0.05, maxDistance: 30 };

  return {
    /**
     * Plays one footstep.
     * @param {{x: number, y: number, z: number}} position the foot
     * @param {string} surface a FOOTSTEP_SURFACES name
     * @param {number} run 0 walk .. 1 run
     * @param {number} wetness 0 dry .. 1 soaked
     * @param {boolean} lead the player's own steps (louder, outrank the crowd's)
     */
    play(position, surface, run, wetness, lead) {
      const recipe = FOOTSTEP_SURFACES[surface] ?? FOOTSTEP_SURFACES.concrete;
      spec.priority = lead ? SOUND_PRIORITY.footstep + 2 : SOUND_PRIORITY.footstep;
      spec.refDistance = lead ? 3 : 2;
      const v = mixer.voiceAt(position, spec);
      if (!v) return;
      const t = ctx.currentTime + 0.005;
      const loud = (1.2 + 1.1 * run) * (0.85 + Math.random() * 0.3) * (lead ? 1 : 0.7);
      const short = 1 - 0.25 * run;
      const vary = 0.9 + Math.random() * 0.2;
      const [thumpHz, thumpDecay, thumpGain] = recipe.thump;
      synth.burst(v, t, { brown: true, type: 'lowpass', freq: thumpHz * vary, q: 0.7, decay: thumpDecay * short, gain: thumpGain * loud });
      const [type, freq, q, decay, gain, attack] = recipe.sole;
      synth.burst(v, t + 0.012 + Math.random() * 0.01, { type, freq: freq * vary, q, attack: attack ?? 0.002, decay: decay * short, gain: gain * loud });
      if (recipe.ring) {
        for (const [f, d, g] of recipe.ring) synth.tone(v, t, { wave: 'triangle', f0: f * vary, f1: f * vary * 0.97, decay: d, gain: g * loud });
      }
      if (wetness > 0.25 && surface !== 'grass' && surface !== 'sand') {
        synth.burst(v, t + 0.01, { type: 'highpass', freq: 2600, q: 0.6, attack: 0.006, decay: 0.09 + 0.05 * run, gain: 0.16 * loud * Math.min(1, wetness) });
      }
    },
  };
}
