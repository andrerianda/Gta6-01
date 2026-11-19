// The system registry: init order from dependencies, update order from the manifest, progress,
// the gating of simulating systems, and the isolation of a failing system.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeSystemProblems } from '../../../game/src/core/systems/gameSystemContract.js';
import { resolveSystemInitOrder } from '../../../game/src/core/systems/systemInitOrder.js';
import { createSystemRegistry } from '../../../game/src/core/systems/systemRegistry.js';

const names = (entries) => entries.map((entry) => entry.name);

test('init order: dependencies first, otherwise manifest order', () => {
  const systems = [
    { name: 'city', dependsOn: ['render'] },
    { name: 'player', dependsOn: ['city', 'vehicles'] },
    { name: 'vehicles', dependsOn: ['city'] },
    { name: 'hud' },
    { name: 'render' },
  ];
  const { order, problems } = resolveSystemInitOrder(systems);
  assert.deepEqual(names(order), ['render', 'city', 'vehicles', 'player', 'hud']);
  assert.deepEqual(problems, []);
});

test('init order: an already sorted manifest is left alone', () => {
  const systems = [{ name: 'a' }, { name: 'b', dependsOn: ['a'] }, { name: 'c', dependsOn: ['a', 'b'] }];
  assert.deepEqual(names(resolveSystemInitOrder(systems).order), ['a', 'b', 'c']);
});

test('init order: unknown dependencies and cycles are reported, nothing is lost', () => {
  const systems = [
    { name: 'a', dependsOn: ['ghost'] },
    { name: 'b', dependsOn: ['c'] },
    { name: 'c', dependsOn: ['b'] },
    { name: 'd' },
  ];
  const { order, problems } = resolveSystemInitOrder(systems);
  assert.deepEqual(names(order).sort(), ['a', 'b', 'c', 'd']);
  assert.equal(names(order)[0], 'a');
  assert.ok(problems.some((problem) => problem.includes('"ghost"')));
  assert.ok(problems.some((problem) => problem.includes('cycle') && problem.includes('b -> c -> b')));
});

test('the contract check names what is wrong', () => {
  assert.deepEqual(describeSystemProblems({ name: 'traffic', fixedUpdate() {} }), []);
  assert.ok(describeSystemProblems(null)[0].includes('did not return an object'));
  assert.ok(describeSystemProblems({}).some((problem) => problem.includes('no name')));
  assert.ok(describeSystemProblems({ name: 'Traffic System' }).some((problem) => problem.includes('camelCase')));
  assert.ok(describeSystemProblems({ name: 'a', update: 3 }).some((problem) => problem.includes('update')));
  assert.ok(describeSystemProblems({ name: 'a', runsWhen: 'sometimes' }).some((problem) => problem.includes('runsWhen')));
  assert.ok(describeSystemProblems({ name: 'a', dependsOn: ['a'] }).some((problem) => problem.includes('itself')));
});

function makeRegistry(overrides = {}) {
  const faults = [];
  let simulating = true;
  const registry = createSystemRegistry({
    reportFault: (fault) => faults.push(fault),
    isSimulating: () => simulating,
    now: () => 0,
    ...overrides,
  });
  return { registry, faults, setSimulating: (value) => { simulating = value; } };
}

