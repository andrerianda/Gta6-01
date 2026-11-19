// The colour of a speaker's name in the story's subtitles, as pure rules: red for those hunting the
// lead (Coronel Vargas, Halcón flight, the navy), amber for the tower while it believes
// "Lt. Osorio" and red once the alarm has gone off, white for Dez, dark violet for El Comprador
// until he shows his hand (his last line, and everything after `betrayed`), steel for everyone
// else and a pale italic blue for the flashback. Also the colour of a plain radio line by its
// channel, and how long a line stays up when no voiced clip gives its length. No imports.

/** Tone name -> hex colour of the speaker's name. */
export const SUBTITLE_TONES = Object.freeze({
  white: '#ffffff',
  amber: '#f2b13c',
  red: '#e5484d',
  violet: '#6f42c1',
  steel: '#b9c4cf',
  memory: '#9db4c8',
});

/** The near-white of the spoken text itself. */
export const SUBTITLE_TEXT_COLOUR = '#f4f1ea';

/**
 * The tone of a story line's speaker name.
 * @param {{channel?: string, tone?: string} | null | undefined} line A line of FINAL_ARC_LINES.
 * @param {{tone?: string} | null | undefined} speaker Its speaker in FINAL_ARC_SPEAKERS.
 * @param {{alarm?: boolean, betrayed?: boolean} | null} [storyState]
 * @returns {'white'|'amber'|'red'|'violet'|'steel'|'memory'}
 */
export function subtitleToneOf(line, speaker, storyState = null) {
  if (line?.tone && SUBTITLE_TONES[line.tone]) return line.tone;
  if (line?.channel === 'memory') return 'memory';
  const tone = speaker?.tone && SUBTITLE_TONES[speaker.tone] ? speaker.tone : 'steel';
  if (tone === 'amber' && storyState?.alarm) return 'red';
  if (tone === 'violet' && storyState?.betrayed) return 'red';
  return tone;
}

/**
 * The tone of a plain radio line (RADIO_MESSAGE) by its channel.
 * @param {string | null | undefined} channel 'tower' | 'airGuard' | 'airspace' | 'guard' | 'navy'.
 * @param {{alarm?: boolean} | null} [storyState]
 * @returns {'amber'|'red'|'steel'}
 */
export function radioChannelTone(channel, storyState = null) {
  if (channel === 'airGuard' || channel === 'airspace' || channel === 'navy') return 'red';
  if (channel === 'tower') return storyState?.alarm ? 'red' : 'amber';
  return 'steel';
}

/**
 * How long a line needs on screen when read (and spoken at a calm pace): about 2.7 words a
 * second plus a breath, a little more for each pause written into it, between 1.4 and 14 seconds.
 * @param {string | null | undefined} text
 * @returns {number} Seconds.
 */
export function readingSecondsOf(text) {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) return 0;
  const pauses = (String(text).match(/\.\.\.|[.,;:!?]/g) ?? []).length;
  const seconds = 0.9 + words / 2.7 + pauses * 0.12;
  return Math.round(Math.min(14, Math.max(1.4, seconds)) * 100) / 100;
}
