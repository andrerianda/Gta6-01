// The scene script builder: a scene module describes its film with a cursor on a time line and
// gets plain data back. Pure (no three.js, no DOM): the cinematic runtime plays the data, the
// tests of tools/tests/cinematics/ read it. Positions are local to the stage (+x right, +y up,
// -z forward, turned by the stage heading about +Y). Cues land at the cursor; only line(),
// wait() and at() move it.
//
//   const s = createSceneScript({ skippable: true }, tools);
//   s.stage({ origin, heading }); s.black(); s.fade({ to: 0, seconds: 1.5 });
//   s.shot({ from: { position, target, fov }, to: {...}, seconds: 4 }); s.wait(4);
//   s.line('hr_01'); s.mark('doors_open'); s.end({ leadAt: { position, heading } });
//   return s.script();

/** Every cue kind the timeline may carry. */
export const CUE_KINDS = Object.freeze([
  'fade', 'shot', 'firstPerson', 'line', 'card', 'act', 'move', 'show', 'sound', 'mark', 'run', 'waitFor', 'phone', 'arm',
]);

/** The gestures act() takes. */
export const ACTOR_GESTURES = Object.freeze([
  'salute', 'halt', 'idle', 'talk', 'offer', 'take', 'turn_away', 'pull', 'point', 'phone_ear', 'sit',
]);

/** Seconds a line takes when nobody can say (no voiceOver yet). */
export const DEFAULT_LINE_SECONDS = 3;
/** The pause after a line before the next cue. */
export const DEFAULT_LINE_GAP = 0.3;
/** How long a scripted phone waits for the answer before the scene goes on by itself. */
export const PHONE_ANSWER_TIMEOUT = 8;

const number = (value, fallback) => (Number.isFinite(value) ? value : fallback);

/**
 * Creates a scene script builder.
 * @param {{skippable?: boolean, letterbox?: boolean, hideLead?: boolean, hud?: boolean,
 *   secondsOf?: (lineId: string) => number}} [options] skippable (default true), letterbox
 *   (default true), hideLead (default false: the lead's body stays where it is and is drawn).
 * @param {{secondsOf?: (lineId: string) => number}} [tools] The runtime tools (for line lengths).
 */
