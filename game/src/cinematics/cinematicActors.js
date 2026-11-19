// The cast of a cinematic: character bodies of the game (a pedestrian archetype in its colours
// and uniform kit, or a story character in their catalog look) standing on marks of the stage,
// posed by the character run-time's locomotion controller: they turn to face, walk to a mark at
// walking pace with the walk cycle, and gesture (the controller's salute, halt, talk, point,
// phone and bench sit; offer, take and pull from actorGestures.js). Positions are local to the
// stage group the bodies are children of. A body whose asset is not loaded is left out.
import { setPaint } from '../assets/index.js';
import { PEDESTRIAN_ARCHETYPES } from '../catalog/pedestrianArchetypes.js';
import { createLocomotionController } from '../characters/controller/locomotionController.js';
import { computeForwardKinematics } from '../characters/skeleton/forwardKinematics.js';
import { blendPoses, createPose } from '../characters/skeleton/poseBuffer.js';
import { bodiesFor, pickAppearance, uniformBaseFor } from '../pedestrians/crowdSpawning.js';
import { createUniformKits } from '../pedestrians/uniformKit.js';
import { leadPaints, storyCharacter } from '../player/leadAppearance.js';
import { CONTROLLER_GESTURES, SCENE_GESTURES, writeSceneGesture } from './actorGestures.js';

/** Metres per second an actor walks to a mark. */
export const ACTOR_WALK_SPEED = 1.35;
const ARRIVE_WITHIN = 0.1;
const GESTURE_FADE = 0.35;
const PAINT_ROLES = ['paint_skin', 'paint_hair', 'paint_jacket', 'paint_top', 'paint_bottom', 'paint_shoes'];

