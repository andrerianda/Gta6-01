// Generates the voiced lines outside the final arc once, offline, and packs them for the game:
// the intros and outros of the sixteen story missions, the calls that send the lead to the next
// mission, the police dispatch chatter of a chase, the gate guard and the air guard's radio lines
// the final arc does not already voice.
//
//   node tools/voices/generate-story-voices.mjs            generate what is missing, pack, write the index
//   node tools/voices/generate-story-voices.mjs --check    only check that every voice answers
//   node tools/voices/generate-story-voices.mjs --list     only print the lines it would voice
//
// Like generate-voices.mjs: every line is asked of the text-to-speech service in its speaker's
// stock voice (the key is injected by the outbound proxy; the header below is literal, never a
// real key), cached under the scratch directory (a re-run asks nothing it already has), trimmed,
// evened in loudness and joined with a short silence into a few mono mp3 packs under
// game/assets/voices/. The police lines are made to sound like a radio here, offline (band-pass
// 300-3400 Hz, compression, soft clipping, a hiss bed and the squelch's click and burst at both
// ends); the other radio lines stay clean because the game's own radio chain treats them as it
// does the final arc's. Each pack is decoded again to measure where every clip really starts
// and ends, and the index is written to <scratch>/storyVoiceIndex.js, which is copied by hand to
// game/src/audio/voice/storyVoiceIndex.js.
import { execFile, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { STORY_MISSIONS, STORY_MISSION_ORDER } from '../../game/src/catalog/storyMissions.js';
import { WANTED_LEVELS } from '../../game/src/catalog/wantedLevels.js';
import { FINAL_ARC_LINES } from '../../game/src/catalog/finalArcScript.js';
import { AIR_GUARD_RADIO_LINES } from '../../game/src/flight/defence/airGuardTuning.js';
import { GATE_LINES } from '../../game/src/police/restricted/gateChallenge.js';
import { createStoryPhoneCalls } from '../../game/src/missions/storyPhoneCalls.js';
import { AIR_GUARD_SPEAKERS, POLICE_RADIO, STORY_VOICE_CAST, voiceKeyOf } from '../../game/src/audio/voice/storyVoiceLines.js';

const run = promisify(execFile);
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const scratch = process.env.MARAZUL_VOICE_SCRATCH ?? '/tmp/marazul/s6/voices';
const clipDirectory = join(scratch, 'clips');
const workDirectory = join(scratch, 'work');
const packDirectory = join(repository, 'game/assets/voices');
const caBundle = '/root/.ccr/ca-bundle.crt';
const GAP_SECONDS = 0.2;
const TARGET_MEAN_DB = -21;
const PEAK_CEILING_DB = -1.5;

/** The packs: sample rate and bit rate of each (the radio and the phone are band-limited anyway). */
export const STORY_PACK_FORMATS = Object.freeze({
  act1: { rate: 22050, bitRate: '32k' },
  act2: { rate: 22050, bitRate: '32k' },
  act3: { rate: 22050, bitRate: '32k' },
  calls: { rate: 16000, bitRate: '24k' },
  radio: { rate: 16000, bitRate: '24k' },
});

/** Words the service reads better spelled another way: subtitle text -> spoken text. */
const SPOKEN = Object.freeze({});

const packOfAct = (act) => (act <= 1 ? 'act1' : act === 2 ? 'act2' : 'act3');

/** Every line to voice: {id, key, speaker, text, pack, treatment ('clean' | 'radio')}, in playing order. */
export function collectStoryLines() {
  const lines = [];
  const seen = new Set();
  const add = (id, speaker, text, pack, treatment = 'clean') => {
    const key = voiceKeyOf(text);
    if (seen.has(key)) return;
    seen.add(key);
    lines.push({ id, key, speaker, text, pack, treatment });
  };
  for (const missionId of STORY_MISSION_ORDER) {
    const mission = STORY_MISSIONS[missionId];
    for (const part of ['intro', 'outro']) {
      (mission[part] ?? []).forEach((line, i) => add(`${missionId}:${part}:${i}`, line.speaker, line.line, packOfAct(mission.act)));
    }
  }
  // The calls, as the game's own phone code makes them: the opening call and the one after each pass.
  const rung = [];
  const calls = createStoryPhoneCalls({ message() {}, speak() {}, notify() {}, ring: (callId, from, text) => { rung.push({ callId, from, text }); return true; } },
    { missions: STORY_MISSIONS, nameOf: (id) => id, placeOf: () => null });
  calls.opening(STORY_MISSION_ORDER[0], 0);
  STORY_MISSION_ORDER.forEach((missionId, i) => { if (STORY_MISSION_ORDER[i + 1]) calls.afterPass(missionId, [STORY_MISSION_ORDER[i + 1]]); });
  calls.update(1000);
  for (const call of rung) add(`call:${call.callId}`, call.from, call.text, 'calls');
  // The police radio: each star's call, the search and the end of the chase.
  WANTED_LEVELS.forEach((level, stars) => { if (level.radioCall) add(`police:level${stars}`, POLICE_RADIO.levelSpeaker[stars], level.radioCall, 'radio', 'radio'); });
  add('police:search', POLICE_RADIO.search.speaker, POLICE_RADIO.search.text, 'radio', 'radio');
  add('police:searchFromAir', POLICE_RADIO.searchFromAir.speaker, POLICE_RADIO.searchFromAir.text, 'radio', 'radio');
  for (const [reason, line] of Object.entries(POLICE_RADIO.cleared)) add(`police:${reason}`, line.speaker, line.text, 'radio', 'radio');
  // The gate guard and the air guard lines the final arc does not voice (the game's radio chain treats them).
  for (const line of Object.values(GATE_LINES)) add(`gate:${line.lineId}`, 'gate_guard', line.text, 'radio');
  for (const [lineId, line] of Object.entries(AIR_GUARD_RADIO_LINES)) {
    if (!FINAL_ARC_LINES[lineId]) add(lineId, AIR_GUARD_SPEAKERS[line.speaker], line.text, 'radio');
  }
  return lines;
}

/** One request to the speech service through curl (which honours HTTPS_PROXY); returns the status. */
async function requestSpeech(voice, text, file) {
  const args = ['-sS', '--max-time', '60', '--retry', '2', '-o', file, '-w', '%{http_code}', '-X', 'POST',
    `https://api.deepgram.com/v1/speak?model=${encodeURIComponent(voice)}`,
    '-H', 'Authorization: Token proxy-injected', '-H', 'Content-Type: application/json',
    '--data-binary', JSON.stringify({ text })];
  if (existsSync(caBundle)) args.unshift('--cacert', caBundle);
  const { stdout } = await run('curl', args);
  return Number(stdout.trim());
}

const pause = (ms) => new Promise((done) => { setTimeout(done, ms); });

/** Runs tasks a few at a time. */
async function inBatches(items, size, task) {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(task));
}

