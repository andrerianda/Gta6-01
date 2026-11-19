// Tests of the run-time surface toolkit: every catalogue surface paints, tiles, repeats exactly
// for a seed, keeps physically plausible values, and can be generated in slices; plus the noise,
// normal-from-height and packed occlusion-roughness-metalness building blocks.
//
//   node --test "tools/tests/textures/*.test.mjs"

import assert from 'node:assert/strict';
import test from 'node:test';

import { createFractalNoiseField } from '../../../game/src/render/textures/noise/fractalNoise.js';
import { tileableGradientNoise2D } from '../../../game/src/render/textures/noise/gradientNoise.js';
import { createCellularNoiseFields } from '../../../game/src/render/textures/noise/cellularNoise.js';
import { createSurfaceJob, generateSurfaceMaps, listSurfaceNames, resolveSurfaceRequest, SURFACE_CATALOG } from '../../../game/src/render/textures/surfaces/surfaceCatalog.js';
import { packNormalMap, packOrmMap } from '../../../game/src/render/textures/surfaces/surfaceMapPacking.js';
import { resolveTextureSize, setTextureDetailScale } from '../../../game/src/render/textures/textureQuality.js';

const SMALL = 128;
const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Mean absolute difference between two columns (or rows) of an RGBA8 map, over R, G and B. */
function lineDifference(pixels, size, a, b, vertical) {
  let sum = 0;
  for (let i = 0; i < size; i += 1) {
    const p = (vertical ? i * size + a : a * size + i) * 4;
    const q = (vertical ? i * size + b : b * size + i) * 4;
    sum += Math.abs(pixels[p] - pixels[q]) + Math.abs(pixels[p + 1] - pixels[q + 1]) + Math.abs(pixels[p + 2] - pixels[q + 2]);
  }
  return sum / (size * 3);
}

test('tiling noise repeats at its period and has the documented spread', () => {
  for (const [x, y] of [[0.3, 1.7], [5.25, 2.5], [7.9, 7.1]]) {
    assert.ok(Math.abs(tileableGradientNoise2D(x, y, 8, 5) - tileableGradientNoise2D(x + 8, y - 8, 8, 5)) < 1e-6);
  }
  const field = createFractalNoiseField(128, { period: 4, octaves: 5, seed: 9 });
  let mean = 0;
  let square = 0;
  for (const value of field) {
    mean += value;
    square += value * value;
  }
  mean /= field.length;
  const deviation = Math.sqrt(square / field.length - mean * mean);
  assert.ok(Math.abs(mean) < 0.1, `mean ${mean}`);
  assert.ok(deviation > 0.2 && deviation < 0.45, `deviation ${deviation}`);
  const ridged = createFractalNoiseField(64, { period: 4, octaves: 3, seed: 9, shape: 'ridged' });
  assert.ok(ridged.every((value) => value >= -1e-4 && value <= 1.0001));
  const cells = createCellularNoiseFields(64, { period: 6, seed: 3 });
  for (let i = 0; i < cells.nearest.length; i += 97) assert.ok(cells.nearest[i] <= cells.second[i] + 1e-6);
});

test('a height field becomes a tangent-space normal map that leans away from the rise', () => {
  const size = 16;
  const height = new Float32Array(size * size);
  // A ridge along y: rising to the middle column, falling after it (1 cm per 1 cm texel).
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) height[y * size + x] = 0.01 * (x < 8 ? x : 16 - x);
  const normal = packNormalMap(height, size, 0.01, 1);
  const rising = (4 * size + 4) * 4;
  const falling = (4 * size + 12) * 4;
  assert.ok(normal[rising] < 60, `rising slope should lean to -x, got ${normal[rising]}`);
  assert.ok(normal[falling] > 195, `falling slope should lean to +x, got ${normal[falling]}`);
  assert.ok(Math.abs(normal[rising + 1] - 128) <= 2 && normal[rising + 2] > 128 && normal[rising + 3] === 255);
  const flat = packNormalMap(new Float32Array(16), 4, 0.01, 1);
  assert.deepEqual([...flat.slice(0, 4)], [128, 128, 255, 255]);
});

