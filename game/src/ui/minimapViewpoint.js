// Where the maps look from: the player's position (the entity tagged player, or the camera's
// focus when there is none yet), the horizontal direction the camera looks in and the direction
// the player faces, read into one reused object each frame without allocating.

/**
 * Creates the viewpoint reader.
 * @param {{entities: object, focus: {position: {x: number, z: number}}, view: {camera: object}}} context
 *   The game context.
 */
export function createMinimapViewpoint(context) {
  const frame = { x: 0, z: 0, forwardX: 0, forwardZ: -1, faceX: 0, faceZ: -1, radiusMetres: 165, time: 0 };
  return {
    frame,
    /** Reads the current viewpoint into `frame` and returns it. */
    read() {
      const player = context.entities.firstWithTag('player');
      const position = player?.position ?? context.focus.position;
      frame.x = position.x;
      frame.z = position.z;
      const m = context.view.camera.matrixWorld.elements;     // the camera looks down its -Z axis
      const length = Math.hypot(m[8], m[10]);
      if (length > 1e-4) {
        frame.forwardX = -m[8] / length;
        frame.forwardZ = -m[10] / length;
      }
      if (player && Number.isFinite(player.heading)) {
        // Entity headings turn like three.js rotation.y: 0 faces north (-Z), growing to the left.
        frame.faceX = -Math.sin(player.heading);
        frame.faceZ = -Math.cos(player.heading);
      } else {
        frame.faceX = frame.forwardX;
        frame.faceZ = frame.forwardZ;
      }
      return frame;
    },
  };
}

/**
 * The shops of the shopsAndProperties catalog placed at their landmarks in the plan, for the
 * radar's shop blips.
 * @param {object} plan The city plan (landmarkById).
 * @param {Record<string, {kind: string, landmark: string}>} shops SHOPS_AND_SERVICES, or {}.
 * @returns {{kind: string, x: number, z: number}[]}
 */
export function placeShopsOnPlan(plan, shops) {
  const placed = [];
  for (const shop of Object.values(shops ?? {})) {
    const landmark = plan.landmarkById?.[shop.landmark];
    if (landmark) placed.push({ kind: shop.kind, x: landmark.x, z: landmark.z });
  }
  return placed;
}
