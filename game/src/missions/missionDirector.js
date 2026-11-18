// The mission director: runs the story. Every open mission of the storyMissions catalog is a
// glowing gold marker at its start landmark and a giver blip on the minimap; walking (or
// pulling up) into it plays the giver's intro as a cutscene, then the mission runs as a
// sequence of objectives, each kind implemented once (objectiveKinds.js: go to, enter or steal
// a vehicle, tow, deliver, tail, chase, race, checkpoints, collect, photograph, stealth, lose
// the police, escape pursuers, switch lead, defend, eliminate, survive) and scripted only by the
// catalog's parameters. A pass pays cash and reputation, plays the outro, unlocks what follows
// and autosaves; a fail shows the catalog's reason and retries from the last objective with
// Enter. A new game starts Dez down the street from Tolliver Tow with a call from Aunt Hattie.
//
// Files: missionScripting.js (offers, start, pass, fail, retry, the opening), missionRun.js (one
// play: objectives, timer, fail conditions, checkpoints), objectiveKinds.js, missionProgress.js
// (completed, open, attempts, rewards), missionWorld.js (the game behind one interface),
// missionMarkers.js (the markers in the world).
// Commands: MISSION_START {missionId, skipIntro?, startIndex?} -> boolean; MISSION_ABORT
// {reason?} fails the mission; MISSION_SKIP_TO_OBJECTIVE {index} (index = objective count
// passes it). Publishes MISSION_AVAILABLE, _STARTED, _OBJECTIVE_CHANGED {target {x, y, z}},
// _TIMER_CHANGED, _PASSED, _FAILED; enters missionPassed and missionFailed. Saved as
// { completed, available, attempts }. Members: activeMissionId, phase, objectiveIndex.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { GAME_EVENTS } from '../core/events/gameEvents.js';

/**
 * Creates the mission director system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createMissionDirectorSystem(context) {
  let director = null;
  const stops = [];

  const system = {
    name: 'missions',
    dependsOn: ['player', 'vehicles', 'pedestrians', 'economy'],
    get activeMissionId() { return director ? director.activeMissionId : null; },
    get phase() { return director ? director.phase : 'idle'; },
    get objectiveIndex() { return director ? director.objectiveIndex : -1; },
    get progress() { return director ? director.progress.serialise() : null; },

    async init(progress) {
      const { createMissionScripting } = await import('./missionScripting.js');
      director = createMissionScripting(context);
      const { commands } = context;
      stops.push(
        commands.handle(GAME_COMMANDS.MISSION_START, ({ missionId, skipIntro, startIndex } = {}) => director.start(missionId, { skipIntro, startIndex })),
        commands.handle(GAME_COMMANDS.MISSION_ABORT, ({ reason } = {}) => director.abort(reason)),
        commands.handle(GAME_COMMANDS.MISSION_SKIP_TO_OBJECTIVE, ({ index } = {}) => director.skipTo(index ?? 0)),
      );
      progress(1, 'missions');
    },

    start() {
      const listen = (topic, handler) => stops.push(context.events.on(topic, handler));
      listen(GAME_EVENTS.CUTSCENE_ENDED, (event) => director.onCutsceneEnded(event));
      listen(GAME_EVENTS.PLAYER_WASTED, () => director.note('leadDead'));
      listen(GAME_EVENTS.PLAYER_BUSTED, () => director.note('leadBusted'));
      listen(GAME_EVENTS.VEHICLE_DESTROYED, ({ vehicleId }) => director.note('vehicleDestroyed', vehicleId));
      listen(GAME_EVENTS.NEW_GAME_STARTED, () => director.onNewGame());
      director.offer();
    },

    fixedUpdate(stepSeconds) {
      director.fixedUpdate(stepSeconds);
    },

    update(deltaSeconds) {
      director.update(deltaSeconds);
    },

    serialise() {
      return director ? director.serialise() : null;
    },

    restore(data) {
      director?.restore(data);
    },

    dispose() {
      for (const stop of stops.splice(0)) if (typeof stop === 'function') stop();
      director?.dispose();
    },
  };
  return system;
}
