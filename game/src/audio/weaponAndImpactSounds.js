// One-shot sounds of the world. Gunshots per weapon class come from the rendered sound bank
// (pistol, revolver, SMG, shotgun, rifle, sniper with its rolling tail), arrive late with
// distance (343 m/s) and darker through the air, and the place's echo answers them (the mixer's
// slap and reverb, set by streetAcoustics). After the shot: the shotgun's pump stroke, the
// sniper's bolt, and spent cases tinkling on hard ground beside the shooter (none on grass,
// sand or dirt; revolvers keep theirs). Rockets launch with a thump and a whoosh that flies
// away along the aim; throws swish; a grenade clinks as it bounces; a fire bottle smashes and
// catches; car glass cracks and shatters; explosions rumble; crashes crunch; bullets hit;
// thunder rolls; the interface clicks; stealth stingers rise. Every sound borrows a mixer slot,
// so the voice limit applies.
import { SOUND_PRIORITY } from './voicePriorityTable.js';
import { casingKindOf, gunshotClassOf } from './combatSoundRecipes.js';

const SPEED_OF_SOUND = 343;
const HARD_GROUND = new Set(['asphalt', 'concrete', 'wood', 'metal']);

/**
 * Creates the one-shot player.
 * @param {ReturnType<import('./audioMixer.js').createAudioMixer>} mixer
 * @param {ReturnType<import('./synthesisVoices.js').createSynthesisVoices>} synth
 * @param {Record<string, object>} weapons WEAPON_CATALOG
 * @param {{bank: ReturnType<import('./renderedSoundBank.js').createRenderedSoundBank>, surfaceAt?: (x: number, z: number) => string}} kit
 */
