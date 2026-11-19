// The voice-over: every voiced line of the story, generated once and packed into a few audio files
// with a timing index, played clean (face to face) or through the game's own radio filter
// (band-pass, static, push-to-talk clicks, dropouts far out at sea), phone filter, helmet or memory
// treatment, always with its subtitle and the speaker's name in the story's faction colour.
// Commands: STORY_LINE_SPEAK {lineId, channel?, quiet?} -> seconds, STORY_LINES_STOP, STORY_SOUND.
// Publishes: STORY_LINE_SPOKEN. Listens: RADIO_MESSAGE (voices the air guard's lines it has).
// Members: ready, secondsOf(lineId), speak(lineId, options) -> seconds, storyState {alarm, betrayed}.
// Implementation: audio/voice/voiceOverRuntime.js and its neighbours.

/**
 * Creates the voice-over system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createVoiceOverSystem(context) {
  void context;
  return {
    name: 'voiceOver',
    runsWhen: 'always',
    get ready() { return false; },
    secondsOf() { return 3; },
    speak() { return 3; },
    async init(progress) { progress(1, 'voices'); },
    update() {},
    dispose() {},
  };
}
