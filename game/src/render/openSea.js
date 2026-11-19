// The open sea: the endless ocean beyond the city, its horizon haze, and the sky, clouds and
// curved horizon seen from high altitude (up to 25 km). The sea is drawn to the horizon from any
// place and height, the camera sees at least 30 km whenever it is above 60 m or outside the
// city's extent, and the owners of far objects (navy ships, the Norvast island) ask this system
// how deep in the haze their object stands.
//
// The work is in render/sea/: openSeaRuntime.js (camera planes, the cloud layer seen from above,
// the answers below) and seaHorizonMaths.js (the numbers, which also run in Node).

/**
 * Creates the open sea system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem & {
 *   hazeAmountAt: (distanceMetres: number, cameraHeightMetres?: number) => number,
 *   hazeColourAt: (distanceMetres: number, out: {r: number, g: number, b: number}) => {r: number, g: number, b: number},
 *   horizonDropRadians: (cameraHeight: number) => number,
 *   seaLevelAt: (x: number, z: number) => number,
 *   farPlane: number,
 * }}
 */
export function createOpenSeaSystem(context) {
  /** @type {ReturnType<import('./sea/openSeaRuntime.js').createOpenSeaRuntime> | null} */
  let runtime = null;

  return {
    name: 'openSea',
    dependsOn: ['worldRenderPipeline'],
    runsWhen: /** @type {'always'} */ ('always'),

    async init() {
      const { createOpenSeaRuntime } = await import('./sea/openSeaRuntime.js');
      runtime = createOpenSeaRuntime(context);
    },

    /** The camera's far plane in force, metres (at least 30 km aloft or out at sea). */
    get farPlane() {
      return runtime ? runtime.farPlane : context.view.camera.far;
    },

    /**
     * How much of an object at sea level, `distanceMetres` from the camera, is lost in the
     * horizon haze: 0 clear .. 1 gone. Models drawn in the scene already receive this haze from
     * the picture's haze pass; the number is for fading them in and out and for their lamps.
     * @param {number} distanceMetres
     * @param {number} [cameraHeightMetres] The camera's own height when omitted.
     */
    hazeAmountAt(distanceMetres, cameraHeightMetres) {
      return runtime ? runtime.hazeAmountAt(distanceMetres, cameraHeightMetres) : 0;
    },

    /**
     * The colour of that haze (linear scene radiance), written into `out` (any {r, g, b}).
     * @param {number} distanceMetres
     * @param {{r: number, g: number, b: number}} out
     */
    hazeColourAt(distanceMetres, out) {
      if (runtime) return runtime.hazeColourAt(distanceMetres, out);
      out.r = 0.56; out.g = 0.69; out.b = 0.84;
      return out;
    },

    /** The angle the sea's horizon lies below the level for a camera height, radians. */
    horizonDropRadians(cameraHeight) {
      return runtime ? runtime.horizonDropRadians(cameraHeight) : 0;
    },

    /** The resting level of the sea, world Y in metres: 0 everywhere (the world is flat). */
    seaLevelAt(x, z) {
      void x; void z;
      return 0;
    },

    dispose() {
      if (runtime) runtime.dispose();
      runtime = null;
    },
  };
}