function seeded(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/**
 * Creates the cast of one scene.
 * @param {object} options
 * @param {import('../core/systems/gameContext.js').GameContext} options.context
 * @param {import('three').Object3D} options.group The stage group.
 * @param {(x: number, z: number) => number} options.groundY The ground's height at a local point, local metres.
 * @param {(name: string) => {x: number, z: number} | null} options.pointOf A named point to face ('camera', a prop).
 */
export function createCinematicActors({ context, group, groundY, pointOf }) {
  const assets = context.assets;
  const has = (id) => Boolean(assets && id && assets.has(id));
  const kits = createUniformKits();
  const cast = new Map();
  const layerPose = createPose();

  function pedestrianBase(sex) {
    const loaded = assets ? Object.keys(assets.registry ?? {}).filter(has) : [];
    return bodiesFor(loaded, sex).find(has) ?? null;
  }

  /** The asset, paints, height and kit of an actor's spec, or null when no body is loaded. */
  function lookOf(spec) {
    const random = seeded(`${spec.name}:${spec.archetypeId ?? spec.characterId ?? ''}`);
    const archetype = spec.archetypeId ? PEDESTRIAN_ARCHETYPES[spec.archetypeId] : null;
    const character = spec.characterId ? storyCharacter(spec.characterId) : null;
    let assetId = null, paints = {}, height = 0, kit = spec.kit ?? null;
    if (character?.appearance) {
      paints = leadPaints(character.appearance);
      height = character.appearance.height ?? 0;
      assetId = has(character.id) ? character.id : pedestrianBase(character.appearance.sex ?? 'male');
    } else {
      const look = archetype?.appearance ? pickAppearance(archetype.appearance, random) : null;
      const sex = look?.sex ?? 'male';
      if (look) { paints = look.paints; height = look.height; }
      assetId = (archetype ? uniformBaseFor(archetype, sex, has) : null) ?? pedestrianBase(sex);
      if (!kit && archetype?.uniformKit) kit = archetype.uniformKit;
    }
    if (!has(assetId)) return null;
    return { assetId, paints: { ...paints, ...(spec.tint ?? {}) }, height, kit };
  }

  function facingTo(actor, face) {
    if (typeof face === 'number') return face;
    const point = typeof face === 'string' ? (cast.get(face)?.instance.position ?? pointOf(face)) : face;
    if (!point) return NaN;
    const dx = point.x - actor.instance.position.x, dz = point.z - actor.instance.position.z;
    return Math.hypot(dx, dz) > 0.01 ? Math.atan2(-dx, -dz) : NaN;
  }

  function place(actor) {
    const p = actor.instance.position;
    if (!actor.fixedY) p.y = groundY(p.x, p.z);
  }

  function setGesture(actor, gesture) {
    const walker = actor.walker;
    if (gesture === 'sit') { walker.setStance('sit_bench', { seatHeight: actor.seatHeight }); walker.setGesture(null); actor.overlay = null; return; }
    if (walker.stance === 'sit_bench') walker.setStance('stand');
    if (SCENE_GESTURES.includes(gesture)) { walker.setGesture(null); actor.overlay = gesture; actor.overlayShown = gesture; actor.overlayTime = 0; return; }
    actor.overlay = null;
    if (gesture === 'turn_away') { walker.setGesture(null); walker.input.facing = walker.state.yaw + 2.5; return; }
    walker.setGesture(CONTROLLER_GESTURES[gesture] ?? null); // 'idle' and anything unknown: at ease
  }

  function stepOne(actor, dt) {
    const walker = actor.walker, input = walker.input, p = actor.instance.position;
    input.moveX = 0; input.moveZ = 0;
    if (actor.walk) {
      const dx = actor.walk.x - p.x, dz = actor.walk.z - p.z, gap = Math.hypot(dx, dz);
      if (gap < ARRIVE_WITHIN) {
        if (Number.isFinite(actor.walk.face)) input.facing = actor.walk.face;
        actor.walk = null;
      } else {
        const speed = actor.walk.speed * Math.min(1, 0.35 + gap / 0.6);
        input.moveX = (dx / gap) * speed; input.moveZ = (dz / gap) * speed;
      }
    }
    walker.update(dt);
    p.x += walker.state.vx * dt; p.z += walker.state.vz * dt;
    place(actor);
    // The scene's own gestures, faded over the finished pose.
    actor.overlayWeight += ((actor.overlay ? 1 : 0) - actor.overlayWeight) * Math.min(1, dt / GESTURE_FADE * 2.2);
    if (actor.overlayWeight > 0.01 && actor.overlayShown) {
      const rig = walker.rig;
      actor.overlayTime += dt;
      layerPose.set(rig.pose);
      computeForwardKinematics(rig.body, layerPose, rig.fk);
      writeSceneGesture(layerPose, rig.body, rig.fk, actor.overlayShown, actor.overlayTime);
      blendPoses(rig.pose, rig.pose, layerPose, Math.min(1, actor.overlayWeight));
      rig.applyPose();
    }
  }

  return {
    /** Stands an actor on its mark; null (and nothing drawn) when no body is loaded for it. */
    add(spec) {
      const look = lookOf(spec);
      if (!look) return null;
      const instance = assets.instantiate(look.assetId);
      instance.name = `cinematic-actor-${spec.name}`;
      instance.rotation.order = 'YXZ';
      const stature = assets.get(look.assetId).extras?.height || 1.8;
      for (const role of PAINT_ROLES) {
        const hex = role === 'paint_top' ? look.paints.paint_top ?? look.paints.paint_jacket : look.paints[role];
        if (hex) { try { setPaint(instance, hex, role); } catch { /* a base without that paint role */ } }
      }
      if (look.height > 0) instance.scale.setScalar(Math.min(1.12, Math.max(0.88, look.height / stature)));
      instance.traverse((node) => { if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; node.frustumCulled = false; } });
      const walker = createLocomotionController(instance, { stature, seed: cast.size * 17 + 3, yaw: spec.heading ?? 0 });
      const actor = { name: spec.name, instance, walker, kit: null, walk: null, fixedY: Number.isFinite(spec.position?.y),
        seatHeight: 0.45, overlay: null, overlayShown: null, overlayWeight: 0, overlayTime: 0 };
      if (look.kit) kits.dress(actor, look.kit);
      instance.position.set(spec.position?.x ?? 0, spec.position?.y ?? 0, spec.position?.z ?? 0);
      instance.rotation.y = spec.heading ?? 0;
      instance.visible = spec.visible !== false;
      group.add(instance);
      place(actor);
      cast.set(spec.name, actor);
      if (spec.pose) setGesture(actor, spec.pose);
      walker.update(0.016);
      return actor;
    },
    get(name) { return cast.get(name) ?? null; },
    /**
     * An act cue: a gesture, a walk to a mark, a facing.
     * @param {boolean} [snap] Put the actor at the end of the walk at once (a seek).
     */
    act(cue, snap = false) {
      const actor = cast.get(cue.actor);
      if (!actor) return false;
      if (cue.walkTo) {
        const distance = Math.hypot(cue.walkTo.x - actor.instance.position.x, cue.walkTo.z - actor.instance.position.z);
        const speed = cue.speed ?? (cue.seconds > 0 ? Math.min(2.4, Math.max(0.6, distance / cue.seconds)) : ACTOR_WALK_SPEED);
        actor.walk = { x: cue.walkTo.x, z: cue.walkTo.z, speed, face: NaN };
        if (snap) {
          const yaw = distance > 0.01 ? Math.atan2(-(cue.walkTo.x - actor.instance.position.x), -(cue.walkTo.z - actor.instance.position.z)) : actor.walker.state.yaw;
          actor.instance.position.x = cue.walkTo.x; actor.instance.position.z = cue.walkTo.z;
          actor.walk = null;
          actor.walker.reset(yaw);
        }
      }
      if (cue.face !== undefined && cue.face !== null) {
        const yaw = facingTo(actor, cue.face);
        if (Number.isFinite(yaw)) {
          if (actor.walk) actor.walk.face = yaw; else if (snap) actor.walker.reset(yaw); else actor.walker.input.facing = yaw;
        }
      }
      if (cue.gesture !== undefined) setGesture(actor, cue.gesture);
      return true;
    },
    show(name, visible) {
      const actor = cast.get(name);
      if (actor) actor.instance.visible = visible;
      return Boolean(actor);
    },
    update(dt) { for (const actor of cast.values()) if (actor.instance.visible) stepOne(actor, dt); },
    dispose() {
      for (const actor of cast.values()) {
        kits.undress(actor);
        actor.instance.removeFromParent();
        const skeletons = new Set();
        actor.instance.traverse((node) => { if (node.isSkinnedMesh) skeletons.add(node.skeleton); });
        for (const skeleton of skeletons) skeleton.dispose();
      }
      cast.clear();
    },
  };
}