test('lifecycle: create, init in dependency order with progress, start, update in manifest order', async () => {
  const { registry, faults } = makeRegistry();
  const log = [];
  const context = { marker: 'context' };
  const factory = (name, extra = {}) => function namedFactory(received) {
    assert.equal(received, context);
    return {
      name,
      async init(progress) {
        log.push(`init ${name}`);
        progress(0.5, `${name} halfway`);
        await Promise.resolve();
      },
      start: () => log.push(`start ${name}`),
      fixedUpdate: () => log.push(`fixed ${name}`),
      update: (delta, alpha) => log.push(`update ${name} ${delta} ${alpha}`),
      lateUpdate: () => log.push(`late ${name}`),
      dispose: () => log.push(`dispose ${name}`),
      ...extra,
    };
  };
  registry.createAll([
    factory('player', { dependsOn: ['city'] }),
    factory('city'),
    factory('hud', { runsWhen: 'always', loadWeight: 2 }),
  ], context);
  assert.deepEqual(registry.names(), ['player', 'city', 'hud']);
  assert.deepEqual(registry.initOrderNames(), ['city', 'player', 'hud']);

  const progress = [];
  await registry.initialiseAll((report) => progress.push(report));
  assert.deepEqual(log.slice(0, 6), ['init city', 'init player', 'init hud', 'start player', 'start city', 'start hud']);
  const fractions = progress.map((report) => report.fraction);
  assert.ok(fractions.every((value, index) => index === 0 || value >= fractions[index - 1]), 'progress never goes back');
  assert.equal(fractions[fractions.length - 1], 1);
  assert.ok(progress.some((report) => report.label === 'city halfway' && Math.abs(report.fraction - 0.125) < 1e-9));

  log.length = 0;
  registry.fixedUpdate(1 / 60);
  registry.update(0.02, 0.01, 0.5);
  registry.lateUpdate(0.02, 0.01, 0.5);
  assert.deepEqual(log, [
    'fixed player', 'fixed city', 'fixed hud',
    'update player 0.01 0.5', 'update city 0.01 0.5', 'update hud 0.02 0.5',
    'late player', 'late city', 'late hud',
  ]);

  log.length = 0;
  registry.disposeAll();
  assert.deepEqual(log, ['dispose hud', 'dispose player', 'dispose city']);
  assert.deepEqual(faults, []);
  assert.equal(registry.get('city').name, 'city');
  assert.equal(registry.find('ghost'), null);
  assert.throws(() => registry.get('ghost'), /no system named "ghost"/);
});

test('systems that run when simulating stop in states that do not simulate', async () => {
  const { registry, setSimulating } = makeRegistry();
  const ticks = { world: 0, menu: 0 };
  registry.createAll([
    () => ({ name: 'world', fixedUpdate: () => { ticks.world += 1; }, update: () => { ticks.world += 1; } }),
    () => ({ name: 'menu', runsWhen: 'always', fixedUpdate: () => { ticks.menu += 1; }, update: () => { ticks.menu += 1; } }),
  ], {});
  await registry.initialiseAll();
  setSimulating(false);
  registry.fixedUpdate(1 / 60);
  registry.update(0.016, 0, 1);
  assert.deepEqual(ticks, { world: 0, menu: 2 });
  setSimulating(true);
  registry.fixedUpdate(1 / 60);
  assert.deepEqual(ticks, { world: 1, menu: 3 });
});

test('a failing system is reported by name and suspended; the others keep running', async () => {
  const { registry, faults } = makeRegistry();
  let goodTicks = 0;
  registry.createAll([
    function brokenFactory() { throw new Error('factory blew up'); },
    () => ({ name: 'badInit', init: async () => { throw new Error('no lanes'); }, fixedUpdate: () => { throw new Error('never runs'); } }),
    () => ({ name: 'badUpdate', update: () => { throw new Error('NaN position'); } }),
    () => ({ name: 'good', update: () => { goodTicks += 1; } }),
    () => ({ name: 'good' }),
    () => 42,
  ], {});
  await registry.initialiseAll();
  registry.fixedUpdate(1 / 60);
  registry.update(0.016, 0.016, 1);
  registry.update(0.016, 0.016, 1);
  assert.equal(goodTicks, 2);
  const summary = faults.map((fault) => `${fault.system}/${fault.phase}`);
  assert.deepEqual(summary, [
    'brokenFactory/create', 'good/contract', 'anonymous factory/contract', 'badInit/init', 'badUpdate/update',
  ]);
  const status = Object.fromEntries(registry.status().map((entry) => [entry.name, entry.status]));
  assert.deepEqual(status, { badInit: 'failed', badUpdate: 'failed', good: 'ready' });
  assert.equal(registry.status().find((entry) => entry.name === 'badUpdate').error, 'NaN position');
});
