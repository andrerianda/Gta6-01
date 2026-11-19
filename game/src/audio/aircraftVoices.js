// The sound of a fixed-wing aircraft: one voice, given to the airplane the lead flies or else to
// the nearest one running within earshot (an interceptor passing). A piston propeller is an engine
// drone under the blades' beat; a jet a spool whine over a thrust roar with a crackling afterburner
// layer. Around the pilot, not placed in the world: the wind by airspeed (louder in the cockpit
// view), the stall-warning horn (a steady reed in the trainer, pulsed in the jets), the buffet
// rumble, the gear and flap motors while they travel, the tyres' chirp on touchdown, the autopilot
// disconnect tone and the jets' ground-proximity tone. All synthesis (aircraftSoundTargets.js has
// the maps); the graph is built on first need, driven thirty times a second, and allocates nothing
// per frame (a touchdown or a disconnect makes a few short-lived nodes, once).
import { createPanner, setPannerPosition } from './audioMixer.js';
import {
  aircraftVoiceKindOf, jetSoundTargets, motorRunning, propellerSoundTargets, pullUpToneOn, stallHornTargets, touchdownChirp,
  windSoundTargets,
} from './aircraftSoundTargets.js';

const HEARING = 1500;
const VEHICLES = Object.freeze({ kind: 'vehicle' });
const DEFAULT_SOUND = Object.freeze({ idleHz: 200, redlineHz: 500 });

/**
 * Creates the aircraft voice.
 * @param {ReturnType<import('./audioMixer.js').createAudioMixer>} mixer
 * @param {ReturnType<import('./synthesisVoices.js').createSynthesisVoices>} synth
 * @param {{catalog: Record<string, object>, engineSounds?: Record<string, {idleHz: number, redlineHz: number}>}} options
 *   The vehicle catalog and its VEHICLE_ENGINE_SOUNDS.
 */
