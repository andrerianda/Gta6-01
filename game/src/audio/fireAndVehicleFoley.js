// Fire and car foley: the roar and crackle of the nearest burning wreck or ground fire (one
// persistent positional voice fed by a looping crackle buffer and low noise), and the doors and
// engine starts of people getting in and out of vehicles near the listener.
import { SOUND_PRIORITY } from './voicePriorityTable.js';
import { createPanner, setPannerPosition } from './audioMixer.js';

const FIRE_SLOTS = 8;
const FIRE_HEARD = 70;
/** Seconds a fire burns: a wreck (the effects' wreck_fire) and the ground fire of a blast. */
export const FIRE_SECONDS = Object.freeze({ wreck: 31, blast: 9.5 });

/**
 * @param {ReturnType<import('./audioMixer.js').createAudioMixer>} mixer
 * @param {ReturnType<import('./synthesisVoices.js').createSynthesisVoices>} synth
 * @param {{engineSoundOf?: (modelId: string) => string|null}} [options]
 */
export function createFireAndVehicleFoley(mixer, synth, options = {}) {
  const ctx = mixer.ctx;
  const engineSoundOf = options.engineSoundOf ?? (() => null);

  // ---- fire: fixed slots, one voice placed on the nearest ----
  const fires = [];
  for (let i = 0; i < FIRE_SLOTS; i += 1) fires.push({ active: false, x: 0, y: 0, z: 0, remaining: 0, total: 1 });
  const panner = createPanner(ctx);
  panner.refDistance = 5;
  panner.connect(mixer.buses.effects);
  const fireGain = ctx.createGain();
  fireGain.gain.value = 0;
  fireGain.connect(panner);
  const roar = synth.loop(synth.brown);
  const roarFilter = ctx.createBiquadFilter();
  roarFilter.type = 'lowpass';
  roarFilter.frequency.value = 420;
  const roarGain = ctx.createGain();
  roarGain.gain.value = 0.55;
  roar.connect(roarFilter).connect(roarGain).connect(fireGain);
  const crackle = synth.loop(crackleBuffer(ctx, 3.1));
  const crackleFilter = ctx.createBiquadFilter();
  crackleFilter.type = 'highpass';
  crackleFilter.frequency.value = 700;
  crackle.connect(crackleFilter).connect(fireGain);
  roar.start();
  crackle.start();
  let fireTick = 0;

  const addFire = (position, seconds) => {
    if (!position) return;
    let slot = null;
    for (const f of fires) {
      if (f.active && Math.abs(f.x - position.x) + Math.abs(f.z - position.z) < 6) { slot = f; break; }
    }
    const burning = Boolean(slot);
    if (!slot) slot = fires.find((f) => !f.active) ?? fires.reduce((a, b) => (a.remaining < b.remaining ? a : b));
    slot.active = true;
    slot.x = position.x; slot.y = position.y ?? 0; slot.z = position.z;
    slot.remaining = burning ? Math.max(slot.remaining, seconds) : seconds;
    slot.total = Math.max(slot.remaining, 1);
  };

  // ---- doors and engine starts ----
  const doorSpec = { bus: 'effects', priority: SOUND_PRIORITY.impact, duration: 1.6, refDistance: 3, reverb: 0.15, maxDistance: 35 };
  let lastDoorTime = -1;

  const doorOpen = (v, t) => {
    synth.burst(v, t, { type: 'bandpass', freq: 2400, q: 2.2, decay: 0.03, gain: 0.22 });
    synth.burst(v, t + 0.02, { brown: true, type: 'lowpass', freq: 380, decay: 0.06, gain: 0.18 });
  };
  const doorClose = (v, t) => {
    synth.burst(v, t, { brown: true, type: 'lowpass', freq: 150, q: 0.8, decay: 0.16, gain: 0.8 });
    synth.burst(v, t, { type: 'bandpass', freq: 850, q: 1.1, decay: 0.06, gain: 0.25 });
    synth.burst(v, t + 0.012, { type: 'bandpass', freq: 3000, q: 2, decay: 0.025, gain: 0.14 });
  };
  const engineStart = (v, t, sound) => {
    if (sound && sound.startsWith('turbine')) { // a turbine spools up
      synth.tone(v, t, { wave: 'sawtooth', f0: 120, f1: 2400, sweep: 2.4, attack: 0.5, decay: 2.2, gain: 0.04 });
      synth.burst(v, t + 0.3, { type: 'bandpass', freq: 600, freqEnd: 3000, q: 0.8, attack: 0.6, decay: 2, gain: 0.12 });
      return;
    }
    // The starter turns the engine over a few compressions, then it catches.
    const crank = sound && sound.includes('diesel') ? 0.85 : 0.55;
    const cranks = Math.round(crank * 9);
    for (let i = 0; i < cranks; i += 1) {
      synth.burst(v, t + i / 9, { brown: true, type: 'bandpass', freq: 260, q: 1.4, attack: 0.02, decay: 0.08, gain: 0.35 });
    }
    synth.burst(v, t, { type: 'bandpass', freq: 1700, q: 5, attack: 0.03, decay: crank, gain: 0.05 });
    synth.burst(v, t + crank, { brown: true, type: 'lowpass', freq: 240, freqEnd: 900, q: 0.7, attack: 0.02, decay: 0.45, gain: 0.7 });
    synth.tone(v, t + crank, { wave: 'sawtooth', f0: 38, f1: 85, sweep: 0.3, attack: 0.02, decay: 0.45, gain: 0.1 });
  };

  /** A door sequence near the listener; `entering` adds the close and, for a driver, the start. */
  const doors = (position, entering, driver, modelId, isPlayer, bailedOut) => {
    if (!position) return;
    const now = ctx.currentTime;
    if (!isPlayer && now - lastDoorTime < 0.3) return;
    if (!isPlayer && mixer.distanceTo(position) > 30) return;
    const v = mixer.voiceAt(position, doorSpec);
    if (!v) return;
    lastDoorTime = now;
    const t = now + 0.02;
    doorOpen(v, t);
    if (bailedOut) return;
    doorClose(v, t + (entering ? 0.6 : 0.95));
    if (entering && driver) engineStart(v, t + 0.95, engineSoundOf(modelId));
  };

  return {
    fires,
    /** A burning wreck (VEHICLE_DESTROYED). */
    wreckFire(position) { addFire(position, FIRE_SECONDS.wreck); },
    /** The ground fire of a blast (EXPLOSION_DETONATED). */
    blastFire(position) { addFire(position, FIRE_SECONDS.blast); },
    /** VEHICLE_ENTERED near the listener. */
    entered(position, seat, modelId, isPlayer) { doors(position, true, seat === 'driver', modelId, isPlayer, false); },
    /** VEHICLE_EXITED near the listener. */
    exited(position, modelId, isPlayer, bailedOut) { doors(position, false, false, modelId, isPlayer, bailedOut); },

    update(dt) {
      let nearest = null;
      let best = Infinity;
      for (const f of fires) {
        if (!f.active) continue;
        f.remaining -= dt;
        if (f.remaining <= 0) { f.active = false; continue; }
        const d = mixer.distanceTo(f);
        if (d < best) { best = d; nearest = f; }
      }
      fireTick -= dt;
      if (fireTick > 0) return;
      fireTick = 0.15;
      const t = ctx.currentTime;
      if (!nearest || best > FIRE_HEARD) {
        fireGain.gain.setTargetAtTime(0, t, 0.4);
        return;
      }
      setPannerPosition(panner, nearest.x, nearest.y + 0.8, nearest.z, t);
      const strength = Math.min(1, (nearest.remaining / nearest.total) * 3);
      fireGain.gain.setTargetAtTime(0.9 * strength, t, 0.3);
    },

    silence() { fireGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1); },

    dispose() {
      roar.stop();
      crackle.stop();
      panner.disconnect();
    },
  };
}

/**
 * A looping crackle: sparse sharp pops of varied size, each a click with a short noisy tail,
 * with denser bursts now and then (wood splitting).
 */
function crackleBuffer(ctx, seconds) {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const buffer = ctx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  let seed = 98765;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  let t = 0;
  while (t < seconds - 0.05) {
    const big = random() < 0.12;
    const amp = big ? 0.6 + 0.4 * random() : 0.08 + 0.3 * random();
    const tail = (big ? 0.025 : 0.006) * (0.5 + random());
    const start = Math.floor(t * rate);
    const n = Math.floor(tail * rate);
    for (let i = 0; i < n && start + i < length; i += 1) {
      data[start + i] += amp * (random() * 2 - 1) * Math.exp(-i / (n * 0.3));
    }
    // mostly sparse, sometimes a quick cluster
    t += random() < 0.2 ? 0.004 + 0.01 * random() : 0.02 + 0.09 * random();
  }
  return buffer;
}