/** Decodes an audio file to mono 16-bit samples at `rate` through a filter chain. */
function decode(file, rate, filters) {
  const args = ['-v', 'error', '-i', file];
  if (filters) args.push('-af', filters);
  args.push('-ac', '1', '-ar', String(rate), '-f', 's16le', '-');
  const bytes = execFileSync('/usr/bin/ffmpeg', args, { maxBuffer: 1 << 28 });
  return new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >> 1);
}

/** Filters raw samples through ffmpeg. */
function filterSamples(samples, rate, filters) {
  const raw = join(workDirectory, `filter-${process.pid}.s16le`);
  writeFileSync(raw, Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength));
  const bytes = execFileSync('/usr/bin/ffmpeg', ['-v', 'error', '-f', 's16le', '-ar', String(rate), '-ac', '1', '-i', raw,
    '-af', filters, '-ac', '1', '-ar', String(rate), '-f', 's16le', '-'], { maxBuffer: 1 << 28 });
  return new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

/** True when the clip holds speech: a peak above -30 dB somewhere in it. */
function isAudible(file) {
  const samples = decode(file, 16000, null);
  for (let i = 0; i < samples.length; i += 1) if (Math.abs(samples[i]) > 1036) return true;
  return false;
}

function levelsOf(samples) {
  let sum = 0;
  let peak = 1;
  for (let i = 0; i < samples.length; i += 1) {
    sum += samples[i] * samples[i];
    if (Math.abs(samples[i]) > peak) peak = Math.abs(samples[i]);
  }
  return { meanDb: 10 * Math.log10(sum / Math.max(1, samples.length) / (32768 * 32768) + 1e-12), peakDb: 20 * Math.log10(peak / 32768) };
}

/** Brings samples to the common loudness, gently, with short fades at both ends. */
function even(samples, maxGainDb = 9) {
  const { meanDb, peakDb } = levelsOf(samples);
  const gainDb = Math.max(-8, Math.min(maxGainDb, TARGET_MEAN_DB - meanDb, PEAK_CEILING_DB - peakDb));
  const gain = 10 ** (gainDb / 20);
  const out = new Int16Array(samples.length);
  const fade = Math.min(80, samples.length >> 1);
  for (let i = 0; i < samples.length; i += 1) {
    const edge = Math.min(1, i / fade, (samples.length - 1 - i) / fade);
    out[i] = Math.max(-32767, Math.min(32767, Math.round(samples[i] * gain * edge)));
  }
  return out;
}

