// The engine's boot and automation parts that run without a browser: the content registry, the
// game context check, the frame scheduler, the loading screen, the asset preload, the control
// bindings and game input, the active quality, the state effects and the showcase registry.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createShowcaseSceneRegistry } from '../../../game/src/core/automation/showcaseSceneRegistry.js';
import { choosePreloadAssetIds, preloadGameAssets, withWholeFileFetch } from '../../../game/src/core/boot/assetPreload.js';
import { createLoadingScreen } from '../../../game/src/core/boot/loadingScreen.js';
import { CONTENT_CATALOG_NAMES, createContentRegistry } from '../../../game/src/core/content/contentRegistry.js';
import { DEFAULT_CONTROL_BINDINGS, resolveControlBindings } from '../../../game/src/core/input/controlBindings.js';
import { createGameInput } from '../../../game/src/core/input/gameInput.js';
import { createFrameScheduler } from '../../../game/src/core/loop/frameScheduler.js';
import { createActiveQuality } from '../../../game/src/core/quality/activeQuality.js';
import { looksLikeSoftwareRenderer } from '../../../game/src/core/renderer/softwareRendererDetection.js';
import { applyGameStateEffects } from '../../../game/src/core/state/gameStateEffects.js';
import { createGameStateMachine } from '../../../game/src/core/state/gameStateMachine.js';
import { GAME_STATE } from '../../../game/src/core/state/gameStates.js';
import { createFrameFocus, createGameContext, REQUIRED_CONTEXT_PARTS } from '../../../game/src/core/systems/gameContext.js';

test('content registry: present catalogs by name, the rest listed as missing', () => {
  const content = createContentRegistry({ vehicleCatalog: { VEHICLE_CATALOG: {} }, cityDistricts: undefined });
  assert.equal(CONTENT_CATALOG_NAMES.length, 15);
  assert.deepEqual(content.names, ['vehicleCatalog']);
  assert.equal(content.missing.length, 14);
  assert.ok(content.missing.includes('cityDistricts'));
  assert.ok(content.get('vehicleCatalog').VEHICLE_CATALOG);
  assert.equal(content.find('weaponCatalog'), null);
  assert.throws(() => content.get('weaponCatalog'), /not loaded/);
});

test('game context: refuses to be built with a service missing', () => {
  const parts = Object.fromEntries(REQUIRED_CONTEXT_PARTS.map((name) => [name, {}]));
  const context = createGameContext(parts);
  assert.equal(context.assets, null);
  assert.equal(context.atmosphere, null);
  delete parts.entities;
  assert.throws(() => createGameContext(parts), /entities/);
  assert.deepEqual(createFrameFocus().position, { x: 0, y: 0, z: 0 });
});

test('frame scheduler: runs frames, holds, resumes and stops', () => {
  const queue = [];
  let frames = 0;
  let resumed = 0;
  const scheduler = createFrameScheduler({
    onFrame: () => { frames += 1; },
    requestFrame: (callback) => queue.push(callback),
    cancelFrame: () => { queue.length = 0; },
    onResume: () => { resumed += 1; },
  });
  const pump = () => { const callback = queue.shift(); if (callback) callback(16); };
  scheduler.start();
  pump();
  pump();
  assert.equal(frames, 2);
  scheduler.hold();
  pump();
  assert.equal(frames, 2);
  assert.equal(queue.length, 0);
  scheduler.resume();
  assert.equal(resumed, 1);
  pump();
  assert.equal(frames, 3);
  scheduler.stop();
  pump();
  assert.equal(frames, 3);
  assert.equal(scheduler.running, false);
});

test('loading screen: the bar never moves backwards and stages map onto shares', () => {
  const bar = { style: {} };
  const status = { textContent: '' };
  const screen = createLoadingScreen({ bar, status });
  screen.set(0.4, 'Loading models');
  screen.set(0.2, 'Later label');
  assert.equal(screen.fraction, 0.4);
  assert.equal(bar.style.width, '40.0%');
  assert.match(status.textContent, /Later label/);
  screen.stage(0.5, 0.9)(0.5, 'Preparing traffic');
  assert.ok(Math.abs(screen.fraction - 0.7) < 1e-9);
  screen.set(7);
  assert.equal(screen.fraction, 1);
});

test('asset preload: skips development probes and isolates a broken model', async () => {
  const registry = { probe: { kind: 'dev' }, palm: { kind: 'vegetation' }, lamp: { kind: 'prop' }, broken: { kind: 'prop' } };
  assert.deepEqual(choosePreloadAssetIds(registry), ['palm', 'lamp', 'broken']);
  assert.equal(choosePreloadAssetIds(registry, { includeDevelopmentAssets: true }).length, 4);
  const loaded = new Set();
  const assets = {
    registry,
    has: (id) => loaded.has(id),
    async load(ids) {
      for (const id of ids) {
        if (id === 'broken') throw new Error('asset "broken" failed to load: HTTP 404');
        loaded.add(id);
      }
    },
  };
  const fractions = [];
  const result = await preloadGameAssets({ assets, fetchScope: {}, onProgress: ({ fraction }) => fractions.push(fraction) });
  assert.deepEqual(result.loaded, ['palm', 'lamp']);
  assert.deepEqual(result.failed.map((failure) => failure.id), ['broken']);
  assert.equal(fractions.at(-1), 1);
});

