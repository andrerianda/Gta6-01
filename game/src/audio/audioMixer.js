// The mixer: one AudioContext, six buses (effects, vehicles, voices, ambience, radio,
// interface) under a master gain and a limiter, volumes from the player's settings, a shared
// city reverb (slap-back between buildings plus a diffuse tail) for gunshots and blasts, the
// listener on the camera, and a fixed pool of positional slots (panner, air-absorption filter,
// reverb send) that one-shot sounds borrow through the voice priority table.
import { createVoicePriorityTable } from './voicePriorityTable.js';

/** Bus names and the settings key that scales each (always times audio.master). */
export const AUDIO_BUSES = Object.freeze({
  effects: 'audio.effects',
  vehicles: 'audio.effects',
  ambience: 'audio.effects',
  interface: 'audio.effects',
  voices: 'audio.voices',
  radio: 'audio.music',
});

/**
 * Creates the mixer on a running (or offline) audio context.
 * @param {BaseAudioContext} ctx
 * @param {{settings?: {get(key: string): any}, voiceCount?: number}} [options]
 */
export function createAudioMixer(ctx, options = {}) {
  const settings = options.settings ?? null;
  const voiceCount = options.voiceCount ?? 32;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.2;
  limiter.connect(ctx.destination);
  const master = ctx.createGain();
  master.connect(limiter);

  const buses = {};
  for (const name of Object.keys(AUDIO_BUSES)) {
    const bus = ctx.createGain();
    bus.connect(master);
    buses[name] = bus;
  }

  const reverbSend = ctx.createGain();
  const reverb = ctx.createConvolver();
  reverb.buffer = cityImpulseResponse(ctx, 2.2);
  const reverbReturn = ctx.createGain();
  reverbReturn.gain.value = 0.5;
  reverbSend.connect(reverb).connect(reverbReturn).connect(buses.effects);

  const table = createVoicePriorityTable(voiceCount);
  const slots = [];
  for (let i = 0; i < voiceCount; i += 1) {
    const input = ctx.createGain();
    const air = ctx.createBiquadFilter();
    air.type = 'lowpass';
    air.frequency.value = 18000;
    const panner = createPanner(ctx);
    const send = ctx.createGain();
    send.gain.value = 0;
    input.connect(air).connect(panner);
    air.connect(send).connect(reverbSend);
    slots.push({ input, air, panner, send, current: null, bus: null });
  }

  const listener = ctx.listener;
  const mixer = {
    ctx,
    buses,
    master,
    reverbSend,
    table,
    listenerPosition: { x: 0, y: 0, z: 0 },

    /** Applies the settings' volumes (call on SETTINGS_CHANGED). */
    applySettings() {
      const get = (key, fallback) => {
        const value = settings?.get(key);
        return typeof value === 'number' ? value : fallback;
      };
      const muted = settings?.get('audio.muted') === true;
      master.gain.setTargetAtTime(muted ? 0 : get('audio.master', 0.8), ctx.currentTime, 0.05);
      for (const [name, key] of Object.entries(AUDIO_BUSES)) {
        buses[name].gain.setTargetAtTime(get(key, 0.8) * (name === 'interface' ? 0.7 : 1), ctx.currentTime, 0.05);
      }
    },

    /** Puts the listener on a three.js camera (reads matrixWorld; no allocation). */
    setListenerFromCamera(camera) {
      const e = camera.matrixWorld.elements;
      const p = mixer.listenerPosition;
      p.x = e[12]; p.y = e[13]; p.z = e[14];
      if (listener.positionX) {
        const t = ctx.currentTime;
        listener.positionX.setTargetAtTime(p.x, t, 0.02);
        listener.positionY.setTargetAtTime(p.y, t, 0.02);
        listener.positionZ.setTargetAtTime(p.z, t, 0.02);
        listener.forwardX.setTargetAtTime(-e[8], t, 0.02);
        listener.forwardY.setTargetAtTime(-e[9], t, 0.02);
        listener.forwardZ.setTargetAtTime(-e[10], t, 0.02);
        listener.upX.setTargetAtTime(e[4], t, 0.02);
        listener.upY.setTargetAtTime(e[5], t, 0.02);
        listener.upZ.setTargetAtTime(e[6], t, 0.02);
      } else {
        listener.setPosition(p.x, p.y, p.z);
        listener.setOrientation(-e[8], -e[9], -e[10], e[4], e[5], e[6]);
      }
    },

    /** Distance from the listener to a point. */
    distanceTo(position) {
      const p = mixer.listenerPosition;
      return Math.hypot(position.x - p.x, (position.y ?? p.y) - p.y, position.z - p.z);
    },

    /**
     * Borrows a positional slot for a one-shot. Returns a GainNode to build the sound into (it
     * fades out if the slot is stolen), or null when the voice limit drops the sound.
     * @param {{x:number, y?:number, z:number}|null} position null plays at the listener
     * @param {{bus?: string, priority?: number, duration?: number, refDistance?: number, reverb?: number, maxDistance?: number}} spec
     */
    voiceAt(position, spec) {
      const now = ctx.currentTime;
      const distance = position ? mixer.distanceTo(position) : 0;
      if (distance > (spec.maxDistance ?? 400)) return null;
      const slotIndex = table.acquire(spec.priority ?? 4, distance, now, spec.duration ?? 1);
      if (slotIndex < 0) return null;
      const slot = slots[slotIndex];
      if (slot.current) {
        slot.current.gain.setTargetAtTime(0, now, 0.01);
      }
      const bus = buses[spec.bus ?? 'effects'];
      if (slot.bus !== bus) {
        if (slot.bus) slot.panner.disconnect();
        slot.panner.connect(bus);
        slot.bus = bus;
      }
      const lp = mixer.listenerPosition;
      const x = position ? position.x : lp.x;
      const y = position ? (position.y ?? lp.y) : lp.y;
      const z = position ? position.z : lp.z;
      setPannerPosition(slot.panner, x, y, z, now);
      slot.panner.refDistance = spec.refDistance ?? 4;
      // Air absorbs the highs with distance; buildings in the way do the rest.
      slot.air.frequency.setValueAtTime(Math.max(900, 18000 / (1 + distance / 60)), now);
      slot.send.gain.setValueAtTime((spec.reverb ?? 0.25) * (0.6 + Math.min(distance / 80, 1)), now);
      const voice = ctx.createGain();
      voice.connect(slot.input);
      slot.current = voice;
      return voice;
    },
  };
  mixer.applySettings();
  return mixer;
}

