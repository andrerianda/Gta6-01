// The rendered one-shots (gunshots per class, casings, rocket, grenade, bottle, glass,
// stingers), the street acoustics, the radio's pre-rendered drum hits and the rotor loop.
import test from 'node:test';
import assert from 'node:assert/strict';
import { WEAPON_CATALOG } from '../../../game/src/catalog/weaponCatalog.js';
import { measurePcm } from '../../../game/src/audio/pcmSynthesis.js';
import { COMBAT_SOUND_RECIPES, GUNSHOT_CLASS_SOUND, gunshotClassOf, casingKindOf, renderGunshot } from '../../../game/src/audio/combatSoundRecipes.js';
import { createAcoustics, streetAcoustics, ACOUSTIC_RAY_COUNT } from '../../../game/src/audio/streetAcoustics.js';
import { renderDrumKit, DRUM_HITS } from '../../../game/src/audio/radioDrumSamples.js';
import { RADIO_STATION_SOUNDS } from '../../../game/src/audio/radioStationSounds.js';
import { renderRotorLoop, ROTOR_BLADE_PASS_HZ } from '../../../game/src/audio/helicopterRotorVoice.js';

const RATE = 22050;

test('every gun has a class sound, and the classes differ in length as they should', () => {
  const tails = {};
  for (const weapon of Object.values(WEAPON_CATALOG)) {
    if (weapon.sound?.kind !== 'gunshot') continue;
    const kind = gunshotClassOf(weapon);
    assert.ok(GUNSHOT_CLASS_SOUND[kind], `${weapon.id} -> ${kind}`);
    const m = measurePcm(renderGunshot(weapon.sound, kind, RATE, 1));
    assert.ok(m.finite && m.peak > 0.5 && m.peak <= 1, `${weapon.id} peak ${m.peak}`);
    tails[kind] = m.tailSeconds;
  }
  assert.equal(gunshotClassOf(WEAPON_CATALOG.heavy_revolver), 'revolver');
  assert.equal(gunshotClassOf(WEAPON_CATALOG.pistol), 'pistol');
  assert.ok(tails.sniper > 1.5, `sniper rolls on (${tails.sniper.toFixed(2)} s)`);
  assert.ok(tails.sniper > tails.revolver && tails.revolver > tails.pistol && tails.pistol > tails.smg, JSON.stringify(tails));
});

test('spent cases: brass for pistols and SMGs, rifle brass, shotgun shells, none for revolvers and throws', () => {
  assert.equal(casingKindOf(WEAPON_CATALOG.pistol), 'brass');
  assert.equal(casingKindOf(WEAPON_CATALOG.smg), 'brass');
  assert.equal(casingKindOf(WEAPON_CATALOG.assault_rifle), 'rifle_brass');
  assert.equal(casingKindOf(WEAPON_CATALOG.sniper_rifle), 'rifle_brass');
  assert.equal(casingKindOf(WEAPON_CATALOG.pump_shotgun), 'shell');
  assert.equal(casingKindOf(WEAPON_CATALOG.heavy_revolver), null);
  assert.equal(casingKindOf(WEAPON_CATALOG.grenade), null);
  assert.equal(casingKindOf(WEAPON_CATALOG.rocket_launcher), null);
  assert.equal(casingKindOf(WEAPON_CATALOG.fists), null);
});

test('every named one-shot renders finite, audible and short enough', () => {
  for (const [name, recipe] of Object.entries(COMBAT_SOUND_RECIPES)) {
    const m = measurePcm(recipe(RATE, 3));
    assert.ok(m.finite, `${name} is finite`);
    assert.ok(m.peak > 0.2 && m.peak <= 1, `${name} peak ${m.peak}`);
    assert.ok(m.tailSeconds < 2.3, `${name} tail ${m.tailSeconds}`);
  }
  const brass = measurePcm(COMBAT_SOUND_RECIPES.casing_brass(RATE, 1));
  assert.ok(brass.tailSeconds > 0.25, 'a case bounces several times');
});

test('street acoustics: canyon slaps, open ground is dry, a room is tight, the sea swallows the tail', () => {
  const a = createAcoustics();
  const canyon = new Float32Array(ACOUSTIC_RAY_COUNT).fill(60);
  canyon[2] = 9; canyon[6] = 11; canyon[1] = 14; canyon[5] = 15;
  streetAcoustics(a, canyon, Infinity, {});
  const canyonSlap = a.slapGain;
  assert.ok(Math.abs(a.slapSeconds - 2 * 12.25 / 343) < 0.01, `slap ${a.slapSeconds}`);
  assert.ok(a.canyon > 0.4 && !a.indoor);
  streetAcoustics(a, new Float32Array(ACOUSTIC_RAY_COUNT).fill(60), Infinity, {});
  assert.ok(a.slapGain < 0.1 && a.slapGain < canyonSlap, `open ${a.slapGain}`);
  streetAcoustics(a, new Float32Array(ACOUSTIC_RAY_COUNT).fill(4), 3, {});
  assert.ok(a.indoor && a.slapSeconds <= 0.06 && a.slapFeedback > 0.4, JSON.stringify(a));
  streetAcoustics(a, canyon, Infinity, { shoreDistance: 5 });
  assert.ok(a.slapGain < canyonSlap * 0.5, 'by the water');
});

test('radio drum hits pre-render for every station kit at the live levels', () => {
  for (const [id, sound] of Object.entries(RADIO_STATION_SOUNDS)) {
    const hits = renderDrumKit(sound.kit, RATE);
    for (const name of DRUM_HITS) {
      assert.ok(hits[name].length >= 1, `${id}.${name}`);
      for (const pcm of hits[name]) {
        const m = measurePcm(pcm);
        assert.ok(m.finite && m.peak > 0.01 && m.peak < 1.5, `${id}.${name} peak ${m.peak}`);
      }
    }
    const kick = measurePcm(hits.kick[0]);
    assert.ok(kick.peak > sound.kit.kick[3] * 0.8, `${id} kick level kept`);
  }
});

test('the rotor loop is one second, loops without a click and beats at the blade rate', () => {
  const pcm = renderRotorLoop(RATE);
  assert.equal(pcm.data.length, RATE);
  const m = measurePcm(pcm);
  assert.ok(m.finite && m.peak > 0.5);
  assert.ok(Math.abs(pcm.data[0] - pcm.data[pcm.data.length - 1]) < 0.05, 'seamless');
  // Energy envelope in blade-pass windows: each window starts loud and ends quieter.
  const window = Math.floor(RATE / ROTOR_BLADE_PASS_HZ);
  let louderStarts = 0;
  for (let w = 0; w < ROTOR_BLADE_PASS_HZ; w += 1) {
    let head = 0, tail = 0;
    for (let i = 0; i < window / 3; i += 1) head += Math.abs(pcm.data[w * window + i]);
    for (let i = Math.floor(window * 2 / 3); i < window; i += 1) tail += Math.abs(pcm.data[w * window + i]);
    if (head > tail * 1.5) louderStarts += 1;
  }
  assert.ok(louderStarts >= ROTOR_BLADE_PASS_HZ - 2, `${louderStarts} slaps`);
});
