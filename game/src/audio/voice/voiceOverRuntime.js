// The voice-over at work: speaks a line of the final arc (subtitle in its faction colour, the
// event STORY_LINE_SPOKEN, and the voiced clip cut out of its pack and sent through the chain of
// the channel it is heard on: face, radio, phone, helmet, memory, news), loads a pack the first
// time one of its lines is wanted and the next pack after it, colours the plain radio lines of
// the air guard and the gate, and plays the story's own sounds (WebAudio synthesis: breath,
// hangar hum, door rumble, the far gunshot, phones, alarm, surf, rain, heartbeat...).
// Silent but otherwise the same before the first gesture has made the AudioContext.
import { GAME_COMMANDS } from '../../core/events/gameCommands.js';
import { GAME_EVENTS } from '../../core/events/gameEvents.js';
import { WORLD_FLAGS } from '../../core/state/worldFlags.js';
import { radioChannelTone, readingSecondsOf, subtitleToneOf } from '../../ui/subtitle/subtitleTones.js';
import { VOICE_CLIPS, VOICE_PACKS, VOICE_TAIL_SECONDS } from './voicePackIndex.js';

const PACK_ORDER = Object.keys(VOICE_PACKS);
const CITY_CENTRE = { x: 0, z: 192 };
const CLEAR_RADIO_METRES = 2600;
const FAINT_RADIO_METRES = 11500;
const LATE_START_SECONDS = 1.2;

/**
 * Creates the voice-over's implementation.
 * @param {object} context The game context.
 * @param {{script: {FINAL_ARC_LINES: object, FINAL_ARC_SPEAKERS: object}, subtitles?: object | null}} parts
 *   The story script and the subtitle layer (null where there is no page).
 */
