// Sound and radio: everything heard, synthesised with WebAudio at run time (no audio files).
// Engines by vehicle class driven by the physics rpm, gear and throttle, tyre squeal from wheel
// slip, horns and sirens (wail, yelp, hi-lo), gunshots with a tail between the buildings,
// explosions, crashes and breaking glass, thunder, interface sounds, and the radio stations of
// the radioStations catalog with their own generative music and the DJ's lines as subtitles.
//
// The browser allows sound only after a gesture, so the AudioContext is made on the first
// click or key (the start menu's Play); before that the system is silent and costs nothing.
// Mixer: buses effects, vehicles, voices, ambience, radio, interface under master (settings
// audio.master, effects, music, voices, muted); positional voices around the camera with a
// voice limit by priority (quality tier audioVoices); doppler on passing vehicles.
//
// Members: ready (bool), play({soundId, position?, volume?}), tune(stationId), stationId,
//   director (the implementation, for the preview and tests). Commands: AUDIO_PLAY, RADIO_TUNE.
// Listens: WEAPON_FIRED, EXPLOSION_DETONATED, VEHICLE_COLLIDED, DAMAGE_DEALT, THUNDER_STRUCK,
//   VEHICLE_ENTERED/EXITED, MISSION_PASSED/FAILED, SETTINGS_CHANGED. Publishes RADIO_STATION_CHANGED.
// Implementation: audio/audioDirector.js and its neighbours.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';

/**
 * Creates the sound and radio system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createSoundAndRadioSystem(context) {
  let createDirector = null;
  let radioCatalog = null;
  let director = null;
  let pendingStation = null;
  const stops = [];
  const gestureEvents = ['pointerdown', 'keydown'];

  function unlock() {
    if (director || !createDirector) return;
    const AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!AudioContextClass) return;
    const audioContext = new AudioContextClass({ latencyHint: 'interactive' });
    director = createDirector(context, audioContext, radioCatalog);
    if (audioContext.state === 'suspended') audioContext.resume();
    if (pendingStation) director.tune?.(pendingStation);
    for (const name of gestureEvents) context.page.document.removeEventListener(name, unlock, true);
  }

  const system = {
    name: 'audio',
    runsWhen: 'always',

    get ready() { return director !== null; },
    get director() { return director; },
    get stationId() { return director?.stationId ?? pendingStation; },

    async init(progress) {
      const implementation = await import('./audioDirector.js');
      createDirector = implementation.createAudioDirector;
      radioCatalog = await implementation.loadRadioCatalog(context);
      stops.push(
        context.commands.handle(GAME_COMMANDS.AUDIO_PLAY, (request) => system.play(request)),
        context.commands.handle(GAME_COMMANDS.RADIO_TUNE, ({ stationId }) => system.tune(stationId)),
      );
      for (const name of gestureEvents) context.page.document.addEventListener(name, unlock, true);
      progress(1, 'sound');
    },

    /** Plays a named sound (AUDIO_PLAY); silently ignored before the first click. */
    play(request) {
      director?.play(request);
    },

    /** Tunes the vehicle radio (RADIO_TUNE). */
    tune(stationId) {
      if (director?.tune) director.tune(stationId);
      else pendingStation = stationId;
    },

    /** Save data: the station the radio was last on. */
    serialise() { return { stationId: system.stationId ?? null }; },
    restore(data) { if (data?.stationId) system.tune(data.stationId); },

    update(deltaSeconds) {
      if (director) director.update(deltaSeconds, context.state.simulates);
    },

    dispose() {
      for (const name of gestureEvents) context.page.document.removeEventListener(name, unlock, true);
      for (const stop of stops) if (typeof stop === 'function') stop();
      director?.dispose();
      director = null;
    },
  };
  return system;
}
