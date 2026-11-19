// Wingtip vapour trails for a held showcase shot: the thin white condensation streams a wing pulls
// from its tips in a hard turn through moist air, drawn as two soft ribbons that start as a thread
// at each tip and widen and fade behind the aircraft along its recent path (a gentle arc for a
// turning aircraft). Each ribbon is turned toward the held camera, so it reads as a tube of vapour
// from that eye. Deterministic: plain geometry from the given points, no randomness.
import * as THREE from 'three';

/** The look of the trails: length (m), width at the tip and at the end (m), opacity at the tip, colour. */
const TRAIL = Object.freeze({ length: 60, startWidth: 0.6, endWidth: 5, opacity: 0.85, color: [1.0, 0.95, 0.88], segments: 48 });

/**
 * Finds the two wingtips of an aircraft model: the vertices furthest left and right in the root's
 * own frame, returned in world space.
 * @param {THREE.Object3D} root The aircraft's model root (its matrices up to date).
 * @returns {{left: THREE.Vector3, right: THREE.Vector3} | null}
 */
export function wingtipsOf(root) {
  if (!root) return null;
  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const local = new THREE.Matrix4();
  const point = new THREE.Vector3();
  let left = null;
  let right = null;
  root.traverse((node) => {
    const position = node.isMesh && node.visible !== false ? node.geometry?.attributes?.position : null;
    if (!position) return;
    local.multiplyMatrices(toRoot, node.matrixWorld);
    for (let i = 0; i < position.count; i += 1) {
      point.fromBufferAttribute(position, i).applyMatrix4(local);
      if (!right || point.x > right.x) right = point.clone();
      if (!left || point.x < left.x) left = point.clone();
    }
  });
  if (!left || !right || right.x - left.x < 1) return null;
  return { left: left.applyMatrix4(root.matrixWorld), right: right.applyMatrix4(root.matrixWorld) };
}

/**
 * Adds the two trails to a scene.
 * @param {THREE.Object3D} scene Where to add them.
 * @param {{tips: {left: THREE.Vector3, right: THREE.Vector3}, back: {x: number, y: number, z: number},
 *   side: {x: number, y: number, z: number}, curve?: number, eye: {x: number, y: number, z: number},
 *   length?: number}} options `back` the unit direction the aircraft came from, `side` the unit
 *   direction the path bends toward behind it, `curve` metres of bend at the trail's end.
 * @returns {() => void} Removes the trails again.
 */
export function addWingtipVapourTrails(scene, options) {
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: true, fog: true,
  });
  material.name = 'wingtip_vapour';
  const group = new THREE.Group();
  group.name = 'wingtip_vapour_trails';
  for (const tip of [options.tips.left, options.tips.right]) group.add(ribbon(tip, options, material));
  scene.add(group);
  return () => {
    scene.remove(group);
    group.children.forEach((mesh) => mesh.geometry.dispose());
    material.dispose();
  };
}

function ribbon(tip, options, material) {
  const length = options.length ?? TRAIL.length;
  const curve = options.curve ?? 0;
  const count = TRAIL.segments + 1;
  const positions = new Float32Array(count * 2 * 3);
  const colors = new Float32Array(count * 2 * 4);
  const indices = [];
  const at = (t) => {
    const along = t * length;
    const bend = curve * t * t;
    return new THREE.Vector3(
      tip.x + options.back.x * along + options.side.x * bend,
      tip.y + options.back.y * along + options.side.y * bend,
      tip.z + options.back.z * along + options.side.z * bend,
    );
  };
  const eye = new THREE.Vector3(options.eye.x, options.eye.y, options.eye.z);
  const across = new THREE.Vector3();
  const toEye = new THREE.Vector3();
  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1);
    const p = at(t);
    const tangent = at(Math.min(1, t + 0.01)).sub(at(Math.max(0, t - 0.01))).normalize();
    toEye.subVectors(eye, p).normalize();
    across.crossVectors(tangent, toEye).normalize();
    const width = TRAIL.startWidth + (TRAIL.endWidth - TRAIL.startWidth) * Math.pow(t, 0.7);
    // Born a few metres behind the tip, densest just behind it, thinning to nothing at the end.
    const born = Math.min(1, t / 0.025);
    const alpha = TRAIL.opacity * born * Math.pow(1 - t, 1.6);
    for (let s = 0; s < 2; s += 1) {
      const k = (i * 2 + s);
      const sign = s === 0 ? -0.5 : 0.5;
      positions[k * 3] = p.x + across.x * width * sign;
      positions[k * 3 + 1] = p.y + across.y * width * sign;
      positions[k * 3 + 2] = p.z + across.z * width * sign;
      colors.set([...TRAIL.color, alpha], k * 4);
    }
    if (i > 0) {
      const a = (i - 1) * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'wingtip_vapour';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 2;
  return mesh;
}
