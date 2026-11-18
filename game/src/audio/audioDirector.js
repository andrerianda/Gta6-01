// The audio director: builds the mixer, the synthesis voices, the vehicle voices and the
// one-shot sounds once the audio context exists (first click), and turns game events into
// sound: weapons, explosions, crashes, hits, thunder, interface sounds. Each frame it puts the
// listener on the camera and drives the vehicle voices. The radio comes in a later shift.
import { GAME_EVENTS } from '../core/events/gameEvents.js';
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { createAudioMixer } from './audioMixer.js';
import { createSynthesisVoices } from './synthesisVoices.js';
import { createVehicleEngineVoices } from './vehicleEngineVoices.js';
import { createWeaponAndImpactSounds } from './weaponAndImpactSounds.js';
import { createVehicleRadio } from './vehicleRadio.js';

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

  on(GAME_EVENTS.SETTINGS_CHANGED, ({ key }) => { if (String(key).startsWith('audio')) mixer.applySettings(); });
  on(GAME_EVENTS.WEAPON_FIRED, ({ weaponId, origin, loudness }) => sounds.gunshot(weaponId, origin, loudness ?? 1));
  on(GAME_EVENTS.EXPLOSION_DETONATED, ({ position, power, radius }) => sounds.explosion(position, power ?? (radius ? radius / 7 : 1)));
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
  on(GAME_EVENTS.VEHICLE_ENTERED, ({ vehicleId, modelId, isPlayer }) => {
    if (!isPlayer) return;
    playerVehicleId = vehicleId;
    const remembered = stationOfVehicle.get(vehicleId);
    radio?.tune(remembered !== undefined ? remembered : vehicleCatalog[modelId]?.radioDefault ?? null);
  });
  on(GAME_EVENTS.VEHICLE_EXITED, ({ vehicleId, isPlayer }) => {
    if (!isPlayer || playerVehicleId !== vehicleId) return;
    if (radio) stationOfVehicle.set(vehicleId, radio.stationId);
    playerVehicleId = null;
  });
  on(GAME_EVENTS.MISSION_PASSED, () => sounds.interfaceSound('mission_passed'));
  on(GAME_EVENTS.MISSION_FAILED, () => sounds.interfaceSound('mission_failed'));

  return {
    mixer,
    sounds,
    vehicles,
    radio,
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
      if (simulating) vehicles.update(dt, context.entities, context.systems.find('vehicles'), playerVehicleId);
      else vehicles.silence();
      const inVehicle = simulating && playerVehicleId != null;
      if (radio) {
        if (inVehicle && context.input.pressed('nextRadioStation')) radio.cycle(1);
        if (inVehicle && context.input.pressed('previousRadioStation')) radio.cycle(-1);
        radio.update(inVehicle);
      }
    },

    dispose() {
      for (const stop of stops) if (typeof stop === 'function') stop();
      audioContext.close?.();
    },
  };
}