export function createVoiceOverRuntime(context, parts) {
  const { FINAL_ARC_LINES: lines, FINAL_ARC_SPEAKERS: speakers } = parts.script;
  const subtitles = parts.subtitles ?? null;
  const storyState = { alarm: false, betrayed: false };
  const debug = { packsLoaded: 0, clipsPlayed: 0, lastLineId: null, lastChannel: null, lastVoiced: false, soundsStarted: 0, distance01: 0 };
  const packs = new Map();
  const playing = new Map();
  const sounds = new Map();
  const wantedLoops = new Map();
  const stops = [];
  let graph = null;
  let speakToken = 0;
  let sayLeft = context.launch?.say ? 0.6 : -1;

  const mixer = () => context.systems?.find?.('audio')?.director?.mixer ?? null;

  /** The nodes made once per AudioContext: outputs, a noise buffer, the memory's long reverb. */
  function audio() {
    const m = mixer();
    if (!m) return null;
    if (graph && graph.ctx === m.ctx) return graph;
    const ctx = m.ctx;
    const voiceOut = ctx.createGain();
    voiceOut.gain.value = 1.15;
    voiceOut.connect(m.buses.voices);
    const soundOut = ctx.createGain();
    soundOut.connect(m.buses.effects);
    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const impulse = ctx.createBuffer(2, Math.floor(ctx.sampleRate * 3.4), ctx.sampleRate);
    let seed = 20261119;
    const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = random();
    for (let c = 0; c < 2; c += 1) {
      const tail = impulse.getChannelData(c);
      for (let i = 0; i < tail.length; i += 1) tail[i] = random() * (1 - i / tail.length) ** 2.6;
    }
    const clip = new Float32Array(257);
    for (let i = 0; i < 257; i += 1) clip[i] = Math.tanh((i / 128 - 1) * 2.4) / Math.tanh(2.4);
    graph = { ctx, voiceOut, soundOut, noise, impulse, clip };
    for (const [soundId, volume] of wantedLoops) startSound(soundId, { volume });
    wantedLoops.clear();
    return graph;
  }

  // ---- packs ----

  /** Fetches a pack's bytes once (no AudioContext needed) and decodes them once there is one. */
  function loadPack(name) {
    if (!VOICE_PACKS[name] || !context.page?.document || typeof fetch !== 'function') return null;
    let pack = packs.get(name);
    if (!pack) {
      pack = { bytes: null, buffer: null, failed: false, decoding: null };
      pack.fetching = fetch(VOICE_PACKS[name].file)
        .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error('missing'))))
        .then((bytes) => { pack.bytes = bytes; })
        .catch(() => { pack.failed = true; });
      packs.set(name, pack);
    }
    return pack;
  }

  /** Resolves with the decoded buffer of a pack, or null when it cannot be had. */
  async function bufferOf(name) {
    const pack = loadPack(name);
    if (!pack) return null;
    await pack.fetching;
    const g = audio();
    if (pack.failed || !g) return null;
    if (pack.buffer) return pack.buffer;
    if (!pack.decoding) {
      pack.decoding = g.ctx.decodeAudioData(pack.bytes)
        .then((buffer) => { pack.buffer = buffer; pack.bytes = null; debug.packsLoaded += 1; return buffer; })
        .catch(() => { pack.failed = true; return null; });
    }
    return pack.decoding;
  }

  // ---- the channel chains ----

  const hash = (text) => { let h = 2166136261; for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619); return h >>> 0; };

  function filter(g, type, frequency, q = 0.7, gainDb = 0) {
    const node = g.ctx.createBiquadFilter();
    node.type = type;
    node.frequency.value = frequency;
    node.Q.value = q;
    node.gain.value = gainDb;
    return node;
  }

  function gainNode(g, value) {
    const node = g.ctx.createGain();
    node.gain.value = value;
    return node;
  }

  function shaper(g) {
    const node = g.ctx.createWaveShaper();
    node.curve = g.clip;
    return node;
  }

  /** A stretch of filtered noise from `from` to `to` with a level envelope; returns its source. */
  function noiseBed(g, destination, type, frequency, q, level, from, to) {
    const source = g.ctx.createBufferSource();
    source.buffer = g.noise;
    source.loop = true;
    const envelope = gainNode(g, 0);
    envelope.gain.setValueAtTime(0, from);
    envelope.gain.linearRampToValueAtTime(level, from + 0.012);
    envelope.gain.setValueAtTime(level, Math.max(from + 0.013, to - 0.02));
    envelope.gain.linearRampToValueAtTime(0, to);
    source.connect(filter(g, type, frequency, q)).connect(envelope).connect(destination);
    source.start(from, (from * 0.37) % 1.5);
    source.stop(to + 0.02);
    return source;
  }

  /** The radio: band-pass 320-3200 Hz, a little grit, static under it, a click in and out, dropouts. */
  function radioChain(g, input, destination, t0, t1, distance01, seedText, extra) {
    const high = filter(g, 'highpass', 320, 0.8);
    const low = filter(g, 'lowpass', 3200, 0.8);
    const presence = filter(g, 'peaking', 1900, 1.1, 4);
    const drive = gainNode(g, 1.5);
    const gate = gainNode(g, 0.82 - 0.2 * distance01);
    input.connect(high).connect(low).connect(presence).connect(drive).connect(shaper(g)).connect(gate).connect(destination);
    extra.push(noiseBed(g, destination, 'bandpass', 2100, 0.6, 0.02 + 0.075 * distance01, t0 - 0.07, t1 + 0.12));
    extra.push(noiseBed(g, destination, 'bandpass', 2600, 1.4, 0.3, t0 - 0.07, t0 - 0.035));
    extra.push(noiseBed(g, destination, 'bandpass', 1700, 1.4, 0.22, t1 + 0.09, t1 + 0.135));
    let seed = hash(seedText) || 1;
    const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    const count = distance01 < 0.12 ? 0 : Math.round((t1 - t0) * distance01 * 1.5);
    for (let i = 0; i < count; i += 1) {
      const at = t0 + 0.25 + random() * Math.max(0.1, t1 - t0 - 0.5);
      const length = 0.05 + random() * 0.14 * (0.5 + distance01);
      gate.gain.setValueAtTime(0.05, at);
      gate.gain.setValueAtTime(0.82 - 0.2 * distance01, at + length);
      extra.push(noiseBed(g, destination, 'bandpass', 2400, 0.5, 0.11 + 0.1 * distance01, at, at + length));
    }
  }

  /** Wires a source through its channel into the voices bus. */
  function connectChannel(g, channel, source, t0, t1, distance01, lineId, extra) {
    const out = gainNode(g, 1);
    out.connect(g.voiceOut);
    if (channel === 'radio') {
      radioChain(g, source, out, t0, t1, distance01, lineId, extra);
    } else if (channel === 'phone') {
      const drive = gainNode(g, 2.1);
      source.connect(filter(g, 'highpass', 420, 0.9)).connect(filter(g, 'lowpass', 2900, 1)).connect(filter(g, 'peaking', 1700, 1.2, 6))
        .connect(drive).connect(shaper(g)).connect(gainNode(g, 0.62)).connect(out);
      extra.push(noiseBed(g, out, 'bandpass', 1500, 0.5, 0.008, t0 - 0.04, t1 + 0.05));
    } else if (channel === 'helmet') {
      source.connect(filter(g, 'lowpass', 2700, 0.6)).connect(filter(g, 'peaking', 330, 0.9, 5)).connect(gainNode(g, 1.1)).connect(out);
      extra.push(noiseBed(g, out, 'bandpass', 760, 1.3, 0.035, t0 - 0.42, t0 - 0.05));
      extra.push(noiseBed(g, out, 'lowpass', 500, 0.7, 0.014, t1 + 0.05, t1 + 0.6));
    } else if (channel === 'memory') {
      const dry = gainNode(g, 0.62);
      const dark = filter(g, 'lowpass', 1750, 0.7);
      const reverb = g.ctx.createConvolver();
      reverb.buffer = g.impulse;
      radioChain(g, source, dark, t0, t1, 0.3, lineId, extra);
      dark.connect(dry).connect(out);
      dark.connect(reverb).connect(gainNode(g, 0.5)).connect(out);
    } else if (channel === 'news') {
      const drive = gainNode(g, 1.4);
      source.connect(filter(g, 'highpass', 460, 0.8)).connect(filter(g, 'lowpass', 2500, 0.9)).connect(filter(g, 'peaking', 1150, 2, 7))
        .connect(drive).connect(shaper(g)).connect(gainNode(g, 0.5)).connect(out);
      extra.push(noiseBed(g, out, 'highpass', 3000, 0.5, 0.006, t0 - 0.05, t1 + 0.1));
    } else {
      source.connect(out);
    }
    return out;
  }

  /** How far out at sea the listener is, 0 (over the city) .. 1 (the radio is nearly gone). */
  function radioDistance01() {
    const m = mixer();
    if (!m || context.flags?.get?.(WORLD_FLAGS.SEA_OPEN) !== true) return 0;
    const p = m.listenerPosition;
    const metres = Math.hypot(p.x - CITY_CENTRE.x, p.z - CITY_CENTRE.z);
    return Math.min(1, Math.max(0, (metres - CLEAR_RADIO_METRES) / (FAINT_RADIO_METRES - CLEAR_RADIO_METRES)));
  }

  function cut(channel, fade = 0.05) {
    const voice = playing.get(channel);
    if (!voice) return;
    playing.delete(channel);
    const t = voice.ctx.currentTime;
    voice.out.gain.cancelScheduledValues(t);
    voice.out.gain.setTargetAtTime(0, t, fade / 3);
    for (const node of [voice.source, ...voice.extra]) { try { node.stop(t + fade + 0.02); } catch { /* already stopped */ } }
  }

  function playClip(lineId, channel, buffer, lateSeconds, distance01) {
    const g = audio();
    const clip = VOICE_CLIPS[lineId];
    if (!g || !clip || g.ctx.state !== 'running') return false;
    cut(channel);
    const lead = channel === 'radio' || channel === 'memory' ? 0.09 : channel === 'helmet' ? 0.44 : 0.02;
    const t0 = g.ctx.currentTime + lead;
    const offset = Math.max(0, clip.start - 0.012);
    const length = Math.min(buffer.duration - offset, clip.seconds + 0.04);
    const source = g.ctx.createBufferSource();
    source.buffer = buffer;
    const extra = [];
    const out = connectChannel(g, channel, source, t0, t0 + length, distance01, lineId, extra);
    out.gain.setValueAtTime(0, t0);
    out.gain.linearRampToValueAtTime(1, t0 + 0.012);
    source.start(t0, offset, length);
    const voice = { ctx: g.ctx, source, out, extra };
    source.onended = () => { if (playing.get(channel) === voice) playing.delete(channel); };
    playing.set(channel, voice);
    debug.clipsPlayed += 1;
    void lateSeconds;
    return true;
  }

  // ---- speaking ----

  function secondsOf(lineId) {
    const clip = VOICE_CLIPS[lineId];
    if (clip && clip.seconds > 0) return Math.round((clip.seconds + VOICE_TAIL_SECONDS) * 1000) / 1000;
    const line = lines[lineId];
    if (!line) return 0;
    return line.seconds ?? readingSecondsOf(line.text);
  }

  function speak(lineId, options = {}) {
    const line = lines[lineId];
    if (!line) return 0;
    const speaker = speakers[line.speaker] ?? null;
    const channel = options.channel ?? line.channel ?? 'face';
    const tone = subtitleToneOf(line, speaker, storyState);
    const seconds = secondsOf(lineId);
    const clip = VOICE_CLIPS[lineId];
    const g = audio();
    const voiced = Boolean(clip && g && g.ctx.state === 'running' && !packs.get(clip.pack)?.failed);
    const token = (speakToken += 1);
    debug.lastLineId = lineId;
    debug.lastChannel = channel;
    debug.lastVoiced = voiced;
    if (!options.quiet) subtitles?.show({ speakerName: speaker?.name ?? '', text: line.text, tone, seconds: seconds + 0.25, lineId, hold: options.hold === true });
    context.events.emit(GAME_EVENTS.STORY_LINE_SPOKEN, { lineId, speakerId: line.speaker, speakerName: speaker?.name ?? '', text: line.text, seconds, channel, tone, voiced });
    if (clip) {
      const next = PACK_ORDER[PACK_ORDER.indexOf(clip.pack) + 1];
      if (next) loadPack(next);
      const distance01 = options.distance01 ?? (debug.distance01 = radioDistance01());
      const pack = loadPack(clip.pack);
      if (voiced && pack?.buffer) playClip(lineId, channel, pack.buffer, 0, distance01);
      else if (voiced) {
        const asked = g.ctx.currentTime;
        bufferOf(clip.pack).then((buffer) => {
          if (buffer && token === speakToken && g.ctx.currentTime - asked < LATE_START_SECONDS) playClip(lineId, channel, buffer, g.ctx.currentTime - asked, distance01);
        });
      }
    }
    return seconds;
  }

  function stopLines() {
    speakToken += 1;
    for (const channel of [...playing.keys()]) cut(channel, 0.08);
    subtitles?.clear();
  }

  function onRadioMessage(message) {
    if (!message) return;
    if (message.lineId && lines[message.lineId]) { speak(message.lineId, { channel: 'radio' }); return; }
    if (!message.text) return;
    subtitles?.show({
      speakerName: message.speakerName ?? '', text: message.text, tone: radioChannelTone(message.channel, storyState),
      seconds: message.seconds ?? readingSecondsOf(message.text), lineId: message.lineId ?? '',
    });
  }

  // ---- the story's sounds ----

  /** A buffer computed sample by sample: the patterned loops (rings, alarm, heartbeat). */
  function rendered(g, seconds, sampleAt) {
    const buffer = g.ctx.createBuffer(1, Math.floor(seconds * g.ctx.sampleRate), g.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = sampleAt(i / g.ctx.sampleRate);
    return buffer;
  }

  const TAU = Math.PI * 2;
  const PATTERNS = {
    phone_ring: [3.2, (t) => (t > 1.25 ? 0 : (Math.sin(TAU * 1318 * t) + 0.6 * Math.sin(TAU * 1760 * t)) * 0.3 * Math.exp(-((t * 21) % 1) * 2.2) * Math.min(1, (1.25 - t) * 20))],
    phone_buzz: [2.1, (t) => { const u = t % 0.7; return t > 1.3 || u > 0.46 ? 0 : Math.tanh(Math.sin(TAU * 152 * t) * 3) * 0.22 * Math.min(1, u * 60, (0.46 - u) * 60) * (0.75 + 0.25 * Math.sin(TAU * 31 * t)); }],
    cockpit_alarm: [0.9, (t) => { const u = t % 0.3; return t > 0.6 ? 0 : Math.tanh(Math.sin(TAU * (u < 0.15 ? 932 : 698) * t) * 2) * 0.2 * Math.min(1, u * 200, (0.3 - u) * 200); }],
    heartbeat: [1.04, (t) => { const beat = (u, f) => (u < 0 ? 0 : Math.sin(TAU * (f - 30 * u) * u) * Math.exp(-u * 16) * Math.min(1, u * 300)); return 0.9 * beat(t, 62) + 0.6 * beat(t - 0.27, 54); }],
  };

  /** What each sound is made of: [kind, ...parameters] rows built into the sound's own gain. */
  const RECIPES = {
    breath: { loop: true, level: 0.5, parts: [['noise', 'bandpass', 720, 1.2, 0.5, 0.27, 0.48], ['noise', 'lowpass', 380, 0.7, 0.12, 0.27, 0.1]] },
    hangar_hum: { loop: true, level: 0.5, parts: [['tone', 'sine', 50, 0.3], ['tone', 'sine', 100.3, 0.13], ['tone', 'triangle', 149.6, 0.05], ['noise', 'lowpass', 230, 0.5, 0.3, 0.07, 0.06]] },
    door_rumble: { loop: true, level: 0.7, parts: [['noise', 'lowpass', 105, 0.8, 1.1, 6.5, 0.3], ['tone', 'sawtooth', 31, 0.1, 90], ['noise', 'bandpass', 2300, 9, 0.05, 0.9, 0.04], ['noise', 'bandpass', 420, 2, 0.12, 3.1, 0.1]] },
    low_note: { loop: true, level: 0.5, parts: [['tone', 'sine', 55, 0.4], ['tone', 'sawtooth', 55.35, 0.16, 190], ['tone', 'sine', 27.5, 0.3], ['tone', 'sine', 82.6, 0.07]] },
    wind_surf: { loop: true, level: 0.55, parts: [['noise', 'bandpass', 520, 0.5, 0.4, 0.11, 0.3], ['noise', 'highpass', 3200, 0.5, 0.05, 0.11, 0.04], ['noise', 'lowpass', 240, 0.6, 0.45, 0.23, 0.2]] },
    rain_roof: { loop: true, level: 0.5, parts: [['noise', 'highpass', 2600, 0.5, 0.2, 0.31, 0.03], ['noise', 'bandpass', 950, 0.7, 0.3, 0.17, 0.05], ['noise', 'lowpass', 280, 0.7, 0.35, 0.09, 0.08]] },
    phone_ring: { loop: true, level: 0.55, parts: [['pattern', 'phone_ring']] },
    phone_buzz: { loop: true, level: 0.6, parts: [['pattern', 'phone_buzz']] },
    cockpit_alarm: { loop: true, level: 0.45, parts: [['pattern', 'cockpit_alarm']] },
    heartbeat: { loop: true, level: 0.9, parts: [['pattern', 'heartbeat']] },
    gunshot_far: { seconds: 4.4, level: 0.9, parts: [
      ['burst', 'lowpass', 900, 0.7, 1, 0, 0.55], ['burst', 'lowpass', 620, 0.7, 0.42, 0.62, 0.7], ['burst', 'lowpass', 460, 0.7, 0.24, 1.3, 0.9], ['burst', 'lowpass', 340, 0.7, 0.12, 2.15, 1.2],
      ['burst', 'bandpass', 3100, 1.5, 0.07, 0.7, 2.6, 13],
      ['chirp', 2900, 2100, 0.07, 0.75], ['chirp', 2500, 1800, 0.06, 0.98], ['chirp', 3200, 2300, 0.07, 1.2], ['chirp', 2700, 1900, 0.05, 1.55], ['chirp', 3000, 2200, 0.04, 1.95], ['chirp', 2600, 2000, 0.03, 2.5], ['chirp', 2850, 2150, 0.02, 3.1],
    ] },
    phone_pickup: { seconds: 0.5, level: 0.5, parts: [['burst', 'bandpass', 2600, 2, 0.8, 0, 0.03], ['burst', 'bandpass', 900, 1.5, 0.5, 0.07, 0.05], ['burst', 'bandpass', 1500, 0.5, 0.04, 0.1, 0.35]] },
    phone_hangup: { seconds: 0.5, level: 0.5, parts: [['burst', 'bandpass', 1900, 2, 0.7, 0, 0.03], ['burst', 'lowpass', 260, 1, 0.9, 0.03, 0.12], ['chirp', 480, 470, 0.12, 0.12]] },
    tape_seal: { seconds: 1.3, level: 0.6, parts: [['burst', 'bandpass', 2300, 3.5, 0.7, 0, 1.0, 46, 3400], ['burst', 'bandpass', 900, 1, 0.2, 0, 1.0, 46], ['burst', 'bandpass', 3000, 1.2, 0.8, 1.02, 0.05]] },
    cloth_pull: { seconds: 1.1, level: 0.6, parts: [['burst', 'bandpass', 1300, 0.8, 0.5, 0, 0.9, 0, 320], ['burst', 'lowpass', 300, 0.7, 0.4, 0.5, 0.5]] },
    tinnitus: { seconds: 7, level: 0.25, parts: [['ring', 6150, 0.5, 6.6], ['ring', 6188, 0.35, 5.2], ['ring', 3075, 0.12, 3]] },
  };

  function buildSound(g, recipe, destination, t) {
    const sources = [];
    const begin = (source, at = t) => { source.start(at); sources.push(source); return source; };
    for (const part of recipe.parts) {
      const kind = part[0];
      if (kind === 'tone') {
        const [, type, frequency, level, lowpass] = part;
        const oscillator = g.ctx.createOscillator();
        oscillator.type = type;
        oscillator.frequency.value = frequency;
        const level1 = gainNode(g, level);
        (lowpass ? oscillator.connect(filter(g, 'lowpass', lowpass)) : oscillator).connect(level1).connect(destination);
        begin(oscillator);
      } else if (kind === 'noise') {
        // A looping filtered noise whose level swells at `rate` Hz by `depth`.
        const [, type, frequency, q, level, rate, depth] = part;
        const source = g.ctx.createBufferSource();
        source.buffer = g.noise;
        source.loop = true;
        const level1 = gainNode(g, level);
        const swell = g.ctx.createOscillator();
        swell.frequency.value = rate;
        swell.connect(gainNode(g, depth)).connect(level1.gain);
        source.connect(filter(g, type, frequency, q)).connect(level1).connect(destination);
        begin(source);
        begin(swell);
      } else if (kind === 'pattern') {
        const [seconds, sampleAt] = PATTERNS[part[1]];
        const source = g.ctx.createBufferSource();
        source.buffer = rendered(g, seconds, sampleAt);
        source.loop = true;
        source.connect(destination);
        begin(source);
      } else if (kind === 'burst') {
        // Noise that decays over `seconds` from `at`, optionally fluttering and sweeping.
        const [, type, frequency, q, level, at, seconds, flutterHz, sweepTo] = part;
        const source = g.ctx.createBufferSource();
        source.buffer = g.noise;
        source.loop = true;
        const band = filter(g, type, frequency, q);
        if (sweepTo) band.frequency.exponentialRampToValueAtTime(sweepTo, t + at + seconds);
        const envelope = gainNode(g, 0);
        envelope.gain.setValueAtTime(0, t + at);
        envelope.gain.linearRampToValueAtTime(level, t + at + Math.min(0.01, seconds / 4));
        if (flutterHz || sweepTo) envelope.gain.setValueAtTime(level, t + at + seconds * 0.8);
        envelope.gain.exponentialRampToValueAtTime(0.0008, t + at + seconds);
        source.connect(band).connect(envelope).connect(destination);
        if (flutterHz) {
          const flutter = g.ctx.createOscillator();
          flutter.type = 'sawtooth';
          flutter.frequency.value = flutterHz;
          flutter.connect(gainNode(g, level * 0.8)).connect(envelope.gain);
          begin(flutter, t + at).stop(t + at + seconds);
        }
        begin(source, t + at).stop(t + at + seconds + 0.02);
      } else if (kind === 'chirp' || kind === 'ring') {
        // A bird's cry (a short falling whistle) or a long held ringing tone.
        const chirp = kind === 'chirp';
        const [, from, second, third, fourth] = part;
        const at = chirp ? fourth : 0;
        const seconds = chirp ? 0.16 : third;
        const level = chirp ? third : second;
        const oscillator = g.ctx.createOscillator();
        oscillator.frequency.setValueAtTime(from, t + at);
        if (chirp) oscillator.frequency.exponentialRampToValueAtTime(second, t + at + seconds);
        const envelope = gainNode(g, 0);
        envelope.gain.setValueAtTime(0, t + at);
        envelope.gain.linearRampToValueAtTime(level, t + at + (chirp ? 0.02 : 0.25));
        envelope.gain.exponentialRampToValueAtTime(0.0005, t + at + seconds);
        oscillator.connect(envelope).connect(destination);
        begin(oscillator, t + at).stop(t + at + seconds + 0.02);
      }
    }
    return sources;
  }

  function stopSound(soundId, fadeSeconds = 0.6) {
    wantedLoops.delete(soundId);
    const sound = sounds.get(soundId);
    if (!sound) return;
    sounds.delete(soundId);
    const t = sound.ctx.currentTime;
    const fade = Math.max(0.02, fadeSeconds);
    sound.gain.gain.cancelScheduledValues(t);
    sound.gain.gain.setValueAtTime(sound.gain.gain.value, t);
    sound.gain.gain.linearRampToValueAtTime(0, t + fade);
    for (const source of sound.sources) { try { source.stop(t + fade + 0.05); } catch { /* already stopped */ } }
  }

  function startSound(soundId, request = {}) {
    const recipe = RECIPES[soundId];
    if (!recipe) return;
    const volume = Math.max(0, Math.min(2, request.volume ?? 1));
    const g = graph ?? audio();
    if (!g) {
      if (recipe.loop) wantedLoops.set(soundId, volume);
      return;
    }
    const t = g.ctx.currentTime;
    const existing = sounds.get(soundId);
    if (existing && recipe.loop) {
      // Already sounding: only its volume moves (the low note rises).
      existing.gain.gain.cancelScheduledValues(t);
      existing.gain.gain.setValueAtTime(existing.gain.gain.value, t);
      existing.gain.gain.linearRampToValueAtTime(recipe.level * volume, t + Math.max(0.05, request.fadeSeconds ?? 0.6));
      return;
    }
    if (existing) stopSound(soundId, 0.05);
    const gain = gainNode(g, recipe.loop ? 0 : recipe.level * volume);
    gain.connect(g.soundOut);
    if (recipe.loop) gain.gain.linearRampToValueAtTime(recipe.level * volume, t + Math.max(0.02, request.fadeSeconds ?? 0.6));
    const sound = { ctx: g.ctx, gain, sources: buildSound(g, recipe, gain, t + 0.02), endsAt: recipe.loop ? Infinity : t + recipe.seconds + 0.2 };
    sounds.set(soundId, sound);
    debug.soundsStarted += 1;
  }

  function storySound(request) {
    if (!request?.soundId) return;
    if (request.action === 'stop') stopSound(request.soundId, request.fadeSeconds);
    else startSound(request.soundId, request);
  }

  // ---- wiring ----

  stops.push(
    context.commands.handle(GAME_COMMANDS.STORY_LINE_SPEAK, (request) => speak(request?.lineId, request ?? {})),
    context.commands.handle(GAME_COMMANDS.STORY_LINES_STOP, () => stopLines()),
    context.commands.handle(GAME_COMMANDS.STORY_SOUND, (request) => storySound(request)),
    context.events.on(GAME_EVENTS.STORY_STATE_CHANGED, (change) => {
      if (typeof change?.alarm === 'boolean') storyState.alarm = change.alarm;
      if (typeof change?.betrayed === 'boolean') storyState.betrayed = change.betrayed;
    }),
    context.events.on(GAME_EVENTS.RADIO_MESSAGE, onRadioMessage),
    context.events.on(GAME_EVENTS.SETTINGS_CHANGED, ({ key, value }) => { if (key === 'gameplay.subtitles') subtitles?.setEnabled(value); }),
  );
  subtitles?.setEnabled(context.settings?.get?.('gameplay.subtitles') !== false);

  return {
    storyState,
    debug,
    secondsOf,
    speak,
    stopLines,
    storySound,
    soundIds: Object.freeze(Object.keys(RECIPES)),

    /** @param {number} deltaSeconds Real seconds. */
    update(deltaSeconds) {
      subtitles?.update(deltaSeconds);
      if (wantedLoops.size > 0) audio();
      if (sounds.size > 0 && graph) {
        const t = graph.ctx.currentTime;
        for (const [soundId, sound] of sounds) if (sound.endsAt < t) sounds.delete(soundId);
      }
      if (sayLeft >= 0) {
        sayLeft -= deltaSeconds;
        if (sayLeft < 0) speak(context.launch.say, { hold: true });
      }
    },

    dispose() {
      stopLines();
      for (const soundId of [...sounds.keys()]) stopSound(soundId, 0.05);
      for (const stop of stops) if (typeof stop === 'function') stop();
      subtitles?.dispose();
    },
  };
}
