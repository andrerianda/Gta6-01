// The radio's composer: turns a station's music hints (radioStations catalog: tempo range,
// scale, roots, chord progression, bass and drum patterns, lead style) and a seed into a song
// the synthesiser can play bar by bar. Chords are built from the progression's roman numerals
// in the chosen key; the bass follows the station's pattern on chord roots and fifths; the lead
// is a seeded one-bar motif repeated and varied over four-bar phrases, landing on chord tones on
// the strong beats, so it sounds like a tune rather than random notes. Pure, no WebAudio.

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const NUMERALS = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii'];
const LEAD_RHYTHMS = ['x--x--x-x---x-x-', 'x-x---x-x-x-----', 'x---x-x---x-x-x-', 'x--x---xx--x-x--', 'x-xx--x---x-xx--', '--x-x--x--x-x---'];

/**
 * Parses a roman-numeral chord ('I', 'vi', 'ii7', 'Imaj7', 'V7sus', 'bVII') in a key.
 * @param {string} symbol
 * @param {boolean} minorKey whether the key's tonic chord is minor
 * @returns {number[]} semitone offsets of the chord tones above the key root
 */
export function chordFromNumeral(symbol, minorKey = false) {
  const match = /^(b?)([ivIV]+)(maj7|7sus|7|sus)?$/.exec(symbol);
  if (!match) return [0, 4, 7];
  const [, flat, numeral, suffix] = match;
  const degree = NUMERALS.indexOf(numeral.toLowerCase());
  const upper = numeral === numeral.toUpperCase();
  const root = flat ? MAJOR[degree] - 1 : (minorKey ? MINOR : MAJOR)[degree];
  let tones = suffix && suffix.includes('sus') ? [0, 5, 7] : upper ? [0, 4, 7] : [0, 3, 7];
  if (suffix === 'maj7') tones = [...tones, 11];
  else if (suffix === '7' || suffix === '7sus') tones = [...tones, 10];
  return tones.map((t) => root + t);
}

/**
 * Composes a song for a station.
 * @param {object} music The station's `music` hints.
 * @param {number} seed Any integer (station and in-game hour, per RADIO_RULES).
 * @param {Record<string, number[]>} scales RADIO_SCALES
 * @param {number} [seconds] Target length.
 */
export function composeSong(music, seed, scales, seconds = 90) {
  const random = seededRandom(seed);
  const [lo, hi] = music.tempoRange;
  const tempo = Math.round(lo + (hi - lo) * random());
  const root = music.roots[Math.floor(random() * music.roots.length)];
  const scale = scales[music.scale] ?? MAJOR;
  const minorKey = /^i(?![iv])/.test(music.chordProgression[0]) || music.chordProgression[0] === 'i';
  const chords = music.chordProgression.map((symbol) => {
    const tones = chordFromNumeral(symbol, minorKey);
    return music.pad?.powerChords ? [tones[0], tones[0] + 7, tones[0] + 12] : tones;
  });
  const secondsPerBar = (60 / tempo) * 4;
  const bars = Math.max(16, Math.round(seconds / secondsPerBar / 4) * 4);

  // Two lead motifs (verse and chorus), each a rhythm and a contour of scale steps.
  const motifs = [0, 1].map(() => {
    const rhythm = LEAD_RHYTHMS[Math.floor(random() * LEAD_RHYTHMS.length)];
    const contour = [];
    let step = 0;
    for (let i = 0; i < 16; i += 1) {
      if (rhythm[i] !== 'x') { contour.push(null); continue; }
      step += Math.round((random() - 0.5) * 3.2);
      step = Math.max(-3, Math.min(5, step));
      contour.push(step);
    }
    return contour;
  });

  return {
    tempo, root, scale, chords, bars, secondsPerBar,
    swing: music.swing ?? 0,
    stepSeconds: secondsPerBar / 16,
    /** Section of a bar: intro, verse, chorus or outro (drives which parts play). */
    sectionOf(bar) {
      if (bar < 4) return 'intro';
      if (bar >= bars - 2) return 'outro';
      return Math.floor((bar - 4) / 8) % 2 === 0 ? 'verse' : 'chorus';
    },
    /** The chord (MIDI notes) of a bar. */
    chordOf(bar) {
      const chord = chords[bar % chords.length];
      return chord.map((t) => root + t);
    },
    /** The bass note (MIDI) at a step, or -1 for a rest. */
    bassAt(bar, step) {
      if (music.bass.pattern[step] !== 'x') return -1;
      const chordRoot = root + chords[bar % chords.length][0];
      const bass = chordRoot - (chordRoot >= root + 7 ? 24 : 12);
      return step % 8 === 6 && music.mood !== 'smoky' ? bass + 7 : bass;
    },
    /** Which drums hit at a step: bit 1 kick, 2 snare, 4 hat, 8 clap. */
    drumsAt(bar, step) {
      const d = music.drums;
      const section = this.sectionOf(bar);
      let bits = 0;
      if (d.kick[step] === 'x') bits |= 1;
      if (section !== 'intro' && d.snare[step] === 'x') bits |= 2;
      if (d.hat[step] === 'x') bits |= 4;
      if (section === 'chorus' && d.clap[step] === 'x') bits |= 8;
      if (section === 'outro' && step > 0) bits &= 4;
      return bits;
    },
    /** The lead note (MIDI) at a step, or -1. */
    leadAt(bar, step) {
      const section = this.sectionOf(bar);
      if (section === 'intro' || section === 'outro') return -1;
      const chord = this.chordOf(bar);
      if (music.lead.arpeggio) {
        if (section === 'verse' && step % 2 === 1) return -1;
        const pick = music.lead.arpeggio[step % music.lead.arpeggio.length] % chord.length;
        return chord[pick] + 12 + (step >= 8 ? 12 : 0) * (bar % 2);
      }
      if (music.lead.montuno && section === 'verse') {
        return 'x-x-xx-x-x-xx-x-'[step] === 'x' ? chord[(step >> 1) % chord.length] + 12 : -1;
      }
      const motif = motifs[section === 'chorus' ? 1 : 0];
      const offset = motif[step];
      if (offset === null) return -1;
      if (section === 'verse' && bar % 4 === 3 && step >= 8) return -1;
      // Anchor on the chord root's scale degree, answer phrases a third higher, land on chord tones.
      const lift = bar % 4 === 2 ? 2 : 0;
      const note = degreeToMidi(root + 12, scale, nearestDegree(scale, chords[bar % chords.length][0]) + offset + lift);
      return step % 8 === 0 ? nearestOf(note, chord.map((n) => n + 12), chord.map((n) => n + 24)) : note;
    },
  };
}

/** MIDI note number to frequency. */
export function midiToHz(note) {
  return 440 * Math.pow(2, (note - 69) / 12);
}

function degreeToMidi(base, scale, degree) {
  const octave = Math.floor(degree / scale.length);
  const index = ((degree % scale.length) + scale.length) % scale.length;
  return base + octave * 12 + scale[index];
}

function nearestDegree(scale, semitone) {
  const s = ((semitone % 12) + 12) % 12;
  let best = 0;
  for (let i = 0; i < scale.length; i += 1) if (Math.abs(scale[i] - s) < Math.abs(scale[best] - s)) best = i;
  return best;
}

function nearestOf(note, ...groups) {
  let best = note;
  let bestDistance = Infinity;
  for (const group of groups) for (const n of group) {
    const d = Math.abs(n - note);
    if (d < bestDistance) { bestDistance = d; best = n; }
  }
  return best;
}

function seededRandom(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
