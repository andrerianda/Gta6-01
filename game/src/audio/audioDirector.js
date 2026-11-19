// The audio director: builds the mixer, the synthesis voices, the vehicle voices, the one-shot
// sounds, the city ambience, the footsteps, the fire and door foley and the radio once the audio
// context exists (first click), and turns game events into sound: weapons, explosions, crashes,
// hits, thunder, doors and engine starts, burning wrecks, interface sounds. Each frame it puts
// the listener on the camera, drives the vehicle voices and footsteps, and five times a second
// tells the ambience where the listener is (district, distance to the sea), the hour and weather.
import { GAME_EVENTS } from '../core/events/gameEvents.js';
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { createAudioMixer } from './audioMixer.js';
import { createSynthesisVoices } from './synthesisVoices.js';
import { createVehicleEngineVoices } from './vehicleEngineVoices.js';
import { createWeaponAndImpactSounds } from './weaponAndImpactSounds.js';
import { createVehicleRadio } from './vehicleRadio.js';
import { createCityAmbience } from './cityAmbience.js';
import { createFootstepTracker } from './footstepTracker.js';
import { createFireAndVehicleFoley } from './fireAndVehicleFoley.js';
import { createRenderedSoundBank } from './renderedSoundBank.js';
import { createHelicopterRotorVoice } from './helicopterRotorVoice.js';
import { createAcousticProbe } from './acousticProbe.js';
import { createAircraftVoices } from './aircraftVoices.js';

/** AUDIO_PLAY ids the sound bank plays positionally (others: weapons, interface). */
const BANK_SOUNDS = new Set(['grenade_bounce', 'throw_whoosh', 'bottle_smash', 'glass_crack', 'glass_shatter']);

/**
 * Loads the radio catalog (from the content registry, or the catalog module while main.js does
 * not register it yet). Called in init, before any audio context exists.
 */
export async function loadRadioCatalog(context) {
  const module = context.content.find('radioStations') ?? await import('../catalog/radioStations.js');
  return { stations: module.RADIO_STATIONS, dial: module.RADIO_DIAL_ORDER, scales: module.RADIO_SCALES, rules: module.RADIO_RULES };
}

/**
 * Creates the director on an AudioContext.
 * @param {object} context The game context.
 * @param {BaseAudioContext} audioContext
 * @param {Awaited<ReturnType<typeof loadRadioCatalog>>} [radioCatalog]
 */
