// One-shot sounds of the world: gunshots per weapon (built from the weaponCatalog's sound
// spec: a supersonic crack, a body thump at the weapon's pitch, a noise blast and a reverb tail
// between the buildings, darker with distance), the shotgun's pump, explosions with a long low
// rumble, car crunches and breaking glass scaled by collision energy, bullet hits, thunder and
// interface clicks. Every sound borrows a mixer slot, so the voice limit applies.
import { SOUND_PRIORITY } from './voicePriorityTable.js';

/**
 * Creates the one-shot player.
 * @param {ReturnType<import('./audioMixer.js').createAudioMixer>} mixer
 * @param {ReturnType<import('./synthesisVoices.js').createSynthesisVoices>} synth
 * @param {Record<string, object>} weapons WEAPON_CATALOG
 */
export function createWeaponAndImpactSounds(mixer, synth, weapons = {}) {
  const ctx = mixer.ctx;

  function gunshot(weaponId, position, loudness = 1) {
    const spec = weapons[weaponId]?.sound ?? { kind: 'gunshot', pitchHz: 400, decaySeconds: 0.14, noise: 0.85 };
    if (spec.kind === 'explosion') return explosion(position, 0.6);
    if (spec.kind === 'whoosh') return glass(position, 0.4);
    if (spec.kind !== 'gunshot') return melee(spec, position);
    const out = mixer.voiceAt(position, { priority: SOUND_PRIORITY.gunshot, duration: spec.decaySeconds + 0.9, refDistance: 9 * loudness, reverb: spec.echo ? 0.9 : 0.55, maxDistance: 700 });
    if (!out) return;
    const t = ctx.currentTime + 0.005;
    const level = 0.9 * Math.min(1.4, loudness);
    synth.burst(out, t, { type: 'highpass', freq: 2500, q: 0.7, decay: 0.018, gain: level * 0.9 });
    synth.burst(out, t, { type: 'bandpass', freq: spec.pitchHz * 4, freqEnd: spec.pitchHz * 1.2, q: 0.6, decay: spec.decaySeconds, gain: level * spec.noise });
    synth.tone(out, t, { wave: 'triangle', f0: spec.pitchHz * 1.4, f1: spec.pitchHz * 0.35, decay: spec.decaySeconds * 0.8, gain: level * 0.6 });
    synth.burst(out, t, { brown: true, type: 'lowpass', freq: 300 + spec.pitchHz, q: 0.5, decay: spec.decaySeconds * 2.5, gain: level * 0.5 });
    if (spec.followUp === 'pump_clack') {
      synth.burst(out, t + 0.42, { type: 'bandpass', freq: 1800, q: 4, decay: 0.03, gain: 0.25 });
      synth.burst(out, t + 0.56, { type: 'bandpass', freq: 1300, q: 4, decay: 0.04, gain: 0.3 });
    }
  }

  function melee(spec, position) {
    const out = mixer.voiceAt(position, { priority: SOUND_PRIORITY.impact, duration: 0.4, refDistance: 2, reverb: 0.1, maxDistance: 60 });
    if (!out) return;
    const t = ctx.currentTime + 0.005;
    synth.burst(out, t, { type: 'bandpass', freq: spec.pitchHz * 2, q: 1.2, decay: spec.decaySeconds, gain: 0.6 * spec.noise });
    synth.tone(out, t, { wave: spec.kind === 'clank' ? 'square' : 'sine', f0: spec.pitchHz, f1: spec.pitchHz * 0.7, decay: spec.decaySeconds, gain: 0.4 });
  }

  function explosion(position, power = 1) {
    const out = mixer.voiceAt(position, { priority: SOUND_PRIORITY.explosion, duration: 3.5, refDistance: 18 * Math.max(0.5, power), reverb: 0.8, maxDistance: 1500 });
    if (!out) return;
    const t = ctx.currentTime + 0.005;
    const p = Math.min(1.5, Math.max(0.4, power));
    synth.burst(out, t, { type: 'highpass', freq: 1800, decay: 0.05, gain: 0.8 * p });
    synth.burst(out, t, { type: 'lowpass', freq: 2400, freqEnd: 220, q: 0.6, decay: 0.9, gain: 1.0 * p });
    synth.burst(out, t, { brown: true, type: 'lowpass', freq: 180, q: 0.7, attack: 0.02, decay: 2.8, gain: 1.4 * p });
    synth.tone(out, t, { f0: 62, f1: 28, decay: 1.6, gain: 0.9 * p });
    // Debris: a few late crackles.
    for (let i = 0; i < 6; i += 1) {
      synth.burst(out, t + 0.25 + i * 0.13 + Math.random() * 0.1, { type: 'bandpass', freq: 1200 + Math.random() * 2500, q: 3, decay: 0.05, gain: 0.12 * p });
    }
  }

  function crash(position, energy) {
    // Energy in joules: a nudge is a few hundred, a hard crash tens of thousands.
    const strength = Math.min(1.3, Math.log10(1 + energy / 200) / 2.4);
    if (strength < 0.08) return;
    const out = mixer.voiceAt(position, { priority: SOUND_PRIORITY.crash, duration: 1.2, refDistance: 5, reverb: 0.3, maxDistance: 250 });
    if (!out) return;
    const t = ctx.currentTime + 0.005;
    synth.burst(out, t, { brown: true, type: 'lowpass', freq: 400, decay: 0.25 + strength * 0.3, gain: 0.9 * strength });
    synth.burst(out, t, { type: 'bandpass', freq: 900, freqEnd: 400, q: 1.2, decay: 0.12 + strength * 0.25, gain: 0.7 * strength });
    // Panel resonances: inharmonic partials of a steel sheet.
    const partials = [187, 331, 467, 709, 1123];
    for (let i = 0; i < partials.length; i += 1) {
      synth.tone(out, t + i * 0.006, { wave: 'triangle', f0: partials[i] * (0.9 + Math.random() * 0.2), decay: 0.18 + strength * 0.4, gain: 0.14 * strength });
    }
    if (strength > 0.55) glassInto(out, t + 0.03, strength - 0.3);
  }

  function glass(position, strength = 0.6) {
    const out = mixer.voiceAt(position, { priority: SOUND_PRIORITY.impact, duration: 1, refDistance: 3, reverb: 0.3, maxDistance: 150 });
    if (out) glassInto(out, ctx.currentTime + 0.005, strength);
  }

  function glassInto(out, t, strength) {
    synth.burst(out, t, { type: 'highpass', freq: 4000, decay: 0.3, gain: 0.5 * strength });
    for (let i = 0; i < 9; i += 1) {
      synth.tone(out, t + Math.random() * 0.35, { f0: 2500 + Math.random() * 5000, decay: 0.05 + Math.random() * 0.1, gain: 0.1 * strength });
    }
  }

  function bulletHit(position, kind) {
    const out = mixer.voiceAt(position, { priority: SOUND_PRIORITY.impact, duration: 0.3, refDistance: 3, reverb: 0.15, maxDistance: 120 });
    if (!out) return;
    const t = ctx.currentTime + 0.005;
    if (kind === 'vehicle') {
      synth.tone(out, t, { wave: 'square', f0: 1400, f1: 700, decay: 0.12, gain: 0.25 });
      synth.burst(out, t, { type: 'bandpass', freq: 3000, q: 2, decay: 0.05, gain: 0.4 });
    } else {
      synth.burst(out, t, { brown: true, type: 'lowpass', freq: 600, decay: 0.08, gain: 0.6 });
    }
  }

  function thunder(distance = 1000, delay = 0) {
    const out = mixer.voiceAt(null, { bus: 'ambience', priority: SOUND_PRIORITY.explosion, duration: delay + 6, reverb: 0.4 });
    if (!out) return;
    const t = ctx.currentTime + delay;
    const near = Math.max(0.15, 1 - distance / 4000);
    if (near > 0.6) synth.burst(out, t, { type: 'highpass', freq: 1500, decay: 0.3, gain: 0.5 * near });
    synth.burst(out, t, { brown: true, type: 'lowpass', freq: 260 + 400 * near, freqEnd: 90, attack: 0.15, decay: 4.5, gain: 1.2 * near });
    synth.burst(out, t + 0.4, { brown: true, type: 'lowpass', freq: 160, attack: 0.3, decay: 3, gain: 0.7 * near });
  }

  function interfaceSound(soundId) {
    const out = mixer.voiceAt(null, { bus: 'interface', priority: SOUND_PRIORITY.interface, duration: 0.6, reverb: 0 });
    if (!out) return;
    const t = ctx.currentTime + 0.002;
    if (soundId === 'ui_back') {
      synth.tone(out, t, { wave: 'triangle', f0: 660, f1: 440, decay: 0.08, gain: 0.25 });
    } else if (soundId === 'mission_passed' || soundId === 'pickup') {
      [523, 659, 784, 1047].forEach((f, i) => synth.tone(out, t + i * 0.09, { wave: 'triangle', f0: f, decay: 0.3, gain: 0.22 }));
    } else if (soundId === 'mission_failed') {
      [392, 370, 349].forEach((f, i) => synth.tone(out, t + i * 0.16, { wave: 'triangle', f0: f, decay: 0.35, gain: 0.22 }));
    } else {
      synth.tone(out, t, { wave: 'triangle', f0: 880, f1: 1320, sweep: 0.02, decay: 0.05, gain: 0.2 });
    }
  }

  return { gunshot, explosion, crash, glass, bulletHit, thunder, interfaceSound, melee };
}
