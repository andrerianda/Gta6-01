// A radio station's drum hits rendered once into PCM (pcmSynthesis.js) from its kit
// (radioStationSounds.js), so the radio plays each hit as one buffer source instead of an
// oscillator or a noise source, a filter and a gain: the radio was the costliest sound in a
// car. Same recipes as the live hits were: a swept sine kick, a filtered noise snare with its
// tone, closed and open hats, a three-burst clap and a clave. Levels are kept absolute (no
// normalising) so the mix stays as it was. Pure.
import { createPcm, addNoise, addTone } from './pcmSynthesis.js';

/** Drum hit names a kit renders. */
export const DRUM_HITS = Object.freeze(['kick', 'snare', 'hat', 'hatOpen', 'clap', 'clave']);

/**
 * Renders the hits of a kit.
 * @param {{kick: number[], snare: (string|number)[], hat: (string|number)[]}} kit
 * @param {number} rate
 * @returns {Record<string, {data: Float32Array, rate: number}[]>} two variants of each noisy hit
 */
export function renderDrumKit(kit, rate) {
  const nyquist = rate * 0.45;
  const [k0, k1, kDecay, kGain] = kit.kick;
  const [sType, sHz, sDecay, sGain, sTone] = kit.snare;
  const [hType, hHz, hDecay, hGain] = kit.hat;
  const hits = {};
  const make = (seconds, draw) => { const pcm = createPcm(seconds, rate); draw(pcm); fadeEnd(pcm); return pcm; };
  hits.kick = [make(kDecay * 1.3 + 0.01, (p) => addTone(p, { f0: k0, f1: k1, sweep: kDecay * 0.35, decay: kDecay, gain: kGain }))];
  hits.snare = [1, 2].map((seed) => make(sDecay * 1.3 + 0.01, (p) => {
    addNoise(p, { type: sType, freq: Math.min(sHz, nyquist), q: 0.7, decay: sDecay, gain: sGain, seed });
    if (sTone) addTone(p, { f0: sTone, f1: sTone * 0.78, decay: sDecay * 0.5, gain: sGain * 0.7 });
  }));
  hits.hat = [3, 4].map((seed) => make(hDecay * 1.3 + 0.01, (p) => addNoise(p, { type: hType, freq: Math.min(hHz, nyquist), q: 0.7, decay: hDecay, gain: hGain, seed })));
  hits.hatOpen = [5].map((seed) => make(hDecay * 2.6 + 0.01, (p) => addNoise(p, { type: hType, freq: Math.min(hHz, nyquist), q: 0.7, decay: hDecay * 2, gain: hGain, seed })));
  hits.clap = [6].map((seed) => make(0.16, (p) => {
    for (let i = 0; i < 3; i += 1) addNoise(p, { at: i * 0.011, type: 'bandpass', freq: 1300, q: 1.2, decay: i === 2 ? 0.1 : 0.02, gain: 0.16, seed: seed + i });
  }));
  hits.clave = [make(0.06, (p) => addTone(p, { f0: 2500, decay: 0.04, gain: 0.1 }))];
  return hits;
}

function fadeEnd(pcm) {
  const fade = Math.min(pcm.data.length, Math.ceil(pcm.rate * 0.003));
  for (let i = 0; i < fade; i += 1) pcm.data[pcm.data.length - 1 - i] *= i / fade;
}
