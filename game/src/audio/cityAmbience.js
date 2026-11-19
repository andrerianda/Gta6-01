// The sound of Marazul around the listener: continuous beds (traffic hum and tyre hiss, wind,
// rain on the street and the roofs, waves on the shore, night insects) built once from looping
// noise and oscillators and faded to the mix of the place, hour and weather (ambienceMix.js);
// and scattered calls placed around the listener (birds by day, gulls by the sea, distant car
// horns and sirens). Muffled inside a car. Updates its levels five times a second, nothing per
// frame allocates.
import { SOUND_PRIORITY } from './voicePriorityTable.js';
import { ambienceLevels, createAmbienceLevels } from './ambienceMix.js';

/** Base gains of the beds at level 1. */
const BED_GAIN = Object.freeze({ traffic: 0.24, hiss: 0.03, wind: 0.14, rain: 0.11, roof: 0.07, waves: 0.3, wash: 0.06, insects: 0.03 });
const UPDATE_SECONDS = 0.2;

/**
 * Creates the ambience on the mixer's 'ambience' bus.
 * @param {ReturnType<import('./audioMixer.js').createAudioMixer>} mixer
 * @param {ReturnType<import('./synthesisVoices.js').createSynthesisVoices>} synth
 */
export function createCityAmbience(mixer, synth) {
  const ctx = mixer.ctx;
  const muffle = ctx.createBiquadFilter();
  muffle.type = 'lowpass';
  const openHz = Math.min(16000, ctx.sampleRate * 0.45);
  muffle.frequency.value = openHz;
  muffle.Q.value = 0.5;
  const out = ctx.createGain();
  out.gain.value = 1;
  out.connect(muffle).connect(mixer.buses.ambience);

  const sources = [];
  /** A looping noise bed through a chain of filters into its own gain. */
  const bed = (buffer, filters, rate = 1) => {
    const source = synth.loop(buffer);
    source.playbackRate.value = rate;
    let node = source;
    const made = [];
    for (const f of filters) {
      const filter = ctx.createBiquadFilter();
      filter.type = f.type;
      filter.frequency.value = f.freq;
      filter.Q.value = f.q ?? 0.7;
      node.connect(filter);
      node = filter;
      made.push(filter);
    }
    const gain = ctx.createGain();
    gain.gain.value = 0;
    node.connect(gain).connect(out);
    source.start(0, Math.random() * 1.5);
    sources.push(source);
    return { gain, filters: made };
  };

  const traffic = bed(synth.brown, [{ type: 'lowpass', freq: 300, q: 0.4 }], 0.8);
  const hiss = bed(synth.white, [{ type: 'bandpass', freq: 1000, q: 0.5 }, { type: 'lowpass', freq: 2200 }], 0.9);
  const wind = bed(synth.white, [{ type: 'bandpass', freq: 520, q: 1.4 }], 0.7);
  const rain = bed(synth.white, [{ type: 'highpass', freq: 1100 }, { type: 'lowpass', freq: 5200 }]);
  const roof = bed(synth.brown, [{ type: 'bandpass', freq: 380, q: 0.6 }], 1.3);
  const waves = bed(synth.brown, [{ type: 'lowpass', freq: 650, q: 0.5 }], 0.6);
  const wash = bed(synth.white, [{ type: 'bandpass', freq: 2400, q: 0.5 }], 0.8);

  // Night insects: two cricket voices, each a high sine gated by a fast square (the chirp's
  // pulses) and a slow sine (the phrases).
  const insects = ctx.createGain();
  insects.gain.value = 0;
  insects.connect(out);
  const oscillators = [];
  for (const [carrierHz, pulseHz, phraseHz, pan] of [[4350, 31, 1.3, -0.6], [5150, 23, 0.83, 0.5]]) {
    const carrier = ctx.createOscillator();
    carrier.frequency.value = carrierHz;
    const pulse = ctx.createGain();
    pulse.gain.value = 0.5;
    const pulseLfo = ctx.createOscillator();
    pulseLfo.type = 'square';
    pulseLfo.frequency.value = pulseHz;
    const pulseDepth = ctx.createGain();
    pulseDepth.gain.value = 0.5;
    pulseLfo.connect(pulseDepth).connect(pulse.gain);
    const phrase = ctx.createGain();
    phrase.gain.value = 0.5;
    const phraseLfo = ctx.createOscillator();
    phraseLfo.frequency.value = phraseHz;
    const phraseDepth = ctx.createGain();
    phraseDepth.gain.value = 0.5;
    phraseLfo.connect(phraseDepth).connect(phrase.gain);
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    if (panner.pan) panner.pan.value = pan;
    carrier.connect(pulse).connect(phrase).connect(panner).connect(insects);
    for (const o of [carrier, pulseLfo, phraseLfo]) { o.start(); oscillators.push(o); }
  }

  const levels = createAmbienceLevels();
  const where = { x: 0, y: 0, z: 0 };
  const timers = { bird: 2, gull: 4, horn: 3, siren: 20 };
  let tick = 0;
  let swell = 0;
  let gust = 0;
  let trafficDrift = 0;

  /** A place around the listener at `near`..`far` metres (written into `where`). */
  const around = (near, far, height) => {
    const p = mixer.listenerPosition;
    const angle = Math.random() * Math.PI * 2;
    const r = near + Math.random() * (far - near);
    where.x = p.x + Math.cos(angle) * r;
    where.z = p.z + Math.sin(angle) * r;
    where.y = p.y + height;
    return where;
  };

  const calls = {
    bird(t) {
      const v = mixer.voiceAt(around(8, 35, 6), { bus: 'ambience', priority: SOUND_PRIORITY.ambience, duration: 1.2, refDistance: 6, reverb: 0.1, maxDistance: 80 });
      if (!v) return;
      const kind = Math.random();
      if (kind < 0.25) { // a dove's soft three-note coo
        for (let i = 0; i < 3; i += 1) synth.tone(v, t + i * 0.42, { f0: 520 - i * 25, f1: 470 - i * 25, attack: 0.06, decay: i === 1 ? 0.45 : 0.3, gain: 0.2 });
        return;
      }
      const base = 2600 + Math.random() * 1800;
      const notes = 2 + Math.floor(Math.random() * 4);
      const rising = kind < 0.6;
      for (let i = 0; i < notes; i += 1) {
        const f = base * (1 + (i % 2) * 0.12);
        synth.tone(v, t + i * (0.09 + Math.random() * 0.05), { f0: rising ? f * 0.8 : f * 1.15, f1: rising ? f * 1.2 : f * 0.85, attack: 0.01, decay: 0.06 + Math.random() * 0.04, gain: 0.07 });
      }
    },
    gull(t) {
      const v = mixer.voiceAt(around(25, 90, 15), { bus: 'ambience', priority: SOUND_PRIORITY.ambience, duration: 2, refDistance: 14, reverb: 0.2, maxDistance: 150 });
      if (!v) return;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 1500;
      band.Q.value = 1.6;
      band.connect(v);
      const cries = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < cries; i += 1) {
        const long = i === 0;
        const f = 1300 + Math.random() * 300;
        synth.tone(band, t + i * (long ? 0.55 : 0.22) , { wave: 'sawtooth', f0: f, f1: f * (long ? 0.62 : 0.8), attack: 0.03, decay: long ? 0.45 : 0.14, gain: 0.12 });
      }
    },
    horn(t) {
      const v = mixer.voiceAt(around(50, 160, 1), { bus: 'ambience', priority: SOUND_PRIORITY.ambience, duration: 1.2, refDistance: 25, reverb: 0.45, maxDistance: 220 });
      if (!v) return;
      const low = ctx.createBiquadFilter();
      low.type = 'lowpass';
      low.frequency.value = 1800;
      low.connect(v);
      const pitch = 340 + Math.random() * 160;
      const taps = Math.random() < 0.4 ? 2 : 1;
      for (let i = 0; i < taps; i += 1) {
        const length = taps === 2 ? 0.12 : 0.3 + Math.random() * 0.5;
        const at = t + i * 0.22;
        synth.tone(low, at, { wave: 'square', f0: pitch, attack: 0.01, decay: length, gain: 0.05 });
        synth.tone(low, at, { wave: 'square', f0: pitch * 1.26, attack: 0.01, decay: length, gain: 0.04 });
      }
    },
    siren(t) {
      const v = mixer.voiceAt(around(260, 520, 3), { bus: 'ambience', priority: SOUND_PRIORITY.ambience, duration: 6, refDistance: 120, reverb: 0.6, maxDistance: 700 });
      if (!v) return;
      const low = ctx.createBiquadFilter();
      low.type = 'lowpass';
      low.frequency.value = 1300;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.linearRampToValueAtTime(0.06, t + 1.2);
      env.gain.setTargetAtTime(0.0001, t + 4.2, 0.5);
      const yelp = Math.random() < 0.3;
      const cycle = yelp ? 0.32 : 2.2;
      osc.frequency.setValueAtTime(650, t);
      for (let s = 0; s < 6.5; s += cycle) {
        osc.frequency.linearRampToValueAtTime(1400, t + s + cycle * 0.5);
        osc.frequency.linearRampToValueAtTime(650, t + s + cycle);
      }
      osc.connect(low).connect(env).connect(v);
      osc.start(t);
      osc.stop(t + 7);
    },
  };

  /** Counts a call's timer down and plays it at its rate (a Poisson-like spacing). */
  const schedule = (name, perSecond, dt, t) => {
    timers[name] -= dt;
    if (timers[name] > 0) return;
    timers[name] = (0.4 + Math.random() * 1.2) / Math.max(perSecond, 0.002);
    if (perSecond > 0.002) calls[name](t + 0.05);
  };

  const set = (param, value, t, lag = 0.6) => param.setTargetAtTime(value, t, lag);

  return {
    levels,

    /**
     * Fades the beds to the place, hour and weather and plays scattered calls.
     * @param {number} dt
     * @param {{district?: string|null, hour: number, nightFactor?: number, rain?: number, windSpeed?: number,
     *   shoreDistance?: number|null, inVehicle?: boolean}} state
     */
    update(dt, state) {
      tick += dt;
      if (tick < UPDATE_SECONDS) return;
      const step = tick;
      tick = 0;
      const t = ctx.currentTime;
      ambienceLevels(levels, state);
      // Slow movements: the swell of the sea, gusts, cars passing nearby.
      swell += step;
      gust += (Math.random() - 0.5) * step * 1.5 - gust * step * 0.4;
      trafficDrift += (Math.random() - 0.5) * step * 0.8 - trafficDrift * step * 0.3;
      const wave = 0.55 + 0.45 * Math.sin(swell * 0.8) * Math.sin(swell * 0.23 + 1);
      const g = Math.max(0, Math.min(1, levels.wind * (0.75 + gust)));

      set(traffic.gain.gain, BED_GAIN.traffic * levels.traffic * (0.85 + trafficDrift), t, 0.8);
      set(hiss.gain.gain, BED_GAIN.hiss * levels.traffic * (0.6 + 0.8 * Math.max(0, trafficDrift + 0.3)) * (1 + levels.rain), t, 0.5);
      set(wind.gain.gain, BED_GAIN.wind * g, t, 0.5);
      set(wind.filters[0].frequency, 320 + 700 * g, t, 0.5);
      set(rain.gain.gain, BED_GAIN.rain * levels.rain, t, 1);
      set(roof.gain.gain, BED_GAIN.roof * levels.rain * levels.rain, t, 1);
      set(waves.gain.gain, BED_GAIN.waves * levels.waves * wave, t, 0.4);
      set(wash.gain.gain, BED_GAIN.wash * levels.waves * wave * wave, t, 0.3);
      set(insects.gain, BED_GAIN.insects * levels.insects, t, 1.5);
      set(muffle.frequency, state.inVehicle ? 700 : openHz, t, 0.15);
      set(out.gain, state.inVehicle ? 0.55 : 1, t, 0.15);

      schedule('bird', levels.birdsPerSecond, step, t);
      schedule('gull', levels.gullsPerSecond, step, t);
      schedule('horn', levels.hornsPerSecond, step, t);
      schedule('siren', levels.sirensPerSecond, step, t);
    },

    /** Silences the beds (menus, cutscenes). */
    silence() {
      out.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
    },

    dispose() {
      for (const s of sources) s.stop();
      for (const o of oscillators) o.stop();
      out.disconnect();
    },
  };
}
