// Vehicle sound: a fixed pool of engine voices given to the player's vehicle and the nearest
// running vehicles each frame. A voice is an engine (two slightly detuned oscillators on the
// profile's PeriodicWave, a waveshaper, a load-following low-pass, intake roar from filtered
// noise, a rasp under load and an idle lope), tyre squeal from the physics wheel slip, the
// catalog horn and, for emergency vehicles running their siren, a wail, yelp or hi-lo. Doppler
// comes from the closing speed between vehicle and listener. Nothing is allocated per frame.
import { engineProfileFor, engineHarmonics, engineTargets, dopplerFactor } from './engineProfiles.js';
import { hornTonesFor, sirenPatternFor, sirenFrequency } from './sirenAndHornPatterns.js';
import { createPanner, setPannerPosition } from './audioMixer.js';

const HEARING_RADIUS = 90;

/**
 * Creates the vehicle voice pool.
 * @param {ReturnType<import('./audioMixer.js').createAudioMixer>} mixer
 * @param {ReturnType<import('./synthesisVoices.js').createSynthesisVoices>} synth
 * @param {{catalog: Record<string, object>, voiceCount?: number}} options
 */
export function createVehicleEngineVoices(mixer, synth, options) {
  const ctx = mixer.ctx;
  const catalog = options.catalog ?? {};
  const waves = new Map();
  const targets = {};
  const voices = [];
  for (let i = 0; i < (options.voiceCount ?? 6); i += 1) voices.push(buildVoice());

  // Candidates found this frame (fixed arrays, filled by a visitor made once).
  const candidateIds = new Array(24).fill(null);
  const candidateDistance = new Float32Array(24);
  let candidateCount = 0;
  let listener = null;
  let frame = 0;
  const visit = (entity) => {
    if (candidateCount >= candidateIds.length) return;
    const dx = entity.position.x - listener.x;
    const dz = entity.position.z - listener.z;
    candidateIds[candidateCount] = entity.id;
    candidateDistance[candidateCount] = Math.hypot(dx, dz);
    candidateCount += 1;
  };
  const filter = { kind: 'vehicle' };

  function waveFor(soundName) {
    let wave = waves.get(soundName);
    if (!wave) {
      const { real, imag } = engineHarmonics(engineProfileFor(soundName));
      wave = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
      waves.set(soundName, wave);
    }
    return wave;
  }

  function buildVoice() {
    const out = ctx.createGain();
    out.gain.value = 0;
    const panner = createPanner(ctx);
    panner.refDistance = 6;
    out.connect(panner).connect(mixer.buses.vehicles);

    const oscA = ctx.createOscillator();
    const oscB = ctx.createOscillator();
    oscB.detune.value = 9;
    const shaper = ctx.createWaveShaper();
    shaper.curve = synth.softClip;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.Q.value = 1.4;
    const lope = ctx.createGain();
    const lopeOsc = ctx.createOscillator();
    const lopeDepth = ctx.createGain();
    lopeDepth.gain.value = 0;
    lopeOsc.connect(lopeDepth).connect(lope.gain);
    const engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const oscMix = ctx.createGain();
    oscMix.gain.value = 0.5;
    oscA.connect(oscMix);
    oscB.connect(oscMix);
    oscMix.connect(shaper).connect(lowpass).connect(lope).connect(engineGain).connect(out);

    const noise = synth.loop(synth.white);
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.Q.value = 0.9;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0;
    noise.connect(noiseFilter).connect(noiseGain).connect(lope);

    const rasp = ctx.createOscillator();
    rasp.type = 'sawtooth';
    const raspFilter = ctx.createBiquadFilter();
    raspFilter.type = 'bandpass';
    raspFilter.Q.value = 2;
    const raspGain = ctx.createGain();
    raspGain.gain.value = 0;
    rasp.connect(raspFilter).connect(raspGain).connect(lope);

    const squealFilter = ctx.createBiquadFilter();
    squealFilter.type = 'bandpass';
    squealFilter.frequency.value = 1150;
    squealFilter.Q.value = 14;
    const squealGain = ctx.createGain();
    squealGain.gain.value = 0;
    noise.connect(squealFilter).connect(squealGain).connect(out);

    // A boat's wash: the hull slapping and the wake hissing (Boat physics: wake, spray 0..1).
    const washFilter = ctx.createBiquadFilter();
    washFilter.type = 'lowpass';
    washFilter.frequency.value = 700;
    washFilter.Q.value = 0.4;
    const washGain = ctx.createGain();
    washGain.gain.value = 0;
    noise.connect(washFilter).connect(washGain).connect(out);

    const hornGain = ctx.createGain();
    hornGain.gain.value = 0;
    const hornFilter = ctx.createBiquadFilter();
    hornFilter.type = 'lowpass';
    hornFilter.frequency.value = 2200;
    hornFilter.connect(hornGain).connect(out);
    const hornOscs = [0, 1, 2].map(() => {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      const g = ctx.createGain();
      g.gain.value = 0;
      osc.connect(g).connect(hornFilter);
      osc.start();
      return { osc, g };
    });

    const siren = ctx.createOscillator();
    siren.type = 'triangle';
    const sirenEdge = ctx.createWaveShaper();
    sirenEdge.curve = synth.hardClip;
    const sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    siren.connect(sirenEdge).connect(sirenGain).connect(out);

    for (const node of [oscA, oscB, lopeOsc, noise, rasp, siren]) node.start();
    return {
      out, panner, oscA, oscB, oscMix, shaper, lowpass, lopeOsc, lopeDepth, engineGain, noiseFilter, noiseGain,
      rasp, raspFilter, raspGain, squealGain, hornGain, hornOscs, siren, sirenGain, washFilter, washGain, washing: false,
      vehicleId: null, soundName: null, horn: null, sirenPattern: null, sirenTime: 0,
      lastX: 0, lastZ: 0, lastDistance: 0, fresh: true, keep: false, pendingDt: 0,
    };
  }

  function assign(voice, vehicleId, entity) {
    const spec = catalog[entity.data?.modelId] ?? null;
    const soundName = spec?.engine?.sound ?? 'smooth_four';
    voice.vehicleId = vehicleId;
    if (voice.soundName !== soundName) {
      const wave = waveFor(soundName);
      voice.oscA.setPeriodicWave(wave);
      voice.oscB.setPeriodicWave(wave);
      voice.soundName = soundName;
      voice.profile = engineProfileFor(soundName);
      // More drive into the soft clipper: a harder, raspier exhaust.
      voice.oscMix.gain.value = 0.35 + voice.profile.drive * 1.6;
    }
    const tones = hornTonesFor(spec?.engine?.horn);
    for (let i = 0; i < voice.hornOscs.length; i += 1) {
      const tone = tones[i];
      voice.hornOscs[i].g.gain.value = tone ? 0.3 : 0;
      if (tone) voice.hornOscs[i].osc.frequency.value = tone;
    }
    voice.sirenPattern = spec?.id === 'police_cruiser' ? 'patrol' : sirenPatternFor(spec?.engine?.horn);
    voice.sirenTime = 0;
    voice.fresh = true;
    voice.pendingDt = 0;
  }

  function release(voice) {
    voice.vehicleId = null;
    voice.out.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
  }

  return {
    voices,
    /**
     * Gives voices to the vehicles worth hearing and drives them from their physics.
     * @param {number} dt
     * @param {object} entities context.entities
     * @param {object|null} fleet the vehicles system (get(id) -> {entity, car, controls})
     * @param {string|null} playerVehicleId
     */
    update(dt, entities, fleet, playerVehicleId) {
      if (!fleet) return;
      listener = mixer.listenerPosition;
      candidateCount = 0;
      entities.forEachWithin(listener.x, listener.z, HEARING_RADIUS, visit, filter);
      for (const voice of voices) voice.keep = false;
      // Choose: the player's vehicle first, then nearest first.
      let wanted = 0;
      if (playerVehicleId != null) wanted += claim(playerVehicleId, fleet);
      while (wanted < voices.length) {
        let best = -1;
        for (let i = 0; i < candidateCount; i += 1) {
          if (candidateIds[i] != null && (best < 0 || candidateDistance[i] < candidateDistance[best])) best = i;
        }
        if (best < 0) break;
        const id = candidateIds[best];
        candidateIds[best] = null;
        if (id !== playerVehicleId) wanted += claim(id, fleet);
      }
      // The player's vehicle is driven every frame, the others on alternate frames (half the
      // AudioParam automation; the parameters glide over the gap) with their time accumulated.
      const now = ctx.currentTime;
      frame += 1;
      for (let i = 0; i < voices.length; i += 1) {
        const voice = voices[i];
        if (!voice.keep) { if (voice.vehicleId != null) release(voice); continue; }
        voice.pendingDt += dt;
        const isPlayer = voice.vehicleId === playerVehicleId;
        if (!isPlayer && !voice.fresh && ((frame + i) & 1) === 1) continue;
        drive(voice, fleet.get(voice.vehicleId), voice.pendingDt, now, isPlayer);
        voice.pendingDt = 0;
      }
    },
    /** Silences every voice (menus, pause). */
    silence() { for (const voice of voices) if (voice.vehicleId != null) release(voice); },
  };

  function claim(id, fleet) {
    const record = fleet.get(id);
    if (!record?.car || !record.entity) return 0;
    // Fixed-wing aircraft have their own voice (aircraftVoices.js): no car engine for them.
    if (record.entity.tags?.has?.('airplane')) return 0;
    if (!isRunning(record)) return 0;
    for (const voice of voices) if (voice.vehicleId === id) { voice.keep = true; return 1; }
    for (const voice of voices) {
      if (!voice.keep && voice.vehicleId == null) { assign(voice, id, record.entity); voice.keep = true; return 1; }
    }
    for (const voice of voices) {
      if (!voice.keep) { assign(voice, id, record.entity); voice.keep = true; return 1; }
    }
    return 0;
  }

  function drive(voice, record, dt, now, isPlayer) {
    if (!record?.car) { release(voice); return; }
    const { entity, car } = record;
    const controls = record.controls ?? entity.data?.controls;
    const p = entity.position;
    const lp = mixer.listenerPosition;
    const distance = Math.hypot(p.x - lp.x, p.z - lp.z);
    // Closing speed from the change of distance (positive when approaching).
    const closing = voice.fresh || dt <= 0 ? 0 : (voice.lastDistance - distance) / dt;
    voice.lastDistance = distance;
    const pitch = isPlayer ? 1 : dopplerFactor(closing);
    voice.fresh = false;

    engineTargets(voice.profile, car.rpm ?? 900, car.throttle ?? 0, targets);
    const tc = 0.04;
    voice.oscA.frequency.setTargetAtTime(targets.cycleHz * pitch, now, tc);
    voice.oscB.frequency.setTargetAtTime(targets.cycleHz * pitch, now, tc);
    voice.lopeOsc.frequency.setTargetAtTime(targets.cycleHz * 0.5 * pitch, now, tc);
    voice.lopeDepth.gain.setTargetAtTime(targets.lopeDepth, now, 0.1);
    voice.lowpass.frequency.setTargetAtTime(targets.cutoffHz * pitch, now, tc);
    voice.noiseFilter.frequency.setTargetAtTime(targets.noiseHz * pitch, now, tc);
    voice.noiseGain.gain.setTargetAtTime(targets.noiseGain, now, 0.05);
    voice.rasp.frequency.setTargetAtTime(targets.firingHz * 1.5 * pitch, now, tc);
    voice.raspFilter.frequency.setTargetAtTime(targets.firingHz * 3 * pitch, now, tc);
    voice.raspGain.gain.setTargetAtTime(targets.raspGain * 0.25, now, 0.05);
    const dead = entity.tags?.has?.('dead');
    voice.engineGain.gain.setTargetAtTime(dead ? 0 : targets.gain * 0.5, now, 0.05);

    let slip = 0;
    const slips = car.wheelSlip;
    if (slips) for (let i = 0; i < slips.length; i += 1) if (slips[i] > slip) slip = slips[i];
    const speed = Math.abs(car.speed ?? 0);
    const squeal = slip > 0.25 && speed > 2 ? Math.min(1, (slip - 0.25) * 1.6) * Math.min(1, speed / 10) : 0;
    voice.squealGain.gain.setTargetAtTime(squeal * 0.9, now, 0.06);
    // Boats: the wash rises with the wake and brightens with the spray when planing.
    if (car.wake !== undefined || voice.washing) {
      const wake = car.wake ?? 0, spray = car.spray ?? 0;
      voice.washing = car.wake !== undefined;
      voice.washGain.gain.setTargetAtTime(voice.washing ? 0.12 + wake * 0.7 + spray * 0.4 : 0, now, 0.15);
      voice.washFilter.frequency.setTargetAtTime(500 + spray * 2500, now, 0.15);
    }

    voice.hornGain.gain.setTargetAtTime(controls?.horn ? 0.35 : 0, now, 0.01);
    const sirenOn = voice.sirenPattern && entity.data?.siren;
    if (sirenOn) {
      voice.sirenTime += dt;
      voice.siren.frequency.setTargetAtTime(sirenFrequency(voice.sirenPattern, voice.sirenTime) * pitch, now, voice.sirenPattern === 'hilo' ? 0.005 : 0.02);
    }
    voice.sirenGain.gain.setTargetAtTime(sirenOn ? 0.22 : 0, now, 0.05);

    voice.out.gain.setTargetAtTime(isPlayer ? 0.8 : 1, now, 0.1);
    setPannerPosition(voice.panner, p.x, (p.y ?? 0) + 0.6, p.z, now);
    voice.panner.refDistance = isPlayer ? 8 : 6;
  }

  function isRunning(record) {
    const { entity, car } = record;
    if (entity.tags?.has?.('dead')) return false;
    if (entity.data?.siren) return true;
    if (entity.data?.driverId != null) return true;
    if (entity.tags?.has?.('traffic') || entity.tags?.has?.('police')) return true;
    return Math.abs(car.speed ?? 0) > 0.5 || (car.throttle ?? 0) > 0.05;
  }
}
