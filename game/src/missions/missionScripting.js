// The mission director's implementation: offers every open story mission as a glowing marker
// at its start landmark (and a giver blip on the minimap through MISSION_AVAILABLE), starts a
// mission when the lead walks or drives into its marker, plays the intro through the cutscene
// player, runs the objectives (missionRun.js), and ends in the passed state (rewards, unlocks,
// the outro, an autosave) or the failed state (the catalog's reason, retry from the last
// checkpoint with Enter). A new game opens with Dez down the street from Tolliver Tow and a
// call from the first mission's giver; after each pass the phone carries the story on to the
// next giver (storyPhoneCalls.js).
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { GAME_EVENTS } from '../core/events/gameEvents.js';
import { GAME_STATE } from '../core/state/gameStates.js';
import { createMissionGivers } from './missionGivers.js';
import { createMissionMarkers } from './missionMarkers.js';
import { createMissionProgress, isWithinHours } from './missionProgress.js';
import { createMissionRun } from './missionRun.js';
import { createMissionWorld } from './missionWorld.js';
import { objectiveTarget } from './objectiveKinds.js';
import { createStoryPhoneCalls } from './storyPhoneCalls.js';

const RESULT_SECONDS = 4.5;
const OPENING_CALL_DELAY = 2.5;

/**
 * Creates the mission scripting over the game context.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 */
