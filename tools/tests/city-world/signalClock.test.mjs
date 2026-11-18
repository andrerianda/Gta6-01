// Tests of the shared signal clock on the default plan's real signals: it gives the same lights as
// the traffic system's junction rules and the same walk decisions as the pedestrians' routes, so
// switching those systems to it changes nothing but makes everyone read one clock; it follows its
// time source, and never shows two conflicting greens at one junction.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSeededRandom } from '../../../game/src/core/random/seededRandom.js';
import { generateCityPlan } from '../../../game/src/world/plan/cityPlanGenerator.js';
import { createSignalClock, signalLightOf } from '../../../game/src/world/streets/signalClock.js';
import { signalLightAt } from '../../../game/src/traffic/junctionRules.js';
import { createWalkingRoutes } from '../../../game/src/pedestrians/walkingRoutes.js';

const plan = generateCityPlan(createSeededRandom(1));
const nodes = plan.roads.nodes;
const signalled = nodes.filter((node) => node.control === 'signals' && node.signal);

test('the lights match the traffic rules at every signalled junction', () => {
  assert.ok(signalled.length > 10);
  for (const node of signalled) {
    for (let s = -40; s < 200; s += 0.7) {
      for (let phase = -1; phase < node.signal.phases.length; phase += 1) {
        assert.equal(signalLightOf(node.signal, phase, s), signalLightAt(node.signal, phase, s), `node ${node.id} phase ${phase} t ${s}`);
      }
    }
  }
});

test('the clock follows its time source and never shows two greens at once', () => {
  let now = 0;
  const clock = createSignalClock(nodes, () => now);
  for (const node of signalled.slice(0, 20)) {
    for (now = 0; now < node.signal.cycle * 2; now += 0.5) {
      assert.equal(clock.seconds, now);
      let lit = 0;
      for (let phase = 0; phase < node.signal.phases.length; phase += 1) if (clock.signalLight(node.id, phase) !== 'red') lit += 1;
      const state = clock.phaseAt(node.id);
      assert.equal(lit, state.phase < 0 ? 0 : 1);
      assert.ok(state.left > 0 && state.left <= node.signal.cycle);
    }
  }
  const plain = nodes.find((node) => node.control !== 'signals');
  assert.equal(clock.signalLight(plain.id, 0), 'green');
  assert.equal(clock.walkOpen(plain.id, 0), true);
});

test('walk decisions match the pedestrians routes on every signalled crossing', () => {
  let now = 0;
  const clock = createSignalClock(nodes, () => now);
  const routes = createWalkingRoutes(plan.pedestrianGraph, nodes);
  const crossings = plan.pedestrianGraph.edges.filter((edge) => edge.kind === 'crosswalk' && edge.signalNode >= 0);
  assert.ok(crossings.length > 10);
  for (const edge of crossings.slice(0, 60)) {
    for (now = 0; now < 150; now += 0.9) {
      assert.equal(clock.walkOpen(edge.signalNode, edge.conflictPhase), routes.crossingOpen(edge.id, now), `edge ${edge.id} t ${now}`);
    }
  }
});
