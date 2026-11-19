// Radar and stealth: the radar emitters of the flight phase (the unmanned coastal radar tower of
// Cabo Lejano and, while the flag radar.navyPicket is set, the three navy picket ships at sea,
// each with a turning antenna and a sweeping beam), the radar signature every aircraft shows them
// (by type, aspect, height, speed and open bays), the track a radar builds over consecutive paints
// and loses between them, and the Manta Sombra's one guided bomb: the green targeting screen, the
// release envelope, the fall, and the blast that brings the tower down (the only valid target).
//
// Members: playerTrack { tracked, signature 0..1, quality 0..1, guidance (false once the tower is
//   destroyed), emitterId, lockSeconds (how long a picket ship has held a solid track) },
//   signatureOf(vehicleId) -> 0..1, emitters [{ id, kind, x, y, z, range, alive, beamAzimuth }],
//   display (what the cockpit shows: flight/deck reads it), targeting / setTargeting(bool),
//   releaseBomb() -> boolean, restore().
// Commands: GUIDED_BOMB_RELEASE -> boolean, RADAR_EMITTER_RESTORE (rebuilds the tower; reloads no bomb).
// Publishes: RADAR_TRACK_CHANGED, RADAR_EMITTER_DESTROYED, GUIDED_BOMB_RELEASED, GUIDED_BOMB_IMPACT.
// Flags: reads radar.navyPicket and bomb.loaded (cleared on release), sets radar.towerDestroyed.
// Keys (inAircraft): bombTargeting (R), bombRelease (U).
// Stages (?stage=): 'radar' (nothing forced: fly a Manta Sombra at the tower), 'bomb' (bomb loaded,
//   targeting screen on), 'picket' (the picket on station).
// Implementation: flight/radar/radarNetworkRuntime.js and its neighbours.

const NO_TRACK = Object.freeze({ tracked: false, signature: 0, quality: 0, guidance: true, emitterId: null, lockSeconds: 0 });
const NO_EMITTERS = Object.freeze([]);

/**
 * Creates the radar network system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createRadarNetworkSystem(context) {
  let network = null;

  return {
    name: 'radarNetwork',
    dependsOn: ['vehicles'],

    /** Whether a radar holds the lead's aircraft, how bright it shows, and whether the air guard still has ground guidance. */
    get playerTrack() { return network ? network.playerTrack : NO_TRACK; },
    /** The emitters on station: [{id, kind: 'tower' | 'ship', x, y, z, range, alive, beamAzimuth (compass degrees)}]. */
    get emitters() { return network ? network.emitters : NO_EMITTERS; },
    /** What the cockpit shows (signature, emitters in range, the targeting screen), or null. */
    get display() { return network ? network.display : null; },
    /** True while the bomb's targeting mode is switched on. */
    get targeting() { return network ? network.bombRun.targeting : false; },
    /** The signature (0..1) a flying vehicle shows the nearest live radar; 0 for anything that does not fly. */
    signatureOf(vehicleId) { return network ? network.signatureOf(vehicleId) : 0; },
    /** Switches the bomb's targeting mode. */
    setTargeting(on) { if (network) network.setTargeting(on); },
    /** Releases the guided bomb when the designated target is the radar tower and the envelope is met. */
    releaseBomb() { return network ? network.releaseBomb() : false; },
    /** Rebuilds the destroyed tower (a mission retry). */
    restore() { if (network) network.restore(); },

    async init() {
      // Without its parts the game plays on with no radar rather than fail.
      try {
        const [runtime, chart] = await Promise.all([import('./radar/radarNetworkRuntime.js'), import('../catalog/seaAndAirspaceChart.js')]);
        let models = null;
        if (context.view?.scene || context.view?.layers) {
          try {
            models = (await import('./radar/radarEmitterModels.js')).createRadarEmitterModels(context);
          } catch (error) {
            context.log.child('radarNetwork').warn?.(`radar models unavailable: ${error?.message ?? error}`);
          }
        }
        network = runtime.createRadarNetwork(context, chart.SEA_AND_AIRSPACE_CHART, models);
      } catch (error) {
        context.log.child('radarNetwork').warn?.(`radar network unavailable: ${error?.message ?? error}`);
      }
    },

    update(deltaSeconds) {
      if (network) network.update(deltaSeconds);
    },

    dispose() {
      if (network) network.dispose();
      network = null;
    },
  };
}
