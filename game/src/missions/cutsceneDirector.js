// The cutscene director: turns a list of catalog dialogue lines into a short film. It stages
// the lead (placed and turned to face the scene's place), enters the cutscene state (the
// letterbox), and gives every line a camera shot framed on the lead: an establishing crane
// shot first, then a slow push-in on whoever is speaking, a reverse over the shoulder for the
// voice on the other end of the line. Shots are held through the follow camera's CAMERA_CUT_TO
// and moved every frame by easing the held shot from its start to its end framing;
// CAMERA_RELEASE hands the camera back. Lines show as subtitles under the letterbox and as
// DIALOGUE_LINE_SPOKEN; Enter or Space skips the rest after a short moment. A staged scene
// first holds behind a black veil until the city's streaming work is idle (context.work), lets
// the caller's restage() move the stage to a clear spot, then fades in.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { GAME_EVENTS } from '../core/events/gameEvents.js';
import { GAME_STATE } from '../core/state/gameStates.js';
import { planCutsceneShots, lineSeconds } from './cutsceneShots.js';

const SKIPPABLE_AFTER = 0.8;
/** The intro's hold behind black: at least `minimum` s, until the streaming has been idle for
 * `quiet` s (the crowd refills within that), at most `maximum` s; then a fade of `fadeSeconds`. */
const HOLD = Object.freeze({ minimum: 0.6, quiet: 0.6, maximum: 9, fadeSeconds: 0.6 });

/**
 * Creates the cutscene director.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 */
export function createCutsceneDirector(context) {
  const { commands, events, state } = context;
  const cast = context.content.find('storyCharacters')?.STORY_CHARACTERS ?? {};
  const rules = context.content.find('storyMissions')?.MISSION_RULES ?? {};
  const held = { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, fieldOfView: 46 };
  const box = buildLetterbox(context.page);
  const fade = buildFade(context.page);
  let scene = null;          // {cutsceneId, missionId, lines, shots, index, t, lineEnd, enteredState}

  function lead() {
    const player = context.systems.find('player')?.entity;
    const vehicleId = player?.data?.vehicleId;
    const body = vehicleId ? context.entities.get(vehicleId) ?? player : player;
    return body ? { x: body.position.x, y: body.position.y, z: body.position.z, heading: body.heading ?? 0, inVehicle: Boolean(vehicleId) } : { x: 0, y: 0, z: 0, heading: 0, inVehicle: false };
  }

  function play({ cutsceneId, missionId = null, lines = [], stage = null, restage = null } = {}) {
    if (scene) finish(true);
    const staged = Boolean(stage) && !lead().inVehicle;
    if (staged && commands.has(GAME_COMMANDS.PLAYER_TELEPORT)) commands.run(GAME_COMMANDS.PLAYER_TELEPORT, stage);
    const spoken = lines.length ? lines : [{ speaker: null, line: '' }];
    const enteredState = state.is(GAME_STATE.PLAYING, GAME_STATE.PHONE_OPEN) ? state.enter(GAME_STATE.CUTSCENE) : false;
    scene = { cutsceneId, missionId, lines: spoken, shots: plan(spoken), index: -1, t: 0, lineEnd: 0, enteredState,
      waiting: staged, waited: 0, quiet: 0, restage: staged ? restage : null };
    events.emit(GAME_EVENTS.CUTSCENE_STARTED, { cutsceneId, missionId });
    box.show(true);
    if (!staged) { nextLine(); return; }
    // A staged scene (a mission's intro, often far from where the lead was) waits behind black
    // until the city round the stage has streamed and the crowd has filled in (QA bug 5: intros
    // opened on an empty grey plain), the first shot already cut so the streaming follows there.
    fade.set(1);
    cutTo(scene.shots[0], 0);
  }

  function plan(spoken) {
    const leadId = context.systems.find('player')?.entity?.data?.characterId ?? 'dez_tolliver';
    return planCutsceneShots(lead(), spoken, leadId);
  }

  function cutTo(shot, k) {
    mix(held.position, shot.from, shot.to, k);
    mix(held.target, shot.lookFrom, shot.lookTo, k);
    held.fieldOfView = shot.fieldOfView;
    if (commands.has(GAME_COMMANDS.CAMERA_CUT_TO)) commands.run(GAME_COMMANDS.CAMERA_CUT_TO, held);
  }

  /** Counts the hold behind black; true once the city is ready (or the hold has run out). */
  function holdUntilStreamed(deltaSeconds) {
    scene.waited += deltaSeconds;
    const pending = Number(context.work?.pendingCount) || 0;
    scene.quiet = pending > 0 ? 0 : scene.quiet + deltaSeconds;
    if (scene.waited < HOLD.minimum || (scene.quiet < HOLD.quiet && scene.waited < HOLD.maximum)) return false;
    scene.waiting = false;
    const clear = scene.restage?.();
    if (clear && commands.has(GAME_COMMANDS.PLAYER_TELEPORT)) commands.run(GAME_COMMANDS.PLAYER_TELEPORT, clear);
    scene.shots = plan(scene.lines);
    fade.to(0, HOLD.fadeSeconds);
    return true;
  }

  function nextLine() {
    scene.index += 1;
    if (scene.index >= scene.lines.length) { finish(false); return; }
    const line = scene.lines[scene.index];
    const seconds = line.line ? lineSeconds(line.line, rules.subtitleSecondsPerLine) : 3;
    scene.lineStart = scene.t;
    scene.lineEnd = scene.t + seconds;
    cutTo(scene.shots[scene.index], 0);
    if (line.line) {
      const speakerName = cast[line.speaker]?.name ?? line.speaker ?? '';
      events.emit(GAME_EVENTS.DIALOGUE_LINE_SPOKEN, { speakerId: line.speaker, speakerName, text: line.line, seconds });
      box.say(speakerName, line.line);
    } else {
      box.say('', '');
    }
  }

  function finish(skipped) {
    if (!scene) return;
    const { cutsceneId, missionId, enteredState } = scene;
    scene = null;
    box.show(false);
    fade.to(0, HOLD.fadeSeconds);
    if (commands.has(GAME_COMMANDS.CAMERA_RELEASE)) commands.run(GAME_COMMANDS.CAMERA_RELEASE, {});
    // The HUD keeps a spoken line up for its full time; a skipped scene takes it down with it.
    if (skipped && commands.has(GAME_COMMANDS.UI_SHOW_SUBTITLE)) commands.run(GAME_COMMANDS.UI_SHOW_SUBTITLE, { speakerName: '', text: '', seconds: 0.01 });
    if (enteredState && state.is(GAME_STATE.CUTSCENE)) state.enter(GAME_STATE.PLAYING);
    events.emit(GAME_EVENTS.CUTSCENE_ENDED, { cutsceneId, missionId, skipped });
  }

  return {
    play,
    skip() { finish(true); },
    get playing() { return scene ? scene.cutsceneId : null; },
    get holding() { return Boolean(scene?.waiting); },
    update(deltaSeconds) {
      fade.update(deltaSeconds);
      if (!scene) return;
      // The follow camera does not write the focus while it holds a shot, so the city would
      // keep streaming round where the lead was before the stage: the scene's subject is it.
      const subject = lead();
      const focus = context.focus?.position;
      if (focus) { focus.x = subject.x; focus.y = subject.y; focus.z = subject.z; }
      if (scene.waiting) {
        if (!holdUntilStreamed(deltaSeconds)) return;
        nextLine();
        return;
      }
      scene.t += deltaSeconds;
      if (scene.t > SKIPPABLE_AFTER && context.input.pressed('skipCutscene')) { finish(true); return; }
      const shot = scene.shots[scene.index];
      const span = Math.max(0.001, scene.lineEnd - scene.lineStart);
      const k = smooth(Math.min(1, (scene.t - scene.lineStart) / span));
      mix(held.position, shot.from, shot.to, k);
      mix(held.target, shot.lookFrom, shot.lookTo, k);
      if (scene.t >= scene.lineEnd) nextLine();
    },
    dispose() { finish(true); box.remove(); fade.remove(); },
  };
}

