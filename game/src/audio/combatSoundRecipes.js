// What the fights and the street's breakages sound like, as recipes rendered once into PCM
// (pcmSynthesis.js) and played as single buffers: a gunshot per weapon class (pistol, revolver,
// SMG, shotgun, rifle, sniper with a long rolling tail across the city), the shotgun's pump
// stroke and the sniper's bolt, brass and shotgun shells tinkling on hard ground, the rocket's
// launch thump and its tearing whoosh, a grenade's clink as it bounces, a throw, a fire
// bottle's smash and whoomp, car glass cracking and shattering, and the stealth stingers
// (suspicion rising, alarm). Pure: no WebAudio.
import { createPcm, addNoise, addTone, addRing, addEchoes, finishPcm } from './pcmSynthesis.js';

/**
 * Per weapon class: how loud the supersonic crack, the body thump and the low boom are, the
 * tail length (s), the mechanism's click, the rolling echo delays and the peak level.
 */
export const GUNSHOT_CLASS_SOUND = Object.freeze({
  pistol: { crack: 0.75, crackHz: 3800, body: 0.75, boom: 0.45, tail: 0.32, mech: 'slide', echoes: [0.09, 0.17], peak: 0.8 },
  revolver: { crack: 0.7, crackHz: 3000, body: 0.9, boom: 0.95, tail: 0.6, mech: null, echoes: [0.1, 0.21, 0.34], peak: 0.9 },
  smg: { crack: 0.6, crackHz: 4200, body: 0.6, boom: 0.28, tail: 0.16, mech: 'bolt', echoes: [0.07], peak: 0.7 },
  shotgun: { crack: 0.5, crackHz: 2600, body: 1, boom: 1, tail: 0.7, mech: null, echoes: [0.1, 0.22, 0.37], peak: 0.95 },
  rifle: { crack: 1, crackHz: 4500, body: 0.75, boom: 0.6, tail: 0.45, mech: 'bolt', echoes: [0.08, 0.18, 0.31], peak: 0.88 },
  sniper: { crack: 1, crackHz: 5000, body: 0.85, boom: 0.85, tail: 2.6, mech: null, echoes: [0.12, 0.26, 0.43, 0.64, 0.9, 1.22, 1.6, 2.05], peak: 0.95 },
});

/** The class sound of a weapon (catalog entry): revolvers apart from pistols. */
export function gunshotClassOf(weapon) {
  if (!weapon) return 'pistol';
  if (weapon.class === 'handgun') return weapon.stance?.reload === 'cylinder' || /revolver/.test(weapon.id) ? 'revolver' : 'pistol';
  return GUNSHOT_CLASS_SOUND[weapon.class] ? weapon.class : 'pistol';
}

/** Which spent case a weapon throws ('brass', 'rifle_brass', 'shell') or null (revolvers keep theirs). */
export function casingKindOf(weapon) {
  const kind = gunshotClassOf(weapon);
  if (!weapon || weapon.class === 'thrown' || weapon.class === 'heavy' || weapon.class === 'melee' || weapon.class === 'unarmed') return null;
  if (kind === 'revolver') return null;
  if (kind === 'shotgun') return 'shell';
  return kind === 'rifle' || kind === 'sniper' ? 'rifle_brass' : 'brass';
}

/**
 * Renders one gunshot.
 * @param {{pitchHz?: number, decaySeconds?: number, noise?: number}} spec the catalog's sound
 * @param {string} kind a GUNSHOT_CLASS_SOUND key
 * @param {number} rate sample rate
 * @param {number} seed variant
 */
