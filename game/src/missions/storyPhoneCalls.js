// The story between missions, on the phone. After a mission's passed screen closes, the giver
// who just paid sends a short text that closes the job, and a few seconds later someone in the
// story calls (the HUD's incoming call card, the line spoken as a subtitle) and sends the lead
// to the next mission, whose giver now waits in person at the marker and on the map. Act one's
// lines are written here; for later missions the next giver calls with the first sentence of the
// mission's summary. A new game opens with the first giver's call the same way.

/**
 * What the phone says after each act one mission: the giver's text, then the call that sends
 * the lead on (caller, line). Keyed by the mission that has just been passed.
 */
export const AFTER_PASS_PHONE = Object.freeze({
  m01_hook_and_chain: {
    text: { from: 'hattie_tolliver', line: 'Envelope is in my safe, not your glovebox. Aurelia Group, same as on our loan. Do not go poking at it without me.' },
    call: { from: 'sol_arrieta', line: 'Tolliver Tow? Sol Arrieta. I need your truck at the service door of Frigoríficos Golfo, in the port. Come quietly.' },
  },
  m02_twice_the_weight: {
    text: { from: 'sol_arrieta', line: 'The tile is in your aunt\'s freezer, behind the shrimp. She says it is the heaviest bathroom she ever saw.' },
    call: { from: 'sol_arrieta', line: 'To weigh that container again we need the night gate, and passes. La Notaria makes clean ones. El Ancla Torcida, La Marisma, before four.' },
  },
  m03_stamped_and_sealed: {
    text: { from: 'ximena_robles', line: 'Stamped, sealed, filed. You were never in my booth, and Marisol owes me a pen.' },
    call: { from: 'hattie_tolliver', line: 'Desmond. Chispa Roldán came by asking if you still race. He says he knows a truck that rattles like a bank. Scrapyard, after seven.' },
  },
  m04_sparks_fly: {
    text: { from: 'jacinto_roldan', line: 'A win is a win, Tolliver. Next time we race without the cops. Rematch whenever.' },
    call: { from: 'sol_arrieta', line: 'Brazo Fletero leaves the rail yard at two with the tiles. Meet me at Patio Ferroviario after dark. Tonight we take the truck.' },
  },
});

const TEXT_DELAY = 2;
const CALL_DELAY = 7;

/**
 * Creates the phone side of the story.
 * @param {{message: (contactId: string, text: string, missionId?: string) => void,
 *   speak: (characterId: string, text: string, seconds: number) => void,
 *   notify: (text: string) => void}} say How a text, a spoken line and a notice reach the HUD.
 * @param {{missions: Record<string, object>, nameOf: (id: string) => string,
 *   placeOf: (missionId: string) => ({name?: string}|null)}} story
 */
export function createStoryPhoneCalls(say, story) {
  const queue = [];                  // {seconds, run}

  function later(seconds, run) { queue.push({ seconds, run }); }

  /** The call that offers a mission: the written line, or the giver with the summary. */
  function callFor(missionId, written) {
    const mission = story.missions[missionId];
    if (!mission) return;
    const from = written?.from ?? mission.giver;
    const line = written?.line ?? String(mission.summary).split('. ')[0].replace(/\.?$/, '.');
    say.message(from, line, missionId);
    say.speak(from, line, 6);
    const place = story.placeOf(missionId)?.name;
    later(6.5, () => say.notify(`${mission.title}: ${story.nameOf(mission.giver)} waits${place ? ` at ${place}` : ''}.`));
  }

  return {
    /** The first giver calls a few seconds into a new game. */
    opening(missionId, seconds) { later(seconds, () => callFor(missionId, null)); },
    /** After a pass: the giver's text, then the call to the next open mission. */
    afterPass(passedId, openIds) {
      const beat = AFTER_PASS_PHONE[passedId];
      const next = openIds.find((id) => id !== passedId) ?? null;
      if (beat?.text) later(TEXT_DELAY, () => say.message(beat.text.from, beat.text.line));
      if (next) later(beat ? CALL_DELAY : TEXT_DELAY, () => callFor(next, beat?.call ?? null));
    },
    /** Counts down while the game is in play (calls wait through menus and cutscenes). */
    update(dt) {
      for (let i = queue.length - 1; i >= 0; i -= 1) {
        const item = queue[i];
        item.seconds -= dt;
        if (item.seconds > 0) continue;
        queue.splice(i, 1);
        item.run();
      }
    },
    clear() { queue.length = 0; },
  };
}