/** A full-screen black veil over the game and the HUD (under the menus) for the intro's hold. */
function buildFade(page) {
  const document = page.document;
  const veil = document?.createElement?.('div');
  if (veil) {
    veil.style.cssText = 'position:fixed;inset:0;z-index:15;background:#05070a;opacity:0;pointer-events:none;display:none;';
    document.body.append(veil);
  }
  let value = 0, goal = 0, rate = 0;
  const paint = () => { if (veil) { veil.style.opacity = value.toFixed(3); veil.style.display = value > 0.002 ? 'block' : 'none'; } };
  return {
    set(v) { value = goal = v; paint(); },
    to(v, seconds) { goal = v; rate = Math.abs(goal - value) / Math.max(0.01, seconds); },
    update(deltaSeconds) {
      if (value === goal) return;
      const step = rate * deltaSeconds;
      value = Math.abs(goal - value) <= step ? goal : value + Math.sign(goal - value) * step;
      paint();
    },
    remove() { veil?.remove(); },
  };
}
function mix(out, a, b, k) { out.x = a.x + (b.x - a.x) * k; out.y = a.y + (b.y - a.y) * k; out.z = a.z + (b.z - a.z) * k; }
function smooth(k) { return k * k * (3 - 2 * k); }

/** The subtitle and skip hint inside the page's letterbox container. */
function buildLetterbox(page) {
  const box = page.element('cutscene-letterbox');
  if (!box) return { show() {}, say() {}, remove() {} };
  const document = page.document;
  const subtitle = document.createElement('div');
  subtitle.style.cssText = 'position:absolute;left:50%;bottom:2.6vh;transform:translateX(-50%);width:max-content;max-width:min(70vw,900px);'
    + 'text-align:center;font:500 clamp(14px,2.3vh,26px)/1.35 system-ui,sans-serif;color:#fff6e6;text-shadow:0 1px 3px #000;';
  const speaker = document.createElement('span');
  speaker.style.cssText = 'color:#ffd36b;font-weight:700;margin-right:0.5em;';
  const words = document.createElement('span');
  subtitle.append(speaker, words);
  const hint = document.createElement('div');
  hint.style.cssText = 'position:absolute;right:2.4vw;top:3.4vh;font:600 clamp(10px,1.4vh,15px)/1 system-ui,sans-serif;color:#fff6e6b0;letter-spacing:0.08em;';
  hint.textContent = 'ENTER  SKIP';
  box.append(subtitle, hint);
  return {
    show(on) { if (!on) { speaker.textContent = ''; words.textContent = ''; } },
    say(name, text) { speaker.textContent = name ? `${name}` : ''; words.textContent = text; },
    remove() { subtitle.remove(); hint.remove(); },
  };
}
