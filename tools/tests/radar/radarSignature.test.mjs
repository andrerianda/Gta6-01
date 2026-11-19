// The radar-signature model: by type, by the side shown to the emitter, by height (clutter and the
// radar horizon), by speed and skin temperature, and by what hangs open.
import assert from 'node:assert/strict';
import test from 'node:test';
import { CLUTTER, aspectTo, clutterShareAt, radarHorizonMetres, radarSignatureOf, signatureWord } from '../../../game/src/flight/radar/radarSignature.js';
import { SIGNATURE_DETECTED, stealthSignatureOf } from '../../../game/src/flight/deck/stealthSignature.js';

const EMITTER = { x: 0, y: 40, z: 0 };
/** An aircraft 6 km south of the emitter at a height, flying a compass heading in degrees. */
const craft = (overrides = {}) => ({
  x: 0, y: 1500, z: 6000, heading: 0, pitch: 0, roll: 0, mach: 0.5, skinTemperatureC: 10, heightAboveSurface: overrides.y ?? 1500, onGround: false,
  gear: 0, afterburner: false, hatchOpen: false, bayOpen: false, ...overrides,
});
const DEG = Math.PI / 180;

test('aspect: nose-on, beam, tail and the planform in a bank', () => {
  const nose = aspectTo(craft({ y: 40 }), EMITTER, {});
  assert.ok(nose.forward > 0.999 && Math.abs(nose.right) < 1e-9);
  const tail = aspectTo(craft({ y: 40, heading: 180 * DEG }), EMITTER, {});
  assert.ok(tail.forward < -0.999);
  const beam = aspectTo(craft({ y: 40, heading: 90 * DEG }), EMITTER, {});
  assert.ok(beam.right < -0.999, 'flying east with the emitter to the north: on the left wing');
  // Banked 60 degrees left wing down towards the emitter on the left: the radar looks at the top.
  const banked = aspectTo(craft({ y: 40, heading: 90 * DEG, roll: -60 * DEG }), EMITTER, {});
  assert.ok(banked.up > 0.8, `top shown, got ${banked.up}`);
  const away = aspectTo(craft({ y: 40, heading: 90 * DEG, roll: 60 * DEG }), EMITTER, {});
  assert.ok(away.up < -0.8, 'banked away: the belly');
});

test('the Manta Sombra: tiny nose-on and from below, larger side-on, from above and in a bank', () => {
  const nose = radarSignatureOf('manta_sombra', craft(), EMITTER);
  assert.ok(nose < 0.06, `nose-on at 1500 m, got ${nose}`);
  const side = radarSignatureOf('manta_sombra', craft({ heading: 90 * DEG }), EMITTER);
  const tail = radarSignatureOf('manta_sombra', craft({ heading: 180 * DEG }), EMITTER);
  assert.ok(side > nose * 2.5 && tail > nose && tail < side);
  const banked = radarSignatureOf('manta_sombra', craft({ heading: 90 * DEG, roll: -60 * DEG }), EMITTER);
  assert.ok(banked > 0.6 && banked > side * 3, `planform to the radar, got ${banked}`);
  const bankedAway = radarSignatureOf('manta_sombra', craft({ heading: 90 * DEG, roll: 60 * DEG }), EMITTER);
  assert.ok(bankedAway > side && bankedAway < banked, 'a bank away shows the belly: more than level, less than the top');
  const above = radarSignatureOf('manta_sombra', craft(), { x: 0, y: 9000, z: 6000 });
  const below = radarSignatureOf('manta_sombra', craft(), { x: 0, y: 0, z: 6000 });
  assert.ok(above > 0.6 && below < 0.15 && below < above / 4);
});

