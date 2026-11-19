// A body for the character tests: the rest joints of an adult in the A-pose, scaled to any
// height, as createBodyModel() would read them from a character file.
import { BONE, BONE_COUNT } from '../../../game/src/characters/skeleton/humanSkeleton.js';
import { createBodyModel } from '../../../game/src/characters/skeleton/bodyMeasurements.js';

/**
 * Builds the body model of a test person.
 * @param {number} [stature] Height in metres (1.78 is the reference adult).
 * @returns {import('../../../game/src/characters/skeleton/bodyMeasurements.js').BodyModel}
 */
export function createTestBody(stature = 1.78) {
  const k = stature / 1.78;
  const rest = new Float32Array(BONE_COUNT * 3);
  const put = (bone, x, y, z) => rest.set([x * k, y * k, z * k], bone * 3);
  put(BONE.ROOT, 0, 0, 0);
  put(BONE.HIPS, 0, 0.975, 0);
  put(BONE.SPINE, 0, 1.09, 0.005);
  put(BONE.CHEST, 0, 1.25, 0.01);
  put(BONE.NECK, 0, 1.49, 0);
  put(BONE.HEAD, 0, 1.6, -0.01);
  const armX = Math.cos(40 * Math.PI / 180), armY = -Math.sin(40 * Math.PI / 180);
  for (const side of [-1, 1]) {
    const arm = side < 0 ? BONE.SHOULDER_L : BONE.SHOULDER_R;
    put(arm, side * 0.03, 1.44, 0);
    put(arm + 1, side * 0.185, 1.43, 0);
    put(arm + 2, side * (0.185 + 0.3 * armX), 1.43 + 0.3 * armY, 0);
    put(arm + 3, side * (0.185 + 0.57 * armX), 1.43 + 0.57 * armY, 0);
    const leg = side < 0 ? BONE.THIGH_L : BONE.THIGH_R;
    put(leg, side * 0.09, 0.954, 0);
    put(leg + 1, side * 0.09, 0.504, -0.004);
    put(leg + 2, side * 0.09, 0.08, 0.012);
    put(leg + 3, side * 0.09, 0.016, -0.135);
  }
  return createBodyModel(rest, { stature });
}
