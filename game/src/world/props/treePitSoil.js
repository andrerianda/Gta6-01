// Tree pit soil: the dark mulched earth under each pavement tree's cast-iron grate (the grate is
// set_sidewalk's tree_grate, pooled with the clutter), so the grate's slots and its trunk opening
// show soil, not the paving below. One city-wide instanced quad: a sector adds its pits and
// takes them back on release (the last slot fills the hole). Nothing is allocated per frame.
//
//   const soil = createTreePitSoil({ textures });
//   pools.object3d.add(soil.object3d);
//   const handle = soil.addSector([{ x, y, z, rotationY }, ...]);   // handle.dispose()
import * as THREE from 'three';

/** The soil square's side (metres), just inside the 1.24 m grate's frame, and its lift above the paving. */
export const PIT_SOIL_SIZE = 1.2;
export const PIT_SOIL_LIFT = 0.012;

/**
 * Creates the soil batch.
 * @param {{textures?: {getMaterial?: Function} | null}} [options] The surface library (its 'dirt').
 */
export function createTreePitSoil(options = {}) {
  const root = new THREE.Group();
  root.name = 'city_dressing_tree_pit_soil';
  const material = soilMaterial(options.textures);
  const geometry = new THREE.PlaneGeometry(PIT_SOIL_SIZE, PIT_SOIL_SIZE).rotateX(-Math.PI / 2);
  let mesh = null;
  let capacity = 0;
  let count = 0;
  const ownerList = [];
  const ownerIndex = [];
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const unit = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);

  function grow(size) {
    const next = new THREE.InstancedMesh(geometry, material, size);
    next.name = 'tree_pit_soil';
    next.frustumCulled = false;
    next.castShadow = false;
    next.receiveShadow = true;
    next.matrixAutoUpdate = false;
    if (mesh) {
      next.instanceMatrix.array.set(mesh.instanceMatrix.array.subarray(0, count * 16));
      mesh.removeFromParent();
      mesh.dispose();
    }
    mesh = next;
    capacity = size;
    root.add(mesh);
  }
  function commit() {
    if (!mesh) return;
    mesh.count = count;
    mesh.visible = count > 0;
    mesh.instanceMatrix.needsUpdate = true;
  }

  return {
    object3d: root,
    /**
     * Adds a sector's pits.
     * @param {{x: number, y: number, z: number, rotationY: number}[]} pits Ground height at the trunk.
     * @returns {{count: number, dispose: () => void}}
     */
    addSector(pits) {
      const slots = [];
      for (const pit of pits) {
        if (count >= capacity) grow(Math.max(64, capacity * 2));
        position.set(pit.x, pit.y + PIT_SOIL_LIFT, pit.z);
        rotation.setFromAxisAngle(up, pit.rotationY ?? 0);
        matrix.compose(position, rotation, unit).toArray(mesh.instanceMatrix.array, count * 16);
        ownerList[count] = slots;
        ownerIndex[count] = slots.length;
        slots.push(count);
        count += 1;
      }
      commit();
      return {
        count: slots.length,
        dispose() {
          while (slots.length) {
            const slot = slots.pop();
            const last = count - 1;
            if (slot !== last) {
              mesh.instanceMatrix.array.copyWithin(slot * 16, last * 16, last * 16 + 16);
              const owner = ownerList[last];
              owner[ownerIndex[last]] = slot;
              ownerList[slot] = owner;
              ownerIndex[slot] = ownerIndex[last];
            }
            ownerList[last] = null;
            count = last;
          }
          commit();
        },
      };
    },
    /** Pits drawn now (one draw call). */
    get count() {
      return count;
    },
    dispose() {
      mesh?.removeFromParent();
      mesh?.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}

/** Dark, damp mulched earth: the surface library's dirt, darkened, or a plain brown. */
function soilMaterial(textures) {
  let material = null;
  try {
    const base = textures?.getMaterial?.('dirt', { uvMetres: false, seed: 31 });
    if (base) material = base.clone();
  } catch {
    material = null;
  }
  material ??= new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 1 });
  material.color.multiplyScalar(0.55);
  material.name = 'tree_pit_soil';
  material.polygonOffset = true;
  material.polygonOffsetFactor = -1;
  material.polygonOffsetUnits = -1;
  return material;
}
