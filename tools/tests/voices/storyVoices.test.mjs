// The voiced lines outside the final arc: every mission cutscene line, story call, police dispatch
// call and extra radio line has a clip found by its exact text; the packs are on disk, in budget
// and in order; and, through a fake WebAudio, a mission cutscene line, a story phone call, a police
// call and a gate radio line each start the right clip at the right offset with their subtitle.
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import * as script from '../../../game/src/catalog/finalArcScript.js';
import * as storyMissions from '../../../game/src/catalog/storyMissions.js';
import * as wantedLevels from '../../../game/src/catalog/wantedLevels.js';
import * as storyCharacters from '../../../game/src/catalog/storyCharacters.js';
import { AIR_GUARD_RADIO_LINES } from '../../../game/src/flight/defence/airGuardTuning.js';
import { GATE_LINES } from '../../../game/src/police/restricted/gateChallenge.js';
import { createStoryPhoneCalls } from '../../../game/src/missions/storyPhoneCalls.js';
import { createCutsceneDirector } from '../../../game/src/missions/cutsceneDirector.js';
import { createIncomingCallRuntime } from '../../../game/src/ui/call/incomingCallRuntime.js';
import { STORY_VOICE_CLIPS, STORY_VOICE_MISSION_PACKS, STORY_VOICE_PACKS } from '../../../game/src/audio/voice/storyVoiceIndex.js';
import { POLICE_RADIO, STORY_VOICE_CAST, voiceKeyOf } from '../../../game/src/audio/voice/storyVoiceLines.js';
import { VOICE_CAST, VOICE_TAIL_SECONDS } from '../../../game/src/audio/voice/voicePackIndex.js';
import { createVoiceOverRuntime } from '../../../game/src/audio/voice/voiceOverRuntime.js';
import { GAME_COMMANDS } from '../../../game/src/core/events/gameCommands.js';
import { GAME_EVENTS } from '../../../game/src/core/events/gameEvents.js';

const { STORY_MISSIONS, STORY_MISSION_ORDER } = storyMissions;
const game = resolve(dirname(fileURLToPath(import.meta.url)), '../../../game');
const BUDGET_BYTES = 3 * 1024 * 1024;
const clipOf = (text) => STORY_VOICE_CLIPS[voiceKeyOf(text)];

/** The texts the story's phone rings with, as the game's own phone code makes them. */
function phoneLines() {
  const rung = [];
  const calls = createStoryPhoneCalls({ message() {}, speak() {}, notify() {}, ring: (callId, from, text) => { rung.push({ callId, from, text }); return true; } },
    { missions: STORY_MISSIONS, nameOf: (id) => id, placeOf: () => null });
  calls.opening(STORY_MISSION_ORDER[0], 0);
  STORY_MISSION_ORDER.forEach((id, i) => { if (STORY_MISSION_ORDER[i + 1]) calls.afterPass(id, [STORY_MISSION_ORDER[i + 1]]); });
  calls.update(1000);
  return rung;
}

const missionLines = () => STORY_MISSION_ORDER.flatMap((id) => ['intro', 'outro'].flatMap((part) => (STORY_MISSIONS[id][part] ?? []).map((line) => ({ id, ...line }))));

test('every mission cutscene line has a clip in its act\'s pack, and every speaker a voice', () => {
  const lines = missionLines();
  assert.ok(lines.length >= 140);
  for (const line of lines) {
    const clip = clipOf(line.line);
    assert.ok(clip, `${line.id}: no clip for "${line.line}"`);
    assert.equal(clip.pack, STORY_VOICE_MISSION_PACKS[line.id], line.id);
    assert.ok(STORY_VOICE_CAST[line.speaker], `no voice for ${line.speaker}`);
  }
});

test('every story call, police call and extra radio line has a clip', () => {
  const calls = phoneLines();
  assert.equal(calls.length, STORY_MISSION_ORDER.length);
  for (const call of calls) assert.equal(clipOf(call.text)?.pack, 'calls', call.callId);
  for (const level of wantedLevels.WANTED_LEVELS) if (level.radioCall) assert.equal(clipOf(level.radioCall)?.pack, 'radio', level.radioCall);
  for (const line of [POLICE_RADIO.search, POLICE_RADIO.searchFromAir, ...Object.values(POLICE_RADIO.cleared), ...Object.values(GATE_LINES)]) {
    assert.equal(clipOf(line.text)?.pack, 'radio', line.text);
  }
  for (const [lineId, line] of Object.entries(AIR_GUARD_RADIO_LINES)) {
    if (!script.FINAL_ARC_LINES[lineId]) assert.equal(clipOf(line.text)?.pack, 'radio', lineId);
  }
});

