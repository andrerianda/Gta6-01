// A loaded asset: the parsed .glb kept as a template, plus everything the game asks of it.
// Instances made from it share its geometry and materials, so they are cheap; the template
// itself is never added to a scene.
import * as THREE from 'three';
import { SkeletonUtils } from '../../vendor/three/three-gltf-addons.min.js';
import { ROLE, colliderShapeOf, isAnchorName, isColliderName, lodLevelOf, lodPartOf } from './contract.js';
import { assetOf, registerAsset, registerInstance, unregisterAsset } from './instances.js';
import { InstancedBatch } from './instancing.js';
import { prepareMaterial, roleOfMaterial } from './materials.js';
import { isColliderNode, lodLevelOfNode, matrixInRoot } from './nodes.js';

/** Camera distances in metres at which levels 1, 2 and 3 take over when an asset names none. */
export const DEFAULT_LOD_DISTANCES = Object.freeze([30, 80, 160]);

/**
 * A named point and direction of an asset, in the asset's own space.
 * @typedef {object} AnchorInfo
 * @property {string} name The anchor's node name ("anchor_light").
 * @property {THREE.Vector3} position Where it is.
 * @property {THREE.Quaternion} quaternion Its orientation.
 * @property {THREE.Vector3} direction The way it points (its local -Z).
 * @property {Record<string, unknown>} extras The custom properties set in Blender.
 */

/**
 * A collision proxy of an asset, in the asset's own space.
 * @typedef {object} ColliderInfo
 * @property {string} name The proxy's node name ("col_box_body").
 * @property {'box' | 'cyl' | 'sphere' | 'hull' | 'mesh'} shape The proxy shape.
 * @property {THREE.Vector3} position The centre of the proxy.
 * @property {THREE.Quaternion} quaternion Its orientation.
 * @property {THREE.Vector3} size Full width (x), height (y) and depth (z) in metres.
 * @property {number} radius Half the width: the radius of a cylinder or sphere proxy.
 * @property {number} height The height: of a cylinder proxy, its length along +Y.
 * @property {THREE.BufferGeometry | null} geometry The triangles of a hull or mesh proxy.
 */

export class Asset {
  /**
   * @param {string} id The asset id.
   * @param {import('./registry/index.js').AssetEntry} entry Its registry entry.
   * @param {{ scene: THREE.Group, animations: THREE.AnimationClip[] }} gltf The parsed file.
   * @param {{ environmentIntensity?: number, glassEnvironmentIntensity?: number,
   *   anisotropy?: number }} [options] Library-wide material settings.
   */
  constructor(id, entry, gltf, options = {}) {
    /** The asset id. */
    this.id = id;
    /** The registry entry. */
    this.entry = entry;
    /** The asset class: "vehicle", "character", "building", "prop", "vegetation" or "dev". */
    this.kind = entry.kind;
    /** The template scene. Do not add it to a scene: use instantiate(). */
    this.scene = gltf.scene;
    /** Animation clips (for skinned assets), by the names given in Blender. */
    this.animations = gltf.animations ?? [];
    /** The asset's extras from Blender: asset, kind, lods, lod_distances, bounds, ... */
    this.extras = gltf.scene.userData ?? {};
    /** True when the asset has a skeleton; its instances are deep clones with their own bones. */
    this.skinned = false;
    /** How many levels of detail the asset has (1 when it has no levels). */
    this.lodCount = 1;
    /** @type {Record<string, AnchorInfo>} Anchors by name, in asset space. */
    this.anchors = {};
    /** @type {ColliderInfo[]} Collision proxies, in asset space. */
    this.colliders = [];
    /** @type {Map<string, THREE.Material>} The asset's materials by name. */
    this.materials = new Map();
    /** @type {Set<THREE.Material>} Every material object the loader made for this asset. */
    this.ownMaterials = new Set();
    /** @type {Map<string, THREE.Material>} Recoloured and switched variants, by key. */
    this.variants = new Map();
    /** @type {Map<number, object[]>} Batch parts per level of detail, made on first use. */
    this.batchParts = new Map();

    this.scene.name = id;
    this.scene.userData.assetId = id;
    this.scene.updateMatrixWorld(true);
    this.#readTemplate(options);

    /** Camera distances (metres) at which level 1, 2, ... take over. */
    this.lodDistances = (this.extras.lod_distances ?? DEFAULT_LOD_DISTANCES).slice(0, this.lodCount - 1);
    const bounds = this.extras.bounds;
    /** The asset's bounding box in its own space. */
    this.bounds = Array.isArray(bounds) && bounds.length === 6
      ? new THREE.Box3(new THREE.Vector3(bounds[0], bounds[1], bounds[2]),
        new THREE.Vector3(bounds[3], bounds[4], bounds[5]))
      : new THREE.Box3().setFromObject(this.scene);
    registerAsset(this);
  }

