// Each radio station's own sound, so the dial is six distinct records rather than one synth with
// six tunes: the drum kit (kick pitch and length, snare or brush or timbale, hats or ride or
// shaker), the filters that warm the bass, chords and lead, how hard the lead and chords are
// driven, and the echo (in sixteenth steps). Looked up by station id, else by the music's mood.

const KIT = Object.freeze({
  pop: { kick: [125, 48, 0.24, 0.85], snare: ['bandpass', 1900, 0.15, 0.3, 200], hat: ['highpass', 8000, 0.03, 0.09] },
  rock: { kick: [115, 44, 0.2, 1], snare: ['bandpass', 1500, 0.22, 0.42, 190], hat: ['highpass', 6200, 0.05, 0.11] },
  jazz: { kick: [95, 52, 0.2, 0.45], snare: ['highpass', 2800, 0.2, 0.12, 0], hat: ['bandpass', 5200, 0.28, 0.06] },
  lounge: { kick: [100, 48, 0.3, 0.7], snare: ['bandpass', 2600, 0.05, 0.2, 330], hat: ['highpass', 9000, 0.02, 0.07] },
  electro: { kick: [150, 40, 0.34, 1], snare: ['bandpass', 1700, 0.18, 0.3, 180], hat: ['highpass', 9500, 0.025, 0.08] },
  salsa: { kick: [230, 175, 0.16, 0.5], snare: ['bandpass', 3400, 0.08, 0.2, 880], hat: ['bandpass', 6500, 0.05, 0.08] },
});

/** Station sound by id: kit, filter cut-offs (Hz) and resonance, drive, echo. */
export const RADIO_STATION_SOUNDS = Object.freeze({
  muelle_88: { kit: KIT.pop, bassHz: 900, padHz: 2200, padQ: 0.7, leadHz: 3600, drive: 0.2, echo: { steps: 3, feedback: 0.25, mix: 0.16 } },
  hierro_rock: { kit: KIT.rock, bassHz: 1300, padHz: 3200, padQ: 1, leadHz: 3800, drive: 0.9, echo: { steps: 1, feedback: 0.1, mix: 0.08 } },
  voz_del_golfo: { kit: KIT.jazz, bassHz: 450, padHz: 1300, padQ: 0.5, leadHz: 2400, drive: 0, echo: { steps: 3, feedback: 0.2, mix: 0.14 } },
  brisa_dorada: { kit: KIT.lounge, bassHz: 550, padHz: 1500, padQ: 0.6, leadHz: 2600, drive: 0, echo: { steps: 3, feedback: 0.35, mix: 0.26 } },
  onda_neon: { kit: KIT.electro, bassHz: 650, padHz: 1900, padQ: 4, leadHz: 3000, drive: 0.15, echo: { steps: 3, feedback: 0.42, mix: 0.3 }, sweep: true },
  la_tumbadora: { kit: KIT.salsa, bassHz: 800, padHz: 2600, padQ: 0.7, leadHz: 3400, drive: 0.25, echo: { steps: 2, feedback: 0.12, mix: 0.09 } },
});

const BY_MOOD = Object.freeze({
  bright: RADIO_STATION_SOUNDS.muelle_88,
  aggressive: RADIO_STATION_SOUNDS.hierro_rock,
  smoky: RADIO_STATION_SOUNDS.voz_del_golfo,
  warm: RADIO_STATION_SOUNDS.brisa_dorada,
  driving: RADIO_STATION_SOUNDS.onda_neon,
  festive: RADIO_STATION_SOUNDS.la_tumbadora,
});

/**
 * The sound of a station.
 * @param {string} stationId
 * @param {{mood?: string}} [music]
 */
export function radioStationSound(stationId, music) {
  return RADIO_STATION_SOUNDS[stationId] ?? BY_MOOD[music?.mood] ?? RADIO_STATION_SOUNDS.muelle_88;
}
