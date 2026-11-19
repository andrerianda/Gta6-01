// Generates the voiced lines of the final arc once, offline, and packs them for the game.
//
//   node tools/voices/generate-voices.mjs            generate what is missing, pack, print the index
//   node tools/voices/generate-voices.mjs --check    only check that every voice name answers
//
// For every line of catalog/finalArcScript.js it asks the text-to-speech service for the speaker's
// stock voice (the key is injected by the outbound proxy: the header below is literal, never a real
// key), caches the clip under the scratch directory so a re-run costs nothing, trims the silence,
// evens the loudness, joins the clips of a group with a quarter second of silence into one mono
// mp3 under game/assets/voices/, then decodes each pack again and measures where every clip
// really starts and ends. The index it prints is typed into game/src/audio/voice/voicePackIndex.js.
import { execFile, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { FINAL_ARC_LINES, FINAL_ARC_SPEAKERS } from '../../game/src/catalog/finalArcScript.js';

const run = promisify(execFile);
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const scratch = process.env.MARAZUL_VOICE_SCRATCH ?? '/tmp/marazul/flight/s3/voice';
const clipDirectory = join(scratch, 'clips');
const workDirectory = join(scratch, 'work');
const packDirectory = join(repository, 'game/assets/voices');
const caBundle = '/root/.ccr/ca-bundle.crt';
const SAMPLE_RATE = 24000;
const GAP_SECONDS = 0.25;
const BIT_RATE = '40k';
const TARGET_MEAN_DB = -21;
const PEAK_CEILING_DB = -1.5;

/** Which scenes go into which pack, in playing order. */
export const VOICE_PACK_SCENES = Object.freeze({
  prologue: ['midnight_call', 'the_decision', 'new_face', 'insider_call'],
  base: ['gate', 'suspicion', 'hangar_reveal', 'walk_out', 'boarding'],
  flight: ['takeoff', 'alarm', 'blind_radar', 'stealth_test', 'time_skip', 'dawn_approach'],
  intercept: ['interception', 'flashback'],
  ending: ['handover', 'epilogue'],
});

/** Stock voices of the same character type to fall back on when a name does not answer. */
const FALLBACK_VOICES = Object.freeze({
  masculine: ['aura-2-apollo-en', 'aura-2-draco-en', 'aura-2-hyperion-en', 'aura-2-neptune-en', 'aura-2-janus-en'],
  feminine: ['aura-2-asteria-en', 'aura-2-hera-en', 'aura-2-cordelia-en', 'aura-2-iris-en', 'aura-2-vesta-en'],
});
const FEMININE_SPEAKERS = new Set(['bank_officer', 'ximena_robles', 'garza_tower', 'cormoran_tres', 'news_reader']);

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

/** Runs tasks a few at a time. */
async function inBatches(items, size, task) {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(task));
}

/** Checks every speaker's voice answers 200 and replaces the ones that do not. */
async function resolveVoices() {
  const answers = new Map();
  const answersOf = async (voice) => {
    if (answers.has(voice)) return answers.get(voice);
    const marker = join(clipDirectory, `_voice-${voice}.mp3`);
    let ok = existsSync(marker) && statSync(marker).size > 2000;
    if (!ok) ok = (await requestSpeech(voice, 'Radio check.', marker)) === 200 && statSync(marker).size > 2000;
    answers.set(voice, ok);
    return ok;
  };
  const speaking = new Set(Object.values(FINAL_ARC_LINES).map((line) => line.speaker));
  const table = {};
  const taken = new Set();
  for (const [speakerId, speaker] of Object.entries(FINAL_ARC_SPEAKERS)) {
    if (!speaking.has(speakerId)) continue;
    const candidates = [speaker.voice, ...FALLBACK_VOICES[FEMININE_SPEAKERS.has(speakerId) ? 'feminine' : 'masculine']];
    let chosen = null;
    for (const voice of candidates) {
      if (taken.has(voice)) continue;
      if (await answersOf(voice)) { chosen = voice; break; }
    }
    if (!chosen) throw new Error(`no voice answers for ${speakerId}`);
    taken.add(chosen);
    table[speakerId] = chosen;
  }
  return table;
}

/** Decodes an audio file to mono 16-bit samples through a filter chain. */
function decode(file, filters) {
  const args = ['-v', 'error', '-i', file];
  if (filters) args.push('-af', filters);
  args.push('-ac', '1', '-ar', String(SAMPLE_RATE), '-f', 's16le', '-');
  const bytes = execFileSync('/usr/bin/ffmpeg', args, { maxBuffer: 1 << 28 });
  return new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >> 1);
}

/** True when the clip holds speech: a peak above -30 dB somewhere in it. */
function isAudible(file) {
  const samples = decode(file, null);
  for (let i = 0; i < samples.length; i += 1) if (Math.abs(samples[i]) > 1036) return true;
  return false;
}

