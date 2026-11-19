// Siren and horn patterns: the pitch of a police wail and yelp, the ambulance's hi-lo two-tone,
// and the tones of each catalog horn kind. Pure functions of time, no WebAudio.

/** Horn tones (Hz, played together) by the vehicleCatalog `engine.horn` names. */
export const HORN_TONES = Object.freeze({
  beep_high: Object.freeze([523, 659]),
  two_tone: Object.freeze([415, 523]),
  deep: Object.freeze([277, 349]),
  air_horn: Object.freeze([185, 233, 277]),
  boat_horn: Object.freeze([98, 123]),
  loudspeaker: Object.freeze([440]),
  none: Object.freeze([]),
});

/** Siren pattern a catalog horn name selects; null for an ordinary horn. */
export function sirenPatternFor(hornName) {
  if (hornName === 'siren_wail') return 'wail';
  if (hornName === 'siren_yelp') return 'yelp';
  if (hornName === 'siren_hilo') return 'hilo';
  return null;
}

/** Horn tones for a catalog horn name (sirens fall back to two_tone for their manual horn). */
export function hornTonesFor(hornName) {
  return HORN_TONES[hornName] ?? HORN_TONES.two_tone;
}

/**
 * Siren pitch in Hz at time t (seconds since the siren started).
 * wail: a slow rise and fall 650..1450 Hz over 4.6 s; yelp: a fast 0.34 s sweep 720..1560 Hz;
 * hilo: the two-tone 960 / 770 Hz, 0.62 s each; 'patrol' alternates wail and yelp.
 * @param {'wail'|'yelp'|'hilo'|'patrol'} pattern
 * @param {number} t
 */
export function sirenFrequency(pattern, t) {
  if (pattern === 'patrol') return sirenFrequency(t % 14 < 9 ? 'wail' : 'yelp', t);
  if (pattern === 'yelp') {
    const p = (t % 0.34) / 0.34;
    const shape = p < 0.8 ? p / 0.8 : 1 - (p - 0.8) / 0.2;
    return 720 + 840 * shape;
  }
  if (pattern === 'hilo') return Math.floor(t / 0.62) % 2 === 0 ? 960 : 770;
  const p = (t % 4.6) / 4.6;
  return 650 + 800 * (0.5 - 0.5 * Math.cos(Math.PI * 2 * p));
}
