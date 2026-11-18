// Who is heard walking: listens to the character run-time's 'footstrike' events of the lead's
// figure and of the few pedestrians nearest the listener (re-chosen twice a second), finds the
// surface under each foot (the street cross-section, else the plan's ground) and plays the step.
import { createFootstepSounds, footstepSurfaceOf } from './footstepSounds.js';

const CROWD_VOICES = 6;
const CROWD_RANGE = 18;
const CHOOSE_SECONDS = 0.5;

/**
 * @param {object} context The game context.
 * @param {ReturnType<import('./audioMixer.js').createAudioMixer>} mixer
 * @param {ReturnType<import('./synthesisVoices.js').createSynthesisVoices>} synth
 */
export function createFootstepTracker(context, mixer, synth) {
  const steps = createFootstepSounds(mixer, synth);
  const street = {};
  let wetness = 0;

  const surfaceAt = (x, z) => {
    const city = context.systems.find('openWorldCity');
    if (!city) return 'concrete';
    const s = city.surfaceAt?.(x, z, street);
    const kind = s ? s.kind : null;
    const ground = !kind || kind === 'ground' ? city.plan?.surfaceAt?.(x, z) ?? null : null;
    return footstepSurfaceOf(kind, s ? s.planted : false, ground);
  };

  const onLeadStep = (e) => steps.play(e, surfaceAt(e.x, e.z), e.run ?? 0, wetness, true);
  const onCrowdStep = (e) => {
    const p = mixer.listenerPosition;
    const dx = e.x - p.x;
    const dz = e.z - p.z;
    if (dx * dx + dz * dz > CROWD_RANGE * CROWD_RANGE * 1.4) return;
    steps.play(e, surfaceAt(e.x, e.z), e.run ?? 0, wetness, false);
  };

  let leadWalker = null;
  let leadStop = null;
  // The crowd's subscribed walkers: parallel fixed arrays.
  const heardWalkers = new Array(CROWD_VOICES).fill(null);
  const heardStops = new Array(CROWD_VOICES).fill(null);
  const chosen = new Array(CROWD_VOICES).fill(null);
  const chosenDistance = new Float64Array(CROWD_VOICES);
  let chooseTimer = 0;

  const chooseCrowd = () => {
    const crowd = context.systems.find('pedestrians');
    const people = crowd?.people ?? [];
    const p = mixer.listenerPosition;
    let count = 0;
    for (let i = 0; i < people.length; i += 1) {
      const person = people[i];
      const walker = person?.body?.walker;
      if (!walker || typeof walker.on !== 'function') continue;
      const d = (person.x - p.x) ** 2 + (person.z - p.z) ** 2;
      if (d > CROWD_RANGE * CROWD_RANGE) continue;
      // Keep the nearest CROWD_VOICES (insertion into a small sorted list).
      let at = count < CROWD_VOICES ? count : CROWD_VOICES - 1;
      if (count >= CROWD_VOICES && d >= chosenDistance[at]) continue;
      while (at > 0 && chosenDistance[at - 1] > d) {
        chosen[at] = chosen[at - 1];
        chosenDistance[at] = chosenDistance[at - 1];
        at -= 1;
      }
      chosen[at] = walker;
      chosenDistance[at] = d;
      if (count < CROWD_VOICES) count += 1;
    }
    for (let i = count; i < CROWD_VOICES; i += 1) chosen[i] = null;
    // Drop walkers no longer chosen, then subscribe the new ones.
    for (let i = 0; i < CROWD_VOICES; i += 1) {
      const w = heardWalkers[i];
      if (w && chosen.indexOf(w) < 0) {
        heardStops[i]?.();
        heardWalkers[i] = null;
        heardStops[i] = null;
      }
    }
    for (let i = 0; i < count; i += 1) {
      const w = chosen[i];
      if (heardWalkers.indexOf(w) >= 0) continue;
      const free = heardWalkers.indexOf(null);
      if (free < 0) break;
      heardWalkers[free] = w;
      heardStops[free] = w.on('footstrike', onCrowdStep);
    }
  };

  return {
    /** @param {number} dt @param {number} wet the atmosphere's wetness, 0..1 */
    update(dt, wet) {
      wetness = wet;
      const walker = context.systems.find('player')?.figure?.walker ?? null;
      if (walker !== leadWalker) {
        leadStop?.();
        leadStop = walker && typeof walker.on === 'function' ? walker.on('footstrike', onLeadStep) : null;
        leadWalker = walker;
      }
      chooseTimer -= dt;
      if (chooseTimer <= 0) {
        chooseTimer = CHOOSE_SECONDS;
        chooseCrowd();
      }
    },

    dispose() {
      leadStop?.();
      for (const stop of heardStops) stop?.();
    },
  };
}
