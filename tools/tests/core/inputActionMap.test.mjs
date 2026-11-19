// The input action map: bindings to actions, edges per frame and per fixed step, contexts,
// axes, rebinding and labels.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInputActionMap } from '../../../game/src/core/input/inputActionMap.js';
import { describeInputCode } from '../../../game/src/core/input/inputCodeLabels.js';

const BINDINGS = {
  always: { pause: ['Escape'] },
  onFoot: {
    moveForward: ['KeyW', 'ArrowUp'], moveBackward: ['KeyS'], moveLeft: ['KeyA'], moveRight: ['KeyD'],
    jump: ['Space'], enterVehicle: ['KeyF'], fire: ['Mouse0'], nextWeapon: ['WheelUp'],
  },
  inVehicle: {
    accelerate: ['KeyW'], brake: ['KeyS'], steerLeft: ['KeyA'], steerRight: ['KeyD'],
    handbrake: ['Space'], exitVehicle: ['KeyF'],
  },
  menu: { confirm: ['Enter'] },
};
const AXES = {
  moveX: { negative: 'moveLeft', positive: 'moveRight' },
  steer: { negative: 'steerLeft', positive: 'steerRight' },
};

const makeMap = (extra = {}) => createInputActionMap({ bindings: BINDINGS, axes: AXES, context: 'onFoot', ...extra });

test('pressed, held and released follow the key within a frame', () => {
  const input = makeMap();
  assert.equal(input.codeDown('KeyW'), true);
  assert.ok(input.pressed('moveForward') && input.held('moveForward') && !input.released('moveForward'));
  input.endFrame();
  assert.ok(!input.pressed('moveForward') && input.held('moveForward'));
  input.codeUp('KeyW');
  assert.ok(input.released('moveForward') && !input.held('moveForward'));
  input.endFrame();
  assert.ok(!input.released('moveForward'));
  assert.equal(input.codeDown('KeyQ'), false, 'an unbound key');
  assert.equal(input.pressed('noSuchAction'), false);
});

test('an edge is seen by exactly one fixed step, even when a frame runs none or several', () => {
  const input = makeMap();
  input.codeDown('Space');
  // A frame without a fixed step: the frame edge is spent, the step edge waits.
  input.endFrame();
  input.beginFixedStep();
  assert.ok(input.pressed('jump'), 'the first step after the key sees it');
  input.endFixedStep();
  input.beginFixedStep();
  assert.ok(!input.pressed('jump'), 'the second step does not');
  assert.ok(input.held('jump'));
  input.endFixedStep();
});

test('two keys on one action hold it until both are up', () => {
  const input = makeMap();
  input.codeDown('KeyW');
  input.codeDown('ArrowUp');
  input.codeUp('KeyW');
  assert.ok(input.held('moveForward'));
  assert.ok(!input.released('moveForward'));
  input.codeUp('ArrowUp');
  assert.ok(!input.held('moveForward') && input.released('moveForward'));
});

test('axes combine two actions', () => {
  const input = makeMap();
  assert.equal(input.axis('moveX'), 0);
  input.codeDown('KeyD');
  assert.equal(input.axis('moveX'), 1);
  input.codeDown('KeyA');
  assert.equal(input.axis('moveX'), 0);
  input.codeUp('KeyD');
  assert.equal(input.axis('moveX'), -1);
  assert.equal(input.axis('noSuchAxis'), 0);
});

test('the same key means different actions in different contexts, without a fresh press', () => {
  const changes = [];
  const input = makeMap({ onContextChanged: (change) => changes.push(change) });
  input.codeDown('KeyF');
  assert.ok(input.pressed('enterVehicle'));
  input.setContext('inVehicle');
  assert.deepEqual(changes, [{ context: 'inVehicle', previous: 'onFoot' }]);
  assert.ok(!input.held('enterVehicle'));
  assert.ok(input.held('exitVehicle'), 'the key is still down');
  assert.ok(!input.pressed('exitVehicle'), 'but it does not leave the car it just entered');
  input.codeUp('KeyF');
  input.endFrame();
  input.codeDown('KeyF');
  assert.ok(input.pressed('exitVehicle'));

  input.codeDown('KeyW');
  assert.ok(input.held('accelerate') && !input.held('moveForward'));
  assert.throws(() => input.setContext('flying'), /unknown input context/);
});

test('actions of the always context work everywhere', () => {
  const input = makeMap();
  input.setContext('menu');
  input.codeDown('Escape');
  assert.ok(input.pressed('pause'));
  assert.equal(input.labelFor('pause'), 'Esc');
});

test('wheel taps, mouse look and releaseAll', () => {
  const input = makeMap();
  input.wheelTurned(1);
  assert.ok(input.pressed('nextWeapon') && !input.held('nextWeapon'));
  assert.equal(input.wheel, 1);
  input.pointerMoved(12, -4);
  input.pointerMoved(3, 1);
  assert.deepEqual([input.lookX, input.lookY], [15, -3]);
  input.codeDown('Mouse0');
  input.codeDown('KeyW');
  input.endFrame();
  assert.deepEqual([input.lookX, input.lookY, input.wheel], [0, 0, 0]);
  input.releaseAll();
  assert.ok(!input.held('fire') && !input.held('moveForward'));
  assert.ok(input.released('fire'));
});

test('virtual input drives actions for automation', () => {
  const input = makeMap();
  input.setVirtual('moveForward', true);
  assert.ok(input.pressed('moveForward') && input.held('moveForward'));
  input.codeDown('KeyW');
  input.codeUp('KeyW');
  assert.ok(input.held('moveForward'), 'the virtual hold outlasts a real key');
  input.setVirtual('moveForward', false);
  assert.ok(!input.held('moveForward'));
});

test('rebinding, conflicts, labels and export', () => {
  const input = makeMap();
  assert.equal(input.labelFor('fire'), 'Left Mouse');
  assert.equal(input.labelFor('enterVehicle', 'onFoot'), 'F');
  assert.equal(input.labelFor('handbrake', 'inVehicle'), 'Space');
  assert.equal(input.labelFor('noSuchAction'), '');
  assert.deepEqual(input.conflictsOf('onFoot', 'Space', 'enterVehicle'), ['jump']);
  assert.deepEqual(input.conflictsOf('onFoot', 'Escape'), ['pause']);
  input.rebind('onFoot', 'jump', ['KeyJ']);
  input.codeDown('Space');
  assert.ok(!input.held('jump'));
  input.codeDown('KeyJ');
  assert.ok(input.held('jump'));
  const exported = input.exportBindings();
  assert.deepEqual(exported.onFoot.jump, ['KeyJ']);
  exported.onFoot.jump.push('KeyK');
  assert.deepEqual(input.codesFor('jump'), ['KeyJ'], 'the export is a copy');
  assert.deepEqual(BINDINGS.onFoot.jump, ['Space'], 'the given bindings are not modified');
  assert.deepEqual(input.contexts(), ['onFoot', 'inVehicle', 'menu']);
  assert.ok(input.actionsIn('inVehicle').includes('handbrake'));
});

test('labels for codes', () => {
  assert.equal(describeInputCode('KeyE'), 'E');
  assert.equal(describeInputCode('Digit4'), '4');
  assert.equal(describeInputCode('ShiftLeft'), 'Shift');
  assert.equal(describeInputCode('Mouse2'), 'Right Mouse');
  assert.equal(describeInputCode('Mouse3'), 'Mouse 4');
  assert.equal(describeInputCode('F5'), 'F5');
  assert.equal(describeInputCode('Numpad7'), 'Num 7');
  assert.equal(describeInputCode('IntlBackslash'), 'Intl Backslash');
});
