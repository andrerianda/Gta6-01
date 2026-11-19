// The terrain as the physics sees it: a wrapper around the ground provider the city supplies (a
// height at any x, z, and optionally a normal, a surface type and a wetness), adding what the
// simulation needs on top: a normal from finite differences when the provider has none, surface
// ids, and ray casts against the height field.
import { surfaceIdOf } from '../surfaceTypes.js';

/**
 * What the city gives the physics for the terrain.
 * @typedef {object} GroundProvider
 * @property {(x: number, z: number) => number} heightAt The ground height in metres.
 * @property {(x: number, z: number, out: {x: number, y: number, z: number}) => unknown} [normalAt]
 *   Writes the unit surface normal into `out`.
 * @property {(x: number, z: number) => number | string} [surfaceAt] The SURFACE id or name.
 * @property {number} [wetness] 0 dry to 1 soaked; read every step, so it may change.
 */

const NORMAL_STEP = 0.3;

export class GroundSurface {
  /**
   * @param {GroundProvider} [provider] The terrain; a flat plane at y = 0 when missing.
   */
  constructor(provider) {
    /** The provider in use. */
    this.provider = provider ?? { heightAt: () => 0 };
    this.hasNormal = typeof this.provider.normalAt === 'function';
    this.hasSurface = typeof this.provider.surfaceAt === 'function';
  }

  /**
   * @param {number} x World X.
   * @param {number} z World Z.
   * @returns {number} The ground height.
   */
  heightAt(x, z) {
    return this.provider.heightAt(x, z);
  }

  /**
   * Writes the unit ground normal at a position.
   * @param {number} x World X.
   * @param {number} z World Z.
   * @param {{x: number, y: number, z: number}} out Receives the normal.
   * @returns {{x: number, y: number, z: number}} `out`.
   */
  normalAt(x, z, out) {
    if (this.hasNormal) {
      this.provider.normalAt(x, z, out);
      return out;
    }
    const provider = this.provider;
    const slopeX = (provider.heightAt(x + NORMAL_STEP, z) - provider.heightAt(x - NORMAL_STEP, z)) / (2 * NORMAL_STEP);
    const slopeZ = (provider.heightAt(x, z + NORMAL_STEP) - provider.heightAt(x, z - NORMAL_STEP)) / (2 * NORMAL_STEP);
    const inverse = 1 / Math.sqrt(slopeX * slopeX + 1 + slopeZ * slopeZ);
    out.x = -slopeX * inverse;
    out.y = inverse;
    out.z = -slopeZ * inverse;
    return out;
  }

  /**
   * @param {number} x World X.
   * @param {number} z World Z.
   * @returns {number} The SURFACE id of the ground there.
   */
  surfaceAt(x, z) {
    return this.hasSurface ? surfaceIdOf(this.provider.surfaceAt(x, z)) : 0;
  }

  /** How wet the ground is, 0 to 1. */
  get wetness() {
    const wetness = this.provider.wetness;
    return typeof wetness === 'number' ? wetness : 0;
  }

  /**
   * Casts a ray against the height field. A ray that starts below the ground hits nothing.
   * @param {number} ox Ray origin.
   * @param {number} oy
   * @param {number} oz
   * @param {number} dx Ray direction (unit).
   * @param {number} dy
   * @param {number} dz
   * @param {number} maxT The furthest distance that counts.
   * @param {import('./rayShapes.js').RayShapeHit} out Receives the distance and the normal.
   * @returns {boolean} True on a hit.
   */
  raycast(ox, oy, oz, dx, dy, dz, maxT, out) {
    const provider = this.provider;
    let t = 0;
    let gap = oy - provider.heightAt(ox, oz);
    if (gap < 0) return false;
    for (let i = 0; i < 400 && t < maxT; i += 1) {
      // Terrain is never steeper than about 60 degrees, so half the clearance is a safe stride.
      let stride = gap * 0.5;
      if (stride < 0.5) stride = 0.5;
      else if (stride > 24) stride = 24;
      let next = t + stride;
      if (next > maxT) next = maxT;
      const nextGap = oy + dy * next - provider.heightAt(ox + dx * next, oz + dz * next);
      if (nextGap <= 0) {
        // The surface lies between t and next: close in on it.
        let low = t;
        let high = next;
        let lowGap = gap;
        let highGap = nextGap;
        for (let k = 0; k < 6; k += 1) {
          const middle = lowGap - highGap > 1e-12 ? low + (high - low) * (lowGap / (lowGap - highGap)) : (low + high) * 0.5;
          const middleGap = oy + dy * middle - provider.heightAt(ox + dx * middle, oz + dz * middle);
          if (middleGap > 0) {
            low = middle;
            lowGap = middleGap;
          } else {
            high = middle;
            highGap = middleGap;
          }
          if (middleGap > -1e-4 && middleGap < 1e-4) break;
        }
        out.t = lowGap - highGap > 1e-12 ? low + (high - low) * (lowGap / (lowGap - highGap)) : high;
        this.normalAt(ox + dx * out.t, oz + dz * out.t, scratchNormal);
        out.nx = scratchNormal.x;
        out.ny = scratchNormal.y;
        out.nz = scratchNormal.z;
        return true;
      }
      t = next;
      gap = nextGap;
    }
    return false;
  }

  /**
   * A short ray for a wheel or a foot: assumes the ground is smooth over the ray's length, and
   * reports distance 0 when the origin is already under the ground.
   * @returns {boolean} True on a hit within `maxT`.
   */
  castShort(ox, oy, oz, dx, dy, dz, maxT, out) {
    const provider = this.provider;
    const startGap = oy - provider.heightAt(ox, oz);
    let t = 0;
    if (startGap > 0) {
      const endGap = oy + dy * maxT - provider.heightAt(ox + dx * maxT, oz + dz * maxT);
      if (endGap > 0) return false;
      t = maxT * (startGap / (startGap - endGap));
      const middleGap = oy + dy * t - provider.heightAt(ox + dx * t, oz + dz * t);
      // One secant step from whichever side the first guess landed on.
      if (middleGap > 1e-4) t += (maxT - t) * (middleGap / (middleGap - endGap));
      else if (middleGap < -1e-4) t *= startGap / (startGap - middleGap);
    }
    out.t = t;
    this.normalAt(ox + dx * t, oz + dz * t, scratchNormal);
    out.nx = scratchNormal.x;
    out.ny = scratchNormal.y;
    out.nz = scratchNormal.z;
    return true;
  }
}

const scratchNormal = { x: 0, y: 1, z: 0 };
