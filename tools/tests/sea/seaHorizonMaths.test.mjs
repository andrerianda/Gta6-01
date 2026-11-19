// The numbers of the open sea and the sky from altitude (game/src/render/sea/seaHorizonMaths.js).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ALOFT_HEIGHT, CLOUD_DECK_HEIGHT, FAR_PLANE_ALOFT, FAR_PLANE_CAP, PLANET_RADIUS_METRES,
  airAboveShare, describeAltitude, farPlaneMetres, hazeAmount, hazeOpticalDepth, horizonDistanceMetres,
  horizonDropRadians, nearPlaneMetres, seaDiscScale, seaReachMetres,
} from '../../../game/src/render/sea/seaHorizonMaths.js';

const DEGREES = 180 / Math.PI;
const HEIGHTS = [0, 2, 30, 60, 150, 300, 1000, 3000, 8000, 12000, 22000, 25000];

test('the horizon is where a round planet puts it', () => {
  assert.equal(horizonDistanceMetres(0), 0);
  assert.ok(Math.abs(horizonDistanceMetres(22000) - Math.sqrt(2 * PLANET_RADIUS_METRES * 22000)) < 1e-6);
  // tan(dip) = distance / radius, once the easing near the ground is over.
  for (const h of [300, 3000, 12000, 22000]) {
    assert.ok(Math.abs(Math.tan(horizonDropRadians(h)) - horizonDistanceMetres(h) / PLANET_RADIUS_METRES) < 1e-9);
  }
  assert.ok(Math.abs(horizonDropRadians(12000) * DEGREES - 4.43) < 0.05);
  assert.ok(Math.abs(horizonDropRadians(22000) * DEGREES - 5.99) < 0.05);
});

test('the horizon does not drop at street level and sinks steadily with height', () => {
  assert.equal(horizonDropRadians(0), 0);
  assert.ok(horizonDropRadians(2) * DEGREES < 0.001);
  assert.ok(horizonDropRadians(30) * DEGREES < 0.03);
  let previous = -1;
  for (const h of HEIGHTS) {
    const drop = horizonDropRadians(h);
    assert.ok(drop >= previous, `drop grows at ${h}`);
    previous = drop;
  }
});

test('the flat sea meets the horizon cone half way to the tangent point, inside the far plane', () => {
  for (const h of [300, 3000, 12000, 25000]) {
    const reach = seaReachMetres(h);
    assert.ok(Math.abs(reach - h / Math.tan(horizonDropRadians(h))) < reach * 1e-9);
    assert.ok(Math.abs(reach - horizonDistanceMetres(h) / 2) < 1e-6);
    assert.ok(farPlaneMetres(h, false, 9000) > Math.hypot(h, reach) * 1.05, `far plane holds the sea at ${h}`);
  }
});

test('the far plane is the ordinary one in the streets and at least 30 km aloft or out at sea', () => {
  assert.equal(farPlaneMetres(0, false, 9000), 9000);
  assert.equal(farPlaneMetres(ALOFT_HEIGHT, false, 9000), 9000);
  assert.ok(farPlaneMetres(ALOFT_HEIGHT + 1, false, 9000) >= FAR_PLANE_ALOFT);
  assert.ok(farPlaneMetres(1.7, true, 9000) >= FAR_PLANE_ALOFT);
  let previous = 0;
  for (const h of HEIGHTS.filter((height) => height > ALOFT_HEIGHT)) {
    const far = farPlaneMetres(h, false, 9000);
    assert.ok(far >= 30000 && far <= FAR_PLANE_CAP && far >= previous);
    previous = far;
  }
  assert.ok(farPlaneMetres(25000, true, 9000) < 260000);
  assert.equal(farPlaneMetres(Number.NaN, false, 9000), 9000);
});

