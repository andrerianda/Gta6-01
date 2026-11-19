// The voiced lines outside the final arc: who speaks them with which stock voice, the police
// dispatch chatter heard during a chase, and the key a line's clip is found by. A clip is looked
// up by the exact text the subtitle shows (voiceKeyOf), so the voice and the subtitle can never
// disagree: a line whose text changes simply falls back to the silent subtitle until the clips are
// generated again (tools/voices/generate-story-voices.mjs). No imports.

/** The stock voice of every story character, the dispatcher and the radio voices that are not in the final arc's cast. */
export const STORY_VOICE_CAST = Object.freeze({
  dez_tolliver: 'aura-2-arcas-en',        // the same voice as in the final arc
  ximena_robles: 'aura-2-andromeda-en',   // the same voice as in the final arc
  sol_arrieta: 'aura-2-selene-en',
  hattie_tolliver: 'aura-2-hera-en',
  aurelio_santangel: 'aura-2-pluto-en',
  etienne_lemaire: 'aura-2-draco-en',
  renata_olabarria: 'aura-2-vesta-en',
  jacinto_roldan: 'aura-2-apollo-en',
  clovis_arceneaux: 'aura-2-mars-en',
  amara_whitlock: 'aura-2-cordelia-en',
  emmett_strand: 'aura-2-neptune-en',
  nadia_finch: 'aura-2-minerva-en',
  ozzy_prieto: 'aura-2-hyperion-en',
  pim_adeyemi: 'aura-2-iris-en',
  odette_baptiste: 'aura-2-callista-en',
  dispatch: 'aura-2-asteria-en',
  air_one: 'aura-2-orpheus-en',
  gate_guard: 'aura-2-hermes-en',         // the final arc's gate guard
  halcon_uno: 'aura-2-orion-en',          // the final arc's interceptor pilots and control
  halcon_dos: 'aura-2-aries-en',
  air_control: 'aura-2-atlas-en',
});

/** The police radio during a chase: the speakers, and the lines beyond each star's own radioCall (wantedLevels.js). */
export const POLICE_RADIO = Object.freeze({
  speakers: Object.freeze({ dispatch: 'Dispatch', air_one: 'Air One' }),
  /** Who reads each star's radioCall when the wanted level rises to it. */
  levelSpeaker: Object.freeze([null, 'dispatch', 'dispatch', 'dispatch', 'dispatch', 'dispatch']),
  /** Out of sight: the dispatcher, or Air One once the helicopter is up (three stars and more). */
  search: Object.freeze({ speaker: 'dispatch', text: 'All units, suspect is out of sight. Close the area and search block by block.' }),
  searchFromAir: Object.freeze({ speaker: 'air_one', text: 'Air One, lost the visual. Sweeping the last known position.', fromLevel: 3 }),
  /** The chase is over, by the reason of WANTED_CLEARED. */
  cleared: Object.freeze({
    escaped: Object.freeze({ speaker: 'dispatch', text: 'All units, the search is over. Suspect not found. Back to patrol.' }),
    busted: Object.freeze({ speaker: 'dispatch', text: 'Suspect is in custody. All units, stand down.' }),
  }),
  /** Seconds between two police lines at least. */
  restSeconds: 5,
});

/** The speaker id of each radio voice by the RADIO_MESSAGE speaker of the air guard's lines. */
export const AIR_GUARD_SPEAKERS = Object.freeze({ 0: 'halcon_uno', 1: 'halcon_dos', control: 'air_control' });

/**
 * The key of a line's clip: FNV-1a of its text with the spaces evened, as eight hex digits.
 * @param {string} text
 * @returns {string}
 */
export function voiceKeyOf(text) {
  const even = String(text ?? '').trim().replace(/\s+/g, ' ');
  let hash = 2166136261;
  for (let i = 0; i < even.length; i += 1) hash = Math.imul(hash ^ even.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}