export function createAircraftVoices(mixer, synth, options) {
  const ctx = mixer.ctx;
  const catalog = options.catalog ?? {};
  const engineSounds = options.engineSounds ?? {};
  let graph = null;
  let timer = 0;
  let audible = false;
  // What the cabin sounds compare against between two readings.
  const last = { id: null, wheels: 0, gear: 1, flaps: 0, disengaged: 0 };
  const found = { id: null, record: null, distance: Infinity };
  const prop = { engineHz: 0, bladeHz: 0, engineGain: 0, bladeGain: 0, cutoff: 0 };
  const jet = { whineHz: 0, whineGain: 0, roarGain: 0, roarCutoff: 0, burnerGain: 0 };
  const wind = { gain: 0, cutoff: 0 };
  const horn = { gain: 0, hz: 0, pulseHz: 0 };

  function loop(buffer, rate) {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.value = rate;
    source.start();
    return source;
  }

  function oscillator(type, hz) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = hz;
    osc.start();
    return osc;
  }

  function quiet() {
    const gain = ctx.createGain();
    gain.gain.value = 0;
    return gain;
  }

  function filter(type, hz, q = 0.7) {
    const node = ctx.createBiquadFilter();
    node.type = type;
    node.frequency.value = hz;
    node.Q.value = q;
    return node;
  }

  function build() {
    const out = quiet();
    const panner = createPanner(ctx);
    panner.refDistance = 30;
    const muffle = filter('lowpass', 12000);
    muffle.connect(out).connect(panner).connect(mixer.buses.vehicles);
    // Propeller: the engine's drone and the blade beat.
    const engine = oscillator('sawtooth', 40);
    const engineLow = filter('lowpass', 900, 1.2);
    const engineGain = quiet();
    engine.connect(engineLow).connect(engineGain).connect(muffle);
    const blade = oscillator('square', 40);
    const bladeLow = filter('lowpass', 600, 0.9);
    const bladeGain = quiet();
    blade.connect(bladeLow).connect(bladeGain).connect(muffle);
    // Jet: whine, roar, afterburner.
    const whineA = oscillator('sine', 900);
    const whineB = oscillator('triangle', 1360);
    const whineGain = quiet();
    whineA.connect(whineGain);
    whineB.connect(whineGain);
    whineGain.connect(muffle);
    const roarLow = filter('lowpass', 400, 0.5);
    const roarGain = quiet();
    loop(synth.brown, 1).connect(roarLow).connect(roarGain).connect(muffle);
    const crackle = ctx.createWaveShaper();
    crackle.curve = synth.hardClip;
    const burnerLow = filter('lowpass', 700, 0.6);
    const burnerGain = quiet();
    loop(synth.brown, 0.45).connect(crackle).connect(burnerLow).connect(burnerGain).connect(muffle);
    // Around the pilot.
    const cabin = mixer.buses.effects;
    const windBand = filter('bandpass', 800, 0.5);
    const windGain = quiet();
    loop(synth.white, 0.8).connect(windBand).connect(windGain).connect(cabin);
    const buffetGain = quiet();
    loop(synth.brown, 0.3).connect(filter('lowpass', 70, 0.8)).connect(buffetGain).connect(cabin);
    const gearGain = quiet();
    oscillator('sawtooth', 170).connect(filter('lowpass', 900)).connect(gearGain).connect(cabin);
    const flapGain = quiet();
    oscillator('sawtooth', 250).connect(filter('lowpass', 1100)).connect(flapGain).connect(cabin);
    const warnings = mixer.buses.interface ?? cabin;
    const hornOsc = oscillator('square', 420);
    const hornGain = quiet();
    const hornPulse = oscillator('square', 4);
    const hornPulseDepth = quiet();
    hornPulse.connect(hornPulseDepth).connect(hornGain.gain);
    hornOsc.connect(filter('lowpass', 2200)).connect(hornGain).connect(warnings);
    const pullOsc = oscillator('sine', 700);
    const pullSweep = oscillator('sawtooth', 2.5);
    const pullDepth = ctx.createGain();
    pullDepth.gain.value = 260;
    pullSweep.connect(pullDepth).connect(pullOsc.frequency);
    const pullGain = quiet();
    pullOsc.connect(pullGain).connect(warnings);
    return {
      out, panner, muffle, engine, engineLow, engineGain, blade, bladeLow, bladeGain, whineA, whineB, whineGain, roarLow, roarGain,
      burnerGain, windBand, windGain, buffetGain, gearGain, flapGain, hornOsc, hornGain, hornPulse, hornPulseDepth, pullGain, cabin, warnings,
    };
  }

  /** Three short beeps: the autopilot has let go. */
  function disconnectTone(now) {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 1250;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    for (let i = 0; i < 3; i += 1) {
      gain.gain.setValueAtTime(0.12, now + i * 0.22);
      gain.gain.setValueAtTime(0, now + i * 0.22 + 0.12);
    }
    osc.connect(gain).connect(graph.warnings);
    osc.start(now);
    osc.stop(now + 0.8);
  }

  let fleetNow = null;
  let listener = null;
  const visit = (entity) => {
    if (!entity.tags || !entity.tags.has('airplane')) return;
    const record = fleetNow.get(entity.id);
    const car = record?.car;
    if (!car || !car.state || !(car.state.rpm > 0.02)) return;
    const p = entity.position;
    const distance = Math.hypot(p.x - listener.x, p.y - listener.y, p.z - listener.z);
    if (distance < found.distance) { found.id = entity.id; found.record = record; found.distance = distance; }
  };

  function hush(now, seconds = 0.25) {
    if (!graph) return;
    for (const gain of [graph.out, graph.windGain, graph.buffetGain, graph.gearGain, graph.flapGain, graph.hornGain, graph.hornPulseDepth, graph.pullGain]) {
      gain.gain.setTargetAtTime(0, now, seconds);
    }
    audible = false;
  }

  return {
    get audible() { return audible; },
    /**
     * @param {number} dt
     * @param {object} entities context.entities
     * @param {object|null} fleet The vehicles system (get(id) -> {entity, car}).
     * @param {string|number|null} playerVehicleId
     * @param {string|null} view The follow camera's flightView ('cockpit', 'chase', 'outside').
     */
    update(dt, entities, fleet, playerVehicleId, view) {
      timer -= dt;
      if (timer > 0 || !fleet) return;
      timer = 1 / 30;
      const now = ctx.currentTime;
      found.id = null;
      found.record = null;
      found.distance = Infinity;
      const own = playerVehicleId != null ? fleet.get?.(playerVehicleId) : null;
      const piloting = Boolean(own && own.car && own.car.state && own.entity?.tags?.has?.('airplane'));
      if (piloting) {
        found.id = playerVehicleId;
        found.record = own;
        found.distance = 0;
      } else if (entities?.forEachWithin) {
        fleetNow = fleet;
        listener = mixer.listenerPosition;
        entities.forEachWithin(listener.x, listener.z, HEARING, visit, VEHICLES);
      }
      if (!found.record || found.distance > HEARING) {
        if (audible) hush(now);
        last.id = null;
        return;
      }
      if (!graph) graph = build();
      audible = true;
      const { car, entity } = found.record;
      const state = car.state;
      const entry = catalog[entity.data?.modelId] ?? null;
      const soundName = entry?.engine?.sound ?? null;
      const kind = aircraftVoiceKindOf(soundName) ?? (entry?.flight?.kind === 'piston' ? 'propeller' : 'jet');
      const sound = engineSounds[soundName] ?? DEFAULT_SOUND;
      const glide = 0.08;
      const spool = state.rpm ?? car.rpm ?? 0;

      if (kind === 'propeller') {
        propellerSoundTargets(spool, state.throttle ?? 0, sound, prop);
        graph.engine.frequency.setTargetAtTime(prop.engineHz, now, glide);
        graph.engineLow.frequency.setTargetAtTime(prop.cutoff, now, glide);
        graph.engineGain.gain.setTargetAtTime(prop.engineGain, now, glide);
        graph.blade.frequency.setTargetAtTime(prop.bladeHz, now, glide);
        graph.bladeLow.frequency.setTargetAtTime(prop.cutoff * 0.6, now, glide);
        graph.bladeGain.gain.setTargetAtTime(prop.bladeGain, now, glide);
        graph.whineGain.gain.setTargetAtTime(0, now, glide);
        graph.roarGain.gain.setTargetAtTime(0, now, glide);
        graph.burnerGain.gain.setTargetAtTime(0, now, glide);
      } else {
        const flight = entry?.flight ?? null;
        const dry = car.tuning?.maxThrust ?? (flight?.engineThrust ?? 0) * (flight?.engines ?? 1);
        const share = dry > 0 && Number.isFinite(state.thrust) ? state.thrust / dry : state.throttle ?? 0;
        jetSoundTargets(spool, share, state.afterburner ?? 0, sound, jet);
        graph.whineA.frequency.setTargetAtTime(jet.whineHz, now, glide);
        graph.whineB.frequency.setTargetAtTime(jet.whineHz * 1.507, now, glide);
        graph.whineGain.gain.setTargetAtTime(jet.whineGain, now, glide);
        graph.roarLow.frequency.setTargetAtTime(jet.roarCutoff, now, glide);
        graph.roarGain.gain.setTargetAtTime(jet.roarGain, now, glide);
        graph.burnerGain.gain.setTargetAtTime(jet.burnerGain, now, glide);
        graph.engineGain.gain.setTargetAtTime(0, now, glide);
        graph.bladeGain.gain.setTargetAtTime(0, now, glide);
      }
      const p = entity.position;
      setPannerPosition(graph.panner, p.x, (p.y ?? 0) + 1.5, p.z, now);
      const inCockpit = piloting && view === 'cockpit';
      graph.muffle.frequency.setTargetAtTime(inCockpit ? 1500 : 12000, now, 0.15);
      graph.out.gain.setTargetAtTime(inCockpit ? 0.55 : piloting ? 0.75 : 1, now, 0.1);

      if (!piloting) {
        for (const gain of [graph.windGain, graph.buffetGain, graph.gearGain, graph.flapGain, graph.hornGain, graph.hornPulseDepth, graph.pullGain]) gain.gain.setTargetAtTime(0, now, 0.2);
        last.id = null;
        return;
      }
      // Around the pilot.
      windSoundTargets(state.indicatedAirspeed ?? 0, inCockpit, wind);
      graph.windBand.frequency.setTargetAtTime(wind.cutoff, now, 0.2);
      graph.windGain.gain.setTargetAtTime(wind.gain, now, 0.2);
      graph.buffetGain.gain.setTargetAtTime((state.buffet ?? 0) > 0.05 ? 0.5 * Math.min(1, state.buffet) : 0, now, 0.08);
      stallHornTargets(state.stallWarning ?? 0, kind, Boolean(state.onGround), horn);
      graph.hornOsc.frequency.setTargetAtTime(horn.hz, now, 0.05);
      if (horn.pulseHz > 0) {
        graph.hornPulse.frequency.setTargetAtTime(horn.pulseHz, now, 0.05);
        graph.hornGain.gain.setTargetAtTime(horn.gain * 0.5, now, 0.03);
        graph.hornPulseDepth.gain.setTargetAtTime(horn.gain * 0.5, now, 0.03);
      } else {
        graph.hornGain.gain.setTargetAtTime(horn.gain, now, 0.03);
        graph.hornPulseDepth.gain.setTargetAtTime(0, now, 0.03);
      }
      graph.pullGain.gain.setTargetAtTime(kind === 'jet' && pullUpToneOn(state) ? 0.14 : 0, now, 0.05);
      const fresh = last.id !== found.id;
      const gear = state.gear ?? 1;
      const flaps = state.flaps ?? 0;
      const wheels = state.wheelsOnGround ?? 0;
      const disengaged = state.autopilotDisengaged ?? 0;
      graph.gearGain.gain.setTargetAtTime(!fresh && motorRunning(last.gear, gear) ? 0.05 : 0, now, 0.05);
      graph.flapGain.gain.setTargetAtTime(!fresh && motorRunning(last.flaps, flaps) ? 0.035 : 0, now, 0.05);
      if (!fresh) {
        const chirp = touchdownChirp(last.wheels, wheels, state.groundSpeed ?? 0);
        if (chirp > 0) synth.burst(graph.cabin, now, { type: 'bandpass', freq: 1900, freqEnd: 900, q: 2.5, attack: 0.004, decay: 0.16, gain: 0.5 * chirp });
        if (disengaged > last.disengaged) disconnectTone(now);
      }
      last.id = found.id;
      last.gear = gear;
      last.flaps = flaps;
      last.wheels = wheels;
      last.disengaged = disengaged;
    },
    /** Silences the voice (menus, pause). */
    silence() {
      if (audible) hush(ctx.currentTime, 0.1);
      last.id = null;
    },
  };
}