export function renderGunshot(spec, kind, rate, seed = 1) {
  const c = GUNSHOT_CLASS_SOUND[kind] ?? GUNSHOT_CLASS_SOUND.pistol;
  const pitch = spec?.pitchHz ?? 400;
  const decay = spec?.decaySeconds ?? 0.14;
  const noise = spec?.noise ?? 0.85;
  const pcm = createPcm(c.tail + decay * 2 + 0.25, rate);
  // The crack: a 2-4 ms snap of bright noise (the bullet's shock wave and the muzzle).
  addNoise(pcm, { type: 'highpass', freq: c.crackHz, q: 0.7, decay: 0.012, gain: 1.6 * c.crack, seed });
  // The blast: broadband noise sweeping down from the weapon's pitch harmonics.
  addNoise(pcm, { type: 'bandpass', freq: pitch * 5, freqEnd: pitch * 1.1, q: 0.55, decay: decay, gain: 1.1 * noise, seed: seed + 1 });
  // The body: a fast-falling tone at the weapon's pitch (the punch you feel).
  addTone(pcm, { wave: 'triangle', f0: pitch * 1.5, f1: pitch * 0.32, sweep: decay * 0.6, decay: decay * 0.85, gain: 0.8 * c.body });
  // The boom: brown noise under 300 Hz plus a low thump.
  addNoise(pcm, { colour: 'brown', type: 'lowpass', freq: 220 + pitch * 0.6, q: 0.6, attack: 0.002, decay: decay * 2.4 + c.boom * 0.12, gain: 1.4 * c.boom, seed: seed + 2 });
  addTone(pcm, { f0: 95, f1: 42, decay: 0.08 + c.boom * 0.18, gain: 0.55 * c.boom });
  // The mechanism: the slide or bolt slamming home right after.
  if (c.mech === 'slide') addRing(pcm, { at: 0.035, freqs: [2300, 3700, 5300], decays: [0.02, 0.015, 0.01], gain: 0.07 });
  if (c.mech === 'bolt') addRing(pcm, { at: 0.022, freqs: [1900, 3100, 4700], decays: [0.018, 0.012, 0.01], gain: 0.06 });
  // The street answering: darker echoes; the sniper's rolls on through the city.
  addEchoes(pcm, { delays: c.echoes, gain: kind === 'sniper' ? 0.42 : 0.3, fall: kind === 'sniper' ? 0.78 : 0.55, darkHz: kind === 'sniper' ? 1400 : 2600 });
  if (kind === 'sniper') addNoise(pcm, { colour: 'brown', type: 'lowpass', freq: 380, freqEnd: 120, q: 0.5, at: 0.15, attack: 0.25, decay: 2.2, gain: 0.5, seed: seed + 3 });
  return finishPcm(pcm, c.peak, 1.4);
}

/** A spent case bouncing on hard ground: brass rings, or a shotgun shell's dull plastic tock. */
export function renderCasing(kind, rate, seed = 1) {
  const pcm = createPcm(0.62, rate);
  const bounces = [0, 0.12, 0.205, 0.265, 0.305];
  const gains = [1, 0.55, 0.36, 0.22, 0.12];
  const jitter = (i) => 1 + ((seed * 7 + i * 13) % 9 - 4) * 0.012;
  for (let i = 0; i < bounces.length; i += 1) {
    const at = bounces[i] * (0.92 + (seed % 3) * 0.05);
    if (kind === 'shell') {
      addTone(pcm, { at, f0: 820 * jitter(i), f1: 700, decay: 0.035, gain: 0.6 * gains[i] });
      addNoise(pcm, { at, type: 'bandpass', freq: 1500, q: 1.5, decay: 0.02, gain: 0.7 * gains[i], seed: seed + i });
      addRing(pcm, { at, freqs: [2900 * jitter(i)], decays: [0.05], gain: 0.12 * gains[i] });
    } else {
      const base = kind === 'rifle_brass' ? 3200 : 4100;
      addNoise(pcm, { at, type: 'highpass', freq: 5000, decay: 0.006, gain: 0.5 * gains[i], seed: seed + i });
      addRing(pcm, { at, freqs: [base * jitter(i), base * 1.63 * jitter(i + 1), base * 2.41, base * 3.07], decays: [0.11, 0.08, 0.05, 0.035], gain: 0.42 * gains[i] });
    }
  }
  return finishPcm(pcm, 0.7);
}

/** A grenade striking the ground: a hollow steel clink over a thud. */
export function renderGrenadeBounce(rate, seed = 1) {
  const pcm = createPcm(0.35, rate);
  addNoise(pcm, { colour: 'brown', type: 'lowpass', freq: 500, decay: 0.05, gain: 1.2, seed });
  addRing(pcm, { freqs: [1180, 1870, 2950, 4100], decays: [0.16, 0.1, 0.07, 0.05], gain: 0.35 });
  return finishPcm(pcm, 0.75);
}