test('occlusion, roughness and metalness pack into R, G and B', () => {
  const packed = packOrmMap(new Float32Array([1, 0.5]), new Float32Array([0.8, 0]), 1);
  assert.deepEqual([...packed.pixels], [255, 204, 255, 255, 128, 8, 255, 255]);
  assert.ok(Math.abs(packed.averageMetalness - 1) < 1e-6);
});

test('every catalogue surface paints complete, plausible, seamless maps', () => {
  for (const name of listSurfaceNames()) {
    const maps = generateSurfaceMaps(name, { size: SMALL });
    const count = SMALL * SMALL * 4;
    assert.equal(maps.size, SMALL, name);
    for (const key of ['color', 'normal', 'orm']) assert.equal(maps[key].length, count, `${name} ${key}`);
    assert.equal(Boolean(maps.emissive), Boolean(SURFACE_CATALOG[name].emissive), `${name} emissive`);
    assert.equal(maps.hasAlpha, Boolean(SURFACE_CATALOG[name].decal), `${name} alpha`);
    let darkest = 255;
    let brightest = 0;
    for (let i = 0; i < count; i += 4) {
      const level = Math.max(maps.color[i], maps.color[i + 1], maps.color[i + 2]);
      if (level < darkest) darkest = level;
      if (level > brightest) brightest = level;
      assert.ok(maps.normal[i + 2] >= 128, `${name}: a normal points into the surface`);
    }
    assert.ok(darkest >= 20, `${name}: pure black texel (${darkest})`);
    assert.ok(brightest <= 248, `${name}: pure white texel (${brightest})`);
    assert.ok(maps.averageRoughness > 0.03 && maps.averageRoughness <= 1, `${name} roughness`);
    if (SURFACE_CATALOG[name].decal) continue;
    for (const [map, label] of [[maps.color, 'colour'], [maps.normal, 'normal']]) {
      for (const vertical of [true, false]) {
        const seam = lineDifference(map, SMALL, 0, SMALL - 1, vertical);
        // The seam may be as sharp as the sharpest neighbouring lines inside the tile (a joint
        // or a window frame can lie on the edge), never sharper.
        let inside = 0;
        for (let line = 1; line < SMALL; line += 1) inside = Math.max(inside, lineDifference(map, SMALL, line - 1, line, vertical));
        assert.ok(seam <= inside * 1.25 + 3, `${name} ${label} seam ${seam.toFixed(1)} against ${inside.toFixed(1)} inside`);
      }
    }
  }
});

test('surfaces are deterministic for a seed and differ between seeds', () => {
  for (const name of ['asphaltOld', 'pavingSlabs', 'grass', 'markingCrosswalk']) {
    const first = generateSurfaceMaps(name, { size: SMALL, seed: 4 });
    const again = generateSurfaceMaps(name, { size: SMALL, seed: 4 });
    const other = generateSurfaceMaps(name, { size: SMALL, seed: 5 });
    assert.deepEqual(first.color, again.color, name);
    assert.deepEqual(first.normal, again.normal, name);
    assert.notDeepEqual(first.color, other.color, name);
  }
});

test('measured values: asphalt is dark and rough, glazing is a smooth metal', () => {
  for (const name of ['asphalt', 'asphaltFresh', 'asphaltOld', 'asphaltPatched']) {
    const maps = generateSurfaceMaps(name, { size: 256 });
    const albedo = luminance(maps.averageColor);
    assert.ok(albedo >= 0.075 && albedo <= 0.125, `${name} albedo ${albedo.toFixed(3)}`);
    assert.ok(maps.averageRoughness >= 0.74 && maps.averageRoughness <= 0.86, `${name} roughness ${maps.averageRoughness.toFixed(2)}`);
    assert.equal(maps.averageMetalness, 0);
  }
  const glass = generateSurfaceMaps('curtainWall', { size: SMALL });
  assert.ok(glass.averageMetalness > 0.8 && glass.averageRoughness < 0.2);
  const lawn = generateSurfaceMaps('grass', { size: SMALL });
  assert.ok(lawn.averageColor[1] > lawn.averageColor[0] && lawn.averageColor[1] > lawn.averageColor[2]);
});

