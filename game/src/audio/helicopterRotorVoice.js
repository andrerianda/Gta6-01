// The helicopter overhead: one positional voice given to the nearest flying helicopter (the
// police helicopter of the chase, policeDispatch.helicopter, or any fleet vehicle with a rotor:
// Helicopter physics' rotorSpeed). Its sound is a one-second loop rendered once: 22 blade slaps
// (four blades at 330 rpm), the tail rotor's buzz and the turbine's whine, all whole cycles of
// the loop so it repeats seamlessly; playback rate follows the rotor speed, a low-pass and the
// level follow the distance. Driven fifteen times a second; nothing allocated per frame.
import { createPcm, addNoise, addTone, finishPcm } from './pcmSynthesis.js';
import { createPanner, setPannerPosition } from './audioMixer.js';

export const ROTOR_BLADE_PASS_HZ = 22;
const HEARING = 600;
const VEHICLES = Object.freeze({ kind: 'vehicle' });

/** Renders the seamless one-second rotor loop (pure). */
export function renderRotorLoop(rate) {
  const pcm = createPcm(1, rate);
  for (let i = 0; i < ROTOR_BLADE_PASS_HZ; i += 1) {
    const at = i / ROTOR_BLADE_PASS_HZ;
    const accent = i % 2 === 0 ? 1 : 0.8;
    addNoise(pcm, { at, colour: 'brown', type: 'lowpass', freq: 420, attack: 0.004, decay: 0.03, gain: 1.6 * accent, seed: 3 + i });
    addNoise(pcm, { at, type: 'bandpass', freq: 1100, q: 0.9, attack: 0.002, decay: 0.012, gain: 0.35 * accent, seed: 40 + i });
    addTone(pcm, { at, f0: 66, attack: 0.003, decay: 0.03, gain: 0.5 * accent });
  }
  // Tail rotor buzz and turbine whine: whole numbers of cycles per second, so the loop is seamless.
  const { data } = pcm;
  for (let i = 0; i < data.length; i += 1) {
    const t = i / rate;
    data[i] += 0.12 * Math.sin(2 * Math.PI * 104 * t) + 0.06 * Math.sin(2 * Math.PI * 208 * t) + 0.025 * Math.sin(2 * Math.PI * 2310 * t);
  }
  return finishPcm(pcm, 0.8);
}

/**
 * Creates the rotor voice.
 * @param {ReturnType<import('./audioMixer.js').createAudioMixer>} mixer
 */
export function createHelicopterRotorVoice(mixer) {
  const ctx = mixer.ctx;
  let source = null;
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 3000;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  const panner = createPanner(ctx);
  panner.refDistance = 25;
  lowpass.connect(gain).connect(panner).connect(mixer.buses.vehicles);
  let timer = 0;
  let audible = false;
  const found = { x: 0, y: 0, z: 0, rotor: 0, distance: Infinity };

  let buffer = null;
  function prepare() {
    if (buffer) return;
    const rate = Math.min(ctx.sampleRate, 24000);
    const pcm = renderRotorLoop(rate);
    buffer = ctx.createBuffer(1, pcm.data.length, rate);
    buffer.getChannelData(0).set(pcm.data);
  }

  function start() {
    if (source) return;
    prepare();
    source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(lowpass);
    source.start();
  }

  function consider(x, y, z, rotor) {
    const lp = mixer.listenerPosition;
    const distance = Math.hypot(x - lp.x, y - lp.y, z - lp.z);
    if (distance < found.distance) { found.x = x; found.y = y; found.z = z; found.rotor = rotor; found.distance = distance; }
  }

  let fleetNow = null;
  const visitVehicle = (entity) => {
    const car = fleetNow.get(entity.id)?.car;
    if (car && car.rotorSpeed > 0.05) consider(entity.position.x, entity.position.y, entity.position.z, car.rotorSpeed);
  };

  return {
    get audible() { return audible; },
    /** Renders the loop ahead of need (the director calls it once the bank is done). */
    prepare,
    /**
     * @param {number} dt
     * @param {object|null} police the policeDispatch system
     * @param {object|null} fleet the vehicles system (records with car.rotorSpeed are helicopters)
     * @param {object} entities context.entities
     */
    update(dt, police, fleet, entities) {
      timer -= dt;
      if (timer > 0) return;
      timer = 1 / 15;
      found.distance = Infinity;
      const heli = police?.helicopter;
      if (heli?.active && heli.root) consider(heli.root.position.x, heli.root.position.y, heli.root.position.z, 1);
      if (fleet && entities?.forEachWithin) {
        const lp = mixer.listenerPosition;
        fleetNow = fleet;
        entities.forEachWithin(lp.x, lp.z, HEARING, visitVehicle, VEHICLES);
      }
      const now = ctx.currentTime;
      if (found.distance > HEARING) {
        if (audible) gain.gain.setTargetAtTime(0, now, 0.3);
        audible = false;
        return;
      }
      start();
      audible = true;
      setPannerPosition(panner, found.x, found.y, found.z, now);
      source.playbackRate.setTargetAtTime(0.75 + 0.25 * Math.min(1, found.rotor), now, 0.2);
      lowpass.frequency.setTargetAtTime(Math.max(500, 6000 / (1 + found.distance / 120)), now, 0.2);
      gain.gain.setTargetAtTime(0.9 * Math.min(1, found.rotor * 1.5), now, 0.2);
    },
    silence() {
      if (audible) gain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
      audible = false;
    },
  };
}
