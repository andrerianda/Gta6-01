// The showcase director registers every one of its scenes with the engine's showcase registry
// (each with a title, a description and a run function), registers nothing twice, and removes
// every scene again when it is disposed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createShowcaseDirectorSystem, SHOWCASE_DIRECTOR_SCENES } from '../../../game/src/showcase/showcaseDirector.js';

function fakeContext() {
  const scenes = new Map();
  return {
    scenes,
    showcase: {
      register(scene) {
        assert.ok(!scenes.has(scene.name), `${scene.name} is registered once`);
        scenes.set(scene.name, scene);
        return () => scenes.delete(scene.name);
      },
    },
  };
}

test('the director registers each of its scenes with a title, a description and a run function', async () => {
  const context = fakeContext();
  const system = createShowcaseDirectorSystem(context);
  let done = 0;
  await system.init((fraction) => { done = fraction; });
  assert.equal(done, 1);
  for (const name of SHOWCASE_DIRECTOR_SCENES) assert.ok(context.scenes.has(name), `${name} is registered`);
  for (const scene of context.scenes.values()) {
    assert.equal(typeof scene.run, 'function', `${scene.name} runs`);
    assert.ok(scene.title && scene.description, `${scene.name} has a title and a description`);
  }
  system.dispose();
  assert.equal(context.scenes.size, 0, 'dispose removes every scene');
});