/** The police radio, offline: squelch burst and click in, hiss under the voice, burst and click out, all band-passed and squeezed. */
function radioize(speech, rate, seed) {
  let state = seed >>> 0 || 1;
  const random = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  const lead = Math.round(0.09 * rate);
  const tail = Math.round(0.16 * rate);
  const out = new Float32Array(lead + speech.length + tail);
  const click = (at, level) => { for (let i = 0; i < Math.round(0.004 * rate); i += 1) out[at + i] += level * (1 - i / (0.004 * rate)) * (i % 2 ? -1 : 1); };
  // The burst of the squelch opening, the hiss of the open carrier, the voice, the burst as it closes.
  for (let i = 0; i < lead; i += 1) out[i] += random() * 5200 * (1 - i / lead) ** 0.6;
  for (let i = lead; i < lead + speech.length; i += 1) out[i] += random() * 420 + speech[i - lead];
  for (let i = 0; i < tail; i += 1) out[lead + speech.length + i] += random() * 6500 * Math.min(1, i / (0.01 * rate)) * (1 - i / tail) ** 0.4;
  click(0, 14000);
  click(Math.round(lead * 0.55), 9000);
  click(out.length - Math.round(0.006 * rate), 12000);
  const samples = new Int16Array(out.length);
  for (let i = 0; i < out.length; i += 1) samples[i] = Math.max(-32767, Math.min(32767, Math.round(out[i])));
  return filterSamples(samples, rate,
    'highpass=f=300,highpass=f=300,lowpass=f=3400,lowpass=f=3400,equalizer=f=1800:t=q:w=1.2:g=4,' +
    'acompressor=threshold=-24dB:ratio=5:attack=4:release=70:makeup=3,volume=2.2,asoftclip=type=tanh,lowpass=f=3600');
}

/** Trims the clip's silence and evens it; radio lines get the radio. */
function prepareClip(line, rate) {
  const trim = 'silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.02';
  let samples = decode(join(clipDirectory, fileOf(line)), rate, `${trim},areverse,${trim},areverse`);
  if (line.treatment === 'radio') samples = radioize(even(samples), rate, parseInt(line.key, 16));
  return even(samples, line.treatment === 'radio' ? 4 : 9);
}

/** Finds where sound really starts and ends in [from, to) of the decoded pack. */
function measure(samples, rate, from, to) {
  const threshold = 90;
  let first = Math.max(0, from);
  while (first < to && Math.abs(samples[first]) < threshold) first += 1;
  let last = Math.min(to, samples.length) - 1;
  while (last > first && Math.abs(samples[last]) < threshold) last -= 1;
  return { start: first / rate, seconds: (last - first + 1) / rate };
}

const fileOf = (line) => `${STORY_VOICE_CAST[line.speaker]}-${line.key}.mp3`;

async function checkVoices() {
  const answers = {};
  for (const voice of new Set(Object.values(STORY_VOICE_CAST))) {
    const marker = join(clipDirectory, `_voice-${voice}.mp3`);
    if (!(existsSync(marker) && statSync(marker).size > 2000)) await requestSpeech(voice, 'Radio check, one two.', marker);
    answers[voice] = existsSync(marker) && statSync(marker).size > 2000;
  }
  return answers;
}

async function generate(lines) {
  const failures = [];
  await inBatches(lines, 4, async (line) => {
    const voice = STORY_VOICE_CAST[line.speaker];
    if (!voice) { failures.push(`${line.id}: no voice for ${line.speaker}`); return; }
    const file = join(clipDirectory, fileOf(line));
    // The service now and then answers 200 with a silent clip, or asks to slow down: ask again, a few times.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (existsSync(file) && statSync(file).size > 1500 && isAudible(file)) return;
      const status = await requestSpeech(voice, SPOKEN[line.text] ?? line.text, file);
      if (status === 429 || status >= 500) { await pause(2000 * (attempt + 1)); continue; }
      if (status !== 200) { failures.push(`${line.id}: ${status} ${existsSync(file) ? readFileSync(file, 'utf8').slice(0, 120) : ''}`); return; }
    }
    if (!isAudible(file)) failures.push(`${line.id}: silent`);
  });
  if (failures.length) throw new Error(`speech requests failed: ${failures.join(', ')}`);
}

