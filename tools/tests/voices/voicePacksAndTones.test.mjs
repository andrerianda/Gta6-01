// The voiced lines of the final arc: every line has a speaker and a clip, the clips lie in order
// inside their packs, the packs are on disk at the indexed size and under the budget, the names
// take the right colours as the story turns, and the run-time speaks without a browser.
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import * as script from '../../../game/src/catalog/finalArcScript.js';
import { VOICE_CAST, VOICE_CLIPS, VOICE_PACKS, VOICE_TAIL_SECONDS } from '../../../game/src/audio/voice/voicePackIndex.js';
import { createVoiceOverRuntime } from '../../../game/src/audio/voice/voiceOverRuntime.js';
import { createVoiceOverSystem } from '../../../game/src/audio/voiceOver.js';
import { GAME_COMMANDS } from '../../../game/src/core/events/gameCommands.js';
import { GAME_EVENTS } from '../../../game/src/core/events/gameEvents.js';
import { SUBTITLE_TONES, radioChannelTone, readingSecondsOf, subtitleToneOf } from '../../../game/src/ui/subtitle/subtitleTones.js';

const { FINAL_ARC_LINES: LINES, FINAL_ARC_SPEAKERS: SPEAKERS } = script;
const game = resolve(dirname(fileURLToPath(import.meta.url)), '../../../game');
const BUDGET_BYTES = 3.2 * 1024 * 1024;
const toneOf = (lineId, state) => subtitleToneOf(LINES[lineId], SPEAKERS[LINES[lineId].speaker], state);

/** A game context with just enough for the run-time: events, commands, no page, no audio. */
function fakeContext(extra = {}) {
  const handlers = new Map();
  const listeners = new Map();
  const emitted = [];
  return {
    emitted,
    launch: {},
    page: { document: null },
    settings: { get: () => true },
    systems: { find: () => null },
    content: { find: (name) => (name === 'finalArcScript' ? script : null) },
    flags: { get: () => false },
    commands: {
      handle(name, handler) { handlers.set(name, handler); return () => handlers.delete(name); },
      run(name, payload) { return handlers.get(name)?.(payload); },
      has: (name) => handlers.has(name),
    },
    events: {
      on(name, handler) { listeners.set(name, [...(listeners.get(name) ?? []), handler]); return () => {}; },
      emit(name, payload) { emitted.push({ name, payload }); for (const handler of listeners.get(name) ?? []) handler(payload); },
    },
    ...extra,
  };
}

/** A subtitle layer that only remembers what it was shown. */
function fakeSubtitles() {
  const shown = [];
  return { shown, show: (line) => shown.push(line), clear: () => shown.push(null), setEnabled() {}, update() {}, dispose() {} };
}

test('every line has a speaker that exists and a voiced clip', () => {
  for (const [lineId, line] of Object.entries(LINES)) {
    assert.ok(SPEAKERS[line.speaker], `${lineId}: speaker ${line.speaker}`);
    assert.ok(VOICE_CLIPS[lineId], `${lineId}: no clip`);
    assert.ok(VOICE_PACKS[VOICE_CLIPS[lineId].pack], `${lineId}: pack`);
    assert.ok(VOICE_CAST[line.speaker], `${lineId}: no voice for ${line.speaker}`);
  }
  assert.deepEqual(Object.keys(VOICE_CLIPS).filter((lineId) => !LINES[lineId]), []);
});

test('every character who speaks has a voice of their own', () => {
  const voices = Object.values(VOICE_CAST);
  assert.equal(new Set(voices).size, voices.length);
  for (const [speakerId, voice] of Object.entries(VOICE_CAST)) {
    assert.ok(SPEAKERS[speakerId], speakerId);
    assert.match(voice, /^aura-2-[a-z]+-en$/);
  }
});

