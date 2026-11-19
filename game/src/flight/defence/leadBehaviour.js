// What the lead's aircraft is doing, as the interceptors judge it: rocking its wings (the answer to
// their order), heading back towards Marazul or out to sea, turning hard, running, jinking. The
// interception's decisions and the gunnery read these few flags. Pure, nothing allocated per step.

const ROCK_BANK = 0.17;      // about 10 degrees each way counts as a rock
const ROCK_WINDOW = 7;       // seconds two reversals must fit in
const TURN_FULL = 0.16;      // rad/s of heading change that counts as full jinking (about 9 degrees/s)
const CLIMB_FULL = 25;       // m/s per second of vertical-speed change that counts as full jinking

/**
 * Creates the watcher.
 * @returns {{rocking: boolean, inbound: boolean, outbound: boolean, evading: boolean, manoeuvre: number, turnRate: number,
 *   landed: boolean, reset: () => void, acknowledge: () => void,
 *   update: (lead: object, deltaSeconds: number, centreX: number, centreZ: number) => void}}
 */
export function createLeadBehaviour() {
  let clock = 0;
  let rockSign = 0;
  let lastFlip = -Infinity;
  let previousFlip = -Infinity;
  let previousHeading = null;
  let previousClimb = 0;
  let previousSpeed = 0;
  let surge = 0;
  let previousRadial = 0;
  let radialRate = 0;

  const behaviour = {
    /** In a turn that is bringing his nose round towards Marazul (not yet inbound). */
    turningBack: false,
    /** True for a few seconds after left-right-left (two bank reversals inside the window). */
    rocking: false,
    /** Flying towards / away from the chart's centre. */
    inbound: false,
    outbound: false,
    /** Turning hard or accelerating away: the opposite of complying. */
    evading: false,
    /** 0 steady .. 1 jinking hard; 0 on autopilot (a steady autopilot flight is trivially tracked). */
    manoeuvre: 0,
    turnRate: 0,
    landed: false,

    reset() {
      clock = 0;
      rockSign = 0;
      lastFlip = previousFlip = -Infinity;
      previousHeading = null;
      previousClimb = previousSpeed = surge = previousRadial = radialRate = 0;
      behaviour.turningBack = false;
      behaviour.rocking = behaviour.inbound = behaviour.outbound = behaviour.evading = behaviour.landed = false;
      behaviour.manoeuvre = behaviour.turnRate = 0;
    },

    /** Forgets the wing rock that was just answered, so the next order needs a new one. */
    acknowledge() {
      lastFlip = previousFlip = -Infinity;
      behaviour.rocking = false;
    },

    update(lead, deltaSeconds, centreX, centreZ) {
      if (!(deltaSeconds > 0)) return;
      clock += deltaSeconds;

      // Wing rocking: the bank changes side twice within the window.
      const roll = lead.roll || 0;
      const sign = roll > ROCK_BANK ? 1 : roll < -ROCK_BANK ? -1 : 0;
      if (sign !== 0 && sign !== rockSign) {
        if (rockSign !== 0) {
          previousFlip = lastFlip;
          lastFlip = clock;
        }
        rockSign = sign;
      }
      behaviour.rocking = clock - previousFlip < ROCK_WINDOW && clock - lastFlip < ROCK_WINDOW * 0.6;

      // Where he is going relative to Marazul.
      const speed = Math.hypot(lead.vx, lead.vz);
      const rx = lead.x - centreX;
      const rz = lead.z - centreZ;
      const radius = Math.hypot(rx, rz) || 1;
      const radial = speed > 1 ? (lead.vx * rx + lead.vz * rz) / (radius * speed) : 0;
      behaviour.inbound = radial < -0.5;
      behaviour.outbound = radial > 0.3;
      radialRate += ((radial - previousRadial) / deltaSeconds - radialRate) * (1 - Math.exp(-deltaSeconds * 2));
      previousRadial = radial;
      behaviour.turningBack = !behaviour.inbound && radialRate < -0.012;
      behaviour.landed = Boolean(lead.onGround) && speed < 40;

      // Turning, jinking, running.
      let turn = 0;
      if (previousHeading !== null) {
        let d = lead.heading - previousHeading;
        if (d > Math.PI) d -= 2 * Math.PI;
        else if (d < -Math.PI) d += 2 * Math.PI;
        turn = d / deltaSeconds;
      }
      previousHeading = lead.heading;
      const blend = 1 - Math.exp(-deltaSeconds * 2);
      behaviour.turnRate += (turn - behaviour.turnRate) * blend;
      const heave = Math.abs((lead.vy - previousClimb) / deltaSeconds);
      previousClimb = lead.vy;
      surge += ((speed - previousSpeed) / deltaSeconds - surge) * blend;
      previousSpeed = speed;
      let jink = Math.abs(behaviour.turnRate) / TURN_FULL + Math.min(1, heave / CLIMB_FULL) * 0.5;
      if (jink > 1) jink = 1;
      const target = lead.autopilot ? 0 : jink;
      behaviour.manoeuvre += (target - behaviour.manoeuvre) * (1 - Math.exp(-deltaSeconds * 1.2));
      if (lead.autopilot) behaviour.manoeuvre = 0;
      behaviour.evading = !behaviour.inbound && !behaviour.rocking && !behaviour.turningBack && (Math.abs(behaviour.turnRate) > 0.09 || surge > 6);
    },
  };
  return behaviour;
}
