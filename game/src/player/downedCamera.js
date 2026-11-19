// The camera when the lead goes down (wasted or busted): it eases up and back from wherever it
// was into a high shot looking down on the lead, turning slowly around the body while the game
// runs in slow motion, and eases back into the normal view when the lead is up again.
import { approach } from './smoothMotion.js';

/** How the downed shot is framed (metres, radians per game second). */
// Rates are per GAME second: the wasted and busted states run at 0.25 and 0.35 time, so a blend
// rate of 5 settles in about 2 real seconds, before the fade to black.
export const DOWNED_SHOT = Object.freeze({ distance: 4.2, height: 5.2, orbitRate: 0.6, blendRate: 5, busted: 0.55 });

/** Creates the downed camera. */
export function createDownedCamera() {
  let blend = 0;
  let angle = 0;
  let wasDown = false;

  /**
   * Bends the shot toward the downed view.
   * @param {number} dt Game seconds.
   * @param {{down: string | null, motion: {x: number, y: number, z: number}, vehicle: object | null}} player
   * @param {{pivot: object, camera: object, yaw: number, pitch: number}} shot Updated in place.
   */
  function frame(dt, player, shot) {
    const down = player.down;
    if (down && !wasDown) angle = Math.atan2(shot.camera.x - player.motion.x, shot.camera.z - player.motion.z);
    wasDown = Boolean(down);
    blend = approach(blend, down ? 1 : 0, DOWNED_SHOT.blendRate * (down ? 1 : 3), dt);
    if (blend < 0.001) return;
    if (down) angle += DOWNED_SHOT.orbitRate * dt;
    const s = player.motion;
    const scale = down === 'busted' ? DOWNED_SHOT.busted : 1;
    const tx = s.x, ty = s.y + 0.6, tz = s.z;
    const cx = tx + Math.sin(angle) * DOWNED_SHOT.distance * (0.7 + 0.3 * scale);
    const cz = tz + Math.cos(angle) * DOWNED_SHOT.distance * (0.7 + 0.3 * scale);
    const cy = ty + DOWNED_SHOT.height * scale;
    const b = blend * blend * (3 - 2 * blend);
    shot.camera.x += (cx - shot.camera.x) * b;
    shot.camera.y += (cy - shot.camera.y) * b;
    shot.camera.z += (cz - shot.camera.z) * b;
    // The look turns onto the body ahead of the rise, so the lead never drops out of the frame
    // while the camera is still on its way up (wasted.jpg, 06:42: the body was cut off below).
    const look = 1 - (1 - blend) * (1 - blend) * (1 - blend);
    const dx = tx - shot.camera.x, dy = ty - shot.camera.y, dz = tz - shot.camera.z;
    const lookYaw = Math.atan2(-dx, -dz);
    const lookPitch = Math.atan2(dy, Math.hypot(dx, dz));
    let turn = lookYaw - shot.yaw;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    shot.yaw += turn * look;
    shot.pitch += (lookPitch - shot.pitch) * look;
  }

  return { frame, get blend() { return blend; } };
}
