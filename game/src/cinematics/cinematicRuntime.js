// The cinematic runtime: plays one registered scene at a time. It asks the scene's module for
// its script, enters the cutscene state, builds the stage (sets, props, lights, cast), waits
// behind the veil while the city streams when the stage is far away, then runs the timeline:
// every frame it fires the cues that came due, moves the tracks (fades, cards, node moves, the
// arm), holds the camera on the shot through CAMERA_CUT_TO and keeps the frame's focus there.
// Lines go through STORY_LINE_SPEAK, sounds through STORY_SOUND, phone cues through
// PHONE_CALL_RING; each is skipped quietly while its system is missing. At the end (or on a
// skip, which first fires the essential cues) it takes everything it made out of the world,
// stops what it started, puts the lead where the script says and resolves play()'s promise.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { GAME_EVENTS } from '../core/events/gameEvents.js';
import { GAME_STATE } from '../core/state/gameStates.js';
import { createCinematicActors } from './cinematicActors.js';
import { createCinematicCamera } from './cinematicCamera.js';
import { createCinematicOverlay } from './cinematicOverlay.js';
import { createCinematicStage } from './cinematicStage.js';
import { createCinematicTimeline, ease } from './cinematicTimeline.js';
import { CINEMATIC_DEMO_SCENE } from './demoScene.js';
import { DEFAULT_LINE_SECONDS } from './sceneScript.js';

const SKIPPABLE_AFTER = 0.8;
/** The hold behind the veil while a far stage streams in: at least, quiet for, at most (seconds). */
const SETTLE = Object.freeze({ far: 150, minimum: 0.5, quiet: 0.5, maximum: 8 });
const VEIL_OUT_SECONDS = 0.6;

/**
 * Creates the runtime.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 * @param {Map<string, {id: string, build: Function}>} scenes The registered scenes (the director's map).
 */
