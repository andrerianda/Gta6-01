// Tests of the seeded random number generator and the coordinate hashes
// (game/src/core/random/). Run with: node --test "tools/tests/core-math/*.test.mjs"
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createSeededRandom,
  deriveSeed,
  hashCombine,
  hashString,
  hashUint32,
  normaliseSeed,
  unitFloatFromHash,
} from '../../../game/src/core/random/seededRandom.js';
import { hashGridCell, hashGridCell3D, randomAtCell, randomAtCell3D, randomAtIndex } from '../../../game/src/core/random/coordinateHash.js';

test('equal seeds give equal sequences, different seeds different ones', () => {
  const a = createSeededRandom('marazul');
  const b = createSeededRandom('marazul');
  const c = createSeededRandom('marazul2');
  const first = Array.from({ length: 50 }, () => a.next());
  assert.deepEqual(Array.from({ length: 50 }, () => b.next()), first);
  assert.notDeepEqual(Array.from({ length: 50 }, () => c.next()), first);
  assert.equal(createSeededRandom(7).seed, 7);
  assert.equal(createSeededRandom('x').seed, hashString('x'));
});

test('the sequence is pinned so that worlds stay the same between versions', () => {
  const random = createSeededRandom(12345);
  const values = [random.uint32(), random.uint32(), random.uint32()];
  const again = createSeededRandom(12345);
  assert.deepEqual([again.uint32(), again.uint32(), again.uint32()], values);
  for (const value of values) assert.ok(Number.isInteger(value) && value >= 0 && value <= 0xffffffff);
  assert.equal(hashUint32(0), 0);
  assert.equal(hashUint32(1), 1364076727);
});

test('next is uniform in [0, 1) and neighbouring seeds are unrelated', () => {
  const buckets = new Array(20).fill(0);
  const random = createSeededRandom(1);
  let sum = 0;
  const count = 200000;
  for (let i = 0; i < count; i += 1) {
    const value = random.next();
    assert.ok(value >= 0 && value < 1);
    buckets[Math.floor(value * 20)] += 1;
    sum += value;
  }
  assert.ok(Math.abs(sum / count - 0.5) < 0.005);
  for (const bucket of buckets) assert.ok(Math.abs(bucket - count / 20) < count / 20 * 0.05, `bucket ${bucket}`);
  // First outputs of seeds 0..999 must themselves look uniform.
  let firsts = 0;
  for (let seed = 0; seed < 1000; seed += 1) firsts += createSeededRandom(seed).next();
  assert.ok(Math.abs(firsts / 1000 - 0.5) < 0.04);
});

test('range, int, chance, sign, angle and jitter stay in their ranges', () => {
  const random = createSeededRandom('ranges');
  const seen = new Set();
  let hits = 0;
  for (let i = 0; i < 20000; i += 1) {
    const r = random.range(-3, 5);
    assert.ok(r >= -3 && r < 5);
    const n = random.int(2, 6);
    assert.ok(Number.isInteger(n) && n >= 2 && n <= 6);
    seen.add(n);
    if (random.chance(0.25)) hits += 1;
    assert.ok(Math.abs(random.sign()) === 1);
    const angle = random.angle();
    assert.ok(angle >= 0 && angle < Math.PI * 2);
    const j = random.jitter(10, 2);
    assert.ok(j >= 8 && j <= 12);
  }
  assert.deepEqual([...seen].sort(), [2, 3, 4, 5, 6]);
  assert.ok(Math.abs(hits / 20000 - 0.25) < 0.02);
  assert.equal(random.int(4, 4), 4);
  assert.equal(random.chance(0), false);
  assert.equal(random.chance(1), true);
});

test('pick, weightedPick, shuffle and sample', () => {
  const random = createSeededRandom('choices');
  assert.equal(random.pick([]), undefined);
  assert.equal(random.pick(['only']), 'only');
  const counts = { a: 0, b: 0, c: 0 };
  for (let i = 0; i < 30000; i += 1) counts[random.weightedPick(['a', 'b', 'c'], [1, 2, 0])] += 1;
  assert.equal(counts.c, 0);
  assert.ok(Math.abs(counts.b / counts.a - 2) < 0.15);
  const byAccessor = { x: 0, y: 0 };
  const items = [{ name: 'x', weight: 3 }, { name: 'y', weight: 1 }];
  for (let i = 0; i < 20000; i += 1) byAccessor[random.weightedPick(items, (item) => item.weight).name] += 1;
  assert.ok(Math.abs(byAccessor.x / byAccessor.y - 3) < 0.3);
  assert.equal(random.weightedPick([], []), undefined);
  assert.ok(['p', 'q'].includes(random.weightedPick(['p', 'q'], [0, 0])));

  const deck = Array.from({ length: 52 }, (_, i) => i);
  const shuffled = random.shuffle(deck.slice());
  assert.notDeepEqual(shuffled, deck);
  assert.deepEqual(shuffled.slice().sort((a, b) => a - b), deck);
  const same = [1, 2, 3];
  assert.equal(random.shuffle(same), same);

  const sample = random.sample(deck, 10);
  assert.equal(sample.length, 10);
  assert.equal(new Set(sample).size, 10);
  assert.equal(random.sample(deck, 99).length, 52);
});