export function createMissionScripting(context) {
  const { commands, events, state } = context;
  const story = context.content.get('storyMissions');
  const missions = story.STORY_MISSIONS;
  const rules = story.MISSION_RULES;
  const cast = context.content.find('storyCharacters')?.STORY_CHARACTERS ?? {};
  const progress = createMissionProgress(missions, story.STORY_MISSION_ORDER, rules);
  const markers = createMissionMarkers(context.view.layers.dynamic, {
    startColour: rules.startMarker.color, startRadius: rules.startMarker.radius, hidden: Boolean(context.launch?.shot),
    groundHeightAt: (x, z) => context.systems.find('openWorldCity')?.groundHeightAt?.(x, z) ?? 0,
  });
  const world = createMissionWorld(context, { marks: (points, target) => { markers.setMarks(points); markers.setObjective(target); followed = target; } });
  const givers = createMissionGivers(context, cast, { markerRadius: rules.startMarker.radius });
  const run = (name, payload) => (commands.has(name) ? commands.run(name, payload) : undefined);
  const offered = new Map();          // missionId -> start point
  const disarmed = new Set();         // markers the lead must leave before they trigger again
  let active = null;                  // {mission, run, phase, checkpoint, checkpointAt, pendingIndex}
  let result = null;                  // {outcome, seconds, missionId, checkpoint}
  let followed = null;
  let hourNotice = null;

  const nameOf = (id) => cast[id]?.name ?? id;
  const calls = createStoryPhoneCalls({
    message: (contactId, text, missionId) => events.emit(GAME_EVENTS.PHONE_MESSAGE_RECEIVED, missionId ? { contactId, text, missionId } : { contactId, text }),
    speak: (characterId, text, seconds) => run(GAME_COMMANDS.UI_SHOW_SUBTITLE, { speakerName: nameOf(characterId), text, seconds }),
    notify: (text) => world.notify(text),
  }, { missions, nameOf, placeOf: (missionId) => offered.get(missionId) ?? null });

  function offer() {
    const open = new Set(progress.available());
    for (const [id] of offered) if (!open.has(id)) { offered.delete(id); markers.setStart(id, null); givers.show(id, null, null); }
    for (const id of open) {
      const mission = missions[id];
      const point = world.place(mission.start.landmark);
      if (!point) continue;
      offered.set(id, point);
      markers.setStart(id, active ? null : point);
      if (!active) givers.show(id, mission.giver, point, mission.start.district);
      if (!active) events.emit(GAME_EVENTS.MISSION_AVAILABLE, { missionId: id, giverId: mission.giver, position: { x: point.x, y: point.y, z: point.z } });
    }
  }

  function start(missionId, { skipIntro = false, startIndex = 0 } = {}) {
    const mission = missions[missionId];
    if (!mission) return false;
    // A restart over a running intro or outro (a picture's command) cuts that cutscene first.
    const cutting = Boolean(active) && active.phase !== 'objectives';
    if (active) end();
    if (cutting) run(GAME_COMMANDS.CUTSCENE_SKIP, {});
    // A start over the passed or failed card (QA bug 9: a mission begun right after an abandoned
    // one showed no title or the old card): back to play first.
    if (result) { result = null; if (state.is(GAME_STATE.MISSION_PASSED, GAME_STATE.MISSION_FAILED)) state.enter(GAME_STATE.PLAYING); }
    progress.attempt(missionId);
    markers.hideStarts();
    const lines = mission.intro || [];
    const withIntro = !skipIntro && lines.length > 0 && commands.has(GAME_COMMANDS.CUTSCENE_PLAY);
    // A giver who is also the mission's lead (Sol in Twice the Weight) meets the current lead in
    // the intro; the switch to her happens when the objectives begin.
    const switchLater = withIntro && mission.lead === mission.giver;
    if (mission.lead && mission.lead !== 'either' && !switchLater) world.switchLead(mission.lead);
    active = { mission, run: null, phase: 'intro', checkpoint: startIndex, checkpointAt: null, pendingIndex: startIndex, switchLater };
    events.emit(GAME_EVENTS.MISSION_STARTED, { missionId, title: mission.title });
    if (withIntro) {
      const point = offered.get(missionId) ?? world.place(mission.start.landmark);
      const stage = point ? stageAt(point) : null;
      if (stage) givers.stage(missionId, { x: stage.position.x, z: stage.position.z, heading: stage.heading });
      commands.run(GAME_COMMANDS.CUTSCENE_PLAY, { cutsceneId: `${missionId}:intro`, missionId, lines, stage });
    } else {
      beginObjectives();
    }
    return true;
  }

  function stageAt(point) {
    // The lead stands on the marker a step towards the door, the building behind, facing the
    // street the camera uses; the giver steps in front of the lead (missionGivers.stage).
    const x = point.x - point.frontX * 1.2, z = point.z - point.frontZ * 1.2;
    return { position: { x, y: point.y, z }, heading: Math.atan2(-point.frontX, -point.frontZ) };
  }

  function beginObjectives() {
    if (!active || active.run) return;
    active.phase = 'objectives';
    const missionId = active.mission.id;
    if (active.switchLater) { givers.dismiss(missionId); world.switchLead(active.mission.lead); active.switchLater = false; }
    active.run = createMissionRun(active.mission, world, {
      startIndex: active.pendingIndex,
      on: {
        objective(o) {
          const player = world.player();
          if (!active) return;
          if (active.checkpoint !== o.index) { active.checkpoint = o.index; active.checkpointAt = { x: player.x, y: player.y, z: player.z, heading: player.heading }; }
          if (!active.checkpointAt) active.checkpointAt = { x: player.x, y: player.y, z: player.z, heading: player.heading };
          const t = o.target;
          events.emit(GAME_EVENTS.MISSION_OBJECTIVE_CHANGED, { missionId, index: o.index, kind: o.kind, text: o.text, target: objectiveTarget(t) });
          if (o.timeLimit === null) events.emit(GAME_EVENTS.MISSION_TIMER_CHANGED, { missionId, secondsLeft: null });
          followed = t && typeof t.isVector3 === 'boolean' ? t : null;
        },
        timer(secondsLeft) { events.emit(GAME_EVENTS.MISSION_TIMER_CHANGED, { missionId, secondsLeft }); },
      },
    });
  }

  function end() {
    if (!active) return;
    active.run?.dispose();
    world.help(null);
    markers.setObjective(null);
    markers.setMarks(null);
    followed = null;
    active = null;
  }

  function pass() {
    const { mission } = active;
    active.run.dispose();
    const reward = progress.complete(mission.id);
    if (rules.wantedClearedOnPass) world.clearWanted('mission');
    run(GAME_COMMANDS.ECONOMY_ADD_MONEY, { amount: reward.cash, reason: `mission:${mission.id}` });
    run(GAME_COMMANDS.PROGRESSION_ADD_REPUTATION, { amount: reward.reputation, reason: `mission:${mission.id}` });
    active.phase = 'outro';
    active.reward = reward;
    markers.setObjective(null);
    markers.setMarks(null);
    if ((mission.outro || []).length && commands.has(GAME_COMMANDS.CUTSCENE_PLAY)) {
      commands.run(GAME_COMMANDS.CUTSCENE_PLAY, { cutsceneId: `${mission.id}:outro`, missionId: mission.id, lines: mission.outro });
    } else {
      showPassed();
    }
  }

  function showPassed() {
    const { mission, reward } = active;
    end();
    if (state.is(GAME_STATE.PLAYING, GAME_STATE.CUTSCENE)) state.enter(GAME_STATE.MISSION_PASSED);
    events.emit(GAME_EVENTS.MISSION_PASSED, { missionId: mission.id, title: mission.title, cash: reward.cash, reputation: reward.reputation, unlocks: mission.unlocks ?? [] });
    result = { outcome: 'passed', seconds: RESULT_SECONDS, missionId: mission.id };
    run(GAME_COMMANDS.SAVE_WRITE, { reason: 'mission passed' });
    disarmed.clear();
  }

  function failActive(text) {
    const { mission } = active;
    const checkpoint = active.run ? active.run.checkpoint : 0;
    const checkpointAt = active.checkpointAt;
    end();
    if (state.is(GAME_STATE.PLAYING, GAME_STATE.CUTSCENE)) state.enter(GAME_STATE.MISSION_FAILED);
    events.emit(GAME_EVENTS.MISSION_FAILED, { missionId: mission.id, title: mission.title, reason: text });
    result = { outcome: 'failed', seconds: (rules.failScreenSeconds ?? 4) + 2, missionId: mission.id, checkpoint, checkpointAt };
    disarmed.add(mission.id);
  }

  function retry() {
    const { missionId, checkpoint, checkpointAt } = result;
    result = null;
    if (!state.is(GAME_STATE.PLAYING)) state.enter(GAME_STATE.PLAYING);
    if (checkpointAt) run(GAME_COMMANDS.PLAYER_TELEPORT, { position: { x: checkpointAt.x, y: checkpointAt.y, z: checkpointAt.z }, heading: checkpointAt.heading });
    start(missionId, { skipIntro: true, startIndex: checkpoint });
  }

  function closeResult() {
    const passed = result?.outcome === 'passed' ? result.missionId : null;
    result = null;
    if (state.is(GAME_STATE.MISSION_PASSED, GAME_STATE.MISSION_FAILED)) state.enter(GAME_STATE.PLAYING);
    offer();
    if (passed) calls.afterPass(passed, progress.available());
  }

  function watchStartMarkers() {
    if (active || result || !state.is(GAME_STATE.PLAYING)) return;
    const player = world.player();
    const reach = rules.startMarker.radius + (player.vehicleId ? 2.5 : 0.4);
    for (const [id, point] of offered) {
      const gap = Math.hypot(player.x - point.x, player.z - point.z);
      if (gap > reach) { if (gap > reach + 6) disarmed.delete(id); continue; }
      if (disarmed.has(id) || (player.vehicleId && Math.abs(player.speed) > 4)) continue;
      const mission = missions[id];
      const hour = context.clock?.timeOfDay ?? 12;
      if (!isWithinHours(mission.start.hours, hour)) {
        if (hourNotice !== id) world.notify(`${mission.title}: come back between ${mission.start.hours[0]}:00 and ${mission.start.hours[1]}:00`);
        hourNotice = id;
        continue;
      }
      start(id);
      return;
    }
  }

  function openNewGame() {
    if (progress.serialise().completed.length) return;
    const first = progress.available()[0];
    const mission = missions[first];
    const point = mission && world.place(mission.start.landmark);
    if (!point) return;
    const city = context.systems.find('openWorldCity');
    const spots = city?.spawnPointsNear?.(point.x, point.z, 34, 'pedestrian', 96) ?? [];
    let best = null, bestScore = Infinity;
    for (const spot of spots) {
      const score = Math.abs(Math.hypot(spot.x - point.x, spot.z - point.z) - 20);
      if (score < bestScore) { bestScore = score; best = spot; }
    }
    const from = best ?? { x: point.x + point.frontX * 18, z: point.z + point.frontZ * 18 };
    run(GAME_COMMANDS.PLAYER_TELEPORT, { position: { x: from.x, z: from.z }, heading: Math.atan2(-(point.x - from.x), -(point.z - from.z)) });
    calls.clear();
    calls.opening(first, OPENING_CALL_DELAY);
  }

  return {
    get activeMissionId() { return active ? active.mission.id : null; },
    get phase() { return active ? active.phase : result ? result.outcome : 'idle'; },
    get objectiveIndex() { return active?.run ? active.run.index : -1; },
    progress,
    world,
    start,
    offer,
    abort(reason) {
      if (!active) return;
      active.run?.fail('aborted', reason ?? undefined);
      failActive(reason ?? 'Mission abandoned');
    },
    skipTo(index) {
      if (!active) return;
      if (!active.run) { active.pendingIndex = index; run(GAME_COMMANDS.CUTSCENE_SKIP, {}); beginObjectives(); return; }
      active.run.skipTo(index);
    },
    onCutsceneEnded({ cutsceneId }) {
      if (!active) return;
      if (active.phase === 'intro' && cutsceneId === `${active.mission.id}:intro`) beginObjectives();
      else if (active.phase === 'outro' && cutsceneId === `${active.mission.id}:outro`) showPassed();
    },
    note(what, id) { active?.run?.noteEvent(what, id); },
    onNewGame: openNewGame,
    fixedUpdate(stepSeconds) {
      if (active?.run) {
        // Only while the objectives run: a passed run keeps answering 'passed' through the outro.
        if (active.phase !== 'objectives') return;
        const status = active.run.update(stepSeconds);
        if (status === 'passed') pass();
        else if (status === 'failed') failActive(active.run.failText);
      } else {
        watchStartMarkers();
      }
    },
    update(deltaSeconds) {
      markers.update(deltaSeconds, followed, world.player(), context.view.camera?.position ?? null);
      givers.update(deltaSeconds);
      if (state.is(GAME_STATE.PLAYING)) calls.update(deltaSeconds);
      if (!result) return;
      if (result.outcome === 'failed' && state.is(GAME_STATE.MISSION_FAILED) && context.input.pressed('skipCutscene')) { retry(); return; }
      result.seconds -= deltaSeconds;
      if (result.seconds <= 0) closeResult();
    },
    serialise: () => progress.serialise(),
    restore(data) { end(); result = null; calls.clear(); progress.restore(data); offer(); },
    dispose() { end(); markers.dispose(); givers.dispose(); },
  };
}