export function createWeaponAndImpactSounds(mixer, synth, weapons = {}, kit) {
  const ctx = mixer.ctx;
  const bank = kit.bank;
  const surfaceAt = kit.surfaceAt ?? (() => 'concrete');
  const arrival = (position) => (position ? Math.min(2, mixer.distanceTo(position) / SPEED_OF_SOUND) : 0);
  const at = { x: 0, y: 0, z: 0 };

  function gunshot(weaponId, position, loudness = 1, direction = null) {
    const weapon = weapons[weaponId];
    const spec = weapon?.sound ?? { kind: 'gunshot' };
    if (weapon?.projectile) return launch(weapon, position, direction);
    if (spec.kind !== 'gunshot') return melee(spec, position);
    const kind = gunshotClassOf(weapon);
    const delay = arrival(position);
    const tail = kind === 'sniper' ? 3 : 1.2;
    const out = mixer.voiceAt(position, { priority: SOUND_PRIORITY.gunshot, duration: delay + tail, refDistance: 9 * Math.min(1.6, Math.max(0.6, loudness / 150)), reverb: spec.echo ? 0.9 : 0.6, maxDistance: kind === 'sniper' ? 1200 : 700 });
    if (!out) return;
    const t = ctx.currentTime + 0.005 + delay;
    bank.play(out, t, weapon ? `shot:${weapon.id}` : 'shot:pistol', { pitch: 0.96 + Math.random() * 0.08 });
    if (!position) return;
    const stance = weapon?.stance;
    if (stance?.cadence === 'pump') {
      // The stroke (combat's pumpRack: 0.1 s pause, back in 45 % of the cycle, forward after).
      const cycle = stance.cycleSeconds ?? 0.42;
      mechanism(position, t + 0.1 + cycle * 0.3, 'pump_back');
      mechanism(position, t + 0.1 + cycle * 0.9, 'pump_forward');
      casing(weapon, position, direction, t + 0.1 + cycle * 0.45);
    } else if (stance?.cadence === 'bolt') {
      mechanism(position, t + 0.45, 'sniper_bolt');
      casing(weapon, position, direction, t + 0.75);
    } else {
      casing(weapon, position, direction, t);
    }
  }

  function mechanism(position, t, name) {
    const out = mixer.voiceAt(position, { priority: SOUND_PRIORITY.footstep + 0.5, duration: t - ctx.currentTime + 0.8, refDistance: 1.5, reverb: 0.15, maxDistance: 35 });
    if (out) bank.play(out, t, name);
  }

  /** A spent case leaving the port to the shooter's right and landing a moment later. */
  function casing(weapon, position, direction, t) {
    const kind = casingKindOf(weapon);
    if (!kind) return;
    const dx = direction ? direction.x : 0, dz = direction ? direction.z : -1;
    const length = Math.hypot(dx, dz) || 1;
    at.x = position.x - (dz / length) * 0.9;
    at.z = position.z + (dx / length) * 0.9;
    at.y = (position.y ?? 1.4) - 1.35;
    if (mixer.distanceTo(at) > 28) return;
    if (!HARD_GROUND.has(surfaceAt(at.x, at.z))) return;
    const land = t + 0.36 + Math.random() * 0.14;
    const out = mixer.voiceAt(at, { priority: SOUND_PRIORITY.footstep, duration: land - ctx.currentTime + 0.7, refDistance: 1.2, reverb: 0.1, maxDistance: 28 });
    if (out) bank.play(out, land, `casing_${kind}`, { pitch: 0.94 + Math.random() * 0.12, gain: 0.8 });
  }

  /** A projectile weapon leaving the hand or the tube (WEAPON_FIRED of a thrown or heavy weapon). */
  function launch(weapon, position, direction) {
    if (weapon.projectile.kind !== 'rocket') return throwSound(position);
    const out = mixer.voiceAt(position, { priority: SOUND_PRIORITY.explosion - 1, duration: 1.6, refDistance: 10, reverb: 0.7, maxDistance: 900 });
    const t = ctx.currentTime + 0.005 + arrival(position);
    if (out) bank.play(out, t, 'rocket_launch');
    if (!position || !direction) return;
    // The motor burns as it flies: the whoosh rides a panner gliding along the aim.
    const seconds = 1.6;
    const reach = (weapon.projectile.speed ?? 55) * seconds;
    const fly = mixer.voiceAt(position, {
      priority: SOUND_PRIORITY.gunshot, duration: 2, refDistance: 6, reverb: 0.4, maxDistance: 900,
      glideTo: { x: position.x + direction.x * reach, y: (position.y ?? 0) + direction.y * reach, z: position.z + direction.z * reach, seconds },
    });
    if (fly) bank.play(fly, t + 0.03, 'rocket_whoosh');
  }

  function throwSound(position) {
    const out = mixer.voiceAt(position, { priority: SOUND_PRIORITY.impact, duration: 0.5, refDistance: 2, reverb: 0.05, maxDistance: 40 });
    if (out) bank.play(out, ctx.currentTime + 0.005, 'throw_whoosh');
  }

  /** A grenade striking something; `strength` 0..1 from its speed. */
  function grenadeBounce(position, strength = 0.7) {
    const out = mixer.voiceAt(position, { priority: SOUND_PRIORITY.impact, duration: 0.4, refDistance: 3, reverb: 0.2, maxDistance: 70 });
    if (out) bank.play(out, ctx.currentTime + 0.005, 'grenade_bounce', { gain: Math.min(1, Math.max(0.2, strength)), pitch: 0.95 + Math.random() * 0.1 });
  }

  /** A fire bottle bursting: glass, then the fuel catching. */
  function bottleSmash(position) {
    const out = mixer.voiceAt(position, { priority: SOUND_PRIORITY.crash, duration: 1.8, refDistance: 5, reverb: 0.35, maxDistance: 200 });
    if (out) bank.play(out, ctx.currentTime + 0.005 + arrival(position), 'bottle_smash');
  }

  function melee(spec, position) {
    const out = mixer.voiceAt(position, { priority: SOUND_PRIORITY.impact, duration: 0.4, refDistance: 2, reverb: 0.1, maxDistance: 60 });
    if (!out) return;
    const t = ctx.currentTime + 0.005;
    synth.burst(out, t, { type: 'bandpass', freq: (spec.pitchHz ?? 300) * 2, q: 1.2, decay: spec.decaySeconds ?? 0.1, gain: 0.6 * (spec.noise ?? 0.5) });
    synth.tone(out, t, { wave: spec.kind === 'clank' ? 'square' : 'sine', f0: spec.pitchHz ?? 300, f1: (spec.pitchHz ?? 300) * 0.7, decay: spec.decaySeconds ?? 0.1, gain: 0.4 });
  }

  function explosion(position, power = 1) {
    const delay = arrival(position);
    const out = mixer.voiceAt(position, { priority: SOUND_PRIORITY.explosion, duration: delay + 3.5, refDistance: 18 * Math.max(0.5, power), reverb: 0.8, maxDistance: 1500 });
    if (!out) return;
    const t = ctx.currentTime + 0.005 + delay;
    const p = Math.min(1.5, Math.max(0.4, power));
    synth.burst(out, t, { type: 'highpass', freq: 1800, decay: 0.05, gain: 0.8 * p });
    synth.burst(out, t, { type: 'lowpass', freq: 2400, freqEnd: 220, q: 0.6, decay: 0.9, gain: 1.0 * p });
    synth.burst(out, t, { brown: true, type: 'lowpass', freq: 180, q: 0.7, attack: 0.02, decay: 2.8, gain: 1.4 * p });
    synth.tone(out, t, { f0: 62, f1: 28, decay: 1.6, gain: 0.9 * p });
    // Debris raining back down: glass and metal from the bank.
    bank.play(out, t + 0.3, 'glass_shatter', { gain: 0.35 * p, pitch: 0.8 });
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
  }

  /** Car glass: 'cracked' or 'shattered' (VEHICLE_DAMAGED's glass), `strength` 0..1.5. */
  function glass(position, strength = 0.6, kind = 'shattered') {
    const out = mixer.voiceAt(position, { priority: SOUND_PRIORITY.impact + 1, duration: 1.2, refDistance: 3.5, reverb: 0.3, maxDistance: 150 });
    if (out) bank.play(out, ctx.currentTime + 0.005, kind === 'cracked' ? 'glass_crack' : 'glass_shatter', { gain: Math.min(1.2, Math.max(0.3, strength)), pitch: 0.93 + Math.random() * 0.14 });
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

  /** The stealth stingers: 'stealth_suspicious' or 'stealth_alarm' (music under the HUD). */
  function stinger(name) {
    const out = mixer.voiceAt(null, { bus: 'interface', priority: SOUND_PRIORITY.interface, duration: 2.4, reverb: 0.2 });
    if (out) bank.play(out, ctx.currentTime + 0.01, name);
  }

  function interfaceSound(soundId) {
    if (soundId === 'stealth_suspicious' || soundId === 'stealth_alarm') return stinger(soundId);
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

  return { gunshot, explosion, crash, glass, bulletHit, thunder, interfaceSound, melee, grenadeBounce, bottleSmash, throwSound, stinger };
}
