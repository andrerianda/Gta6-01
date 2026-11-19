// The small pieces of kit that turn a shared character base into a uniformed person of a force:
// a peaked cap, a helmet band, ear defenders on the head anchor (anchor_head: the top of the
// head), an armband round the upper arm. Each piece is a plain shape in the force's own colour
// (no model file, no lettering); the invented forces here are the Guardia Aérea de Marazul (sand
// yellow on olive grey) and the Federasi Norvast (rust red on slate blue). An archetype names its
// kit with `uniformKit`; the crowd dresses the body when the person is put down and takes the
// kit off before the body goes back to the pool.
import * as THREE from 'three';

/** The kits by id: pieces on the head anchor (metres below the top of the head) and on the arms. */
export const UNIFORM_KITS = Object.freeze({
  air_guard: Object.freeze({ head: ['helmet_band'], arms: ['l'], colour: '#C9B25A', trim: '#C9B25A' }),
  air_guard_officer: Object.freeze({ head: ['cap_crown', 'cap_band', 'cap_peak'], arms: [], colour: '#3B4636', trim: '#C9A84A' }),
  air_guard_crew: Object.freeze({ head: ['ear_cup_l', 'ear_cup_r', 'ear_band'], arms: [], colour: '#E0662B', trim: '#2A2A2E' }),
  norvast: Object.freeze({ head: ['helmet_band'], arms: ['l', 'r'], colour: '#A8432A', trim: '#A8432A' }),
});

/** Where each head piece sits on anchor_head: [x, y, z] metres (+Y up, -Z the face), and which colour it takes. */
const HEAD_PIECES = Object.freeze({
  helmet_band: { at: [0, -0.075, 0], paint: 'colour' },
  cap_crown: { at: [0, 0.012, 0.004], paint: 'colour' },
  cap_band: { at: [0, -0.03, 0], paint: 'trim' },
  cap_peak: { at: [0, -0.045, -0.118], paint: 'dark' },
  ear_cup_l: { at: [-0.094, -0.125, 0.005], paint: 'colour' },
  ear_cup_r: { at: [0.094, -0.125, 0.005], paint: 'colour' },
  ear_band: { at: [0, -0.095, 0.005], paint: 'trim' },
});

/**
 * Creates the dresser of uniform kits (shapes and materials are shared by everyone who wears them).
 * @returns {{dress: (body: {instance: object, kit?: object}, kitId: string) => number, undress: (body: object) => void}}
 */
export function createUniformKits() {
  let shapes = null;
  const materials = new Map();
  const up = new THREE.Vector3(0, 1, 0), axis = new THREE.Vector3();

  function shapeOf(name) {
    if (!shapes) {
      const cup = new THREE.CylinderGeometry(0.043, 0.043, 0.034, 10);
      cup.rotateZ(Math.PI / 2);
      const peak = new THREE.CylinderGeometry(0.105, 0.105, 0.01, 12, 1, false, Math.PI * 0.5, Math.PI);
      peak.scale(1, 1, 0.75);
      const band = new THREE.TorusGeometry(0.098, 0.011, 5, 12, Math.PI);
      shapes = {
        helmet_band: new THREE.CylinderGeometry(0.124, 0.127, 0.03, 14, 1, true),
        cap_crown: new THREE.CylinderGeometry(0.128, 0.106, 0.062, 14),
        cap_band: new THREE.CylinderGeometry(0.107, 0.107, 0.03, 14),
        cap_peak: peak,
        ear_cup_l: cup,
        ear_cup_r: cup,
        ear_band: band,
        armband: new THREE.CylinderGeometry(0.064, 0.062, 0.075, 10, 1, true),
      };
    }
    return shapes[name];
  }

  function materialOf(hex) {
    if (!materials.has(hex)) {
      materials.set(hex, new THREE.MeshStandardMaterial({ color: hex, roughness: 0.85, metalness: 0, side: THREE.DoubleSide, name: `uniform_kit_${hex.slice(1)}` }));
    }
    return materials.get(hex);
  }

  function piece(name, hex, parent) {
    const mesh = new THREE.Mesh(shapeOf(name), materialOf(hex));
    mesh.name = `kit_${name}`;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  /** Takes a body's kit off. */
  function undress(body) {
    if (!body.kit) return;
    for (const mesh of body.kit.meshes) mesh.removeFromParent();
    body.kit = null;
  }

  return {
    undress,
    /**
     * Puts a kit on a body (any kit it wore comes off first).
     * @returns {number} How many pieces it wears now (0: no such kit, or a base without the anchors).
     */
    dress(body, kitId) {
      if (body.kit && body.kit.id === kitId) return body.kit.meshes.length;
      undress(body);
      const kit = UNIFORM_KITS[kitId];
      if (!kit) return 0;
      const meshes = [];
      const head = body.instance.getObjectByName('anchor_head') || null;
      if (head) {
        for (const name of kit.head) {
          const spec = HEAD_PIECES[name];
          const mesh = piece(name, spec.paint === 'dark' ? '#1E1E22' : kit[spec.paint], head);
          mesh.position.set(spec.at[0], spec.at[1], spec.at[2]);
          meshes.push(mesh);
        }
      }
      for (const side of kit.arms) {
        const upper = body.instance.getObjectByName(`upper_arm_${side}`) || null;
        const fore = upper ? body.instance.getObjectByName(`forearm_${side}`) : null;
        if (!upper || !fore || fore.parent !== upper) continue;
        // Round the sleeve a third of the way down the upper arm, along the bone.
        const mesh = piece('armband', kit.colour, upper);
        axis.copy(fore.position);
        const length = axis.length() || 1;
        mesh.position.copy(axis).multiplyScalar(0.34);
        mesh.quaternion.setFromUnitVectors(up, axis.multiplyScalar(1 / length));
        meshes.push(mesh);
      }
      body.kit = { id: kitId, meshes };
      return meshes.length;
    },
  };
}