test('the story characters each have a voice of their own, the shared ones as in the final arc', () => {
  const characters = Object.keys(storyCharacters.STORY_CHARACTERS);
  const voices = characters.map((id) => STORY_VOICE_CAST[id]);
  assert.ok(voices.every(Boolean));
  assert.equal(new Set(voices).size, voices.length);
  assert.equal(STORY_VOICE_CAST.dez_tolliver, VOICE_CAST.dez_tolliver);
  assert.equal(STORY_VOICE_CAST.ximena_robles, VOICE_CAST.ximena_robles);
  for (const voice of Object.values(STORY_VOICE_CAST)) assert.match(voice, /^aura-2-[a-z]+-en$/);
});

test('the text key ignores the spaces at the ends and in between, and the keys never collide', () => {
  assert.equal(voiceKeyOf('  Last warning.   Leave now. '), voiceKeyOf('Last warning. Leave now.'));
  assert.match(voiceKeyOf('x'), /^[0-9a-f]{8}$/);
  const texts = new Set([...missionLines().map((line) => line.line), ...phoneLines().map((call) => call.text)]);
  assert.equal(new Set([...texts].map(voiceKeyOf)).size, texts.size);
});

test('clips lie inside their pack in order; the packs are on disk at their size and under 3 MiB', () => {
  let total = 0;
  for (const [pack, about] of Object.entries(STORY_VOICE_PACKS)) {
    const clips = Object.values(STORY_VOICE_CLIPS).filter((clip) => clip.pack === pack).sort((a, b) => a.start - b.start);
    assert.equal(clips.length, about.clips, pack);
    let end = 0;
    for (const clip of clips) {
      assert.ok(clip.seconds >= 0.3 && clip.seconds < 12, `${pack} ${clip.start}: ${clip.seconds} s`);
      assert.ok(clip.start >= end + 0.1, `${pack}: a clip at ${clip.start} overlaps the one before`);
      end = clip.start + clip.seconds;
    }
    assert.ok(end <= about.seconds, pack);
    const file = join(game, about.file);
    assert.ok(existsSync(file), about.file);
    assert.equal(statSync(file).size, about.bytes, pack);
    total += about.bytes;
  }
  assert.ok(total <= BUDGET_BYTES, `${total} bytes`);
});

// ---- a fake WebAudio, just enough to see which clip starts where ----

function fakeAudio() {
  const started = [];
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} });
  const node = () => ({ gain: param(), frequency: param(), Q: param(), connect(next) { return next ?? node(); }, start() {}, stop() {} });
  const ctx = {
    state: 'running', currentTime: 10, sampleRate: 8000,
    createGain: node, createBiquadFilter: node, createWaveShaper: node, createConvolver: node, createOscillator: node,
    createBuffer: (channels, length) => ({ getChannelData: () => new Float32Array(length) }),
    createBufferSource() {
      const source = node();
      source.start = (when, offset, length) => { if (source.buffer?.pack) started.push({ pack: source.buffer.pack, when, offset, length }); };
      return source;
    },
    decodeAudioData: async (bytes) => ({ pack: bytes.pack, duration: STORY_VOICE_PACKS[bytes.pack]?.seconds ?? 60 }),
  };
  const mixer = { ctx, buses: { voices: node(), effects: node() }, listenerPosition: { x: 0, y: 0, z: 0 } };
  const fetched = [];
  const fetch = async (url) => {
    fetched.push(url);
    const pack = String(url).replace(/^.*\/|\.mp3$/g, '');
    return { ok: true, arrayBuffer: async () => Object.assign(new ArrayBuffer(8), { pack }) };
  };
  return { ctx, mixer, started, fetched, fetch };
}

function fakeBus() {
  const handlers = new Map();
  const listeners = new Map();
  const emitted = [];
  return {
    emitted,
    commands: {
      handle(name, handler) { handlers.set(name, handler); return () => handlers.delete(name); },
      run(name, payload) { return handlers.get(name)?.(payload); },
      send(name, payload) { return handlers.get(name)?.(payload); },
      has: (name) => handlers.has(name),
    },
    events: {
      on(name, handler) { listeners.set(name, [...(listeners.get(name) ?? []), handler]); return () => {}; },
      emit(name, payload) { emitted.push({ name, payload }); for (const handler of listeners.get(name) ?? []) handler(payload); },
    },
  };
}