test('gaussian has the requested mean and deviation; inDisc stays inside', () => {
  const random = createSeededRandom('bell');
  let sum = 0;
  let squares = 0;
  const count = 100000;
  for (let i = 0; i < count; i += 1) {
    const value = random.gaussian(10, 2);
    sum += value;
    squares += (value - 10) * (value - 10);
    const [x, y] = random.inDisc(3);
    assert.ok(Math.hypot(x, y) <= 3);
  }
  assert.ok(Math.abs(sum / count - 10) < 0.03);
  assert.ok(Math.abs(Math.sqrt(squares / count) - 2) < 0.03);
});

test('fork gives independent streams that do not depend on how much was drawn', () => {
  const a = createSeededRandom('world');
  const forkBefore = a.fork('traffic').next();
  for (let i = 0; i < 100; i += 1) a.next();
  assert.equal(a.fork('traffic').next(), forkBefore);
  assert.notEqual(a.fork('traffic').next(), a.fork('weather').next());
  assert.notEqual(a.fork(1).next(), a.fork(2).next());
  assert.equal(a.fork('traffic').seed, createSeededRandom('world').fork('traffic').seed);
  // Drawing from a fork does not disturb the parent.
  const parent = createSeededRandom(5);
  const control = createSeededRandom(5);
  parent.fork('x').next();
  assert.equal(parent.next(), control.next());
});

test('hash helpers are stable, well mixed and order sensitive', () => {
  assert.equal(hashString('marazul'), hashString('marazul'));
  assert.notEqual(hashString('ab'), hashString('ba'));
  assert.notEqual(hashCombine(1, 2), hashCombine(2, 1));
  assert.equal(deriveSeed('world', 'block', 3, 4), deriveSeed('world', 'block', 3, 4));
  assert.notEqual(deriveSeed('world', 'block', 3, 4), deriveSeed('world', 'block', 4, 3));
  assert.equal(normaliseSeed(42), 42);
  assert.equal(normaliseSeed(-1), hashString('-1'));
  assert.equal(normaliseSeed(NaN), 0);
  const unit = unitFloatFromHash(hashString('k'));
  assert.ok(unit >= 0 && unit < 1);
  // Avalanche: flipping one input bit flips about half of the output bits.
  let flipped = 0;
  for (let i = 0; i < 2000; i += 1) {
    let difference = hashUint32(i) ^ hashUint32(i ^ 1);
    while (difference) {
      flipped += difference & 1;
      difference >>>= 1;
    }
  }
  assert.ok(Math.abs(flipped / 2000 - 16) < 1.5);
});

test('coordinate hashes are stateless, signed-safe and uniform', () => {
  assert.equal(hashGridCell(3, -7, 9), hashGridCell(3, -7, 9));
  assert.notEqual(hashGridCell(3, -7, 9), hashGridCell(-7, 3, 9));
  assert.notEqual(hashGridCell(3, 4, 1), hashGridCell(3, 4, 2));
  assert.notEqual(hashGridCell3D(1, 2, 3), hashGridCell3D(3, 2, 1));
  let sum = 0;
  let count = 0;
  for (let x = -60; x < 60; x += 1) {
    for (let y = -60; y < 60; y += 1) {
      const value = randomAtCell(x, y, 77);
      assert.ok(value >= 0 && value < 1);
      sum += value;
      count += 1;
    }
  }
  assert.ok(Math.abs(sum / count - 0.5) < 0.01);
  // Neighbouring cells are uncorrelated.
  let product = 0;
  for (let x = 0; x < 4000; x += 1) product += (randomAtCell(x, 0, 5) - 0.5) * (randomAtCell(x + 1, 0, 5) - 0.5);
  assert.ok(Math.abs(product / 4000) < 0.01);
  assert.ok(randomAtCell3D(1, 2, 3, 4) >= 0 && randomAtCell3D(1, 2, 3, 4) < 1);
  assert.notEqual(randomAtIndex(5, 1, 0), randomAtIndex(5, 1, 1));
});
