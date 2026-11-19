// Measures the place around the listener for its echo: one ray a frame, round robin, against
// the static world (eight level directions at ear height out to 60 m, then one straight up),
// and after each full turn hands the distances to streetAcoustics() and the result to the
// mixer's slap and reverb. Nine frames per measurement; no allocation per frame.
import { LAYER } from '../physics/collisionLayers.js';
import { createQueryHit } from '../physics/collision/worldQueries.js';
import { ACOUSTIC_RAY_COUNT, ACOUSTIC_REACH, createAcoustics, streetAcoustics } from './streetAcoustics.js';

const MASK = LAYER.STATIC | (LAYER.SEE_THROUGH ?? 0);
const DIRECTIONS = new Float32Array(ACOUSTIC_RAY_COUNT * 2);
for (let i = 0; i < ACOUSTIC_RAY_COUNT; i += 1) {
  DIRECTIONS[i * 2] = Math.sin((i / ACOUSTIC_RAY_COUNT) * Math.PI * 2);
  DIRECTIONS[i * 2 + 1] = Math.cos((i / ACOUSTIC_RAY_COUNT) * Math.PI * 2);
}

/**
 * Creates the probe.
 * @param {object} context The game context (systems.find('physics').raycast).
 * @param {ReturnType<import('./audioMixer.js').createAudioMixer>} mixer
 */
export function createAcousticProbe(context, mixer) {
  const distances = new Float32Array(ACOUSTIC_RAY_COUNT).fill(ACOUSTIC_REACH);
  const hit = createQueryHit();
  const acoustics = createAcoustics();
  let ceiling = Infinity;
  let index = 0;
  let measured = 0;

  return {
    /** The last measurement (createAcoustics fields). */
    acoustics,
    /** How many full measurements were made (tests, debug). */
    get measured() { return measured; },

    /** One ray this frame; after the ninth, the mixer gets the place's echo. */
    update(place) {
      const physics = context.systems.find('physics');
      if (!physics?.raycast) return;
      const p = mixer.listenerPosition;
      if (index < ACOUSTIC_RAY_COUNT) {
        const dx = DIRECTIONS[index * 2], dz = DIRECTIONS[index * 2 + 1];
        distances[index] = physics.raycast(p.x, p.y, p.z, dx, 0, dz, ACOUSTIC_REACH, MASK, null, hit) ? hit.distance : ACOUSTIC_REACH;
        index += 1;
        return;
      }
      ceiling = physics.raycast(p.x, p.y + 0.3, p.z, 0, 1, 0, 40, MASK, null, hit) ? hit.distance : Infinity;
      index = 0;
      streetAcoustics(acoustics, distances, ceiling, place);
      mixer.setAcoustics(acoustics);
      measured += 1;
    },
  };
}