/** Car glass: 'crack' (a sharp tick and a creak) or 'shatter' (a burst and falling tinkles). */
export function renderGlass(kind, rate, seed = 1) {
  const pcm = createPcm(kind === 'crack' ? 0.4 : 1.1, rate);
  const random = (i) => ((Math.sin((seed + 1) * 12.9898 + i * 78.233) * 43758.5453) % 1 + 1) % 1;
  if (kind === 'crack') {
    addNoise(pcm, { type: 'highpass', freq: 3500, decay: 0.015, gain: 1.2, seed });
    addNoise(pcm, { type: 'bandpass', freq: 2200, freqEnd: 1300, q: 3, at: 0.02, attack: 0.03, decay: 0.18, gain: 0.25, crackle: 0.9, seed: seed + 1 });
    addRing(pcm, { freqs: [3900, 6100], decays: [0.06, 0.04], gain: 0.2 });
    return finishPcm(pcm, 0.6);
  }
  addNoise(pcm, { type: 'highpass', freq: 2500, decay: 0.12, gain: 1.4, seed });
  addNoise(pcm, { type: 'bandpass', freq: 5200, q: 0.8, decay: 0.45, gain: 0.5, crackle: 0.7, seed: seed + 1 });
  addNoise(pcm, { colour: 'brown', type: 'lowpass', freq: 600, decay: 0.08, gain: 0.6, seed: seed + 2 });
  for (let i = 0; i < 16; i += 1) {
    const at = 0.04 + random(i) * 0.75 * random(i + 40);
    addRing(pcm, { at, freqs: [2600 + random(i + 7) * 5200], decays: [0.03 + random(i + 3) * 0.06], gain: 0.22 * (1 - at) });
  }
  return finishPcm(pcm, 0.8);
}

/** The rocket leaving the tube: a hollow thump and the back-blast's roar. */
export function renderRocketLaunch(rate, seed = 1) {
  const pcm = createPcm(1.4, rate);
  addTone(pcm, { f0: 120, f1: 38, decay: 0.35, gain: 1 });
  addNoise(pcm, { type: 'bandpass', freq: 900, freqEnd: 260, q: 0.5, decay: 0.3, gain: 1.4, seed });
  addNoise(pcm, { colour: 'brown', type: 'lowpass', freq: 400, decay: 0.9, gain: 1.2, seed: seed + 1 });
  addNoise(pcm, { type: 'highpass', freq: 2500, decay: 0.05, gain: 0.8, seed: seed + 2 });
  addEchoes(pcm, { delays: [0.11, 0.25], gain: 0.3 });
  return finishPcm(pcm, 0.95, 1.3);
}

/** The rocket motor in flight: a tearing hiss that burns for about 1.6 s. */
export function renderRocketWhoosh(rate, seed = 1) {
  const pcm = createPcm(1.9, rate);
  addNoise(pcm, { type: 'bandpass', freq: 1800, freqEnd: 900, q: 0.9, attack: 0.04, decay: 1.6, gain: 1, crackle: 0.35, seed });
  addNoise(pcm, { colour: 'brown', type: 'lowpass', freq: 350, attack: 0.04, decay: 1.4, gain: 0.8, seed: seed + 1 });
  return finishPcm(pcm, 0.8);
}

/** A throw: the arm's swish. */
export function renderThrow(rate, seed = 1) {
  const pcm = createPcm(0.4, rate);
  addNoise(pcm, { type: 'bandpass', freq: 700, freqEnd: 2200, q: 1.2, attack: 0.12, decay: 0.16, gain: 0.8, seed });
  return finishPcm(pcm, 0.4);
}

/** A fire bottle bursting: the bottle smashing and the fuel catching with a soft whoomp. */
export function renderBottleSmash(rate, seed = 1) {
  const pcm = createPcm(1.6, rate);
  const glass = renderGlass('shatter', rate, seed);
  for (let i = 0; i < glass.data.length && i < pcm.data.length; i += 1) pcm.data[i] += glass.data[i] * 0.8;
  addNoise(pcm, { colour: 'brown', type: 'lowpass', freq: 160, freqEnd: 420, q: 0.7, at: 0.05, attack: 0.18, decay: 0.9, gain: 2.2, seed: seed + 5 });
  addNoise(pcm, { type: 'bandpass', freq: 1200, q: 0.8, at: 0.2, attack: 0.3, decay: 1, gain: 0.25, crackle: 0.9, seed: seed + 6 });
  return finishPcm(pcm, 0.85);
}

