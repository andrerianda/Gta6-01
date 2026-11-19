// The time skip: the climb, the camera pulling away, El Comprador on the radio, "Three hours
// later...". It opens on the flight's own cockpit view (no shot yet), cuts outside beside the
// aircraft, pulls away and up until it is a dot over the sea, goes to black for the card, and
// comes back behind the aircraft once the mission has rebuilt the world near the island (the
// mark `time_skipped`). Every shot rides with the aircraft's live place.
import { FINAL_MISSION } from '../../catalog/finalArcScript.js';
import { createSceneScript } from '../../cinematics/sceneScript.js';
import { liveAircraft } from './flightCuts.js';

const FALLBACK = Object.freeze({ x: -4200, y: 900, z: -2300, heading: 1.31 });

/** @type {{id: string, build: (params: object, tools: object) => object}} */
export const TIME_SKIP_SCENE = {
  id: 'time_skip',
  build(params, tools) {
    const aircraftId = params?.aircraftId === 'garza_negra' ? 'garza_negra' : 'manta_sombra';
    const craft = liveAircraft(tools, aircraftId) ?? FALLBACK;
    const ride = (t) => liveAircraft(t, aircraftId);
    const s = createSceneScript({ skippable: true, letterbox: true }, tools);
    s.stage({ origin: { x: craft.x, y: craft.y, z: craft.z }, heading: craft.heading });

    // Outside, close: the aircraft against the sky.
    s.at(1.2).sound('wind_surf', { action: 'start', volume: 0.3, fadeSeconds: 1 });
    s.shot({ from: { position: { x: 17, y: 3, z: -36 }, target: { x: 0, y: 1, z: 0 }, fov: 38 },
      to: { position: { x: 23, y: 6, z: -20 } }, seconds: 3.4, ease: 'linear', attach: ride });
    // The pull-away: up and back until it is a dot over the endless sea.
    s.at(4.6).shot({ from: { position: { x: 23, y: 6, z: -20 }, target: { x: 0, y: 1, z: 0 }, fov: 38 },
      to: { position: { x: 150, y: 640, z: 560 }, fov: 27 }, seconds: 9.6, ease: 'in', attach: ride });
    s.at(5.6).line('ts_01', { channel: 'radio', advance: false });
    s.at(12).fade({ to: 1, seconds: 2 });
    s.sound('wind_surf', { action: 'stop', fadeSeconds: 2 });

    // Black: the card, and the world changes behind it.
    s.at(14.4).card({ style: 'time', text: FINAL_MISSION.timeSkipCard, seconds: 4 });
    s.at(15.2).mark('time_skipped', { aircraftId });
    s.at(18.4).shot({ from: { position: { x: 0, y: 7, z: 36 }, target: { x: 0, y: 3, z: -300 }, fov: 44 },
      to: { position: { x: 0, y: 5.2, z: 27 } }, seconds: 3.6, ease: 'out', attach: ride });
    s.at(19).fade({ to: 0, seconds: 2.6 });
    s.at(22).end({ keepBlack: false });
    return s.script();
  },
};
