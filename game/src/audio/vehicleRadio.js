// The vehicle radio: plays the station the player's vehicle is tuned to through the radio bus.
// A song from the composer is scheduled a fraction of a second ahead on the audio clock
// (kick, snare, hat, clap, bass, pad and lead voices synthesised per note, a shared vibrato
// and a little car-speaker colour); between songs the host's banter or an advert is shown as a
// subtitle over a short station jingle. Tuning plays a burst of static and publishes
// RADIO_STATION_CHANGED. The radio key cycles the dial (plus off); emergency vehicles have none.
import { composeSong, midiToHz } from './radioSongComposer.js';

const LOOKAHEAD = 0.18;

/**
 * Creates the radio.
 * @param {ReturnType<import('./audioMixer.js').createAudioMixer>} mixer
 * @param {ReturnType<import('./synthesisVoices.js').createSynthesisVoices>} synth
 * @param {{stations: Record<string, object>, dial: string[], scales: object, rules: object, onChanged?: Function, onLine?: Function}} catalog
 */
export function createVehicleRadio(mixer, synth, catalog) {
  const ctx = mixer.ctx;
  const output = ctx.createGain();
  output.gain.value = 0;
  const speakerLow = ctx.createBiquadFilter();
  speakerLow.type = 'highpass';
  speakerLow.frequency.value = 70;
  const speakerHigh = ctx.createBiquadFilter();
  speakerHigh.type = 'lowpass';
  speakerHigh.frequency.value = 9000;
  output.connect(speakerLow).connect(speakerHigh).connect(mixer.buses.radio);
  const pad = ctx.createGain();
  pad.connect(output);
  const leadBus = ctx.createWaveShaper();
  leadBus.curve = synth.softClip;
  leadBus.connect(output);
  const vibrato = ctx.createOscillator();
  vibrato.frequency.value = 5.2;
  const vibratoDepth = ctx.createGain();
  vibrato.connect(vibratoDepth);
  vibrato.start();

  let stationId = null;
  let station = null;
  let song = null;
  let bar = 0;
  let step = 0;
  let nextStepTime = 0;
  let songsPlayed = 0;
  let pauseUntil = 0;
  let lineIndex = 0;

  function startSong(when) {
    const hour = Math.floor(Date.now() / 3.6e6);
    const seed = hashString(stationId) + hour * 7919 + songsPlayed * 104729;
    const [lo, hi] = catalog.rules?.songSeconds ?? [70, 110];
    song = composeSong(station.music, seed, catalog.scales, lo + ((seed >>> 3) % 1000) / 1000 * (hi - lo));
    bar = 0;
    step = 0;
    nextStepTime = when;
    vibratoDepth.gain.value = (station.music.lead.vibrato ?? 0) * 25;
  }

  function betweenSongs() {
    songsPlayed += 1;
    const lines = station.lines ?? [];
    const every = catalog.rules?.advertEverySongs ?? 3;
    const wantAdvert = songsPlayed % every === 0;
    const pool = lines.filter((l) => (l.kind === 'advert') === wantAdvert);
    const line = pool.length ? pool[(lineIndex += 1) % pool.length] : null;
    const now = ctx.currentTime;
    jingle(now + 0.1);
    if (line) catalog.onLine?.({ speakerName: wantAdvert ? station.name : station.host?.name, text: line.text, seconds: 5.5 });
    pauseUntil = now + (line ? 6 : 1.2);
    song = null;
  }

  function jingle(t) {
    const chord = [0, 4, 7, 12];
    const base = station.music.roots[0] + 12;
    for (let i = 0; i < chord.length; i += 1) {
      note(leadBus, t + i * 0.11, midiToHz(base + chord[i]), 0.5, 'triangle', 0.01, 0.12);
    }
  }

  function note(out, t, hz, length, wave, attack, gain) {
    const osc = ctx.createOscillator();
    osc.type = wave;
    osc.frequency.value = hz;
    vibratoDepth.connect(osc.detune);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.setTargetAtTime(0.0001, t + Math.max(attack, length * 0.6), length * 0.35 + 0.02);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + length * 1.8 + 0.1);
    osc.onended = () => vibratoDepth.disconnect(osc.detune);
  }

  function playStep(t) {
    const music = station.music;
    const bits = song.drumsAt(bar, step);
    if (bits & 1) {
      synth.tone(output, t, { f0: 130, f1: 42, sweep: 0.09, decay: 0.28, gain: 0.9 });
      if (music.pad?.sidechain) { pad.gain.setValueAtTime(0.25, t); pad.gain.setTargetAtTime(1, t + 0.02, 0.08); }
    }
    if (bits & 2) {
      synth.burst(output, t, { type: 'bandpass', freq: 1900, q: 0.7, decay: 0.16, gain: 0.35 });
      synth.tone(output, t, { f0: 210, f1: 160, decay: 0.08, gain: 0.25 });
    }
    if (bits & 4) synth.burst(output, t, { type: 'highpass', freq: 7500, q: 0.7, decay: step % 4 === 2 ? 0.06 : 0.03, gain: 0.14 });
    if (bits & 8) for (let i = 0; i < 3; i += 1) synth.burst(output, t + i * 0.011, { type: 'bandpass', freq: 1300, q: 1.2, decay: i === 2 ? 0.12 : 0.02, gain: 0.25 });
    if (music.clave?.[step] === 'x') synth.tone(output, t, { f0: 2500, decay: 0.04, gain: 0.12 });

    const bass = song.bassAt(bar, step);
    if (bass >= 0 && song.sectionOf(bar) !== 'intro') note(output, t, midiToHz(bass), song.stepSeconds * 1.8, music.bass.wave, 0.008, 0.38);

    if (step === 0 && !music.pad?.stabs) {
      for (const n of song.chordOf(bar)) note(pad, t, midiToHz(n), song.secondsPerBar * 0.9, music.pad?.wave ?? 'triangle', 0.25, 0.05);
    } else if (music.pad?.stabs && (step === 2 || step === 6 || step === 10 || step === 14)) {
      for (const n of song.chordOf(bar)) note(pad, t, midiToHz(n), song.stepSeconds * 1.2, music.pad.wave, 0.005, 0.05);
    }
    const lead = song.leadAt(bar, step);
    if (lead >= 0) note(leadBus, t, midiToHz(lead), song.stepSeconds * (music.lead.arpeggio ? 1 : 2.2) + music.lead.release, music.lead.wave, music.lead.attack, music.lead.wave === 'sine' ? 0.22 : 0.12);
  }

  return {
    get stationId() { return stationId; },

    /** Tunes to a station id (or null / 'radio_off'). */
    tune(id) {
      const next = id && catalog.stations[id] ? id : null;
      if (next === stationId) return;
      const previousId = stationId;
      stationId = next;
      station = next ? catalog.stations[next] : null;
      song = null;
      pauseUntil = 0;
      const now = ctx.currentTime;
      synth.burst(output, now, { type: 'bandpass', freq: 2500, q: 0.4, decay: catalog.rules?.tuneStaticSeconds ?? 0.35, gain: 0.3 });
      if (station) {
        pad.gain.value = 1;
        const filterHz = station.music.pad?.filterHz ?? 2000;
        speakerHigh.frequency.setValueAtTime(Math.min(12000, filterHz * 4), now);
      }
      catalog.onChanged?.({ stationId: next ?? 'radio_off', name: station?.name ?? catalog.rules?.offOption?.name ?? 'Radio off', previousId: previousId ?? 'radio_off' });
    },

    /** Moves along the dial (+1 / -1), wrapping through 'off'. */
    cycle(direction) {
      const dial = [...catalog.dial, null];
      const index = dial.indexOf(stationId);
      this.tune(dial[(index + direction + dial.length) % dial.length]);
    },

    /** Schedules ahead; `audible` is false when the player is not in a vehicle. */
    update(audible) {
      const now = ctx.currentTime;
      output.gain.setTargetAtTime(audible && station ? 0.55 : 0, now, 0.15);
      if (!audible || !station) return;
      if (!song) {
        if (now < pauseUntil) return;
        startSong(now + 0.05);
      }
      while (song && nextStepTime < now + LOOKAHEAD) {
        const swingDelay = step % 2 === 1 ? song.swing * song.stepSeconds * 0.5 : 0;
        if (nextStepTime > now - 0.05) playStep(nextStepTime + swingDelay);
        nextStepTime += song.stepSeconds;
        step += 1;
        if (step === 16) {
          step = 0;
          bar += 1;
          if (bar >= song.bars) betweenSongs();
        }
      }
    },
  };
}

function hashString(text) {
  let h = 2166136261;
  for (let i = 0; i < (text ?? '').length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
