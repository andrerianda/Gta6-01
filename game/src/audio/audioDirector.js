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
  const sounds = createWeaponAndImpactSounds(mixer, synth, weaponCatalog);
  const ambience = createCityAmbience(mixer, synth);
  const footsteps = createFootstepTracker(context, mixer, synth);
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
  on(GAME_EVENTS.WEAPON_FIRED, ({ weaponId, origin, loudness }) => sounds.gunshot(weaponId, origin, loudness ?? 1));
  on(GAME_EVENTS.EXPLOSION_DETONATED, ({ position, power, radius }) => {
    sounds.explosion(position, power ?? (radius ? radius / 7 : 1));
    foley.blastFire(position);
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

    /** AUDIO_PLAY: a named sound (interface ids, a weapon id, 'explosion', 'glass', 'crash'). */
    play({ soundId, position = null, volume = 1 }) {
      if (weaponCatalog[soundId]) sounds.gunshot(soundId, position, volume);
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
      if (simulating) {
        vehicles.update(dt, context.entities, context.systems.find('vehicles'), playerVehicleId);
        footsteps.update(dt, wetness);
        foley.update(dt);
      } else {
        vehicles.silence();
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