test('types: the Garza Negra is moderate and grows with speed and heat; the others are conventional', () => {
  const manta = radarSignatureOf('manta_sombra', craft(), EMITTER);
  const garza = radarSignatureOf('garza_negra', craft(), EMITTER);
  const trainer = radarSignatureOf('gaviota_t2', craft(), EMITTER);
  const fighter = radarSignatureOf('halcon', craft(), EMITTER);
  const heli = radarSignatureOf('helicopter', craft(), EMITTER);
  assert.ok(manta < garza && garza < fighter && garza < trainer && heli > 0.5, `${manta} ${garza} ${fighter} ${trainer} ${heli}`);
  assert.ok(garza > 0.15 && garza < 0.3);
  const fast = radarSignatureOf('garza_negra', craft({ mach: 3, skinTemperatureC: 330 }), EMITTER);
  assert.ok(fast > garza + 0.5, `Mach 3 and hot skin, got ${fast} against ${garza}`);
  const warm = radarSignatureOf('garza_negra', craft({ mach: 2, skinTemperatureC: 180 }), EMITTER);
  assert.ok(warm > garza && warm < fast);
  assert.equal(radarSignatureOf('unknown_type', craft(), EMITTER), fighter);
  const mantaFast = radarSignatureOf('manta_sombra', craft({ mach: 0.9 }), EMITTER);
  assert.ok(mantaFast > manta && mantaFast - manta <= 0.15 + 1e-9);
});

test('height: clutter near the surface, and a parked aircraft is lost in it', () => {
  assert.equal(clutterShareAt(0), CLUTTER.floorShare);
  assert.equal(clutterShareAt(CLUTTER.topMetres), 1);
  assert.equal(clutterShareAt(5000), 1);
  assert.ok(clutterShareAt(100) > clutterShareAt(30) && clutterShareAt(100) < 0.6);
  const high = radarSignatureOf('manta_sombra', craft({ heading: 90 * DEG }), EMITTER);
  const low = radarSignatureOf('manta_sombra', craft({ heading: 90 * DEG, y: 100 }), EMITTER);
  assert.ok(low < high * 0.55 && low > 0);
  const parked = radarSignatureOf('halcon', craft({ y: 2, heightAboveSurface: 0, onGround: true }), EMITTER);
  assert.ok(parked < 0.15);
  assert.ok(Number.isFinite(radarSignatureOf('manta_sombra', craft({ roll: NaN, mach: NaN, heightAboveSurface: NaN }), EMITTER)));
});

test('open bays: gear, the belly hatch and the bomb bay are corner reflectors', () => {
  const clean = radarSignatureOf('manta_sombra', craft(), EMITTER);
  const gear = radarSignatureOf('manta_sombra', craft({ gear: 1 }), EMITTER);
  const hatch = radarSignatureOf('manta_sombra', craft({ hatchOpen: true }), EMITTER);
  const bay = radarSignatureOf('manta_sombra', craft({ bayOpen: true }), EMITTER);
  assert.ok(Math.abs(gear - clean - 0.3) < 1e-9 && Math.abs(hatch - clean - 0.25) < 1e-9 && Math.abs(bay - clean - 0.35) < 1e-9);
  assert.ok(radarSignatureOf('manta_sombra', craft({ gear: 0.5 }), EMITTER) < gear);
  assert.equal(radarSignatureOf('manta_sombra', craft({ gear: 1, hatchOpen: true, bayOpen: true, afterburner: true, roll: 1.2, heading: 90 * DEG }), EMITTER), 1);
});

test('the radar horizon grows with both heights', () => {
  assert.equal(radarHorizonMetres(0, 0), 0);
  const low = radarHorizonMetres(40, 30);
  const high = radarHorizonMetres(40, 1500);
  assert.ok(low > 5000 && low < 7000, `sea skimming under the tower's horizon at 7 km, got ${low}`);
  assert.ok(high > 20000);
  assert.ok(radarHorizonMetres(24, 30) < radarHorizonMetres(40, 30));
});

test('the meter words, and the deck\'s own estimate still works', () => {
  assert.equal(signatureWord(0.02, 0.2, false, false), 'HIDDEN');
  assert.equal(signatureWord(0.1, 0.2, false, false), 'LOW');
  assert.equal(signatureWord(0.25, 0.2, false, false), 'EXPOSED');
  assert.equal(signatureWord(0.25, 0.2, false, true), 'PAINTED');
  assert.equal(signatureWord(0.01, 0.2, true, true), 'TRACKED');
  assert.equal(signatureWord(0.02, Infinity, false, false), 'HIDDEN');
  const quiet = stealthSignatureOf({ radarAltitudeFeet: 300, mach: 0.5, rollDegrees: 0, gearDown: false });
  assert.ok(quiet < 0.15 && quiet < SIGNATURE_DETECTED);
});
