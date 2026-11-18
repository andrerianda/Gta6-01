// The crowd's bodies: one skinned character instance per person, merged to ONE draw call per
// level of detail and painted from the person's look, scaled to their height, posed by the
// character run-time's locomotion controller, and kept cheap. A crowd base ships as one skinned
// mesh per level with a primitive per paint role (paint_skin, paint_hair, paint_top,
// paint_bottom, paint_shoes, atlas): six draws a person. Every role samples the same baked
// textures and differs only in its colour, so the primitives are merged into one geometry whose
// position, normal, uv and skin attributes are shared by every person of that base, with a
// per-person vertex colour attribute holding the paint (one material per base, white, with
// vertexColors). Repainting a pooled body rewrites its colours: no material or texture is made
// per person, so nothing grows as people come and go. A pool reuses instances; the level of
// detail switches by distance; far people are posed every second or fourth frame, people off
// screen not at all (their walk state still steps); only near people cast shadows.
import * as THREE from 'three';
import { BufferGeometryUtils } from '../../vendor/three/three-gltf-addons.min.js';
import { setPaint } from '../assets/index.js';
import { createLocomotionController } from '../characters/controller/locomotionController.js';
import { stepLocomotionState } from '../characters/controller/locomotionState.js';

/** Distances (m) where a body changes level of detail. */
export const BODY_LOD_DISTANCES = Object.freeze([14, 34]);
/** Bodies within this distance cast shadows. */
const SHADOW_DISTANCE = 26;
const PAINT_ROLES = ['paint_skin', 'paint_hair', 'paint_jacket', 'paint_top', 'paint_bottom', 'paint_shoes'];
const SHARED_ATTRIBUTES = ['position', 'normal', 'uv', 'skinIndex', 'skinWeight'];
const colour = new THREE.Color();

/** The level of detail of a mesh node: its own userData.lod or its nearest ancestor's. */
function levelOf(node) {
  for (let at = node; at; at = at.parent) {
    if (typeof at.userData.lod === 'number') return at.userData.lod;
  }
  return 0;
}

/** Whether two materials sample the same baked images (so one material can draw both). */
function sameImages(a, b) {
  const same = (x, y) => (x ? x.source.data : null) === (y ? y.source.data : null);
  return same(a.map, b.map) && same(a.normalMap, b.normalMap) && same(a.roughnessMap, b.roughnessMap) && same(a.aoMap, b.aoMap);
}

/** Whether two skinned meshes are driven by the same bones (each clone has its own Skeleton). */
function sameBones(a, b) {
  const x = a.skeleton.bones, y = b.skeleton.bones;
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i += 1) if (x[i] !== y[i]) return false;
  return true;
}

/** Whether a skeleton has the same bones and bind inverses as another (so it can be swapped). */
function sameSkin(skeleton, other) {
  if (skeleton.bones.length !== other.bones.length) return false;
  for (let i = 0; i < skeleton.bones.length; i += 1) {
    if (skeleton.bones[i] !== other.bones[i]) return false;
    const a = skeleton.boneInverses[i].elements, b = other.boneInverses[i].elements;
    for (let k = 0; k < 16; k += 1) if (Math.abs(a[k] - b[k]) > 1e-5) return false;
  }
  return true;
}

/**
 * Binds every skinned mesh of an instance (all levels) that can share it to ONE skeleton: one
 * bone texture and one bone update per person instead of one per mesh. Returns the skeleton.
 */
function shareSkeleton(instance) {
  let shared = null;
  instance.traverse((node) => {
    if (!node.isSkinnedMesh) return;
    if (!shared) { shared = node.skeleton; return; }
    if (node.skeleton !== shared && sameSkin(node.skeleton, shared)) node.bind(shared, node.bindMatrix);
  });
  return shared;
}

/** Drops a skinned mesh's bone texture (Skeleton.dispose; the renderer remakes it on use). */
function disposeBoneTexture(node) {
  if (node.isSkinnedMesh && node.skeleton.boneTexture) node.skeleton.dispose();
}

/** Free bodies kept per base; beyond it a released body is disposed. */
const FREE_PER_BASE = 8;

/**
 * The merge plan of one level of one base, made once from its first instance: which meshes
 * merge (indices in traversal order), the merged geometry, the vertex range of each role and
 * the shared material. Null when the level cannot be merged (then its meshes stay as they are).
 */