test('the near plane keeps a cockpit and grows only when the camera is clear of the ground', () => {
  assert.equal(nearPlaneMetres(0.06, 22000), 0.06);
  assert.equal(nearPlaneMetres(0.25, 10), 0.25);
  assert.equal(nearPlaneMetres(0.25, 22000), 1);
  assert.equal(nearPlaneMetres(2.4, 22000), 2.4);
  assert.ok(nearPlaneMetres(0.3, 200) > 0.3 && nearPlaneMetres(0.3, 200) < 1);
});

test('the sea disc keeps its size near the ground and reaches the horizon aloft', () => {
  const radius = 7570;
  assert.equal(seaDiscScale(0, radius), 1);
  assert.equal(seaDiscScale(20, radius), 1);
  for (const h of [300, 3000, 12000, 25000]) {
    assert.ok(seaDiscScale(h, radius) * radius > seaReachMetres(h));
    assert.ok(seaDiscScale(h, radius) * radius < farPlaneMetres(h, false, 9000));
  }
});

test('the haze matches the ground formula at street level and thins aloft', () => {
  const density = 0.0004;
  const scale = 260;
  // On the ground: the dense layer plus the uniform 0.22 of the haze pass.
  const ground = hazeOpticalDepth(1000, 0, 0, density, scale);
  assert.ok(Math.abs(ground - density * 1000 * 1.22) < 1e-9);
  // Monotonic in distance, 0..1.
  let previous = 0;
  for (const d of [0, 500, 2000, 6000, 14000, 60000, 200000]) {
    const amount = hazeAmount(d, 300, density, scale);
    assert.ok(amount >= previous && amount >= 0 && amount <= 1);
    previous = amount;
  }
  // Ships at 6 km are veiled but there, the island at 14 km is a faint shape, from low level.
  assert.ok(hazeAmount(6000, 300, density, scale) > 0.5 && hazeAmount(6000, 300, density, scale) < 0.95);
  assert.ok(hazeAmount(14000, 300, density, scale) > 0.9);
  // Straight down from 22 km the sea is not drowned, while the horizon is.
  assert.ok(hazeAmount(22000, 22000, density, scale) < 0.5);
  assert.ok(hazeAmount(Math.hypot(22000, seaReachMetres(22000)), 22000, density, scale) > 0.93);
  // No jump where the upper layer blends in.
  assert.ok(Math.abs(hazeAmount(8000, 59, density, scale) - hazeAmount(8000, 61, density, scale)) < 0.01);
});

test('the sky thins with height: unchanged near the ground, blue-black at 22 km', () => {
  assert.equal(airAboveShare(0), 1);
  assert.equal(airAboveShare(150), 1);
  assert.ok(airAboveShare(3000) < 0.75 && airAboveShare(3000) > 0.6);
  assert.ok(airAboveShare(12000) < 0.25);
  assert.ok(airAboveShare(22000) < 0.07);
});

test('the altitude record is the ground look at street level and crosses the cloud deck once', () => {
  const ground = describeAltitude(1.7);
  assert.equal(ground.airAbove, 1);
  assert.equal(ground.highAir, 0);
  assert.equal(ground.farCalm, 0);
  assert.equal(ground.cloudsFromBelow, 1);
  assert.equal(ground.cloudsFromAbove, 0);
  assert.equal(ground.cirrusFromBelow, 1);
  assert.ok(ground.horizonSine < 1e-6);
  // Never both layers at once, and neither while the camera is inside the deck.
  for (let h = 0; h <= 4000; h += 50) {
    const look = describeAltitude(h);
    assert.ok(look.cloudsFromBelow === 0 || look.cloudsFromAbove === 0);
  }
  const inside = describeAltitude(CLOUD_DECK_HEIGHT);
  assert.equal(inside.cloudsFromBelow + inside.cloudsFromAbove, 0);
  const high = describeAltitude(22000);
  assert.equal(high.cloudsFromAbove, 1);
  assert.equal(high.cirrusFromBelow, 0);
  assert.ok(Math.abs(high.horizonSine - Math.sin(horizonDropRadians(22000))) < 1e-12);
  // The record is reused, not allocated.
  assert.equal(describeAltitude(100, high), high);
});
