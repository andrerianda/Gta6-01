// The Norvast island: the rocky island of the invented Federasi Norvast far out at sea
// (catalog/seaAndAirspaceChart.js), with a hidden airstrip between its cliffs. It is its own
// streamed zone: nothing of it exists while the world flag sea.open is false; with the flag set
// it is a faint shape in the horizon haze from far away, and inside the chart's stream radius
// its ground, airfield, hangar and garrison load through the job queue (world/island/).
//
// Members (valid from init()):
//   loaded            true while the full zone is in the world (SEA_ZONE_LOADED / _UNLOADED)
//   visible           true while anything of the island is drawn (the far shape or the zone)
//   groundHeightAt(x, z) -> metres over the sea, or null beyond the island or while the sea is closed
//   strip             { x0, z0, x1, z1, y, width, length, heading }; end 0 is the eastern threshold
//   hangar            { x, z, heading } the camouflage-net hangar on the apron
//   handoverPoint     { x, y, z } on the apron in front of the hangar
// Staging: ?stage=island sets sea.open (and, without ?aircraft, puts the lead on the apron).
import { WORLD_FLAGS } from '../core/state/worldFlags.js';

/**
 * Creates the Norvast island system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem & Record<string, any>}
 */
export function createNorvastIslandSystem(context) {
  let zone = null;

  const system = {
    name: 'norvastIsland',
    dependsOn: ['openWorldCity'],
    runsWhen: /** @type {'always'} */ ('always'),
    strip: null,
    hangar: null,
    handoverPoint: null,
    get loaded() { return zone ? zone.loaded : false; },
    get visible() { return zone ? zone.visible : false; },
    /** 'off' | 'far' | 'loading' | 'loaded' (diagnostics). */
    get zoneState() { return zone ? zone.state : 'off'; },
    /** The far shape's opacity, 0..1 (diagnostics). */
    get farOpacity() { return zone ? zone.farOpacity : 0; },
    /** How far the far shape has faded into the horizon haze, 0..1 (diagnostics). */
    get farHaze() { return zone ? zone.farHaze : 0; },
    /** How many sentries and vehicles stand on the island now (diagnostics). */
    get garrison() { return zone ? { sentries: zone.garrison.sentries, vehicles: zone.garrison.vehicles, realHangar: zone.realHangar } : null; },
    /** What the airfield is built of now: {baked, props, grass, scrub, colliders}, or null (diagnostics). */
    get airfield() { return zone ? zone.airfield : null; },
    groundHeightAt: (x, z) => (zone ? zone.groundHeightAt(x, z) : null),

    async init(progress) {
      // Only the island's plan and the zone's code load here; nothing is built until the sea opens.
      const [{ NORVAST_ISLAND_SHAPE }, { createNorvastIslandZone }] = await Promise.all([
        import('./island/norvastIslandShape.js'),
        import('./island/islandZone.js'),
      ]);
      system.strip = NORVAST_ISLAND_SHAPE.strip;
      system.hangar = NORVAST_ISLAND_SHAPE.hangar;
      system.handoverPoint = NORVAST_ISLAND_SHAPE.handoverPoint;
      zone = createNorvastIslandZone(context);
      progress(1, 'Norvast island');
    },

    start() {
      if (context.launch.stage === 'island') context.flags.set(WORLD_FLAGS.SEA_OPEN, true);
    },

    update(deltaSeconds) {
      if (zone) zone.update(deltaSeconds);
    },

    dispose() {
      if (zone) zone.dispose();
      zone = null;
    },
  };
  return system;
}
