// The radio composer: chords from roman numerals, songs that stay in key and in tempo, the
// same seed giving the same song.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chordFromNumeral, composeSong, midiToHz } from '../../../game/src/audio/radioSongComposer.js';
import { RADIO_STATIONS, RADIO_SCALES, RADIO_DIAL_ORDER } from '../../../game/src/catalog/radioStations.js';

test('roman numerals build the right chords', () => {
  assert.deepEqual(chordFromNumeral('I'), [0, 4, 7]);
  assert.deepEqual(chordFromNumeral('vi'), [9, 12, 16]);
  assert.deepEqual(chordFromNumeral('ii7'), [2, 5, 9, 12]);
  assert.deepEqual(chordFromNumeral('Imaj7'), [0, 4, 7, 11]);
  assert.deepEqual(chordFromNumeral('V7sus'), [7, 12, 14, 17]);
  assert.deepEqual(chordFromNumeral('bVII'), [10, 14, 17]);
  assert.deepEqual(chordFromNumeral('VI', true), [8, 12, 15]);
  assert.deepEqual(chordFromNumeral('i', true), [0, 3, 7]);
  assert.equal(midiToHz(69), 440);
});

test('every station composes a playable song in its tempo, in key, deterministically', () => {
  assert.equal(RADIO_DIAL_ORDER.length, 6);
  for (const id of RADIO_DIAL_ORDER) {
    const music = RADIO_STATIONS[id].music;
    const song = composeSong(music, 12345, RADIO_SCALES, 90);
    const again = composeSong(music, 12345, RADIO_SCALES, 90);
    assert.ok(song.tempo >= music.tempoRange[0] && song.tempo <= music.tempoRange[1], id);
    assert.ok(song.bars >= 16 && song.bars % 4 === 0, id);
    assert.ok(Math.abs(song.bars * song.secondsPerBar - 90) < song.secondsPerBar * 4 + 1e-9 || song.bars === 16, id);
    let leadNotes = 0;
    let drumHits = 0;
    const scale = new Set(song.scale);
    let inKey = 0;
    for (let bar = 0; bar < song.bars; bar += 1) {
      const chordNotes = new Set(song.chordOf(bar).map((n) => ((n - song.root) % 12 + 12) % 12));
      for (let step = 0; step < 16; step += 1) {
        const lead = song.leadAt(bar, step);
        assert.equal(lead, again.leadAt(bar, step));
        if (lead >= 0) {
          leadNotes += 1;
          assert.ok(lead >= 36 && lead <= 100, `${id} lead ${lead}`);
          const pc = ((lead - song.root) % 12 + 12) % 12;
          if (scale.has(pc) || chordNotes.has(pc)) inKey += 1;
        }
        if (song.drumsAt(bar, step)) drumHits += 1;
        const bass = song.bassAt(bar, step);
        if (bass >= 0) assert.ok(bass >= 16 && bass <= 72, `${id} bass ${bass}`);
      }
    }
    assert.ok(leadNotes > song.bars * 2, `${id} has a lead (${leadNotes})`);
    assert.ok(drumHits > song.bars * 4, `${id} has drums`);
    assert.ok(inKey / leadNotes > 0.9, `${id} lead stays in key (${inKey}/${leadNotes})`);
  }
});

test('different seeds give different songs', () => {
  const music = RADIO_STATIONS.muelle_88.music;
  const a = composeSong(music, 1, RADIO_SCALES);
  const b = composeSong(music, 99, RADIO_SCALES);
  let differences = 0;
  for (let bar = 4; bar < 16; bar += 1) for (let s = 0; s < 16; s += 1) if (a.leadAt(bar, s) !== b.leadAt(bar, s)) differences += 1;
  assert.ok(differences > 10 || a.tempo !== b.tempo || a.root !== b.root);
});
