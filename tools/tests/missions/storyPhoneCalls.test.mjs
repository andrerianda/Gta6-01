// Tests of the story between missions: after each act one pass the giver texts, then a call
// sends the lead to the next open mission (with its missionId, so the HUD shows the call card)
// and a notice names where the next giver waits; the opening call; and the failure wording.
import test from 'node:test';
import assert from 'node:assert/strict';
import { STORY_MISSIONS, STORY_MISSION_ORDER } from '../../../game/src/catalog/storyMissions.js';
import { STORY_CHARACTERS } from '../../../game/src/catalog/storyCharacters.js';
import { AFTER_PASS_PHONE, createStoryPhoneCalls } from '../../../game/src/missions/storyPhoneCalls.js';
import { failureWords, DEFAULT_FAIL_TEXT } from '../../../game/src/missions/missionRun.js';

function harness() {
  const heard = [];
  const calls = createStoryPhoneCalls({
    message: (contactId, text, missionId) => heard.push({ what: 'message', contactId, text, missionId }),
    speak: (characterId, text) => heard.push({ what: 'speak', characterId, text }),
    notify: (text) => heard.push({ what: 'notify', text }),
  }, { missions: STORY_MISSIONS, nameOf: (id) => STORY_CHARACTERS[id]?.name ?? id, placeOf: () => ({ name: 'Somewhere' }) });
  const run = (seconds) => { for (let t = 0; t < seconds; t += 0.1) calls.update(0.1); };
  return { calls, heard, run };
}

test('act one: every pass has a text from its giver and a call naming the next mission', () => {
  for (const [passed, beat] of Object.entries(AFTER_PASS_PHONE)) {
    assert.ok(STORY_MISSIONS[passed], passed);
    assert.equal(beat.text.from, STORY_MISSIONS[passed].giver, `${passed} text comes from its giver`);
    for (const line of [beat.text, beat.call]) {
      assert.ok(STORY_CHARACTERS[line.from], `${passed}: ${line.from} is a character`);
      assert.ok(line.line.length > 20 && line.line.length < 170, `${passed}: line length`);
    }
  }
  assert.deepEqual(Object.keys(AFTER_PASS_PHONE), STORY_MISSION_ORDER.slice(0, 4));
});

test('after a pass: the text first, then the call with the next mission, then the notice', () => {
  const { calls, heard, run } = harness();
  calls.afterPass('m01_hook_and_chain', ['m02_twice_the_weight']);
  run(1);
  assert.equal(heard.length, 0, 'nothing before the delay');
  run(2);
  assert.deepEqual(heard.map((h) => h.what), ['message']);
  assert.equal(heard[0].contactId, 'hattie_tolliver');
  assert.equal(heard[0].missionId, undefined, 'a text is not a call');
  run(6);
  const call = heard.find((h) => h.what === 'message' && h.missionId);
  assert.equal(call.missionId, 'm02_twice_the_weight');
  assert.equal(call.contactId, 'sol_arrieta');
  assert.ok(heard.some((h) => h.what === 'speak' && h.characterId === 'sol_arrieta'));
  run(8);
  const notice = heard.find((h) => h.what === 'notify');
  assert.match(notice.text, /Twice the Weight: .* waits at Somewhere\./);
});

test('later missions: the next giver calls with the summary; nothing open, no call', () => {
  const { calls, heard, run } = harness();
  calls.afterPass('m07_two_beer_problem', ['m08_clean_hands']);
  run(10);
  const call = heard.find((h) => h.what === 'message');
  assert.equal(call.contactId, STORY_MISSIONS.m08_clean_hands.giver);
  assert.equal(call.missionId, 'm08_clean_hands');
  const quiet = harness();
  quiet.calls.afterPass('m15_the_house_loses', []);
  quiet.run(20);
  assert.equal(quiet.heard.length, 0);
});

test('the opening call and clear()', () => {
  const { calls, heard, run } = harness();
  calls.opening('m01_hook_and_chain', 2.5);
  run(3);
  assert.equal(heard[0].missionId, 'm01_hook_and_chain');
  calls.afterPass('m01_hook_and_chain', ['m02_twice_the_weight']);
  calls.clear();
  run(20);
  assert.ok(!heard.some((h) => h.missionId === 'm02_twice_the_weight'));
});

test('failure reasons use MARAZUL\'s own words', () => {
  assert.equal(failureWords('Dez was wasted'), 'Dez flatlined');
  assert.equal(failureWords('Wasted'), 'Flatlined');
  assert.equal(failureWords('Busted with the tile'), 'Cuffed with the tile');
  assert.equal(failureWords('Dez was busted'), 'Dez got cuffed');
  assert.equal(failureWords('Sol or Dez was wasted'), 'Sol or Dez flatlined');
  for (const mission of Object.values(STORY_MISSIONS)) {
    for (const each of mission.failConditions || []) assert.doesNotMatch(failureWords(each.text), /wasted|busted/i, `${mission.id} ${each.text}`);
  }
  for (const text of Object.values(DEFAULT_FAIL_TEXT)) assert.doesNotMatch(text, /wasted|busted/i);
});