/** The voice-over over a fake audio graph, with the game's catalogs and a subtitle layer that remembers. */
async function voicedGame() {
  const audio = fakeAudio();
  const bus = fakeBus();
  const shown = [];
  const subtitles = { show: (line) => shown.push(line), clear: () => shown.push(null), setEnabled() {}, update() {}, dispose() {} };
  const systems = new Map([['audio', { director: { mixer: audio.mixer } }]]);
  const catalogs = { finalArcScript: script, storyMissions, wantedLevels, storyCharacters };
  const context = {
    ...bus, launch: {}, page: { document: {} }, settings: { get: () => true }, flags: { get: () => false },
    systems: { find: (name) => systems.get(name) ?? null },
    content: { find: (name) => catalogs[name] ?? null, get: (name) => catalogs[name] },
  };
  const previousFetch = globalThis.fetch;
  globalThis.fetch = audio.fetch;
  const runtime = createVoiceOverRuntime(context, { script, subtitles });
  systems.set('voiceOver', { ready: true, speakText: (request) => runtime.speakText(request), stop: () => runtime.stopLines() });
  const settle = async () => { runtime.update(0.016); for (let i = 0; i < 6; i += 1) await new Promise((done) => { setImmediate(done); }); };
  const restore = () => { globalThis.fetch = previousFetch; };
  return { audio, bus, shown, systems, context, runtime, settle, restore };
}

const expectStart = (start, clip, pack) => {
  assert.equal(start.pack, pack);
  assert.ok(Math.abs(start.offset - (clip.start - 0.012)) < 1e-6, `offset ${start.offset} for a clip at ${clip.start}`);
  assert.ok(Math.abs(start.length - (clip.seconds + 0.04)) < 1e-6);
};

test('a mission intro: each line starts its clip as its subtitle appears and lasts as long as the clip', async () => {
  const v = await voicedGame();
  try {
    const mission = STORY_MISSIONS.m01_hook_and_chain;
    v.bus.events.emit(GAME_EVENTS.MISSION_AVAILABLE, { missionId: mission.id });
    await v.settle();
    assert.deepEqual(v.audio.fetched, ['assets/voices/act1.mp3']);
    let state = 'playing';
    const director = createCutsceneDirector({
      ...v.bus, page: { document: null, element: () => null }, focus: { position: { x: 0, y: 0, z: 0 } }, work: { pendingCount: 0 },
      state: { is: (...names) => names.includes(state), enter: (name) => { state = name; return true; } },
      input: { pressed: () => false },
      content: v.context.content,
      systems: v.context.systems,
    });
    director.play({ cutsceneId: `${mission.id}:intro`, missionId: mission.id, lines: mission.intro });
    for (let i = 0; i < mission.intro.length; i += 1) {
      const line = mission.intro[i];
      const clip = clipOf(line.line);
      const spoken = v.bus.emitted.filter((entry) => entry.name === GAME_EVENTS.DIALOGUE_LINE_SPOKEN).at(-1).payload;
      assert.equal(spoken.text, line.line);
      const seconds = Math.max(1.6, clip.seconds + VOICE_TAIL_SECONDS);
      assert.ok(Math.abs(spoken.seconds - seconds) < 1e-3, `${spoken.seconds} vs ${seconds}`);
      expectStart(v.audio.started.at(-1), clip, 'act1');
      assert.equal(v.audio.started.length, i + 1);
      // The director moves on to the next line when this one's clip is over.
      director.update(seconds - 0.05);
      assert.equal(v.audio.started.length, i + 1);
      director.update(0.06);
    }
    assert.equal(director.playing, null);
    assert.equal(v.runtime.debug.lastChannel, 'face');
  } finally { v.restore(); }
});

test('a story call: once answered, the caller\'s clip plays through the phone with the subtitle', async () => {
  const v = await voicedGame();
  try {
    const element = () => ({ style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, addEventListener() {}, remove() {} });
    const document = { createElement: element, head: element(), body: element(), defaultView: null };
    const calls = createIncomingCallRuntime({
      ...v.bus, page: { document }, launch: {}, clock: null, input: null,
      state: { is: (...names) => names.includes('playing') }, content: v.context.content, systems: v.context.systems,
    });
    const call = phoneLines().find((entry) => entry.callId === 'giver:m02_twice_the_weight');
    assert.equal(v.bus.commands.run(GAME_COMMANDS.PHONE_CALL_RING, { callId: call.callId, callerId: call.from, text: call.text }), true);
    await v.settle();
    assert.ok(v.audio.fetched.includes('assets/voices/calls.mp3'));
    v.bus.commands.run(GAME_COMMANDS.PHONE_CALL_ANSWER, {});
    for (let i = 0; i < 20 && !v.audio.started.length; i += 1) calls.update(0.1);
    const clip = clipOf(call.text);
    expectStart(v.audio.started.at(-1), clip, 'calls');
    assert.equal(v.runtime.debug.lastChannel, 'phone');
    assert.deepEqual([v.shown.at(-1).speakerName, v.shown.at(-1).text], ['Sol', call.text]);
    calls.dispose();
  } finally { v.restore(); }
});