  /**
   * The asset an instance (or anything inside one) came from.
   * @param {THREE.Object3D} object An instance root or one of its descendants.
   * @returns {Asset | null} The asset, or null for an object no asset made.
   */
  static of(object) {
    return assetOf(object);
  }

  #readTemplate(options) {
    const proxies = [];
    let highestLevel = 0;
    this.scene.traverse((node) => {
      if (node === this.scene) return;
      if (isColliderName(node.name)) {
        proxies.push(node);
        return;
      }
      if (isColliderNode(node, this.scene)) return;
      if (isAnchorName(node.name)) this.anchors[node.name] = this.#anchorInfo(node);
      const level = lodLevelOfNode(node, this.scene);
      if (level !== null) highestLevel = Math.max(highestLevel, level);
      if (node.isSkinnedMesh) this.skinned = true;
      if (node.isMesh) {
        node.userData.lod = level;
        const material = node.material;
        // The loader may make more than one object of a material (a copy for meshes with
        // vertex colours, say): prepare each, and file the first under the material's name.
        if (!this.ownMaterials.has(material)) {
          this.ownMaterials.add(prepareMaterial(material, options));
          if (!this.materials.has(material.name)) this.materials.set(material.name, material);
        }
        node.castShadow = roleOfMaterial(material) !== ROLE.GLASS;
        node.receiveShadow = true;
      }
    });
    this.lodCount = highestLevel + 1;
    for (const node of proxies) {
      this.colliders.push(this.#colliderInfo(node));
      node.removeFromParent();
    }
  }

