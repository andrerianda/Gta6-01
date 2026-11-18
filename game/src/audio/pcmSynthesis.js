// Sample synthesis straight into Float32Arrays: the building blocks the rendered sound bank,
// the radio's drum hits and the helicopter rotor loop are made from once, so that playing one
// at run time is a single buffer source instead of a dozen live oscillators and filters. Pure
// JavaScript (no WebAudio), deterministic for a seed, so Node tests can measure what it makes.
//
// A sound is a PCM record {data, rate}; layers are mixed into it: filtered noise bursts (a
// state-variable filter that can sweep), swept tones, inharmonic rings (metal, glass) and
// rolling echoes of what is already there.

/** A silent PCM record `seconds` long. */
export function createPcm(seconds, rate) {
  return { data: new Float32Array(Math.max(1, Math.ceil(seconds * rate))), rate };
}

/** A small seeded random source: returns numbers in [-1, 1). */
export function seededRandom(seed = 1) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2147483648 - 1;
  };
}

/** Envelope value `t` seconds in: linear attack, then an exponential fall of 40 dB over `decay`. */
export function envelopeAt(t, attack, decay) {
  if (t < 0) return 0;
  if (t < attack) return t / attack;
  return Math.exp(-(t - attack) * 4.6 / decay);
}

/**
 * Adds a filtered noise burst.
 * @param {{data: Float32Array, rate: number}} pcm
 * @param {{at?: number, attack?: number, decay: number, gain: number, colour?: 'white'|'brown',
 *   type?: 'lowpass'|'highpass'|'bandpass', freq?: number, freqEnd?: number, q?: number, seed?: number,
 *   crackle?: number}} o crackle: 0..1 of the noise replaced by sparse sharp pops
 */
export function addNoise(pcm, o) {
  const { data, rate } = pcm;
  const random = seededRandom(o.seed ?? 7);
  const attack = o.attack ?? 0.001;
  const start = Math.floor((o.at ?? 0) * rate);
  const length = Math.min(data.length - start, Math.ceil((attack + o.decay * 1.25) * rate));
  const nyquist = rate * 0.45;
  const f0 = Math.min(o.freq ?? 1000, nyquist);
  const f1 = Math.min(o.freqEnd ?? f0, nyquist);
  const k = 1 / (o.q ?? 0.8);
  const type = o.type ?? 'bandpass';
  const crackle = o.crackle ?? 0;
  let a1 = 0, a2 = 0, a3 = 0, ic1 = 0, ic2 = 0, brown = 0;
  for (let i = 0; i < length; i += 1) {
    if ((i & 31) === 0) {
      const u = Math.min(1, i / Math.max(1, o.decay * rate));
      const fc = f0 * Math.pow(f1 / f0, u);
      const g = Math.tan(Math.PI * fc / rate);
      a1 = 1 / (1 + g * (g + k)); a2 = g * a1; a3 = g * a2;
    }
    let x = random();
    if (o.colour === 'brown') { brown = (brown + 0.02 * x) / 1.02; x = brown * 3.5; }
    if (crackle > 0) x = x * (1 - crackle) + (random() > 0.985 ? random() * 6 * crackle : 0);
    const v3 = x - ic2;
    const v1 = a1 * ic1 + a2 * v3;
    const v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2;
    const y = type === 'lowpass' ? v2 : type === 'highpass' ? x - k * v1 - v2 : v1;
    data[start + i] += y * o.gain * envelopeAt(i / rate, attack, o.decay);
  }
}

/**
 * Adds a tone swept exponentially from f0 to f1 over `sweep` seconds.
 * @param {{data: Float32Array, rate: number}} pcm
 * @param {{at?: number, f0: number, f1?: number, sweep?: number, attack?: number, decay: number, gain: number, wave?: 'sine'|'triangle'|'square'}} o
 */