function pack(lines) {
  const index = { packs: {}, clips: [], missionPacks: {} };
  const report = [];
  for (const [name, format] of Object.entries(STORY_PACK_FORMATS)) {
    const members = lines.filter((line) => line.pack === name);
    if (!members.length) continue;
    const gap = Math.round(GAP_SECONDS * format.rate);
    const parts = members.map((line) => prepareClip(line, format.rate));
    const joined = new Int16Array(parts.reduce((n, part) => n + part.length + gap, gap));
    const bounds = [];
    let cursor = gap;
    for (const part of parts) { joined.set(part, cursor); bounds.push(cursor); cursor += part.length + gap; }
    const raw = join(workDirectory, `${name}.s16le`);
    const file = join(packDirectory, `${name}.mp3`);
    writeFileSync(raw, Buffer.from(joined.buffer));
    execFileSync('/usr/bin/ffmpeg', ['-v', 'error', '-y', '-f', 's16le', '-ar', String(format.rate), '-ac', '1', '-i', raw,
      '-c:a', 'libmp3lame', '-b:a', format.bitRate, '-ar', String(format.rate), '-ac', '1', '-map_metadata', '-1', '-id3v2_version', '0', '-write_xing', '1', file]);
    const packed = decode(file, format.rate, null);
    index.packs[name] = { file: `assets/voices/${name}.mp3`, bytes: statSync(file).size, seconds: Number((packed.length / format.rate).toFixed(3)), clips: members.length };
    members.forEach((line, i) => {
      const half = gap >> 1;
      const found = measure(packed, format.rate, bounds[i] - half, bounds[i] + parts[i].length + half);
      const levels = levelsOf(packed.subarray(Math.round(found.start * format.rate), Math.round((found.start + found.seconds) * format.rate)));
      index.clips.push({ id: line.id, key: line.key, pack: name, start: Number(found.start.toFixed(3)), seconds: Number(found.seconds.toFixed(3)) });
      report.push(`${name}\t${line.id}\t${found.seconds.toFixed(2)}s\tmean ${levels.meanDb.toFixed(1)} dB\tpeak ${levels.peakDb.toFixed(1)} dB\t${line.speaker}`);
      const missionId = line.id.split(':')[0];
      if (STORY_MISSIONS[missionId]) index.missionPacks[missionId] = name;
    });
  }
  writeFileSync(join(scratch, 'story-report.tsv'), `${report.join('\n')}\n`);
  return index;
}

/** The index as the game's module. */
function moduleOf(index) {
  const packs = Object.entries(index.packs).map(([name, p]) => `  ${name}: Object.freeze({ file: '${p.file}', bytes: ${p.bytes}, seconds: ${p.seconds}, clips: ${p.clips} }),`);
  const missions = Object.entries(index.missionPacks).map(([id, name]) => `  ${id}: '${name}',`);
  const clips = index.clips.map((c) => `  '${c.key}': clip('${c.pack}', ${c.start}, ${c.seconds}), // ${c.id}`);
  return `// Where every voiced line outside the final arc lies in its pack: mission intros and outros (one
// pack per act), the story's phone calls and the radio (police dispatch, the gate, the air guard).
// Generated by tools/voices/generate-story-voices.mjs (typed here from the index it writes); a
// clip is found by voiceKeyOf(text) of storyVoiceLines.js, the exact text of its subtitle. No imports.

/** Pack name -> its file (relative to the page), size, length in seconds and clip count. */
export const STORY_VOICE_PACKS = Object.freeze({
${packs.join('\n')}
});

/** The pack that holds each story mission's intro and outro, fetched when its marker is offered. */
export const STORY_VOICE_MISSION_PACKS = Object.freeze({
${missions.join('\n')}
});

const clip = (pack, start, seconds) => Object.freeze({ pack, start, seconds });

/**
 * Text key -> its clip.
 * @type {Readonly<Record<string, {pack: string, start: number, seconds: number}>>}
 */
export const STORY_VOICE_CLIPS = Object.freeze({
${clips.join('\n')}
});
`;
}

async function main() {
  mkdirSync(clipDirectory, { recursive: true });
  mkdirSync(workDirectory, { recursive: true });
  mkdirSync(packDirectory, { recursive: true });
  const lines = collectStoryLines();
  if (process.argv.includes('--list')) {
    for (const line of lines) process.stdout.write(`${line.pack}\t${line.id}\t${line.speaker}\t${line.text}\n`);
    process.stdout.write(`${lines.length} lines, ${lines.reduce((n, line) => n + line.text.length, 0)} characters\n`);
    return;
  }
  if (process.argv.includes('--check')) {
    process.stdout.write(`${JSON.stringify(await checkVoices(), null, 1)}\n`);
    return;
  }
  await generate(lines);
  const index = pack(lines);
  index.totalBytes = Object.values(index.packs).reduce((n, p) => n + p.bytes, 0);
  writeFileSync(join(scratch, 'story-index.json'), JSON.stringify(index, null, 1));
  writeFileSync(join(scratch, 'storyVoiceIndex.js'), moduleOf(index));
  process.stdout.write(`${lines.length} lines; ${JSON.stringify(index.packs)}; total ${index.totalBytes} bytes\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
