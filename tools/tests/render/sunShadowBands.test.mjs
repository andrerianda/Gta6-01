// Tests of the sun's banded far shadow cascade (game/src/render/lighting/sunShadowRig.js): a
// cascade with a refresh interval above 1 draws one band of its map per frame into a back map,
// the bands of a cycle tile the whole map, the lit materials always sample the last complete
// front map with the matrix it was drawn with, and a cut redraws everything at once.
// Run with: node --test "tools/tests/render/*.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

const vendoredThree = new URL('../../../game/vendor/three/three.module.min.js', import.meta.url).href;
register(`data:text/javascript,${encodeURIComponent(
  `export async function resolve(s, c, n) { return s === 'three' ? { url: ${JSON.stringify(vendoredThree)}, shortCircuit: true } : n(s, c); }`,
)}`);
const THREE = await import('three');
const { createSunShadowRig, SHADOW_QUALITY } = await import('../../../game/src/render/lighting/sunShadowRig.js');

/** A stand-in renderer whose shadow pass records what each due light would draw. */
function makeRenderer() {
  const passes = [];
  const shadowMap = {
    enabled: false,
    type: null,
    render(lights) {
      const drawn = [];
      for (const light of lights) {
        const shadow = light.shadow;
        if (!shadow.needsUpdate) continue;
        if (shadow.map === null) {
          shadow.map = new THREE.WebGLRenderTarget(shadow.mapSize.x, shadow.mapSize.y);
          shadow.map.depthTexture = new THREE.DepthTexture(shadow.mapSize.x, shadow.mapSize.y);
        }
        shadow.updateMatrices(light);
        const viewport = shadow.getViewport(0);
        drawn.push({
          name: light.name,
          map: shadow.map,
          rows: [viewport.y * shadow.mapSize.y, (viewport.y + viewport.w) * shadow.mapSize.y],
          scissor: shadow.map.scissorTest ? [shadow.map.scissor.y, shadow.map.scissor.y + shadow.map.scissor.w] : null,
          matrix: shadow.matrix.clone(),
        });
        shadow.needsUpdate = false;
      }
      passes.push(drawn);
    },
  };
  return { shadowMap, capabilities: { maxTextureSize: 4096 }, passes };
}

function makeFrame(rig, renderer, camera) {
  const toward = new THREE.Vector3(0.3, 0.8, 0.2).normalize();
  const white = new THREE.Color(1, 1, 1);
  return (strength = 1) => {
    camera.updateMatrixWorld();
    rig.update(camera, toward, white, 3, 1, strength);
    const lights = rig.group.children.filter((child) => child.isDirectionalLight && child.castShadow);
    renderer.shadowMap.render(lights, null, camera);
    return renderer.passes[renderer.passes.length - 1];
  };
}

test('high: the far cascade draws one band per frame, tiling its map, after a full first frame', () => {
  const renderer = makeRenderer();
  const rig = createSunShadowRig(renderer, new THREE.Scene(), 'high');
  const camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.3, 3000);
  const frame = makeFrame(rig, renderer, camera);
  const far = rig.group.children.find((child) => child.name === 'marazul-key-cascade-2');
  const size = SHADOW_QUALITY.high.mapSizes[2];

  const first = frame().find((pass) => pass.name === far.name);
  assert.deepEqual(first.rows, [0, size], 'the first frame draws the whole far map');
  assert.equal(first.scissor, null);
  const front = far.shadow.map;
  const fullMatrix = far.shadow.matrix.clone();

  const rows = [];
  for (let i = 0; i < 3; i += 1) {
    camera.position.x += 1; // the camera moves; the cycle keeps its light where it started
    const pass = frame();
    const band = pass.find((entry) => entry.name === far.name);
    assert.ok(band, `frame ${i}: one far band is drawn every frame`);
    assert.notEqual(band.map, front, 'bands go into the back map');
    assert.deepEqual(band.scissor, band.rows, 'the clear and the draw are limited to the band');
    rows.push(band.rows);
    // Every cascade nearer than the far one is still drawn whole every frame.
    assert.equal(pass.filter((entry) => entry.name !== far.name).length, 2);
    if (i < 2) {
      assert.equal(far.shadow.map, front, 'materials sample the complete front map meanwhile');
      assert.ok(far.shadow.matrix.equals(fullMatrix), '... with the matrix it was drawn with');
    }
  }
  assert.deepEqual(rows.map((r) => r[0]), [0, Math.round(size / 3), Math.round((2 * size) / 3)]);
  for (let i = 1; i < rows.length; i += 1) assert.equal(rows[i][0], rows[i - 1][1], 'bands meet without a gap');
  assert.equal(rows[2][1], size);
  assert.notEqual(far.shadow.map, front, 'after the last band the back map becomes the front');
  assert.ok(!far.shadow.matrix.equals(fullMatrix), 'and its own matrix is sampled');
  rig.dispose();
});

test('moon key (strength 0): no shadow is drawn or shaded; the sun back redraws every cascade whole', () => {
  const renderer = makeRenderer();
  const rig = createSunShadowRig(renderer, new THREE.Scene(), 'high');
  const camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.3, 3000);
  const frame = makeFrame(rig, renderer, camera);
  const nightStart = frame(0);
  assert.equal(nightStart.length, 3, 'a game that starts at night still creates every map once');
  for (const light of rig.group.children.filter((child) => child.castShadow)) assert.notEqual(light.shadow.map, null);
  frame();
  frame();
  for (let i = 0; i < 4; i += 1) assert.equal(frame(0).length, 0, 'no shadow map is drawn under the moon');
  const cascades = rig.group.children.filter((child) => child.isDirectionalLight && child.castShadow);
  assert.equal(cascades.length, 3, 'the cascades keep casting (no shader recompile at dusk)');
  for (const light of cascades) assert.equal(light.shadow.intensity, 0, `${light.name} shades nothing`);
  const back = frame(1);
  assert.equal(back.length, 3);
  for (const pass of back) assert.deepEqual(pass.rows, [0, pass.map.height], `${pass.name} is redrawn whole`);
  for (const light of cascades) assert.equal(light.shadow.intensity, 1);
  rig.dispose();
});

test('a cut redraws the whole far map at once; the off and low levels have no bands', () => {
  const renderer = makeRenderer();
  const rig = createSunShadowRig(renderer, new THREE.Scene(), 'ultra');
  const camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.3, 3000);
  const frame = makeFrame(rig, renderer, camera);
  frame();
  const steady = frame();
  assert.equal(steady.length, 4, 'ultra: two whole near maps and one band of each far cascade');
  for (const pass of steady.filter((entry) => /cascade-[23]$/.test(entry.name))) {
    assert.ok(pass.scissor && pass.rows[1] - pass.rows[0] < SHADOW_QUALITY.ultra.mapSizes[3], `${pass.name} draws a band`);
  }
  rig.invalidate();
  const cut = frame();
  assert.equal(cut.length, 4);
  for (const pass of cut) assert.deepEqual(pass.rows, [0, pass.map.height], `${pass.name} is drawn whole after a cut`);
  rig.setQuality('low');
  const low = frame();
  assert.equal(low.length, 1);
  assert.equal(low[0].scissor, null);
  rig.dispose();
  assert.notEqual(renderer.shadowMap.render.name, 'renderShadowMapsInBands', 'dispose unwraps the shadow pass');
});