function planMerge(meshes) {
  if (meshes.length < 2) return null;
  const first = meshes[0];
  const members = [];
  for (let i = 0; i < meshes.length; i += 1) {
    const mesh = meshes[i];
    if (mesh.isSkinnedMesh && first.isSkinnedMesh && sameBones(mesh, first) && !Array.isArray(mesh.material)
      && sameImages(mesh.material, first.material) && SHARED_ATTRIBUTES.every((name) => mesh.geometry.getAttribute(name))) members.push(i);
  }
  if (members.length < 2) return null;
  const parts = members.map((i) => {
    const part = new THREE.BufferGeometry();
    for (const name of SHARED_ATTRIBUTES) part.setAttribute(name, meshes[i].geometry.getAttribute(name));
    if (meshes[i].geometry.index) part.setIndex(meshes[i].geometry.index);
    return part;
  });
  if (parts.some((part) => !part.index) && parts.some((part) => part.index)) return null;
  const merged = BufferGeometryUtils.mergeGeometries(parts, false);
  if (!merged) return null;
  const ranges = [];
  let start = 0;
  for (let k = 0; k < members.length; k += 1) {
    const material = meshes[members[k]].material;
    const count = parts[k].getAttribute('position').count;
    ranges.push({ role: material.name, start, count, r: material.color.r, g: material.color.g, b: material.color.b });
    start += count;
  }
  const material = first.material.clone();
  material.name = 'pedestrian_body';
  material.color.setRGB(1, 1, 1);
  material.vertexColors = true;
  merged.computeBoundingSphere();
  const sphere = merged.boundingSphere.clone();
  sphere.radius += 0.45;
  return { members, merged, ranges, material, sphere, vertices: start, total: meshes.length };
}

/** Replaces one level's member meshes in an instance by one merged skinned mesh. */
function applyMerge(plan, meshes) {
  const first = meshes[plan.members[0]];
  const geometry = new THREE.BufferGeometry();
  for (const name of SHARED_ATTRIBUTES) geometry.setAttribute(name, plan.merged.getAttribute(name));
  if (plan.merged.index) geometry.setIndex(plan.merged.index);
  const colours = new THREE.BufferAttribute(new Uint16Array(plan.vertices * 3), 3, true);
  geometry.setAttribute('color', colours);
  geometry.boundingSphere = plan.sphere;
  const mesh = new THREE.SkinnedMesh(geometry, plan.material);
  mesh.name = `${first.parent ? first.parent.name : 'body'}_merged`;
  mesh.position.copy(first.position);
  mesh.quaternion.copy(first.quaternion);
  mesh.scale.copy(first.scale);
  mesh.boundingSphere = plan.sphere;
  mesh.receiveShadow = true;
  first.parent.add(mesh);
  mesh.bind(first.skeleton, first.bindMatrix);
  const rest = meshes.filter((_, i) => !plan.members.includes(i));
  for (const i of plan.members) meshes[i].removeFromParent();
  return { mesh, colours, ranges: plan.ranges, rest };
}

/**
 * Creates the pool of crowd bodies.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 * @param {THREE.Object3D} layer Where bodies are added (context.view.layers.dynamic).
 */