/** A panner with the game's distance model. */
export function createPanner(ctx) {
  const panner = ctx.createPanner();
  panner.panningModel = 'equalpower';
  panner.distanceModel = 'inverse';
  panner.refDistance = 4;
  panner.maxDistance = 10000;
  panner.rolloffFactor = 1;
  return panner;
}

/** Moves a panner (AudioParam API where present). */
export function setPannerPosition(panner, x, y, z, time) {
  if (panner.positionX) {
    panner.positionX.setValueAtTime(x, time);
    panner.positionY.setValueAtTime(y, time);
    panner.positionZ.setValueAtTime(z, time);
  } else {
    panner.setPosition(x, y, z);
  }
}

/**
 * A city impulse response: early reflections off facades (15 to 90 ms), a slap-back from the
 * far side of the street, and a darkening diffuse tail.
 */
function cityImpulseResponse(ctx, seconds) {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const buffer = ctx.createBuffer(2, length, rate);
  let seed = 1234567;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296 * 2 - 1;
  };
  const echoes = [0.017, 0.031, 0.046, 0.071, 0.093, 0.142, 0.21];
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    let low = 0;
    for (let i = 0; i < length; i += 1) {
      const t = i / rate;
      const decay = Math.exp(-t * 3.1);
      // The tail gets darker as it ages: a one-pole low-pass whose coefficient grows with time.
      const k = 0.15 + 0.8 * Math.min(t / seconds, 1);
      low += (random() - low) * (1 - k);
      data[i] = low * decay * 0.5 * Math.min(t / 0.012, 1);
    }
    for (let e = 0; e < echoes.length; e += 1) {
      const at = Math.floor((echoes[e] + channel * 0.004 * (e % 3)) * rate);
      if (at < length) data[at] += (0.8 - e * 0.09) * (e % 2 === channel ? 1 : 0.7);
    }
  }
  return buffer;
}