test('clips lie inside their pack, in order, without overlap, and long enough to be speech', () => {
  for (const [pack, about] of Object.entries(VOICE_PACKS)) {
    const clips = Object.entries(VOICE_CLIPS).filter(([, clip]) => clip.pack === pack);
    assert.equal(clips.length, about.clips, pack);
    let end = 0;
    for (const [lineId, clip] of clips) {
      assert.ok(clip.seconds >= 0.25, `${lineId} is ${clip.seconds} s`);
      assert.ok(clip.start >= end + 0.1, `${lineId} starts at ${clip.start}, the one before ends at ${end}`);
      end = clip.start + clip.seconds;
      assert.ok(end <= about.seconds, `${lineId} runs past the end of ${pack}`);
      const wordsPerSecond = LINES[lineId].text.split(/\s+/).length / clip.seconds;
      assert.ok(wordsPerSecond > 0.9 && wordsPerSecond < 8, `${lineId}: ${wordsPerSecond.toFixed(1)} words a second`);
    }
  }
});

test('the packs are on disk at the indexed size and under the budget', () => {
  let total = 0;
  assert.ok(Object.keys(VOICE_PACKS).length <= 6);
  for (const [pack, about] of Object.entries(VOICE_PACKS)) {
    const file = join(game, about.file);
    assert.ok(existsSync(file), about.file);
    assert.equal(statSync(file).size, about.bytes, pack);
    assert.ok(Math.abs(about.bytes * 8 / about.seconds - 40000) < 2500, `${pack} is not about 40 kbit/s`);
    total += about.bytes;
  }
  assert.ok(total <= BUDGET_BYTES, `${total} bytes of voices`);
});

test('the scenes are packed in the groups the cinematics load', () => {
  const packOfScene = {};
  for (const [lineId, line] of Object.entries(LINES)) {
    packOfScene[line.scene] ??= VOICE_CLIPS[lineId].pack;
    assert.equal(VOICE_CLIPS[lineId].pack, packOfScene[line.scene], lineId);
  }
  assert.equal(packOfScene.midnight_call, 'prologue');
  assert.equal(packOfScene.boarding, 'base');
  assert.equal(packOfScene.takeoff, 'flight');
  assert.equal(packOfScene.dawn_approach, 'flight');
  assert.equal(packOfScene.flashback, 'intercept');
  assert.equal(packOfScene.epilogue, 'ending');
});

test('the tower is amber until the alarm, then red', () => {
  assert.equal(toneOf('tw_06', { alarm: false, betrayed: false }), 'amber');
  assert.equal(toneOf('tw_06', null), 'amber');
  assert.equal(toneOf('tw_06', { alarm: true }), 'red');
  assert.equal(toneOf('tw_fail', { alarm: false }), 'red');
  assert.equal(toneOf('al_01', { alarm: false }), 'red');
});

test('El Comprador is violet, red on his last line and once he has betrayed', () => {
  for (const lineId of ['mc_01', 'br_01', 'st_05', 'da_02', 'hv_01', 'hv_03']) assert.equal(toneOf(lineId, { alarm: true, betrayed: false }), 'violet', lineId);
  assert.equal(toneOf('hv_04', { betrayed: false }), 'red');
  assert.equal(toneOf('hv_01', { betrayed: true }), 'red');
});

test('the hunters are red, Dez white, the others steel, the flashback a memory', () => {
  for (const lineId of ['al_02', 'al_04', 'airGuard.order3', 'airGuard.lost', 'st_03', 'st_04']) assert.equal(toneOf(lineId, {}), 'red', lineId);
  for (const lineId of ['mc_02', 'tw_02', 'hr_01', 'hv_02', 'fb_05']) assert.equal(toneOf(lineId, { alarm: true, betrayed: true }), 'white', lineId);
  for (const lineId of ['td_01', 'nf_01', 'gt_01', 'sg_01', 'wo_01', 'wo_02', 'ic_01', 'ep_01']) assert.equal(toneOf(lineId, {}), 'steel', lineId);
  for (const lineId of ['fb_01', 'fb_02', 'fb_03', 'fb_04']) assert.equal(toneOf(lineId, {}), 'memory', lineId);
  assert.equal(toneOf('su_02', {}), 'red');
});