export function createSceneScript(options = {}, tools = null) {
  const secondsOf = options.secondsOf ?? tools?.secondsOf ?? (() => DEFAULT_LINE_SECONDS);
  const data = {
    options: { skippable: options.skippable !== false, letterbox: options.letterbox !== false, hideLead: options.hideLead === true },
    stage: { origin: null, heading: 0 },
    clock: null,
    startBlack: false,
    sets: [], actors: [], props: [], lights: [], cues: [],
    end: { leadAt: null, keepBlack: false },
  };
  let cursor = 0, order = 0;

  function cue(kind, fields, seconds = 0, essential = false) {
    const entry = { kind, t: cursor, seconds: Math.max(0, number(seconds, 0)), essential, order, ...fields };
    order += 1;
    data.cues.push(entry);
    return entry;
  }

  const s = {
    /** The cursor, seconds. */
    get time() { return cursor; },
    /** Sets the cursor. */
    at(seconds) { cursor = Math.max(0, number(seconds, 0)); return s; },
    /** Moves the cursor. */
    wait(seconds) { cursor = Math.max(0, cursor + number(seconds, 0)); return s; },

    stage({ origin = null, heading = 0 } = {}) { data.stage = { origin: origin ? { ...origin } : null, heading: number(heading, 0) }; return s; },
    /** Holds the clock (and the weather) for the scene; restore: false leaves them as set. */
    clock(spec) { data.clock = spec ? { hours: spec.hours ?? null, weather: spec.weather ?? null, restore: spec.restore !== false } : null; return s; },
    set(name, assetId, spec = {}) { data.sets.push({ name, assetId, ...placed(spec) }); return s; },
    prop(name, assetId, spec = {}) { data.props.push({ name, assetId, ...placed(spec), parent: spec.parent ?? null, visible: spec.visible !== false }); return s; },
    actor(name, spec = {}) {
      data.actors.push({ name, archetypeId: spec.archetypeId ?? null, characterId: spec.characterId ?? null, ...placed(spec),
        tint: spec.tint ?? null, kit: spec.kit ?? null, pose: spec.pose ?? null, visible: spec.visible !== false });
      return s;
    },
    light(name, spec = {}) {
      data.lights.push({ name, kind: spec.kind === 'spot' ? 'spot' : 'point', position: { x: 0, y: 2.5, z: 0, ...spec.position },
        target: spec.target ? { ...spec.target } : null, colour: spec.colour ?? '#ffffff', intensity: number(spec.intensity, 1),
        range: number(spec.range, 12), angle: number(spec.angle, 0.6), parent: spec.parent ?? null });
      return s;
    },

    /** The scene opens behind a full veil (of a colour). */
    black(colour = '#000000') { data.startBlack = colour; return s; },
    fade({ to = 0, seconds = 1, colour = null } = {}) { cue('fade', { to: to ? 1 : 0, colour }, seconds); return s; },
    shot({ from, to = null, seconds = 3, ease = 'smooth', shake = 0, attach = null } = {}) {
      cue('shot', { from: frame(from), to: to ? frame({ ...from, ...to }) : null, ease, shake: number(shake, 0), attach }, seconds);
      return s;
    },
    firstPerson({ path = [], visor = null, bob = 1, breath = 1, seconds = null, fov = 60, attach = null } = {}) {
      const points = path.map((p) => ({ t: number(p.t, 0), position: { x: 0, y: 1.7, z: 0, ...p.position }, yaw: number(p.yaw, 0), pitch: number(p.pitch, 0) }))
        .sort((a, b) => a.t - b.t);
      const length = seconds ?? (points.length ? points[points.length - 1].t : 0);
      cue('firstPerson', { path: points, visor, bob: number(bob, 1), breath: number(breath, 1), fov, attach }, length);
      return s;
    },
    line(lineId, { channel = null, gap = DEFAULT_LINE_GAP, advance = true, quiet = false } = {}) {
      const seconds = Math.max(0, number(secondsOf(lineId), DEFAULT_LINE_SECONDS));
      cue('line', { lineId, channel, quiet }, seconds);
      if (advance) cursor += seconds + number(gap, DEFAULT_LINE_GAP);
      return s;
    },
    card({ style = 'title', text = '', sub = '', seconds = 4, lines = null } = {}) { cue('card', { style, text, sub, lines }, seconds); return s; },
    act(actor, { gesture = undefined, walkTo = null, face = undefined, seconds = 0, speed = null } = {}) {
      if (gesture && !ACTOR_GESTURES.includes(gesture)) throw new Error(`no gesture "${gesture}"`);
      cue('act', { actor, gesture, walkTo: walkTo ? { ...walkTo } : null, face, speed }, seconds);
      return s;
    },
    move(target, { translate = null, rotate = null, seconds = 1, ease = 'smooth' } = {}) {
      cue('move', { target, translate: translate ? { x: 0, y: 0, z: 0, ...translate } : null, rotate: rotate ? { x: 0, y: 0, z: 0, ...rotate } : null, ease }, seconds);
      return s;
    },
    show(target, visible = true) { cue('show', { target, visible: Boolean(visible) }); return s; },
    sound(soundId, { action = 'play', volume = undefined, fadeSeconds = undefined } = {}) { cue('sound', { soundId, action, volume, fadeSeconds }); return s; },
    mark(name, payload = null) { cue('mark', { name, payload }, 0, true); return s; },
    run(fn, { essential = false } = {}) { cue('run', { fn }, 0, Boolean(essential)); return s; },
    waitFor(token, { timeout = 10 } = {}) { cue('waitFor', { token, timeout: Math.max(0, number(timeout, 10)) }); return s; },
    phone({ action = 'ring', callerId = null, callerName = null, callId = null, autoAnswerSeconds = 5 } = {}) {
      const id = callId ?? `scene_${callerId ?? 'call'}`;
      cue('phone', { action, callerId, callerName, callId: id, autoAnswerSeconds });
      if (action === 'ring') cue('waitFor', { token: `phone:${id}`, timeout: Math.max(PHONE_ANSWER_TIMEOUT, autoAnswerSeconds + 3) });
      return s;
    },
    arm({ gesture = 'salute', seconds = 2.4 } = {}) { cue('arm', { gesture }, seconds); return s; },
    end({ leadAt = null, keepBlack = false, world = false } = {}) {
      data.end = { leadAt: leadAt ? { position: { ...leadAt.position }, heading: number(leadAt.heading, 0), world: Boolean(world || leadAt.world) } : null, keepBlack: Boolean(keepBlack) };
      return s;
    },
    /** The finished script: plain data (run cues carry their function). */
    script() {
      let duration = cursor;
      for (const entry of data.cues) duration = Math.max(duration, entry.t + entry.seconds);
      return { ...data, cues: data.cues.slice(), duration };
    },
  };
  return s;
}

function placed(spec) {
  return { position: spec.position ? { x: 0, z: 0, ...spec.position } : { x: 0, z: 0 }, heading: number(spec.heading, 0) };
}

function frame(view = {}) {
  return { position: { x: 0, y: 1.6, z: 4, ...view.position }, target: { x: 0, y: 1.5, z: 0, ...view.target }, fov: number(view.fov, 40) };
}