test('the police radio: a rising wanted level, the search and the end of the chase are called, a breath apart', async () => {
  const v = await voicedGame();
  try {
    v.bus.events.emit(GAME_EVENTS.GAME_READY, {});
    await v.settle();
    const levels = wantedLevels.WANTED_LEVELS;
    v.bus.events.emit(GAME_EVENTS.WANTED_LEVEL_CHANGED, { level: 2, previous: 1, heat: 30 });
    expectStart(v.audio.started.at(-1), clipOf(levels[2].radioCall), 'radio');
    assert.equal(v.runtime.debug.lastChannel, 'police');
    assert.deepEqual([v.shown.at(-1).speakerName, v.shown.at(-1).text], ['Dispatch', levels[2].radioCall]);
    // A falling level says nothing; a rise right away waits for the line before to end.
    v.bus.events.emit(GAME_EVENTS.WANTED_LEVEL_CHANGED, { level: 1, previous: 2, heat: 20 });
    v.bus.events.emit(GAME_EVENTS.WANTED_LEVEL_CHANGED, { level: 3, previous: 1, heat: 60 });
    assert.equal(v.audio.started.length, 1);
    // The fake clip never ends by itself: it is over when its channel is free again.
    v.runtime.stopLines();
    v.runtime.update(4);
    assert.equal(v.audio.started.length, 1);
    v.runtime.update(3);
    expectStart(v.audio.started.at(-1), clipOf(levels[3].radioCall), 'radio');
    v.runtime.stopLines();
    v.runtime.update(7);
    v.bus.events.emit(GAME_EVENTS.WANTED_SEARCH_STARTED, { seconds: 45 });
    expectStart(v.audio.started.at(-1), clipOf(POLICE_RADIO.searchFromAir.text), 'radio');
    assert.equal(v.shown.at(-1).speakerName, 'Air One');
    v.runtime.stopLines();
    v.runtime.update(7);
    v.bus.events.emit(GAME_EVENTS.WANTED_CLEARED, { reason: 'escaped' });
    expectStart(v.audio.started.at(-1), clipOf(POLICE_RADIO.cleared.escaped.text), 'radio');
    // Another voice speaking (a call) keeps the chatter back, and a stale line is dropped.
    v.runtime.stopLines();
    v.runtime.update(7);
    const count = v.audio.started.length;
    v.runtime.speakText({ text: phoneLines()[0].text, channel: 'phone' });
    await v.settle();
    v.bus.events.emit(GAME_EVENTS.WANTED_LEVEL_CHANGED, { level: 1, previous: 0, heat: 10 });
    v.runtime.update(9);
    v.runtime.stopLines();
    v.runtime.update(0.1);
    assert.equal(v.audio.started.filter((start) => start.pack === 'radio').length, count);
  } finally { v.restore(); }
});

test('a gate guard\'s radio message plays its clip through the radio with the message\'s subtitle', async () => {
  const v = await voicedGame();
  try {
    v.bus.events.emit(GAME_EVENTS.GAME_READY, {});
    await v.settle();
    const line = GATE_LINES.last;
    v.bus.events.emit(GAME_EVENTS.RADIO_MESSAGE, { channel: 'guard', speakerId: 'gate_guard_1', speakerName: 'Gate guard', lineId: line.lineId, text: line.text, seconds: 3.5 });
    expectStart(v.audio.started.at(-1), clipOf(line.text), 'radio');
    assert.equal(v.runtime.debug.lastChannel, 'radio');
    assert.deepEqual([v.shown.at(-1).speakerName, v.shown.at(-1).text, v.shown.at(-1).tone], ['Gate guard', line.text, 'steel']);
    // A text with no clip is a plain coloured subtitle, as before.
    assert.equal(v.runtime.speakText({ text: 'Nobody recorded this.' }), 0);
  } finally { v.restore(); }
});