  #anchorInfo(node) {
    const matrix = matrixInRoot(node, this.scene);
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    matrix.decompose(position, quaternion, new THREE.Vector3());
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion);
    return { name: node.name, position, quaternion, direction, extras: { ...node.userData } };
  }

  #colliderInfo(node) {
    const matrix = matrixInRoot(node, this.scene);
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const size = new THREE.Vector3();
    matrix.decompose(position, quaternion, size);
    const shape = colliderShapeOf(node.name) ?? 'box';
    let geometry = null;
    if (node.isMesh) {
      geometry = node.geometry.clone().applyMatrix4(matrix);
      geometry.computeBoundingBox();
      geometry.boundingBox.getSize(size);
      geometry.boundingBox.getCenter(position);
      quaternion.identity();
    }
    size.set(Math.abs(size.x), Math.abs(size.y), Math.abs(size.z));
    return { name: node.name, shape, position, quaternion, size, radius: size.x / 2, height: size.y, geometry };
  }

  /**
   * Makes an instance: a new object tree that shares this asset's geometry and materials.
   * Static assets cost a few small objects; skinned assets get their own skeleton.
   * @param {{ lod?: number | 'all' }} [options] The level of detail to keep (default 0, the
   *   finest); "all" keeps every level (rarely useful: see createLOD()).
   * @returns {THREE.Object3D} The instance root, named after the asset. Find its parts and
   *   anchors with findNode(instance, name).
   */
  instantiate(options = {}) {
    const wanted = options.lod ?? 0;
    const instance = this.skinned ? SkeletonUtils.clone(this.scene) : this.scene.clone(true);
    if (wanted !== 'all') {
      const level = Math.min(wanted, this.lodCount - 1);
      const discarded = [];
      instance.traverse((node) => {
        const own = lodLevelOf(node.name);
        if (own !== null && own !== level) discarded.push(node);
      });
      for (const node of discarded) node.removeFromParent();
    }
    registerInstance(instance, this);
    return instance;
  }

  /**
   * Makes an instance that switches its level of detail by camera distance by itself: each
   * group of <part>_lod0, <part>_lod1, ... becomes one THREE.LOD named <part> ("lod" for bare
   * lod0, lod1, ...), which the renderer updates every frame.
   * @param {{ distances?: number[], hysteresis?: number }} [options] Distances in metres at
   *   which level 1, 2, ... take over (default: the asset's own), and LOD hysteresis (0..1).
   * @returns {THREE.Object3D} The instance root.
   */
  createLOD(options = {}) {
    const instance = this.instantiate({ lod: 'all' });
    if (this.lodCount < 2) return instance;
    const distances = options.distances ?? this.lodDistances;
    /** @type {Map<string, { parent: THREE.Object3D, part: string, levels: THREE.Object3D[] }>} */
    const groups = new Map();
    instance.traverse((node) => {
      const level = lodLevelOf(node.name);
      if (level === null) return;
      const part = lodPartOf(node.name);
      const key = `${node.parent.uuid}/${part}`;
      if (!groups.has(key)) groups.set(key, { parent: node.parent, part, levels: [] });
      groups.get(key).levels[level] = node;
    });
    for (const { parent, part, levels } of groups.values()) {
      const lod = new THREE.LOD();
      lod.name = part || 'lod';
      levels.forEach((node, level) => {
        if (!node) return;
        const distance = level === 0 ? 0 : (distances[level - 1] ?? DEFAULT_LOD_DISTANCES[level - 1] ?? 200);
        lod.addLevel(node, distance, options.hysteresis ?? 0.1);
      });
      parent.add(lod);
    }
    return instance;
  }

  /**
   * Makes a batch that draws many copies of this (static) asset with one draw call per
   * material. Moving parts and skeletons are not supported in a batch.
   * @param {number} capacity The largest number of copies.
   * @param {{ lod?: number }} [options] The level of detail to draw (default 0).
   * @returns {InstancedBatch} The batch; add batch.object to the scene.
   */
  createBatch(capacity, options = {}) {
    if (this.skinned) throw new Error(`asset "${this.id}" is skinned and cannot be batched`);
    const level = Math.min(options.lod ?? 0, this.lodCount - 1);
    if (!this.batchParts.has(level)) {
      const parts = [];
      this.scene.traverse((node) => {
        if (!node.isMesh || (node.userData.lod !== null && node.userData.lod !== level)) return;
        const geometry = node.geometry.clone().applyMatrix4(matrixInRoot(node, this.scene));
        parts.push({ geometry, material: node.material, castShadow: node.castShadow, receiveShadow: node.receiveShadow });
      });
      this.batchParts.set(level, parts);
    }
    return new InstancedBatch(this.batchParts.get(level), capacity, `${this.id}_lod${level}_batch`);
  }

  /**
   * An anchor of the asset, in asset space.
   * @param {string} name The anchor name ("anchor_light").
   * @returns {AnchorInfo} Its position, orientation, direction and extras.
   */
  anchor(name) {
    const info = this.anchors[name];
    if (!info) throw new Error(`asset "${this.id}" has no anchor "${name}"`);
    return info;
  }

  /**
   * An animation clip of the asset.
   * @param {string} name The clip name given in Blender ("idle", "walk", ...).
   * @returns {THREE.AnimationClip} The clip, for an AnimationMixer on an instance.
   */
  clip(name) {
    const clip = THREE.AnimationClip.findByName(this.animations, name);
    if (!clip) {
      throw new Error(`asset "${this.id}" has no animation "${name}" (it has ${this.animations.map((each) => each.name).join(', ')})`);
    }
    return clip;
  }

  /**
   * The materials of one role.
   * @param {string} role A ROLE value from contract.js.
   * @returns {THREE.Material[]} The asset's own materials of that role (not their variants).
   */
  materialsByRole(role) {
    return [...this.ownMaterials].filter((material) => roleOfMaterial(material) === role);
  }

  /**
   * Every material of the asset, variants included.
   * @returns {THREE.Material[]} The materials.
   */
  allMaterials() {
    return [...this.ownMaterials, ...this.variants.values()];
  }

  #baseMaterial(name) {
    const material = this.materials.get(name);
    if (!material) {
      throw new Error(`asset "${this.id}" has no material "${name}" (it has ${[...this.materials.keys()].join(', ')})`);
    }
    return material;
  }

  /**
   * A paint material in a given colour; made once per colour and shared by all users.
   * @param {THREE.ColorRepresentation} color The paint colour.
   * @param {string} [name] The paint material ("paint" by default).
   * @returns {THREE.Material} The material to put on a mesh in place of the asset's own.
   */
  paintMaterial(color, name = 'paint') {
    const base = this.#baseMaterial(name);
    const hex = new THREE.Color(color).getHex();
    if (hex === base.userData.paintColor) return base;
    const key = `${name}/paint/${hex}`;
    if (!this.variants.has(key)) {
      const variant = base.clone();
      variant.color.setHex(hex);
      this.variants.set(key, variant);
    }
    return this.variants.get(key);
  }

  /**
   * A lamp material lit or unlit; the two states are shared by all users.
   * @param {string} name The lamp material ("lamp_head").
   * @param {boolean} lit True for the glowing state.
   * @returns {THREE.Material} The material to put on a mesh in place of the asset's own.
   */
  lampMaterial(name, lit) {
    const base = this.#baseMaterial(name);
    if (lit) return base;
    const key = `${name}/off`;
    if (!this.variants.has(key)) {
      const variant = base.clone();
      variant.emissiveIntensity = 0;
      variant.userData.lit = false;
      this.variants.set(key, variant);
    }
    return this.variants.get(key);
  }

  /** Frees the asset's GPU resources. Remove its instances from the scene first. */
  dispose() {
    const textures = new Set();
    for (const material of this.allMaterials()) {
      for (const value of Object.values(material)) {
        if (value && value.isTexture) textures.add(value);
      }
      material.dispose();
    }
    for (const texture of textures) {
      texture.dispose();
      texture.source?.data?.close?.();
    }
    this.scene.traverse((node) => {
      if (node.isMesh) node.geometry.dispose();
      if (node.isSkinnedMesh) node.skeleton?.dispose();
    });
    for (const parts of this.batchParts.values()) {
      for (const part of parts) part.geometry.dispose();
    }
    for (const collider of this.colliders) collider.geometry?.dispose();
    this.variants.clear();
    this.batchParts.clear();
    unregisterAsset(this);
  }
}