test('a line-level tone wins, an unknown one does not, and a missing speaker is steel', () => {
  assert.equal(subtitleToneOf({ tone: 'amber' }, { tone: 'red' }, { alarm: false }), 'amber');
  assert.equal(subtitleToneOf({ tone: 'pink' }, { tone: 'white' }, {}), 'white');
  assert.equal(subtitleToneOf({}, null, {}), 'steel');
  assert.equal(subtitleToneOf({ channel: 'memory' }, { tone: 'white' }, {}), 'memory');
});

test('the colours are the contract\'s', () => {
  assert.deepEqual({ ...SUBTITLE_TONES }, { white: '#ffffff', amber: '#f2b13c', red: '#e5484d', violet: '#6f42c1', steel: '#b9c4cf', memory: '#9db4c8' });
});

test('plain radio lines are coloured by their channel', () => {
  assert.equal(radioChannelTone('airGuard'), 'red');
  assert.equal(radioChannelTone('airspace', {}), 'red');
  assert.equal(radioChannelTone('navy', {}), 'red');
  assert.equal(radioChannelTone('tower', { alarm: false }), 'amber');
  assert.equal(radioChannelTone('tower', { alarm: true }), 'red');
  assert.equal(radioChannelTone('guard', { alarm: true }), 'steel');
  assert.equal(radioChannelTone(undefined), 'steel');
});

test('the reading time grows with the words and stays in bounds', () => {
  assert.equal(readingSecondsOf(''), 0);
  assert.equal(readingSecondsOf('When?'), 1.4);
  const short = readingSecondsOf('Follow us. This is your last warning.');
  const long = readingSecondsOf(LINES.ep_03.text);
  assert.ok(short > 2.5 && short < 5, String(short));
  assert.ok(long > short && long <= 14, String(long));
  assert.ok(readingSecondsOf('word '.repeat(200)) === 14);
});

test('secondsOf is the clip length plus the tail; an unvoiced line gets the estimate', () => {
  const runtime = createVoiceOverRuntime(fakeContext(), { script, subtitles: null });
  for (const lineId of ['tw_06', 'hv_04', 'ep_01', 'td_03']) {
    assert.ok(Math.abs(runtime.secondsOf(lineId) - (VOICE_CLIPS[lineId].seconds + VOICE_TAIL_SECONDS)) < 1e-6, lineId);
  }
  assert.equal(runtime.secondsOf('no_such_line'), 0);
  const extra = { FINAL_ARC_SPEAKERS: SPEAKERS, FINAL_ARC_LINES: { ...LINES, xx_01: { scene: 'x', speaker: 'dez_tolliver', channel: 'face', text: 'One more line nobody recorded.' } } };
  const other = createVoiceOverRuntime(fakeContext(), { script: extra, subtitles: null });
  assert.equal(other.secondsOf('xx_01'), readingSecondsOf('One more line nobody recorded.'));
  assert.ok(other.speak('xx_01') > 1.4);
});

test('speaking without a browser shows the subtitle, tells the story and returns the seconds', () => {
  const context = fakeContext();
  const subtitles = fakeSubtitles();
  const runtime = createVoiceOverRuntime(context, { script, subtitles });
  const seconds = context.commands.run(GAME_COMMANDS.STORY_LINE_SPEAK, { lineId: 'al_02' });
  assert.ok(Math.abs(seconds - (VOICE_CLIPS.al_02.seconds + VOICE_TAIL_SECONDS)) < 1e-6);
  assert.deepEqual({ name: subtitles.shown[0].speakerName, tone: subtitles.shown[0].tone, text: subtitles.shown[0].text },
    { name: 'Coronel Vargas', tone: 'red', text: LINES.al_02.text });
  const spoken = context.emitted.find((entry) => entry.name === GAME_EVENTS.STORY_LINE_SPOKEN).payload;
  assert.deepEqual(spoken, { lineId: 'al_02', speakerId: 'coronel_vargas', speakerName: 'Coronel Vargas', text: LINES.al_02.text, seconds, channel: 'radio', tone: 'red', voiced: false });

  // The alarm turns the tower red; a quiet line draws nothing; stop takes the line down.
  runtime.speak('tw_06');
  assert.equal(subtitles.shown.at(-1).tone, 'amber');
  context.events.emit(GAME_EVENTS.STORY_STATE_CHANGED, { alarm: true });
  assert.deepEqual(runtime.storyState, { alarm: true, betrayed: false });
  runtime.speak('tw_06');
  assert.equal(subtitles.shown.at(-1).tone, 'red');
  const count = subtitles.shown.length;
  assert.ok(runtime.speak('tw_08', { quiet: true }) > 0);
  assert.equal(subtitles.shown.length, count);
  assert.equal(runtime.debug.lastLineId, 'tw_08');
  context.commands.run(GAME_COMMANDS.STORY_LINES_STOP, {});
  assert.equal(subtitles.shown.at(-1), null);
  assert.equal(runtime.speak('nothing'), 0);
});