export function addTone(pcm, o) {
  const { data, rate } = pcm;
  const attack = o.attack ?? 0.002;
  const start = Math.floor((o.at ?? 0) * rate);
  const length = Math.min(data.length - start, Math.ceil((attack + o.decay * 1.25) * rate));
  const f1 = o.f1 ?? o.f0;
  const sweep = o.sweep ?? o.decay;
  let phase = 0;
  for (let i = 0; i < length; i += 1) {
    const t = i / rate;
    const f = o.f0 * Math.pow(f1 / o.f0, Math.min(1, t / sweep));
    phase += f / rate;
    phase -= Math.floor(phase);
    let y;
    if (o.wave === 'triangle') y = 1 - 4 * Math.abs(phase - 0.5);
    else if (o.wave === 'square') y = phase < 0.5 ? 0.7 : -0.7;
    else y = Math.sin(phase * 2 * Math.PI);
    data[start + i] += y * o.gain * envelopeAt(t, attack, o.decay);
  }
}

/**
 * Adds an inharmonic ring (struck metal or glass): sine partials, each with its own decay.
 * @param {{data: Float32Array, rate: number}} pcm
 * @param {{at?: number, freqs: number[], decays: number[], gains?: number[], gain: number}} o
 */
export function addRing(pcm, o) {
  for (let p = 0; p < o.freqs.length; p += 1) {
    addTone(pcm, { at: o.at, f0: o.freqs[p], attack: 0.0005, decay: o.decays[p % o.decays.length], gain: o.gain * (o.gains ? o.gains[p] : 1 / (1 + p * 0.4)) });
  }
}

/**
 * Adds rolling echoes of what is already in the record: each a darker, quieter, smeared copy
 * (a one-pole low-pass and a short box blur), delayed by `delays` seconds.
 * @param {{data: Float32Array, rate: number}} pcm
 * @param {{delays: number[], gain: number, fall?: number, darkHz?: number}} o fall: gain kept per echo
 */
export function addEchoes(pcm, o) {
  const { data, rate } = pcm;
  const source = data.slice();
  let gain = o.gain;
  for (let e = 0; e < o.delays.length; e += 1) {
    const offset = Math.floor(o.delays[e] * rate);
    const hz = (o.darkHz ?? 2400) / (1 + e * 0.6);
    const c = 1 - Math.exp(-2 * Math.PI * hz / rate);
    let low = 0;
    for (let i = 0; i + offset < data.length; i += 1) {
      low += c * (source[i] - low);
      data[i + offset] += low * gain;
    }
    gain *= o.fall ?? 0.6;
  }
}

/** Soft-clips in place (tanh) and scales so the peak is `peak`. Returns the record. */
export function finishPcm(pcm, peak = 0.9, drive = 1) {
  const { data } = pcm;
  let max = 0;
  for (let i = 0; i < data.length; i += 1) {
    const y = drive === 1 ? data[i] : Math.tanh(data[i] * drive);
    data[i] = y;
    const a = Math.abs(y);
    if (a > max) max = a;
  }
  if (max > 0) {
    const scale = peak / max;
    for (let i = 0; i < data.length; i += 1) data[i] *= scale;
  }
  // A 3 ms fade at the end so a cut tail never clicks.
  const fade = Math.min(data.length, Math.ceil(pcm.rate * 0.003));
  for (let i = 0; i < fade; i += 1) data[data.length - 1 - i] *= i / fade;
  return pcm;
}

/** Peak, RMS and the seconds until the level stays under -40 dB of the peak (tests, preview). */
export function measurePcm(pcm) {
  const { data, rate } = pcm;
  let peak = 0, sum = 0, last = 0, finite = true;
  for (let i = 0; i < data.length; i += 1) {
    const a = Math.abs(data[i]);
    if (!Number.isFinite(a)) finite = false;
    if (a > peak) peak = a;
    sum += a * a;
  }
  for (let i = data.length - 1; i >= 0; i -= 1) if (Math.abs(data[i]) > peak * 0.01) { last = i; break; }
  return { peak, rms: Math.sqrt(sum / data.length), tailSeconds: last / rate, finite };
}
