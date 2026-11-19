// The voice-over: every voiced line of the story, generated once and packed into a few audio files
// with a timing index, played clean (face to face) or through the game's own radio filter
// (band-pass, static, push-to-talk clicks, dropouts far out at sea), phone filter, helmet, memory
// or news-radio treatment, always with its subtitle and the speaker's name in the story's faction
// colour (its own layer, ui/storySubtitles.js, seen in every game state). Also the story's own
// sounds, synthesised (breath, hangar hum, door rumble, far gunshot, phones, alarm, heartbeat...).
// Commands: STORY_LINE_SPEAK {lineId, channel?, quiet?} -> seconds, STORY_LINES_STOP, STORY_SOUND.
// Publishes: STORY_LINE_SPOKEN. Listens: STORY_STATE_CHANGED, RADIO_MESSAGE (voices the lines the
// story script has, colours the rest by channel), SETTINGS_CHANGED. Page option: ?say=<lineId>.
// Also voices the mission cutscenes, story calls and radio outside the final arc by their text
// (speakText), and the police dispatch on WANTED_LEVEL_CHANGED / WANTED_SEARCH_STARTED / WANTED_CLEARED.
// Members: ready, secondsOf(lineId), speak(lineId, options) -> seconds, speakText(request) -> seconds, stop(), sound(request),
//   storyState {alarm, betrayed}, debug {packsLoaded, clipsPlayed, lastLineId, ...}.
// Implementation: audio/voice/voiceOverRuntime.js (speech, channel chains, story sounds) and
//   audio/voice/voicePackIndex.js (where each clip lies in its pack).

/**
 * Creates the voice-over system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createVoiceOverSystem(context) {
  let runtime = null;
  return {
    name: 'voiceOver',
    runsWhen: 'always',
    get ready() { return runtime !== null; },
    get storyState() { return runtime?.storyState ?? { alarm: false, betrayed: false }; },
    get debug() { return runtime?.debug ?? null; },

    /** Seconds a line takes: the clip's length plus a breath, or a reading estimate. */
    secondsOf(lineId) { return runtime?.secondsOf(lineId) ?? 3; },

    /** Speaks a line: `{channel?, quiet?, hold?, distance01?}`; returns its seconds. */
    speak(lineId, options) { return runtime?.speak(lineId, options) ?? 0; },

    /**
     * Speaks a line outside the final arc by its exact text (`{text, speakerId?, speakerName?,
     * channel?, tone?, quiet?}`): its clip and, unless quiet, its subtitle. Returns its seconds,
     * or 0 when the text has no clip (the caller shows its own subtitle then).
     */
    speakText(request) { return runtime?.speakText(request) ?? 0; },

    /** Cuts the playing voices and takes the subtitle down. */
    stop() { runtime?.stopLines(); },

    /** Plays, starts or stops one of the story's sounds: `{soundId, action, volume?, fadeSeconds?}`. */
    sound(request) { runtime?.storySound(request); },

    async init(progress) {
      const [implementation, layer] = await Promise.all([import('./voice/voiceOverRuntime.js'), import('../ui/storySubtitles.js')]);
      const script = context.content.find('finalArcScript') ?? await import('../catalog/finalArcScript.js');
      const document = context.page?.document ?? null;
      const subtitles = document ? layer.createStorySubtitles(document, { enabled: context.settings.get('gameplay.subtitles') !== false }) : null;
      runtime = implementation.createVoiceOverRuntime(context, { script, subtitles });
      progress(1, 'voices');
    },

    update(deltaSeconds) { runtime?.update(deltaSeconds); },

    dispose() {
      runtime?.dispose();
      runtime = null;
    },
  };
}
