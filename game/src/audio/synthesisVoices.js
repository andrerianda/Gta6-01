// Synthesis building blocks shared by every sound: noise buffers made once, a soft-clip curve,
// and two envelope voices (a filtered noise burst and a swept tone) that one-shots are built
// from. Each call wires a few short-lived nodes that stop and free themselves.

/**
 * Creates the shared synthesis resources for a context.
 * @param {BaseAudioContext} ctx
 */
export function createSynthesisVoices(ctx) {
  const white = noiseBuffer(ctx, 2, 'white');
  const brown = noiseBuffer(ctx, 2, 'brown');
  const softClip = clipCurve(0.6);
  const hardClip = clipCurve(3);

  return {
    ctx,
    white,
    brown,
    softClip,
    hardClip,

    /**
     * A filtered noise burst: attack, then exponential decay.
     * @param {AudioNode} out
     * @param {number} t start time
     * @param {{brown?: boolean, type?: BiquadFilterType, freq?: number, freqEnd?: number, q?: number, attack?: number, decay: number, gain: number, rate?: number}} o
     */
    burst(out, t, o) {
      const source = ctx.createBufferSource();
      source.buffer = o.brown ? brown : white;
      source.playbackRate.value = o.rate ?? 1;
      const filter = ctx.createBiquadFilter();
      filter.type = o.type ?? 'bandpass';
      filter.frequency.setValueAtTime(o.freq ?? 1000, t);
      if (o.freqEnd) filter.frequency.exponentialRampToValueAtTime(o.freqEnd, t + o.decay);
      filter.Q.value = o.q ?? 0.8;
      const gain = ctx.createGain();
      envelope(gain.gain, t, o.attack ?? 0.001, o.decay, o.gain);
      source.connect(filter).connect(gain).connect(out);
      source.start(t, Math.random() * 1.5);
      source.stop(t + (o.attack ?? 0.001) + o.decay * 1.2 + 0.05);
      return source;
    },

    /**
     * A tone swept from f0 to f1 with an envelope.
     * @param {AudioNode} out
     * @param {number} t
     * @param {{wave?: OscillatorType, f0: number, f1?: number, sweep?: number, attack?: number, decay: number, gain: number}} o
     */
    tone(out, t, o) {
      const osc = ctx.createOscillator();
      osc.type = o.wave ?? 'sine';
      osc.frequency.setValueAtTime(o.f0, t);
      if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t + (o.sweep ?? o.decay));
      const gain = ctx.createGain();
      envelope(gain.gain, t, o.attack ?? 0.002, o.decay, o.gain);
      osc.connect(gain).connect(out);
      osc.start(t);
      osc.stop(t + (o.attack ?? 0.002) + o.decay * 1.2 + 0.05);
      return osc;
    },

    /** A looping noise source (for continuous voices: engines, wind, rain). */
    loop(buffer = white) {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      return source;
    },
  };
}

/** Attack to `peak`, then an exponential decay to silence over `decay` seconds. */
export function envelope(param, t, attack, decay, peak) {
  param.setValueAtTime(0.0001, t);
  param.linearRampToValueAtTime(peak, t + attack);
  param.setTargetAtTime(0.0001, t + attack, decay / 4.6);
}

function noiseBuffer(ctx, seconds, colour) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 22222;
  let last = 0;
  for (let i = 0; i < length; i += 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const w = seed / 4294967296 * 2 - 1;
    if (colour === 'brown') {
      last = (last + 0.02 * w) / 1.02;
      data[i] = last * 3.5;
    } else {
      data[i] = w;
    }
  }
  return buffer;
}

function clipCurve(amount) {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * (1 + amount * 4)) / Math.tanh(1 + amount * 4);
  }
  return curve;
}