export function createPedestrianBodies(context, layer) {
  /** Free bodies by asset id. */
  const free = new Map();
  /** Merge plans by asset id: one per level (or null). */
  const plans = new Map();
  let created = 0, alive = 0;

  function build(assetId) {
    const asset = context.assets.get(assetId);
    const instance = context.assets.instantiate(assetId, { lod: 'all' });
    instance.name = `pedestrian-${assetId}-${created}`;
    created += 1;
    instance.rotation.order = 'YXZ';
    const found = [[], [], []];
    instance.traverse((node) => { if (node.isMesh) found[Math.min(2, levelOf(node))].push(node); });
    if (!plans.has(assetId)) plans.set(assetId, found.map(planMerge));
    const merges = [];
    const levels = found.map((meshes, level) => {
      const plan = plans.get(assetId)[level];
      if (!plan || meshes.length !== plan.total) return meshes;
      const merge = applyMerge(plan, meshes);
      merges.push(merge);
      return [merge.mesh, ...merge.rest];
    });
    if (levels[1].length === 0) levels[1] = levels[0];
    if (levels[2].length === 0) levels[2] = levels[1];
    const skeleton = shareSkeleton(instance);
    // Paint roles left on unmerged meshes are recoloured the old way (material variants).
    const materialNames = new Set();
    for (const meshes of levels) for (const mesh of meshes) {
      mesh.receiveShadow = true;
      if (mesh.material.name !== 'pedestrian_body') materialNames.add(mesh.material.name);
    }
    const allRoles = new Set(PAINT_ROLES.filter((role) => materialNames.has(role)));
    for (const merge of merges) for (const range of merge.ranges) allRoles.add(range.role);
    const jacket = allRoles.has('paint_jacket');
    const roles = PAINT_ROLES.filter((role) => materialNames.has(role));
    const stature = asset && asset.extras ? asset.extras.height || 1.8 : 1.8;
    const walker = createLocomotionController(instance, { stature, seed: created * 13 });
    const body = { assetId, instance, walker, levels, merges, skeleton, stature, roles, jacket, scale: 1, level: -1, shadows: null, frame: 0, input: walker.input, pending: 0 };
    layer.add(instance);
    alive += 1;
    return body;
  }

  /** Frees a body for good: its skeletons (bone textures) and its own colour buffers. */
  function destroy(body) {
    layer.remove(body.instance);
    const skeletons = new Set();
    body.instance.traverse((node) => { if (node.isSkinnedMesh) skeletons.add(node.skeleton); });
    for (const skeleton of skeletons) skeleton.dispose();
    for (const merge of body.merges) {
      // Detach the attributes shared with the base before disposing, so only this person's go.
      const geometry = merge.mesh.geometry;
      for (const name of SHARED_ATTRIBUTES) geometry.deleteAttribute(name);
      geometry.setIndex(null);
      geometry.dispose();
    }
    alive -= 1;
  }

  /** The colour (hex string) a role wears for a look, or null for the base's own. */
  function paintOf(body, look, role) {
    if (role === 'paint_top' && !body.jacket) return look.paints.paint_jacket || look.paints.paint_top || null;
    return look.paints[role] || null;
  }

  function paint(body, look) {
    for (const merge of body.merges) {
      const array = merge.colours.array;
      for (const range of merge.ranges) {
        const hex = paintOf(body, look, range.role);
        if (hex) colour.set(hex); else colour.setRGB(range.r, range.g, range.b);
        const r = Math.round(Math.min(1, colour.r) * 65535), g = Math.round(Math.min(1, colour.g) * 65535), b = Math.round(Math.min(1, colour.b) * 65535);
        for (let v = range.start, end = range.start + range.count; v < end; v += 1) {
          array[v * 3] = r;
          array[v * 3 + 1] = g;
          array[v * 3 + 2] = b;
        }
      }
      merge.colours.needsUpdate = true;
    }
    for (const role of body.roles) {
      const hex = paintOf(body, look, role);
      if (hex) setPaint(body.instance, hex, role);
    }
  }

  function showLevel(body, level, shadows) {
    if (body.level === level && body.shadows === shadows) return;
    for (let i = 0; i < 3; i += 1) {
      const meshes = body.levels[i];
      for (let j = 0; j < meshes.length; j += 1) {
        meshes[j].visible = i === level;
        meshes[j].castShadow = shadows && i === level;
      }
    }
    body.level = level;
    body.shadows = shadows;
  }

  return {
    /** How many instances were ever made, and how many exist now (in use and free). */
    get created() { return created; },
    get alive() { return alive; },

    /** Draw calls one body costs at a level (for the budget readout). */
    drawsOf(body, level = 0) { return body.levels[Math.min(2, level)].length; },

    /**
     * A body for a person.
     * @param {string} assetId A registered character asset.
     * @param {{height: number, paints: Record<string, string>}} look
     * @param {number} yaw
     */
    acquire(assetId, look, yaw) {
      const list = free.get(assetId);
      const body = list && list.length ? list.pop() : build(assetId);
      paint(body, look);
      body.scale = Math.max(0.85, Math.min(1.12, look.height / body.stature));
      body.instance.scale.setScalar(body.scale);
      body.instance.rotation.set(0, yaw, 0);
      body.instance.visible = true;
      body.walker.reset(yaw);
      if (body.walker.stance !== 'stand' && typeof body.walker.setStance === 'function') body.walker.setStance('stand');
      body.level = -1;
      body.pending = 0;
      return body;
    },

    /** Returns a body to the pool. */
    release(body) {
      body.instance.visible = false;
      body.instance.rotation.x = 0;
      // A free body keeps no bone texture on the GPU (three makes it again when drawn next).
      body.instance.traverse(disposeBoneTexture);
      if (!free.has(body.assetId)) free.set(body.assetId, []);
      const list = free.get(body.assetId);
      if (list.length < FREE_PER_BASE) list.push(body); else destroy(body);
    },

    /**
     * Steps a body's walk and poses it for this frame.
     * @param {object} body
     * @param {number} dt Seconds.
     * @param {number} distance From the camera, metres.
     * @param {boolean} onScreen In the camera's view.
     * @param {boolean} posed False while the person lies down (no walking pose).
     */
    animate(body, dt, distance, onScreen, posed) {
      body.frame += 1;
      const level = distance < BODY_LOD_DISTANCES[0] ? 0 : distance < BODY_LOD_DISTANCES[1] ? 1 : 2;
      showLevel(body, level, distance < SHADOW_DISTANCE);
      const every = distance < 30 ? 1 : distance < 60 ? 2 : 4;
      body.pending += dt;
      if (!posed) {
        body.pending = 0;
        return;
      }
      if (onScreen && body.frame % every === 0) {
        body.walker.update(body.pending, body.input);
        body.pending = 0;
      } else if (!onScreen || body.pending > 0.25) {
        // Off screen (or far between poses): keep the walk state stepping without posing.
        stepLocomotionState(body.walker.state, body.pending, body.input);
        body.instance.rotation.y = body.walker.state.yaw;
        body.pending = 0;
      }
    },
  };
}
