// The gameplay-video tool: the run lasts about a minute, covers every part the owner asked for,
// and records with hardware-WebGL flags on the GPU machine. (The recording itself is checked by
// running the tool; see /tmp/marazul/release/NOTES.md.)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GAMEPLAY_PHASES, GPU_CHROMIUM_FLAGS } from '../../record-gameplay.mjs';

test('the run covers walking, a car, a police chase and shooting', () => {
  for (const part of ['walk', 'board', 'cruise', 'chase', 'stop', 'shoot']) assert.ok(GAMEPLAY_PHASES[part] > 0, part);
});

test('the run lasts about a minute', () => {
  const seconds = Object.values(GAMEPLAY_PHASES).reduce((sum, s) => sum + s, 0);
  assert.ok(seconds >= 55 && seconds <= 70, `${seconds} s`);
});

test('the GPU recording asks for hardware WebGL, not SwiftShader', () => {
  assert.ok(GPU_CHROMIUM_FLAGS.includes('--use-angle=vulkan'));
  assert.ok(!GPU_CHROMIUM_FLAGS.some((flag) => /swiftshader/i.test(flag)));
});
