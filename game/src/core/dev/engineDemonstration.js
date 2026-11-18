// TEMPORARY engine demonstration, deleted when the real systems arrive: a small sand island
// under the real sky and sea with a few models from the asset library, a movable capsule that is
// registered as the player entity, and a free orbit camera. It exists to show the loop, the
// input contexts, the entity registry, the commands and the debug object working end to end.
import * as THREE from 'three';
import { ENTITY_KINDS, ENTITY_TAGS } from '../entities/entityKinds.js';
import { GAME_COMMANDS } from '../events/gameCommands.js';
import { GAME_EVENTS } from '../events/gameEvents.js';
import { GAME_STATE } from '../state/gameStates.js';

/**
 * Creates the demonstration system.
 * @param {import('../systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../systems/gameSystemContract.js').GameSystem}
 */
export function createEngineDemonstrationSystem(context) {
  const GROUND_LEVEL = 1.2;
  const HALF_HEIGHT = 0.9;
  const ISLAND_RADIUS = 60;
  const group = new THREE.Group();
  group.name = 'engine-demonstration';
  const position = new THREE.Vector3(0, GROUND_LEVEL + HALF_HEIGHT, 8);
  const previous = position.clone();
  const target = new THREE.Vector3();
  const disposables = [];
  let capsule = null;
  let entity = null;
  let cameraYaw = 0.35;
  let cameraPitch = 0.2;
  let speed = 0;
  // When the real player system is present it owns the lead, the teleport and the camera; the
  // demonstration then keeps only its island scenery, as ground, until the city exists.
  let replaced = false;

  function place(id, x, z, turn, scale = 1) {
    if (!context.assets || !context.assets.has(id)) return;
    const instance = context.assets.instantiate(id);
    instance.position.set(x, GROUND_LEVEL, z);
    instance.rotation.y = turn;
    instance.scale.setScalar(scale);
    instance.traverse((node) => {
      if (node.isMesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });
    group.add(instance);
  }

  function teleport({ position: to, heading }) {
    position.set(to.x, to.y ?? GROUND_LEVEL + HALF_HEIGHT, to.z);
    previous.copy(position);
    if (typeof heading === 'number') {
      entity.heading = heading;
      cameraYaw = heading;
    }
    context.entities.refresh(entity);
    context.events.emit(GAME_EVENTS.PLAYER_TELEPORTED, {
      position: { x: position.x, y: position.y, z: position.z },
      heading: entity.heading,
    });
  }

  return {
    name: 'engineDemonstration',
    dependsOn: ['worldRenderPipeline', 'timeAndWeather'],

    init(progress) {
      const realPlayer = context.systems.find('player');
      replaced = Boolean(realPlayer && realPlayer.drivesTheLead);
      const sand = new THREE.MeshStandardMaterial({ color: 0xcdb48c, roughness: 0.96, metalness: 0 });
      const island = new THREE.Mesh(new THREE.CylinderGeometry(ISLAND_RADIUS + 6, ISLAND_RADIUS + 30, 4, 72, 1), sand);
      island.position.y = GROUND_LEVEL - 2;
      island.receiveShadow = true;
      const body = new THREE.MeshStandardMaterial({ color: 0xd8603a, roughness: 0.55, metalness: 0.05 });
      capsule = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 2 * HALF_HEIGHT - 0.68, 8, 20), body);
      capsule.castShadow = true;
      capsule.position.copy(position);
      group.add(island);
      if (!replaced) group.add(capsule);
      disposables.push(sand, island.geometry, body, capsule.geometry);
      progress(0.4, 'demonstration island');

      const random = context.random('engineDemonstration');
      for (let i = 0; i < 9; i += 1) {
        const angle = (i / 9) * Math.PI * 2 + random.range(-0.2, 0.2);
        const distance = random.range(14, 44);
        place('royal_palm_a', Math.sin(angle) * distance, -Math.cos(angle) * distance, random.range(0, 6.28), random.range(0.85, 1.15));
      }
      place('street_lamp_a', -5, -2, 0);
      place('street_lamp_a', 9, -14, Math.PI / 2);
      place('newspaper_box_a', -3.4, -1.2, 0.4);
      context.view.layers.world.add(group);

      if (!replaced) {
        entity = context.entities.add({
          kind: ENTITY_KINDS.CHARACTER,
          owner: 'engineDemonstration',
          position,
          radius: 0.5,
          tags: [ENTITY_TAGS.PLAYER],
          data: { demonstration: true },
        });
        context.commands.handle(GAME_COMMANDS.PLAYER_TELEPORT, teleport);
      }

      const scenes = [
        ['engine-demo', 'Engine demonstration at golden hour', 18.83, GAME_STATE.PLAYING],
        ['start', 'The start menu', 18.83, GAME_STATE.START_MENU],
        ['play', 'Walking the island at noon', 13, GAME_STATE.PLAYING],
        ['end', 'The island after dark', 21.5, GAME_STATE.PLAYING],
      ];
      for (const [name, title, hours, stateName] of scenes) {
        context.showcase.register({
          name,
          title,
          description: 'Temporary: the engine demonstration island.',
          run(game, tools) {
            game.state.enter(stateName);
            game.commands.run(GAME_COMMANDS.TIME_SET, { hours });
            game.commands.run(GAME_COMMANDS.PLAYER_TELEPORT, { position: { x: 3, z: 9 }, heading: 0.4 });
            game.input.setVirtual('moveForward', true);
            tools.advance(1.5);
            game.input.setVirtual('moveForward', false);
          },
        });
      }
      progress(1, 'demonstration island');
    },

    fixedUpdate(stepSeconds) {
      if (replaced) return;
      const input = context.input;
      previous.copy(position);
      const strafe = input.axis('moveX');
      const forward = input.axis('moveZ');
      const length = Math.hypot(strafe, forward);
      speed = 0;
      if (length > 0) {
        const sin = Math.sin(cameraYaw);
        const cos = Math.cos(cameraYaw);
        const directionX = (-sin * forward + cos * strafe) / length;
        const directionZ = (-cos * forward - sin * strafe) / length;
        speed = input.held('sprint') ? 9 : 4.5;
        position.x += directionX * speed * stepSeconds;
        position.z += directionZ * speed * stepSeconds;
        const fromCentre = Math.hypot(position.x, position.z);
        if (fromCentre > ISLAND_RADIUS) {
          position.x *= ISLAND_RADIUS / fromCentre;
          position.z *= ISLAND_RADIUS / fromCentre;
        }
        entity.heading = Math.atan2(-directionX, -directionZ);
      }
    },

    update(deltaSeconds, alpha) {
      if (replaced) return;
      const input = context.input;
      const sensitivity = 0.0025 * context.settings.get('controls.mouseSensitivity');
      cameraYaw -= input.lookX * sensitivity;
      const invert = context.settings.get('controls.invertLookY') ? -1 : 1;
      cameraPitch = Math.min(1.2, Math.max(-0.1, cameraPitch + input.lookY * sensitivity * invert));
      capsule.position.lerpVectors(previous, position, alpha);
    },

    lateUpdate() {
      if (replaced) return;
      const camera = context.view.camera;
      const distance = 7.5;
      target.copy(capsule.position);
      target.y += 0.7;
      const flat = Math.cos(cameraPitch) * distance;
      camera.position.set(
        target.x + Math.sin(cameraYaw) * flat,
        target.y + Math.sin(cameraPitch) * distance,
        target.z + Math.cos(cameraYaw) * flat,
      );
      camera.lookAt(target);
      const focus = context.focus;
      focus.position.x = capsule.position.x;
      focus.position.y = capsule.position.y;
      focus.position.z = capsule.position.z;
      focus.groundLevel = GROUND_LEVEL;
      focus.speed = speed;
      focus.radius = 1;
    },

    dispose() {
      if (entity) context.entities.remove(entity);
      group.removeFromParent();
      for (const item of disposables) item.dispose();
    },
  };
}
