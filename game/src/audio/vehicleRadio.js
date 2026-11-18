// The vehicle radio: plays the station the player's vehicle is tuned to through the radio bus.
// A song from the composer is scheduled a fraction of a second ahead on the audio clock
// (kick, snare, hat, clap, bass, pad and lead voices synthesised per note, a shared vibrato
// and a little car-speaker colour); between songs the host's banter or an advert is shown as a
// subtitle over a short station jingle. Each station has its own sound (radioStationSounds.js):
// drum kit, filters that warm the bass, chords and lead, drive, echo and, for the night-drive
// station, a slow filter sweep. Tuning plays a burst of static and publishes
// RADIO_STATION_CHANGED. The radio key cycles the dial (plus off); emergency vehicles have none.
import { composeSong, midiToHz } from './radioSongComposer.js';
import { radioStationSound } from './radioStationSounds.js';

const LOOKAHEAD = 0.18;

/**
 * Creates the radio.
 * @param {ReturnType<import('./audioMixer.js').createAudioMixer>} mixer
 * @param {ReturnType<import('./synthesisVoices.js').createSynthesisVoices>} synth
 * @param {{stations: Record<string, object>, dial: string[], scales: object, rules: object, onChanged?: Function, onLine?: Function}} catalog
 */
export function createVehicleRadio(mixer, synth, catalog) {
  const ctx = mixer.ctx;
  const nyquist = ctx.sampleRate * 0.45;
  const filter = (type, hz, q = 0.7) => {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = Math.min(hz, nyquist);
    f.Q.value = q;
    return f;
  };
  const gainNode = (value) => {
    const g = ctx.createGain();
    g.gain.value = value;
    return g;
  };

  // Output: car-speaker band.
  const output = gainNode(0);
  const speakerLow = filter('highpass', 70);
  const speakerHigh = filter('lowpass', 9000);
  output.connect(speakerLow).connect(speakerHigh).connect(mixer.buses.radio);

  // Drums straight to the output; bass through its low-pass.
  const drums = gainNode(1);
  drums.connect(output);
  const bassFilter = filter('lowpass', 800, 0.9);
  bassFilter.connect(output);

  // Chords: sidechain duck -> drive -> low-pass (swept on some stations) -> output.
  const pad = gainNode(1);
  const padDrive = gainNode(1);
  const padShaper = ctx.createWaveShaper();
  padShaper.curve = synth.softClip;
  const padFilter = filter('lowpass', 2000, 0.7);
  const padOut = gainNode(1);
  pad.connect(padDrive).connect(padShaper).connect(padFilter).connect(padOut).connect(output);
  const sweep = ctx.createOscillator();
  sweep.frequency.value = 0.06;
  const sweepDepth = gainNode(0);
  sweep.connect(sweepDepth).connect(padFilter.detune);
  sweep.start();

  // Lead: drive -> soft clip -> low-pass -> output, with an echo send.
  const leadBus = gainNode(1);
  const leadShaper = ctx.createWaveShaper();
  leadShaper.curve = synth.softClip;
  const leadFilter = filter('lowpass', 3000, 0.6);
  const leadOut = gainNode(1);
  leadBus.connect(leadShaper).connect(leadFilter).connect(leadOut).connect(output);

  // Echo in time with the song: delay with a darkening feedback loop.
  const echoSend = gainNode(0);
  const echo = ctx.createDelay(2);
  echo.delayTime.value = 0.3;
  const echoTone = filter('lowpass', 2600, 0.5);
  const echoFeedback = gainNode(0);
  leadOut.connect(echoSend).connect(echo).connect(echoTone).connect(output);
  echoTone.connect(echoFeedback).connect(echo);
  padOut.connect(gainNode(0.25)).connect(echoSend);

  const vibrato = ctx.createOscillator();
  vibrato.frequency.value = 5.2;
  const vibratoDepth = ctx.createGain();
  vibrato.connect(vibratoDepth);
  vibrato.start();

  let stationId = null;
  let station = null;
  let sound = radioStationSound(null, null);
  let song = null;
  let bar = 0;
  let step = 0;
  let nextStepTime = 0;
  let songsPlayed = 0;
  let pauseUntil = 0;
  let lineIndex = 0;

  /** Sets the filters, drive, echo and sweep to the station's sound. */
  function voiceStation(now) {
    const music = station.music;
    sound = radioStationSound(stationId, music);
    bassFilter.frequency.setValueAtTime(Math.min(sound.bassHz, nyquist), now);
    padFilter.frequency.setValueAtTime(Math.min(sound.padHz, nyquist), now);
    padFilter.Q.setValueAtTime(sound.padQ, now);
    leadFilter.frequency.setValueAtTime(Math.min(sound.leadHz, nyquist), now);
    const padDistortion = music.pad?.distortion ?? 0;
    padDrive.gain.setValueAtTime(0.6 + 4 * padDistortion, now);
    padOut.gain.setValueAtTime(1 / (0.6 + 2.2 * padDistortion), now);
    leadBus.gain.setValueAtTime(0.8 + 5 * sound.drive, now);
    leadOut.gain.setValueAtTime(1 / (0.8 + 2.4 * sound.drive), now);
    sweepDepth.gain.setValueAtTime(sound.sweep ? 1100 : 0, now);
    echoSend.gain.setValueAtTime(sound.echo.mix, now);
    echoFeedback.gain.setValueAtTime(sound.echo.feedback, now);
    speakerHigh.frequency.setValueAtTime(Math.min(nyquist, 4500 + sound.leadHz), now);
    pad.gain.setValueAtTime(1, now);
  }

  function startSong(when) {
    const hour = Math.floor(Date.now() / 3.6e6);
    const seed = hashString(stationId) + hour * 7919 + songsPlayed * 104729;
    const [lo, hi] = catalog.rules?.songSeconds ?? [70, 110];
    song = composeSong(station.music, seed, catalog.scales, lo + ((seed >>> 3) % 1000) / 1000 * (hi - lo));
    bar = 0;
    step = 0;
    nextStepTime = when;
    vibratoDepth.gain.value = (station.music.lead.vibrato ?? 0) * 25;
    echo.delayTime.setValueAtTime(Math.min(1.9, sound.echo.steps * song.stepSeconds), when);
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
    const kit = sound.kit;
    const bits = song.drumsAt(bar, step);
    if (bits & 1) {
      const [k0, k1, kDecay, kGain] = kit.kick;
      synth.tone(drums, t, { f0: k0, f1: k1, sweep: kDecay * 0.35, decay: kDecay, gain: kGain });
      if (music.pad?.sidechain) { pad.gain.setValueAtTime(0.25, t); pad.gain.setTargetAtTime(1, t + 0.02, 0.08); }
    }
    if (bits & 2) {
      const [type, hz, decay, g, toneHz] = kit.snare;
      synth.burst(drums, t, { type, freq: Math.min(hz, nyquist), q: 0.7, decay, gain: g });
      if (toneHz) synth.tone(drums, t, { f0: toneHz, f1: toneHz * 0.78, decay: decay * 0.5, gain: g * 0.7 });
    }
    if (bits & 4) {
      const [type, hz, decay, g] = kit.hat;
      synth.burst(drums, t, { type, freq: Math.min(hz, nyquist), q: 0.7, decay: step % 4 === 2 ? decay * 2 : decay, gain: g });
    }
    if (bits & 8) for (let i = 0; i < 3; i += 1) synth.burst(drums, t + i * 0.011, { type: 'bandpass', freq: 1300, q: 1.2, decay: i === 2 ? 0.1 : 0.02, gain: 0.16 });
    if (music.clave?.[step] === 'x') synth.tone(drums, t, { f0: 2500, decay: 0.04, gain: 0.1 });

    const bass = song.bassAt(bar, step);
    if (bass >= 0 && song.sectionOf(bar) !== 'intro') note(bassFilter, t, midiToHz(bass), song.stepSeconds * 1.8, music.bass.wave, 0.008, 0.42);

    if (step === 0 && !music.pad?.stabs) {
      for (const n of song.chordOf(bar)) note(pad, t, midiToHz(n), song.secondsPerBar * 0.9, music.pad?.wave ?? 'triangle', 0.25, 0.06);
    } else if (music.pad?.stabs && (step === 2 || step === 6 || step === 10 || step === 14)) {
      for (const n of song.chordOf(bar)) note(pad, t, midiToHz(n), song.stepSeconds * 1.2, music.pad.wave, 0.005, 0.06);
    }
    const lead = song.leadAt(bar, step);
    if (lead >= 0) note(leadBus, t, midiToHz(lead), song.stepSeconds * (music.lead.arpeggio ? 1 : 2.2) + music.lead.release, music.lead.wave, music.lead.attack, music.lead.wave === 'sine' ? 0.22 : 0.13);
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
      if (station) voiceStation(now);
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
      output.gain.setTargetAtTime(audible && station ? 0.6 : 0, now, 0.15);
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