test('radio messages: the script\'s lines are spoken, the others coloured by channel, each drawn once', () => {
  const context = fakeContext();
  const subtitles = fakeSubtitles();
  createVoiceOverRuntime(context, { script, subtitles });
  context.events.emit(GAME_EVENTS.RADIO_MESSAGE, { channel: 'airGuard', speakerName: 'HALCON UNO', lineId: 'airGuard.order3', text: 'x', seconds: 5 });
  assert.equal(subtitles.shown.length, 1);
  assert.deepEqual([subtitles.shown[0].speakerName, subtitles.shown[0].tone, subtitles.shown[0].text], ['Halcón Uno', 'red', 'Follow us. This is your last warning.']);
  assert.equal(context.emitted.filter((entry) => entry.name === GAME_EVENTS.STORY_LINE_SPOKEN).length, 1);
  context.events.emit(GAME_EVENTS.RADIO_MESSAGE, { channel: 'guard', speakerName: 'Gate guard', lineId: 'guard.halt', text: 'Stop there.', seconds: 3.5 });
  assert.deepEqual([subtitles.shown[1].speakerName, subtitles.shown[1].tone, subtitles.shown[1].seconds], ['Gate guard', 'steel', 3.5]);
  context.events.emit(GAME_EVENTS.RADIO_MESSAGE, { channel: 'tower', speakerName: 'Tower', lineId: 'tower.x', text: 'Hold short.' });
  assert.equal(subtitles.shown[2].tone, 'amber');
  assert.equal(subtitles.shown.length, 3);
});

test('story sounds are accepted before there is any audio, and the names are the contract\'s', () => {
  const context = fakeContext();
  const runtime = createVoiceOverRuntime(context, { script, subtitles: null });
  const wanted = ['breath', 'hangar_hum', 'door_rumble', 'low_note', 'gunshot_far', 'phone_ring', 'phone_buzz', 'phone_pickup', 'phone_hangup',
    'cockpit_alarm', 'wind_surf', 'rain_roof', 'tape_seal', 'cloth_pull', 'heartbeat', 'tinnitus'];
  assert.deepEqual([...runtime.soundIds].sort(), [...wanted].sort());
  for (const soundId of wanted) context.commands.run(GAME_COMMANDS.STORY_SOUND, { soundId, action: 'start', volume: 0.5 });
  for (const soundId of wanted) context.commands.run(GAME_COMMANDS.STORY_SOUND, { soundId, action: 'stop' });
  context.commands.run(GAME_COMMANDS.STORY_SOUND, { soundId: 'no_such_sound', action: 'play' });
  runtime.update(0.016);
  runtime.dispose();
});

test('the system holds a line with ?say and is ready after init', async () => {
  const context = fakeContext({ launch: { say: 'al_02' } });
  const system = createVoiceOverSystem(context);
  assert.equal(system.ready, false);
  assert.equal(system.speak('al_02'), 0);
  await system.init(() => {});
  assert.equal(system.ready, true);
  system.update(0.3);
  assert.equal(system.debug.lastLineId, null);
  system.update(0.4);
  assert.equal(system.debug.lastLineId, 'al_02');
  assert.ok(system.secondsOf('al_02') > 4);
  system.dispose();
});