/** Trims the silence at both ends and brings the clip to the common loudness, gently. */
function prepareClip(file) {
  const trim = 'silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.02';
  const samples = decode(file, `${trim},areverse,${trim},areverse`);
  let sum = 0;
  let peak = 1;
  for (let i = 0; i < samples.length; i += 1) {
    sum += samples[i] * samples[i];
    if (Math.abs(samples[i]) > peak) peak = Math.abs(samples[i]);
  }
  const meanDb = 10 * Math.log10(sum / Math.max(1, samples.length) / (32768 * 32768) + 1e-12);
  const peakDb = 20 * Math.log10(peak / 32768);
  const gainDb = Math.max(-8, Math.min(9, TARGET_MEAN_DB - meanDb, PEAK_CEILING_DB - peakDb));
  const gain = 10 ** (gainDb / 20);
  const out = new Int16Array(samples.length);
  const fade = Math.min(120, samples.length >> 1);
  for (let i = 0; i < samples.length; i += 1) {
    const edge = Math.min(1, i / fade, (samples.length - 1 - i) / fade);
    out[i] = Math.round(samples[i] * gain * edge);
  }
  return out;
}

/** Finds where sound really starts and ends in [from, to) of the decoded pack. */
function measure(samples, from, to) {
  const threshold = 90;
  let first = from;
  while (first < to && Math.abs(samples[first]) < threshold) first += 1;
  let last = Math.min(to, samples.length) - 1;
  while (last > first && Math.abs(samples[last]) < threshold) last -= 1;
  return { start: first / SAMPLE_RATE, seconds: (last - first + 1) / SAMPLE_RATE };
}

async function main() {
  mkdirSync(clipDirectory, { recursive: true });
  mkdirSync(workDirectory, { recursive: true });
  mkdirSync(packDirectory, { recursive: true });
  const voices = await resolveVoices();
  if (process.argv.includes('--check')) {
    process.stdout.write(`${JSON.stringify(voices, null, 1)}\n`);
    return;
  }

  const lineIds = Object.keys(FINAL_ARC_LINES);
  const failures = [];
  await inBatches(lineIds, 4, async (lineId) => {
    const line = FINAL_ARC_LINES[lineId];
    const file = join(clipDirectory, `${lineId}.mp3`);
    // The service now and then answers 200 with a silent clip: ask again, a few times.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (existsSync(file) && statSync(file).size > 1500 && isAudible(file)) return;
      const status = await requestSpeech(voices[line.speaker], line.spoken ?? line.text, file);
      if (status !== 200) { failures.push(`${lineId}: ${status}`); return; }
    }
    if (!isAudible(file)) failures.push(`${lineId}: silent`);
  });
  if (failures.length) throw new Error(`speech requests failed: ${failures.join(', ')}`);

  const index = { voices, packs: {}, clips: {} };
  const gap = Math.round(GAP_SECONDS * SAMPLE_RATE);
  for (const [pack, scenes] of Object.entries(VOICE_PACK_SCENES)) {
    const ids = lineIds.filter((id) => scenes.includes(FINAL_ARC_LINES[id].scene))
      .sort((a, b) => scenes.indexOf(FINAL_ARC_LINES[a].scene) - scenes.indexOf(FINAL_ARC_LINES[b].scene));
    const parts = ids.map((id) => prepareClip(join(clipDirectory, `${id}.mp3`)));
    const total = parts.reduce((n, part) => n + part.length + gap, gap);
    const joined = new Int16Array(total);
    const bounds = [];
    let cursor = gap;
    for (const part of parts) {
      joined.set(part, cursor);
      bounds.push(cursor);
      cursor += part.length + gap;
    }
    const raw = join(workDirectory, `${pack}.s16le`);
    const file = join(packDirectory, `${pack}.mp3`);
    writeFileSync(raw, Buffer.from(joined.buffer));
    execFileSync('/usr/bin/ffmpeg', ['-v', 'error', '-y', '-f', 's16le', '-ar', String(SAMPLE_RATE), '-ac', '1', '-i', raw,
      '-c:a', 'libmp3lame', '-b:a', BIT_RATE, '-ar', String(SAMPLE_RATE), '-ac', '1', '-map_metadata', '-1', '-id3v2_version', '0', '-write_xing', '1', file]);
    const packed = decode(file, null);
    index.packs[pack] = { file: `assets/voices/${pack}.mp3`, bytes: statSync(file).size, seconds: Number((packed.length / SAMPLE_RATE).toFixed(3)), clips: ids.length };
    ids.forEach((id, i) => {
      const half = gap >> 1;
      const found = measure(packed, bounds[i] - half, bounds[i] + parts[i].length + half);
      index.clips[id] = { pack, start: Number(found.start.toFixed(3)), seconds: Number(found.seconds.toFixed(3)) };
    });
  }
  index.totalBytes = Object.values(index.packs).reduce((n, pack) => n + pack.bytes, 0);
  writeFileSync(join(scratch, 'index.json'), JSON.stringify(index, null, 1));
  process.stdout.write(`${JSON.stringify(index)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