test('asset preload: fetch hands back whole files while the task runs, then is restored', async () => {
  const original = async () => new Response('model bytes', { status: 200, headers: { 'Content-Length': '11' } });
  const scope = { fetch: original };
  const text = await withWholeFileFetch(scope, async () => {
    assert.notEqual(scope.fetch, original);
    const response = await scope.fetch('props/lamp.glb');
    assert.equal(response.headers.get('Content-Length'), null);
    return response.text();
  });
  assert.equal(text, 'model bytes');
  assert.equal(scope.fetch, original);
});

test('control bindings: defaults, then the catalog, then the player', () => {
  const plain = resolveControlBindings();
  assert.deepEqual(plain.bindings.onFoot.jump, DEFAULT_CONTROL_BINDINGS.onFoot.jump);
  assert.equal(plain.axes.steer.positive, 'steerRight');
  const resolved = resolveControlBindings({
    catalog: { PLAYER_CONTROLS: { onFoot: { jump: { codes: ['KeyJ'], label: 'Leap' }, wave: ['KeyG'] } } },
    overrides: { inVehicle: { horn: ['KeyB'] } },
  });
  assert.deepEqual(resolved.bindings.onFoot.jump, ['KeyJ']);
  assert.deepEqual(resolved.bindings.onFoot.wave, ['KeyG']);
  assert.deepEqual(resolved.bindings.inVehicle.horn, ['KeyB']);
  assert.equal(resolved.labels.jump, 'Leap');
  assert.deepEqual(resolved.bindings.onFoot.sprint, ['ShiftLeft', 'ShiftRight']);
  assert.deepEqual(DEFAULT_CONTROL_BINDINGS.onFoot.jump, ['Space']);
});

test('game input: forced and player contexts, the same key per context, rebinding persists', () => {
  const stored = { 'controls.bindings': {} };
  const settings = { get: (key) => stored[key], set: (key, value) => { stored[key] = value; } };
  const changes = [];
  const controls = createGameInput({ settings, onBindingChanged: (change) => changes.push(change) });
  const input = controls.actions;
  assert.equal(controls.device, null);
  assert.equal(input.context, 'menu');
  controls.setPlayContext('inVehicle');
  assert.equal(input.context, 'menu');
  controls.forceContext(null);
  assert.equal(input.context, 'inVehicle');
  input.codeDown('KeyW');
  assert.equal(input.held('accelerate'), true);
  assert.equal(input.axis('throttle'), 1);
  input.codeUp('KeyW');
  controls.setPlayContext('onFoot');
  input.codeDown('KeyW');
  assert.equal(input.held('moveForward'), true);
  assert.equal(input.axis('moveZ'), 1);
  input.codeUp('KeyW');
  controls.rebind('onFoot', 'jump', ['KeyJ']);
  assert.deepEqual(stored['controls.bindings'], { onFoot: { jump: ['KeyJ'] } });
  assert.equal(changes.length, 1);
  input.codeDown('KeyJ');
  assert.equal(input.held('jump'), true);
  assert.equal(typeof controls.promptFor('enterVehicle', 'onFoot'), 'string');
});

test('active quality: the row of the table, changes announced once', () => {
  const changes = [];
  const quality = createActiveQuality({ name: 'medium', source: 'benchmark', onChanged: (change) => changes.push(change) });
  assert.equal(quality.tier.maxVehicles, 36);
  assert.equal(quality.set('medium'), false);
  assert.equal(quality.set('nonsense'), false);
  assert.equal(quality.set('ultra'), true);
  assert.equal(quality.name, 'ultra');
  assert.equal(quality.tier.atmosphere, 'ultra');
  assert.deepEqual(changes.map((change) => [change.previous, change.tier]), [['medium', 'ultra']]);
});

test('software renderer: recognised by its driver name', () => {
  assert.equal(looksLikeSoftwareRenderer('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)'), true);
  assert.equal(looksLikeSoftwareRenderer('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11)'), false);
});

test('state effects: input context, pointer capture and the body attributes follow the state', () => {
  const state = createGameStateMachine();
  const forced = [];
  const captures = [];
  const body = { dataset: {} };
  applyGameStateEffects({
    state,
    controls: { forceContext: (context) => forced.push(context), device: { setPointerCapture: (wanted) => captures.push(wanted) } },
    body,
  });
  assert.equal(body.dataset.gameState, 'booting');
  state.enter(GAME_STATE.LOADING);
  state.enter(GAME_STATE.PLAYING);
  assert.equal(body.dataset.gameState, 'playing');
  assert.equal(body.dataset.hud, 'shown');
  assert.equal(forced.at(-1), null);
  assert.equal(captures.at(-1), true);
  state.enter(GAME_STATE.PAUSED);
  assert.equal(forced.at(-1), 'menu');
  assert.equal(captures.at(-1), false);
  assert.equal(body.dataset.hud, 'hidden');
});

test('showcase registry: scenes by name, bad and duplicate names refused', () => {
  const showcase = createShowcaseSceneRegistry();
  const remove = showcase.register({ name: 'police-chase', title: 'Three stars', run() {} });
  assert.deepEqual(showcase.names(), ['police-chase']);
  assert.deepEqual(showcase.list(), [{ name: 'police-chase', title: 'Three stars', description: '' }]);
  assert.throws(() => showcase.register({ name: 'police-chase', run() {} }), /already registered/);
  assert.throws(() => showcase.register({ name: 'Police Chase', run() {} }), /lower-case/);
  assert.throws(() => showcase.register({ name: 'no-run' }), /run\(context, tools\)/);
  assert.equal(showcase.get('missing'), null);
  remove();
  assert.equal(showcase.has('police-chase'), false);
});