test('generation can be sliced, and slices give the same maps', () => {
  const whole = generateSurfaceMaps('pavingSlabs', { size: SMALL, seed: 2 });
  const job = createSurfaceJob('pavingSlabs', { size: SMALL, seed: 2 });
  let steps = 1;
  while (!job.step(0)) steps += 1;
  assert.ok(steps >= 4, `only ${steps} slices`);
  assert.deepEqual(job.maps.color, whole.color);
  assert.deepEqual(job.maps.orm, whole.orm);
  const cancelled = createSurfaceJob('sand', { size: SMALL });
  cancelled.step(0);
  cancelled.cancel();
  assert.equal(cancelled.done, true);
});

test('requests have stable cache keys and obey the global detail scale', () => {
  const a = resolveSurfaceRequest('asphalt', { seed: 3, age: 0.4, stains: 0.2 });
  const b = resolveSurfaceRequest('asphalt', { stains: 0.2, age: 0.4, seed: 3 });
  assert.equal(a.key, b.key);
  assert.notEqual(a.key, resolveSurfaceRequest('asphalt', { seed: 4, age: 0.4, stains: 0.2 }).key);
  assert.equal(a.size, 1024);
  setTextureDetailScale(0.5);
  try {
    assert.equal(resolveTextureSize(512), 256);
    assert.equal(resolveSurfaceRequest('asphalt').size, 512);
    assert.notEqual(resolveSurfaceRequest('asphalt', { seed: 3, age: 0.4, stains: 0.2 }).key, a.key);
  } finally {
    setTextureDetailScale(1);
  }
  assert.throws(() => resolveSurfaceRequest('noSuchSurface'), /unknown surface/);
});

test('road markings are decals whose coverage follows the shape and the wear', () => {
  const coverage = (name, options) => {
    const maps = generateSurfaceMaps(name, { size: SMALL, ...options });
    let sum = 0;
    for (let i = 3; i < maps.color.length; i += 4) sum += maps.color[i];
    return { maps, mean: sum / (SMALL * SMALL * 255) };
  };
  const fresh = coverage('markingSolidLine', { wear: 0 });
  const worn = coverage('markingSolidLine', { wear: 0.9 });
  assert.ok(fresh.maps.hasAlpha);
  assert.equal(fresh.maps.tileMetres, 4);
  assert.equal(fresh.maps.tileMetresY, 0.3);
  assert.ok(fresh.mean > 0.42 && fresh.mean < 0.52, `fresh line covers ${fresh.mean.toFixed(3)}`);
  assert.ok(worn.mean < fresh.mean * 0.75 && worn.mean > 0.05, `worn line covers ${worn.mean.toFixed(3)}`);
  const dashes = coverage('markingDashedLine', { wear: 0 });
  assert.equal(dashes.maps.tileMetres, 9);
  assert.ok(Math.abs(dashes.mean - 0.5 / 3) < 0.03, `dashes cover ${dashes.mean.toFixed(3)}`);
  const zebra = coverage('markingCrosswalk', { wear: 0 });
  assert.ok(Math.abs(zebra.mean - 0.5 * (2.9 / 3)) < 0.04, `zebra covers ${zebra.mean.toFixed(3)}`);
  const yellow = coverage('markingDoubleYellow', {});
  assert.ok(yellow.maps.averageColor[0] > yellow.maps.averageColor[2] * 3, 'double line is yellow');
  for (const turn of ['straight', 'left', 'right']) assert.ok(coverage('markingArrow', { turn, wear: 0 }).mean > 0.08, turn);
});