/** The pump's stroke: 'back' (a rasping slide and clack) or 'forward' (the chunk home). */
export function renderPumpStroke(kind, rate, seed = 1) {
  const pcm = createPcm(0.2, rate);
  addNoise(pcm, { type: 'bandpass', freq: kind === 'back' ? 2600 : 1900, q: 2.5, attack: 0.02, decay: 0.05, gain: 0.5, seed });
  addRing(pcm, { at: kind === 'back' ? 0.04 : 0.03, freqs: kind === 'back' ? [1500, 2700, 4300] : [1100, 2100, 3600], decays: [0.05, 0.035, 0.02], gain: 0.4 });
  addNoise(pcm, { at: kind === 'back' ? 0.04 : 0.03, colour: 'brown', type: 'lowpass', freq: 700, decay: 0.04, gain: 0.6, seed: seed + 1 });
  return finishPcm(pcm, 0.55);
}

/** The sniper's bolt: up, back, forward, down. */
export function renderBolt(rate, seed = 1) {
  const pcm = createPcm(0.7, rate);
  const clicks = [[0, 2400], [0.16, 1800], [0.36, 1500], [0.5, 2900]];
  for (const [at, hz] of clicks) {
    addRing(pcm, { at, freqs: [hz, hz * 1.7, hz * 2.6], decays: [0.04, 0.03, 0.02], gain: 0.35 });
    addNoise(pcm, { at, type: 'bandpass', freq: hz * 1.2, q: 2, attack: 0.01, decay: 0.05, gain: 0.3, seed: seed++ });
  }
  return finishPcm(pcm, 0.5);
}

/** Stealth stingers: 'suspicious' (a low pluck and a rising question) and 'alarm' (a stab). */
export function renderStinger(kind, rate) {
  const pcm = createPcm(kind === 'alarm' ? 2.2 : 1.6, rate);
  if (kind === 'alarm') {
    for (const hz of [146.8, 207.7, 293.7, 415.3]) addTone(pcm, { wave: 'triangle', f0: hz, attack: 0.005, decay: 1.4, gain: 0.35 });
    addTone(pcm, { wave: 'square', f0: 830.6, f1: 880, sweep: 0.6, attack: 0.01, decay: 0.9, gain: 0.12 });
    addNoise(pcm, { colour: 'brown', type: 'lowpass', freq: 160, decay: 1.2, gain: 1.4, seed: 3 });
    addNoise(pcm, { type: 'highpass', freq: 3000, decay: 0.08, gain: 0.5, seed: 4 });
    addTone(pcm, { f0: 70, f1: 36, decay: 0.8, gain: 0.8 });
    addEchoes(pcm, { delays: [0.19, 0.38], gain: 0.25 });
    return finishPcm(pcm, 0.75, 1.2);
  }
  addTone(pcm, { wave: 'triangle', f0: 110, attack: 0.004, decay: 1.1, gain: 0.6 });
  addTone(pcm, { f0: 466.2, at: 0.0, attack: 0.25, decay: 0.7, gain: 0.25 });
  addTone(pcm, { f0: 493.9, f1: 554.4, sweep: 0.5, at: 0.22, attack: 0.25, decay: 0.8, gain: 0.22 });
  addNoise(pcm, { type: 'bandpass', freq: 900, freqEnd: 2600, q: 2, attack: 0.5, decay: 0.5, gain: 0.12, seed: 9 });
  addEchoes(pcm, { delays: [0.25], gain: 0.3 });
  return finishPcm(pcm, 0.55);
}

/**
 * Every named one-shot of the bank (renderedSoundBank.js) with its renderer. Gunshots are
 * rendered per weapon id by the bank itself from the catalog.
 */
export const COMBAT_SOUND_RECIPES = Object.freeze({
  casing_brass: (rate, seed) => renderCasing('brass', rate, seed),
  casing_rifle_brass: (rate, seed) => renderCasing('rifle_brass', rate, seed),
  casing_shell: (rate, seed) => renderCasing('shell', rate, seed),
  grenade_bounce: renderGrenadeBounce,
  glass_crack: (rate, seed) => renderGlass('crack', rate, seed),
  glass_shatter: (rate, seed) => renderGlass('shatter', rate, seed),
  rocket_launch: renderRocketLaunch,
  rocket_whoosh: renderRocketWhoosh,
  throw_whoosh: renderThrow,
  bottle_smash: renderBottleSmash,
  pump_back: (rate, seed) => renderPumpStroke('back', rate, seed),
  pump_forward: (rate, seed) => renderPumpStroke('forward', rate, seed),
  sniper_bolt: renderBolt,
  stealth_suspicious: (rate) => renderStinger('suspicious', rate),
  stealth_alarm: (rate) => renderStinger('alarm', rate),
});
