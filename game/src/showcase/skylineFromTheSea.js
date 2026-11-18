// The scale picture, scene `skyline-from-the-sea`: the city plan's `muelle_dorado` vantage out
// over the sea at golden hour, looking head-on at the beach, the hotel front on Bulevar Dorado
// and the towers of Centro behind, the water catching the low sun. The lead stands on the sand
// below so the city streams in around the view; the camera is held at the vantage.
import { cutCamera, groundAt, openScene, placeLead } from './showcaseStaging.js';

/** The vantage, its camera height and the height of the point it looks at (metres). */
const VANTAGE = Object.freeze({ id: 'muelle_dorado', eyeHeight: 26, lookHeight: 42, fieldOfView: 46, towards: 0.06 });

/**
 * Registers the skyline scene.
 * @param {object} context The game context.
 * @returns {() => void} Removes the scene again.
 */
export function registerSkylineFromTheSea(context) {
  return context.showcase.register({
    name: 'skyline-from-the-sea',
    title: 'Marazul from the sea at golden hour',
    description: 'The beach, the hotel front and the downtown towers across the water, from the Muelle Dorado vantage.',
    async run(game, tools) {
      openScene(game, { hours: 18.75, traffic: 1, crowd: 1.2 });
      const plan = game.systems.find('openWorldCity')?.plan;
      const vantage = plan?.vantagePoints?.find?.((each) => each.id === VANTAGE.id) ?? { x: 79, z: 1165, lookX: 238, lookZ: 226 };
      const dx = vantage.lookX - vantage.x;
      const dz = vantage.lookZ - vantage.z;
      const length = Math.hypot(dx, dz) || 1;
      // The lead on the beach a third of the way in, facing the city: streaming centres there.
      const beach = { x: vantage.x + dx * 0.24, z: vantage.z + dz * 0.24 };
      await placeLead(game, tools, beach, -Math.atan2(dx / length, -dz / length));
      tools.advance(2);
      const eye = { x: vantage.x - dx * VANTAGE.towards, y: VANTAGE.eyeHeight, z: vantage.z - dz * VANTAGE.towards };
      const lookGround = Math.max(0, groundAt(game, vantage.lookX, vantage.lookZ));
      cutCamera(game, eye, { x: vantage.lookX, y: lookGround + VANTAGE.lookHeight, z: vantage.lookZ }, VANTAGE.fieldOfView);
      tools.advance(0.2);
    },
  });
}