export function createCinematicRuntime(context, scenes) {
  const { commands, events, state } = context;
  const overlay = createCinematicOverlay(context.page);
  const run = (command, payload) => (commands.has(command) ? commands.run(command, payload) : undefined);
  const unsubscribe = [];
  /** The scene that plays, or null. */
  let now = null;
  let veilOut = 0, serial = 0;

  if (!scenes.has(CINEMATIC_DEMO_SCENE.id)) scenes.set(CINEMATIC_DEMO_SCENE.id, CINEMATIC_DEMO_SCENE);

  function groundHeightAt(x, z) {
    const city = context.systems.find('openWorldCity');
    const height = typeof city?.groundHeightAt === 'function' ? city.groundHeightAt(x, z) : NaN;
    return Number.isFinite(height) ? height : 0;
  }

  function lead() {
    const player = context.systems.find('player')?.entity;
    const vehicleId = player?.data?.vehicleId;
    const body = (vehicleId ? context.entities.get(vehicleId) : null) ?? player;
    return body ? { x: body.position.x, y: body.position.y, z: body.position.z, heading: body.heading ?? 0, inVehicle: Boolean(vehicleId) }
      : { x: 0, y: 0, z: 0, heading: 0, inVehicle: false };
  }

  function secondsOf(lineId) {
    const voice = context.systems.find('voiceOver');
    const seconds = typeof voice?.secondsOf === 'function' ? voice.secondsOf(lineId) : NaN;
    return seconds > 0 ? seconds : DEFAULT_LINE_SECONDS;
  }

  /** An aircraft of the world by vehicle id or model id (the nearest of that model), or null. */
  function aircraft(id) {
    const fleet = context.systems.find('vehicles');
    const at = lead();
    let entity = id ? context.entities.get(id) ?? null : null;
    if (!entity && typeof context.entities.nearest === 'function') {
      entity = context.entities.nearest(at.x, at.z, 30000, (candidate) => candidate.data?.modelId === id) ?? null;
    }
    if (!entity) return null;
    const root = typeof fleet?.modelOf === 'function' ? fleet.modelOf(entity.id) ?? null : null;
    return { root, position: entity.position, heading: entity.heading ?? 0, vehicleId: entity.id };
  }

  function toolsFor(params) {
    const tools = { context, params, groundHeightAt, aircraft, lead, secondsOf, toWorld: (local) => ({ x: local.x ?? 0, y: local.y ?? 0, z: local.z ?? 0 }) };
    return tools;
  }

  /** Loads the models a script names that are registered but not loaded; missing ones stay missing. */
  async function ensureAssets(script) {
    const assets = context.assets;
    if (!assets) return;
    const wanted = new Set([...script.sets, ...script.props].map((entry) => entry.assetId));
    for (const cue of script.cues) {
      if (cue.kind === 'firstPerson' && cue.visor) wanted.add(cue.visor === 'pressure' ? 'pressure_helmet_rim' : 'helmet_visor_rim');
      if (cue.kind === 'arm') wanted.add('pilot_arm_fp');
    }
    const ids = [...wanted].filter((id) => id && !assets.has(id) && assets.registry?.[id]);
    for (const id of ids) {
      try { await assets.load([id]); } catch { /* not built yet: the scene plays without it */ }
    }
  }

  function setLeadShown(shown) {
    const figure = context.systems.find('player')?.figure?.instance;
    if (figure) figure.visible = shown;
  }

  /**
   * Plays a scene.
   * @returns {Promise<{skipped: boolean, missing?: boolean}>}
   */
  function play(sceneId, params = {}) {
    if (now) finish(true);
    const scene = scenes.get(sceneId);
    if (!scene || typeof scene.build !== 'function') return Promise.resolve({ skipped: true, missing: true });
    serial += 1;
    const entry = { sceneId, serial, phase: 'loading', tools: toolsFor(params ?? {}), script: null, timeline: null, stage: null, actors: null, camera: null,
      enteredState: false, elapsed: 0, waited: 0, quiet: 0, settle: false, held: false, seekTo: null, moves: new Map(), fired: new Set(),
      fades: new Map(), sounds: new Set(), spoke: false, call: null, card: null, view: null, anchor: null, leadHidden: false, clock: null,
      resumes: [], resolve: null };
    const promise = new Promise((resolve) => { entry.resolve = resolve; });
    now = entry;
    veilOut = 0;
    entry.enteredState = state.is(GAME_STATE.PLAYING, GAME_STATE.PHONE_OPEN) ? Boolean(state.enter(GAME_STATE.CUTSCENE)) : false;
    overlay.show(true);
    events.emit(GAME_EVENTS.CINEMATIC_STARTED, { sceneId });
    prepare(entry, scene, params ?? {});
    return promise;
  }

  async function prepare(entry, scene, params) {
    let script = null;
    try {
      script = await scene.build(params, entry.tools);
      if (script && now === entry) await ensureAssets(script);
    } catch (error) {
      entry.error = error;
      script = null;
    }
    if (now !== entry) return;
    if (!script || !Array.isArray(script.cues)) { finish(true); return; }
    entry.script = script;
    const at = lead();
    const origin = { x: script.stage.origin?.x ?? at.x, y: 0, z: script.stage.origin?.z ?? at.z };
    origin.y = script.stage.origin?.y ?? groundHeightAt(origin.x, origin.z);
    const heading = script.stage.heading ?? 0;
    entry.stage = createCinematicStage({ context, origin, heading, groundHeightAt });
    entry.tools.toWorld = (local) => entry.stage.toWorld(local);
    entry.camera = createCinematicCamera({ context, stage: entry.stage, heading });
    entry.actors = createCinematicActors({ context, group: entry.stage.group, groundY: entry.stage.groundY,
      pointOf: (name) => (name === 'camera' ? cameraLocal(entry) : entry.stage.find(name)?.position ?? null) });
    for (const spec of script.sets) entry.stage.addSet(spec);
    for (const spec of script.props) entry.stage.addProp(spec);
    for (const spec of script.lights) entry.stage.addLight(spec);
    for (const spec of script.actors) { try { entry.actors.add(spec); } catch (error) { entry.error = error; } }
    if (script.clock) holdClock(entry, script.clock);
    if (script.options.hideLead) entry.leadHidden = true;
    // First-person scenes and overlays play without the bars (styles/marazul.css reads this).
    const body = context.page?.document?.body;
    if (body) body.dataset.cinematicBars = script.options.letterbox ? 'on' : 'off';
    if (script.startBlack) overlay.veil(1, typeof script.startBlack === 'string' ? script.startBlack : '#000000');
    entry.timeline = createCinematicTimeline(script);
    // A stage far from where the camera was waits behind the veil for the city to stream in.
    const focus = context.focus?.position;
    entry.settle = Boolean(script.startBlack) && Boolean(focus) && Math.hypot(focus.x - origin.x, focus.z - origin.z) > SETTLE.far;
    entry.origin = origin;
    entry.phase = entry.settle ? 'settling' : 'playing';
    if (entry.seekTo !== null) { const target = entry.seekTo; entry.seekTo = null; seek(target.seconds, target.hold); }
  }

  /** The camera's place in stage space (what `face: 'camera'` turns to). */
  function cameraLocal(entry) {
    if (!entry.camera?.hasView) return null;
    const p = entry.camera.held.position;
    const local = entry.stage.group.worldToLocal(entry.stage.group.position.clone().set(p.x, p.y, p.z));
    return { x: local.x, z: local.z };
  }

  function holdClock(entry, spec) {
    const clock = context.clock, pipeline = context.systems.find('worldRenderPipeline');
    entry.clock = { hours: clock?.timeOfDay ?? null, frozen: clock?.frozen ?? false, weather: pipeline?.weather ?? null, restore: spec.restore };
    if (Number.isFinite(spec.hours)) { run(GAME_COMMANDS.TIME_SET, { hours: spec.hours }); if (clock) clock.frozen = true; }
    if (spec.weather) run(GAME_COMMANDS.WEATHER_SET, { weather: spec.weather, seconds: 1 });
  }

  function releaseClock(entry) {
    const saved = entry.clock;
    if (!saved) return;
    if (context.clock) context.clock.frozen = saved.frozen;
    if (!saved.restore) return;
    if (Number.isFinite(saved.hours)) run(GAME_COMMANDS.TIME_SET, { hours: saved.hours });
    if (saved.weather) run(GAME_COMMANDS.WEATHER_SET, { weather: saved.weather, seconds: 2 });
  }

  /** Fires one cue. `sought`: reached by a seek, so nothing is spoken or sounded and walks land at once. */
  function fire(entry, cue, sought = false) {
    switch (cue.kind) {
      case 'fade':
        entry.fades.set(cue, overlay.veilValue);
        if (!(cue.seconds > 0)) overlay.veil(cue.to, cue.colour);
        break;
      case 'shot': case 'firstPerson': entry.view = cue; break;
      case 'line':
        if (!sought) { entry.spoke = true; run(GAME_COMMANDS.STORY_LINE_SPEAK, { lineId: cue.lineId, ...(cue.channel ? { channel: cue.channel } : {}), ...(cue.quiet ? { quiet: true } : {}) }); }
        break;
      case 'card': entry.card = cue; break;
      case 'act': entry.actors.act(cue, sought); break;
      case 'move': entry.moves.set(cue, entry.stage.beginMove(cue.target)); break;
      case 'show':
        if (cue.target === 'lead') entry.leadHidden = !cue.visible;
        else if (!entry.actors.show(cue.target, cue.visible)) entry.stage.show(cue.target, cue.visible);
        break;
      case 'sound':
        if (sought) break;
        if (cue.action === 'start') entry.sounds.add(cue.soundId); else if (cue.action === 'stop') entry.sounds.delete(cue.soundId);
        run(GAME_COMMANDS.STORY_SOUND, { soundId: cue.soundId, action: cue.action, ...(cue.volume !== undefined ? { volume: cue.volume } : {}), ...(cue.fadeSeconds !== undefined ? { fadeSeconds: cue.fadeSeconds } : {}) });
        break;
      case 'mark':
        if (entry.fired.has(cue)) break;
        entry.fired.add(cue);
        events.emit(GAME_EVENTS.CINEMATIC_CUE, { sceneId: entry.sceneId, name: cue.name, payload: cue.payload ?? null });
        break;
      case 'run':
        if (entry.fired.has(cue)) break;
        entry.fired.add(cue);
        try { cue.fn?.(entry.tools); } catch (error) { entry.error = error; }
        break;
      case 'phone':
        if (sought) break;
        if (cue.action === 'ring') {
          const rang = run(GAME_COMMANDS.PHONE_CALL_RING, { callId: cue.callId, callerId: cue.callerId, ...(cue.callerName ? { callerName: cue.callerName } : {}),
            scripted: true, autoAnswerSeconds: cue.autoAnswerSeconds ?? 5, canDecline: false });
          if (rang) entry.call = cue.callId; else entry.resumes.push(`phone:${cue.callId}`);
        } else {
          run(GAME_COMMANDS.PHONE_CALL_END, { reason: 'finished' });
          entry.call = null;
        }
        break;
      default: break; // waitFor: the timeline holds by itself; arm: a track
    }
  }

  /** Moves one track to its progress. */
  function track(entry, { cue, k, ended }) {
    if (cue.kind === 'fade') {
      const from = entry.fades.get(cue) ?? overlay.veilValue;
      overlay.veil(from + (cue.to - from) * k, cue.colour);
    } else if (cue.kind === 'move') {
      entry.stage.applyMove(entry.moves.get(cue), cue, ease(cue.ease, k));
    } else if (cue.kind === 'card' && entry.card === cue) {
      if (ended) { overlay.card(null); entry.card = null; } else overlay.card(cue, k, cue.seconds);
    } else if (cue.kind === 'arm') {
      entry.camera.arm(ended ? null : cue.gesture, k);
    }
  }

  function holdCamera(entry, dt) {
    const cue = entry.view;
    if (!cue) return;
    const t = Math.max(0, entry.timeline.time - cue.t);
    let anchor = null;
    if (typeof cue.attach === 'function') { try { anchor = cue.attach(entry.tools) ?? null; } catch (error) { entry.error = error; } }
    if (cue.kind === 'shot') entry.camera.shot(cue, Math.min(t, cue.seconds), anchor);
    else entry.camera.firstPerson(cue, t, dt, anchor);
    entry.camera.showVisor();
    overlay.visor(entry.camera.visor, entry.camera.breath, entry.camera.visorModelShown);
    const held = entry.camera.held;
    run(GAME_COMMANDS.CAMERA_CUT_TO, held);
    if (cue.shake > 0 && !cue.shaken) { cue.shaken = true; run(GAME_COMMANDS.CAMERA_SHAKE, { strength: cue.shake, seconds: cue.seconds }); }
    const focus = context.focus?.position;
    const subject = cue.kind === 'shot' ? held.target : held.position;
    if (focus) { focus.x = subject.x; focus.y = subject.y; focus.z = subject.z; }
  }

  function seek(seconds, hold = true) {
    const entry = now;
    if (!entry) return false;
    if (entry.phase === 'loading') { entry.seekTo = { seconds, hold }; return true; }
    entry.phase = 'playing';
    entry.held = Boolean(hold);
    overlay.card(null);
    entry.card = null;
    if (entry.script.startBlack) overlay.veil(1, typeof entry.script.startBlack === 'string' ? entry.script.startBlack : '#000000'); else overlay.veil(0);
    for (const cue of entry.timeline.seek(seconds)) fire(entry, cue, true);
    for (const item of entry.timeline.tracks) track(entry, item);
    entry.actors.update(0.3);
    entry.actors.update(0.3);
    holdCamera(entry, 0);
    return true;
  }

  function finish(skipped) {
    const entry = now;
    if (!entry) return;
    now = null;
    if (skipped && entry.timeline) for (const cue of entry.timeline.skip()) fire(entry, cue, true);
    if (skipped && entry.spoke) run(GAME_COMMANDS.STORY_LINES_STOP, {});
    for (const soundId of entry.sounds) run(GAME_COMMANDS.STORY_SOUND, { soundId, action: 'stop', fadeSeconds: 0.3 });
    if (entry.call) run(GAME_COMMANDS.PHONE_CALL_END, { reason: 'finished' });
    const end = entry.script?.end ?? null;
    let leadAt = null;
    if (end?.leadAt && entry.stage) {
      const position = end.leadAt.world ? { ...end.leadAt.position } : entry.stage.toWorld(end.leadAt.position);
      if (!Number.isFinite(end.leadAt.position.y)) position.y = groundHeightAt(position.x, position.z);
      leadAt = { position, heading: end.leadAt.heading + (end.leadAt.world ? 0 : entry.script.stage.heading ?? 0) };
    }
    entry.camera?.arm(null, 1);
    entry.camera?.dispose();
    entry.actors?.dispose();
    entry.stage?.dispose();
    overlay.card(null);
    overlay.visor(null);
    overlay.hint(false);
    overlay.show(false);
    if (end?.keepBlack) overlay.veil(1); else veilOut = overlay.veilValue > 0 ? VEIL_OUT_SECONDS : 0;
    setLeadShown(true);
    if (context.page?.document?.body) delete context.page.document.body.dataset.cinematicBars;
    releaseClock(entry);
    run(GAME_COMMANDS.CAMERA_RELEASE, {});
    if (leadAt) run(GAME_COMMANDS.PLAYER_TELEPORT, leadAt);
    if (entry.enteredState && state.is(GAME_STATE.CUTSCENE)) state.enter(GAME_STATE.PLAYING);
    events.emit(GAME_EVENTS.CINEMATIC_ENDED, { sceneId: entry.sceneId, skipped: Boolean(skipped) });
    entry.resolve({ skipped: Boolean(skipped) });
  }

  function update(dt) {
    if (!now) {
      if (veilOut > 0) {
        overlay.veil(Math.max(0, overlay.veilValue - dt / VEIL_OUT_SECONDS));
        if (overlay.veilValue <= 0) veilOut = 0;
      }
      return;
    }
    const entry = now;
    entry.elapsed += dt;
    const skippable = entry.script ? entry.script.options.skippable : true;
    const ringing = typeof entry.timeline?.waiting === 'string' && entry.timeline.waiting.startsWith('phone:');
    overlay.hint(skippable && !entry.held && !ringing && entry.elapsed > SKIPPABLE_AFTER);
    if (skippable && !entry.held && !ringing && entry.elapsed > SKIPPABLE_AFTER && context.input?.pressed?.('skipCutscene')) { finish(true); return; }
    if (entry.phase === 'loading') return;
    setLeadShown(!entry.leadHidden);
    if (entry.phase === 'settling') {
      const focus = context.focus?.position;
      if (focus) { focus.x = entry.origin.x; focus.y = entry.origin.y; focus.z = entry.origin.z; }
      entry.waited += dt;
      entry.quiet = (Number(context.work?.pendingCount) || 0) > 0 ? 0 : entry.quiet + dt;
      if (entry.waited < SETTLE.minimum || (entry.quiet < SETTLE.quiet && entry.waited < SETTLE.maximum)) return;
      entry.phase = 'playing';
    }
    if (!entry.held) {
      const due = entry.timeline.advance(dt);
      for (const cue of due) { fire(entry, cue); if (now !== entry) return; }
      for (const token of entry.resumes.splice(0)) entry.timeline.resume(token);
      for (const item of entry.timeline.tracks) track(entry, item);
    }
    entry.actors.update(entry.held ? 0 : dt);
    holdCamera(entry, entry.held ? 0 : dt);
    if (!entry.held && entry.timeline.done) finish(false);
  }

  unsubscribe.push(events.on(GAME_EVENTS.PHONE_CALL_ANSWERED, (payload) => { now?.timeline?.resume(`phone:${payload?.callId}`); }));
  unsubscribe.push(events.on(GAME_EVENTS.PHONE_CALL_ENDED, (payload) => {
    if (!now) return;
    if (now.call === payload?.callId) now.call = null;
    now.timeline?.resume(`phone:${payload?.callId}`);
  }));

  return {
    play,
    seek,
    update,
    skip() { if (now) finish(true); },
    resume(token = null) { return now?.timeline ? now.timeline.resume(token) : false; },
    /** Clears a veil a scene left up (end({ keepBlack: true })). */
    clearVeil(seconds = VEIL_OUT_SECONDS) { if (seconds > 0) veilOut = seconds; else overlay.veil(0); },
    get playing() { return now ? now.sceneId : null; },
    get time() { return now?.timeline ? now.timeline.time : 0; },
    get held() { return Boolean(now?.held); },
    /** The last error a scene's own code threw (build, run, attach), for the tests and the tools. */
    get lastError() { return now?.error ?? null; },
    dispose() {
      if (now) finish(true);
      for (const off of unsubscribe) if (typeof off === 'function') off();
      overlay.dispose();
    },
  };
}