export function createAudioDirector(context, audioContext, radioCatalog = null) {
  const voiceCount = context.quality?.tier?.audioVoices ?? 24;
  const mixer = createAudioMixer(audioContext, { settings: context.settings, voiceCount });
  const synth = createSynthesisVoices(audioContext);
  const vehicleCatalog = context.content.find('vehicleCatalog')?.VEHICLE_CATALOG ?? {};
  const weaponCatalog = context.content.find('weaponCatalog')?.WEAPON_CATALOG ?? {};
  const vehicles = createVehicleEngineVoices(mixer, synth, { catalog: vehicleCatalog, voiceCount: voiceCount <= 16 ? 4 : 7 });
  const bank = createRenderedSoundBank(audioContext, weaponCatalog);
  const footsteps = createFootstepTracker(context, mixer, synth);
  const sounds = createWeaponAndImpactSounds(mixer, synth, weaponCatalog, { bank, surfaceAt: footsteps.surfaceAt });
  const ambience = createCityAmbience(mixer, synth);
  const rotor = createHelicopterRotorVoice(mixer);
  // Fixed-wing aircraft: propeller, jet and afterburner, wind, stall horn, gear and flap motors.
  const aircraft = createAircraftVoices(mixer, synth, { catalog: vehicleCatalog, engineSounds: context.content.find('vehicleCatalog')?.VEHICLE_ENGINE_SOUNDS ?? {} });
  const acoustics = createAcousticProbe(context, mixer);
  const foley = createFireAndVehicleFoley(mixer, synth, { engineSoundOf: (id) => vehicleCatalog[id]?.engine?.sound ?? null });

  const radio = radioCatalog ? createVehicleRadio(mixer, synth, {
    ...radioCatalog,
    onChanged: (change) => context.events.emit(GAME_EVENTS.RADIO_STATION_CHANGED, change),
    onLine: (line) => context.commands.send(GAME_COMMANDS.UI_SHOW_SUBTITLE, line),
  }) : null;
  const stationOfVehicle = new Map();

  let playerVehicleId = null;
  const lastCrash = new Map();
  const stops = [];
  const on = (topic, fn) => { if (topic) stops.push(context.events.on(topic, fn)); };
  const positionOf = (id) => context.entities.get?.(id)?.position ?? null;

  on(GAME_EVENTS.SETTINGS_CHANGED, ({ key }) => { if (String(key).startsWith('audio')) mixer.applySettings(); });
  on(GAME_EVENTS.WEAPON_FIRED, ({ weaponId, origin, direction, loudness }) => sounds.gunshot(weaponId, origin, loudness ?? 150, direction ?? null));
  on(GAME_EVENTS.EXPLOSION_DETONATED, ({ position, radius, weaponId }) => {
    // A fire bottle bursts and catches; everything else (grenade, rocket, a car) explodes.
    if (weaponId === 'fire_bottle') sounds.bottleSmash(position);
    else sounds.explosion(position, radius ? radius / 7 : 1);
    foley.blastFire(position);
  });
  // Car glass by damage stage (vehicle-system: glass 'cracked' | 'shattered' | null).
  const lastGlass = new Map();
  on(GAME_EVENTS.VEHICLE_DAMAGED, ({ vehicleId, glass, windowsShattered, position }) => {
    if (!glass) return;
    const now = audioContext.currentTime;
    if (now - (lastGlass.get(vehicleId) ?? -1) < 0.12) return;
    lastGlass.set(vehicleId, now);
    if (lastGlass.size > 100) lastGlass.clear();
    sounds.glass(position ?? positionOf(vehicleId), glass === 'shattered' ? 0.7 + 0.1 * Math.min(4, windowsShattered ?? 1) : 0.8, glass);
  });
  on(GAME_EVENTS.VEHICLE_DESTROYED, ({ position, vehicleId }) => foley.wreckFire(position ?? positionOf(vehicleId)));
  on(GAME_EVENTS.VEHICLE_COLLIDED, ({ vehicleId, energy, position }) => {
    const now = audioContext.currentTime;
    if (now - (lastCrash.get(vehicleId) ?? -1) < 0.15) return;
    lastCrash.set(vehicleId, now);
    if (lastCrash.size > 200) lastCrash.clear();
    sounds.crash(position, energy ?? 0);
  });
  on(GAME_EVENTS.DAMAGE_DEALT, ({ targetId, kind, position }) => {
    if (!position || (kind && kind !== 'bullet' && kind !== 'gunshot')) return;
    const target = context.entities.get?.(targetId);
    sounds.bulletHit(position, target?.kind === 'vehicle' ? 'vehicle' : 'body');
  });
  on(GAME_EVENTS.THUNDER_STRUCK, ({ distance, delay }) => sounds.thunder(distance, delay ?? 0));
  on(GAME_EVENTS.VEHICLE_ENTERED, ({ vehicleId, modelId, seat, isPlayer }) => {
    foley.entered(positionOf(vehicleId), seat, modelId, isPlayer);
    if (!isPlayer) return;
    playerVehicleId = vehicleId;
    const remembered = stationOfVehicle.get(vehicleId);
    radio?.tune(remembered !== undefined ? remembered : vehicleCatalog[modelId]?.radioDefault ?? null);
  });
  on(GAME_EVENTS.VEHICLE_EXITED, ({ vehicleId, modelId, isPlayer, bailedOut }) => {
    foley.exited(positionOf(vehicleId), modelId, isPlayer, bailedOut);
    if (!isPlayer || playerVehicleId !== vehicleId) return;
    if (radio) stationOfVehicle.set(vehicleId, radio.stationId);
    playerVehicleId = null;
  });
  on(GAME_EVENTS.MISSION_PASSED, () => sounds.interfaceSound('mission_passed'));
  on(GAME_EVENTS.MISSION_FAILED, () => sounds.interfaceSound('mission_failed'));

  // Where the listener is, refreshed five times a second for the ambience.
  const place = { district: null, hour: 13, nightFactor: 0, rain: 0, windSpeed: 3, shoreDistance: null, inVehicle: false };
  let wetness = 0;
  let placeTimer = 0;
  let wasSimulating = false;
  const readPlace = () => {
    const p = mixer.listenerPosition;
    const city = context.systems.find('openWorldCity');
    const atmosphere = context.atmosphere?.state;
    place.district = city?.districtAt?.(p.x, p.z) ?? null;
    const plan = city?.plan;
    const shore = plan?.shoreDistanceAt ?? plan?.terrain?.shoreDistanceAt;
    place.shoreDistance = typeof shore === 'function' ? shore(p.x, p.z) : null;
    place.hour = context.clock?.timeOfDay ?? 13;
    place.nightFactor = atmosphere?.nightFactor ?? (place.hour < 6.5 || place.hour > 19.8 ? 1 : 0);
    place.rain = atmosphere?.rain ?? 0;
    place.windSpeed = atmosphere?.windSpeed ?? 3;
    wetness = atmosphere?.wetness ?? 0;
    place.inVehicle = playerVehicleId != null;
  };

  return {
    mixer,
    sounds,
    vehicles,
    radio,
    ambience,
    footsteps,
    foley,
    place,
    get playerVehicleId() { return playerVehicleId; },
    get stationId() { return radio?.stationId ?? null; },

    /** RADIO_TUNE. */
    tune(stationId) { radio?.tune(stationId); },

    bank,
    rotor,
    aircraft,
    acoustics,

    /**
     * AUDIO_PLAY: a named sound. Interface ids ('ui_click', 'ui_back', 'pickup',
     * 'stealth_suspicious', 'stealth_alarm'), a weapon id, 'explosion', 'glass', 'crash', and the
     * positional bank sounds 'grenade_bounce' (volume = strength 0..1), 'throw_whoosh',
     * 'bottle_smash', 'glass_crack', 'glass_shatter'.
     */
    play({ soundId, position = null, volume = 1, direction = null }) {
      if (weaponCatalog[soundId]) sounds.gunshot(soundId, position, 150 * volume, direction);
      else if (soundId === 'grenade_bounce') sounds.grenadeBounce(position, volume);
      else if (soundId === 'throw_whoosh') sounds.throwSound(position);
      else if (soundId === 'bottle_smash') sounds.bottleSmash(position);
      else if (BANK_SOUNDS.has(soundId)) sounds.glass(position, volume, soundId === 'glass_crack' ? 'cracked' : 'shattered');
      else if (soundId === 'explosion') sounds.explosion(position, volume);
      else if (soundId === 'glass') sounds.glass(position, volume);
      else if (soundId === 'crash') sounds.crash(position, 20000 * volume);
      else sounds.interfaceSound(soundId);
    },

    update(dt, simulating) {
      const camera = context.view?.camera;
      if (camera) mixer.setListenerFromCamera(camera);
      placeTimer -= dt;
      if (placeTimer <= 0) {
        placeTimer = 0.2;
        readPlace();
      }
      ambience.update(dt, place);
      if (bank.pending > 0) {
        bank.prerender(1.2);
        if (bank.pending === 0) rotor.prepare();
      }
      if (simulating) {
        const fleet = context.systems.find('vehicles');
        vehicles.update(dt, context.entities, fleet, playerVehicleId);
        rotor.update(dt, context.systems.find('policeDispatch'), fleet, context.entities);
        aircraft.update(dt, context.entities, fleet, playerVehicleId, context.systems.find('followCamera')?.flightView ?? null);
        footsteps.update(dt, wetness);
        foley.update(dt);
        acoustics.update(place);
      } else {
        vehicles.silence();
        rotor.silence();
        aircraft.silence();
        if (wasSimulating) foley.silence();
      }
      wasSimulating = simulating;
      const inVehicle = simulating && playerVehicleId != null;
      if (radio) {
        if (inVehicle && context.input.pressed('nextRadioStation')) radio.cycle(1);
        if (inVehicle && context.input.pressed('previousRadioStation')) radio.cycle(-1);
        radio.update(inVehicle);
      }
    },

    dispose() {
      for (const stop of stops) if (typeof stop === 'function') stop();
      footsteps.dispose();
      ambience.dispose();
      foley.dispose();
      audioContext.close?.();
    },
  };
}
