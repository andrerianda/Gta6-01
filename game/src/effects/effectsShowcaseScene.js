// The effects showcase scenes, on Gran Vía Marazul among the towers, everything made by the real
// systems (no picture is faked): the lead on the north pavement, a sedan parked in the near lane
// ahead. The lead fires the pistol at it through combat (muzzle flash, tracers, sparks on the
// body), the fleet's own damage takes it to burning, and it burns and explodes by the fleet's
// rules; the drift scene drives a coupe through a handbrake slide on the real physics.
// - ?shot=effects-explosion: the fireball 0.45 s after the blast, at dusk (19:15).
// - ?shot=effects-explosion-night: the same at 22:30.
// - ?shot=effects-burning: the car burning, flames licking out of it, at dusk.
// - ?shot=effects-drift: a coupe sliding with smoking tyres and skid marks, golden hour.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { GAME_STATE } from '../core/state/gameStates.js';

/** Where along the avenue (0 east end, 1 west end) the lead stands, and the lead's offset (m). */
const STAGE = Object.freeze({ along: 0.44, lead: 10, car: 4.6, ahead: 12 });

/** A frame on Gran Vía: a centre point, the unit forward (westwards) and right, compass heading. */
function avenueFrame(game) {
  const street = game.systems.find('openWorldCity')?.plan?.stagingStreets?.find((each) => each.key === 'gran_via_marazul');
  if (!street) return { x: 0, z: 0, fx: 0, fz: -1, rx: 1, rz: 0, compass: 0 };
  const length = Math.hypot(street.westEnd.x - street.eastEnd.x, street.westEnd.z - street.eastEnd.z);
  const fx = (street.westEnd.x - street.eastEnd.x) / length;
  const fz = (street.westEnd.z - street.eastEnd.z) / length;
  return {
    x: street.eastEnd.x + fx * length * STAGE.along, z: street.eastEnd.z + fz * length * STAGE.along,
    fx, fz, rx: -fz, rz: fx, compass: Math.atan2(fx, -fz),
  };
}

function point(frame, right, ahead) {
  return { x: frame.x + frame.rx * right + frame.fx * ahead, z: frame.z + frame.rz * right + frame.fz * ahead };
}

/** Puts the lead on the pavement looking at `target` (a little to its left, so it stands right). */
function setUp(game, tools, frame, hours, target) {
  game.state.enter(GAME_STATE.PLAYING);
  game.commands.run(GAME_COMMANDS.TIME_SET, { hours });
  const at = point(frame, STAGE.lead, 0);
  // the player's heading grows to the left; its forward is (-sin h, -cos h)
  const heading = Math.atan2(-(target.x - at.x), -(target.z - at.z)) + 0.14;
  if (game.commands.has(GAME_COMMANDS.PLAYER_TELEPORT)) game.commands.run(GAME_COMMANDS.PLAYER_TELEPORT, { position: at, heading });
  tools.advance(0.2);
  return { at, heading };
}

/** Spawns the sedan in the near lane ahead, at three quarters to the camera. */
function parkSedan(game, frame) {
  const fleet = game.systems.find('vehicles');
  if (!fleet) return { fleet: null, id: null, car: null };
  const where = point(frame, STAGE.car, STAGE.ahead);
  const id = fleet.spawn({ modelId: 'family_sedan', position: where, heading: frame.compass + 0.75, colour: '#2F6FB0', parked: true, ownerSystem: 'showcase' });
  return { fleet, id, where };
}

/** The lead fires a few pistol rounds into the car through combat (flash, tracer, sparks). */
function shootAt(game, tools, lead, where, shots) {
  const combat = game.systems.find('combat');
  const shooter = game.entities.firstWithTag?.('player') ?? null;
  if (!combat?.fire || !shooter) return;
  const fx = -Math.sin(lead.heading); const fz = -Math.cos(lead.heading);
  const origin = { x: lead.at.x + fx * 0.6 - fz * 0.25, y: (shooter.position?.y ?? 0) + 1.45, z: lead.at.z + fz * 0.6 + fx * 0.25 };
  for (let i = 0; i < shots; i += 1) {
    const dx = where.x - origin.x; const dy = (shooter.position?.y ?? 0) + 0.9 - origin.y; const dz = where.z - origin.z;
    const l = Math.hypot(dx, dy, dz) || 1;
    combat.fire(shooter, 'pistol', origin, { x: dx / l, y: dy / l, z: dz / l }, { spread: 0.01 });
    tools.advance(0.12);
  }
}

function burningCar(game, tools, hours) {
  const frame = avenueFrame(game);
  const sedan = parkSedan(game, frame);
  const lead = setUp(game, tools, frame, hours, sedan.where ?? point(frame, STAGE.car, STAGE.ahead));
  if (!sedan.fleet || !sedan.id) return null;
  shootAt(game, tools, lead, sedan.where, 3);
  // the shots dent it; the fleet's own damage takes it below its burning threshold
  const record = sedan.fleet.get(sedan.id);
  const data = record?.entity?.data;
  if (data) sedan.fleet.damage(sedan.id, Math.max(0, data.health - data.maxHealth * 0.08), 'weapon', game.entities.firstWithTag?.('player')?.id ?? null);
  return { ...sedan, lead, data };
}

/**
 * Registers the scenes with the showcase registry.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 */
export function registerEffectsShowcase(context) {
  if (!context.showcase || context.showcase.has?.('effects-explosion')) return;
  for (const [name, hours] of [['effects-explosion', 19.25], ['effects-explosion-night', 22.5]]) {
    context.showcase.register({
      name,
      title: 'A shot-up car exploding on Gran Vía',
      description: 'The fireball rolling into its smoke column, the flash lighting the towers, a scorch mark and a burning wreck.',
      run(game, tools) {
        const scene = burningCar(game, tools, hours);
        if (!scene?.data) return;
        tools.advance(1.4);
        // the last of its health: it explodes by the fleet's rules
        scene.fleet.damage(scene.id, scene.data.maxHealth, 'weapon', null);
        tools.advance(0.45);
      },
    });
  }
  context.showcase.register({
    name: 'effects-burning',
    title: 'A car burning on Gran Vía at dusk',
    description: 'Flames licking out of a shot-up sedan, the smoke lit by the fire and the low sun.',
    run(game, tools) {
      burningCar(game, tools, 19.25);
      tools.advance(2.6);
    },
  });
  context.showcase.register({
    name: 'effects-drift',
    title: 'A coupe sliding with smoking tyres',
    description: 'Driving effects from the physics: tyre smoke and skid marks in a handbrake slide.',
    run(game, tools) {
      const frame = avenueFrame(game);
      const target = point(frame, 2, 20);
      setUp(game, tools, frame, 18.83, target);
      const fleet = game.systems.find('vehicles');
      if (!fleet) return;
      const start = point(frame, -2, 70);
      const id = fleet.spawn({ modelId: 'sports_coupe', position: start, heading: frame.compass + Math.PI, colour: '#C2261F', parked: false, ownerSystem: 'showcase' });
      const controls = fleet.controlsOf(id);
      if (!controls) return;
      controls.throttle = 1;
      tools.advance(2.6);
      controls.throttle = 0.6;
      controls.handbrake = 1;
      controls.steer = 1;
      tools.advance(0.9);
    },
  });
}
