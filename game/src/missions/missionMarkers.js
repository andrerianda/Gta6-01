// The mission markers in the world: a glowing gold cylinder of light with a ground ring and a
// spinning diamond at every mission start (MISSION_RULES.startMarker), a tall beam of light at
// the current objective, and small diamonds at photograph spots, pickups and checkpoints.
// Additive, unlit, no shadows; geometries and materials are shared and the small marks are
// pooled, so the per-frame update only moves and spins what exists.
import * as THREE from 'three';

const MAX_MARKS = 16;

/**
 * Creates the markers on a scene layer.
 * @param {THREE.Object3D} layer Where the markers live (context.view.layers.dynamic).
 * @param {{startColour?: string, startRadius?: number, groundHeightAt?: (x: number, z: number) => number}} [options]
 */
export function createMissionMarkers(layer, options = {}) {
  const startColour = new THREE.Color(options.startColour ?? '#FFC53D');
  const objectiveColour = new THREE.Color('#FFD36B');
  const markColour = new THREE.Color('#7CC8FF');
  const radius = options.startRadius ?? 2.2;
  const groundAt = options.groundHeightAt ?? (() => 0);
  const root = new THREE.Group();
  root.name = 'mission-markers';
  layer.add(root);

  const glow = (colour, opacity) => new THREE.MeshBasicMaterial({
    color: colour, transparent: true, opacity, vertexColors: true, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false,
  });
  const solid = (colour) => new THREE.MeshBasicMaterial({ color: colour, toneMapped: false, fog: false });
  const shell = fadingCylinder(radius, 2.6);
  const beam = fadingCylinder(1.3, 70);
  const small = fadingCylinder(0.8, 1.8);
  const ring = new THREE.RingGeometry(radius * 0.72, radius, 48, 1).rotateX(-Math.PI / 2);
  const diamond = new THREE.OctahedronGeometry(0.42, 0).scale(1, 1.5, 1);
  const materials = {
    shell: glow(startColour, 0.9), ring: glow(startColour, 0.75), diamond: solid(startColour),
    beam: glow(objectiveColour, 0.55), mark: glow(markColour, 0.85), markDiamond: solid(markColour),
  };
  ring.setAttribute('color', new THREE.Float32BufferAttribute(new Array(ring.attributes.position.count * 4).fill(1), 4));

  function marker(shellGeometry, shellMaterial, diamondMaterial, withRing) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(shellGeometry, shellMaterial);
    const top = new THREE.Mesh(diamond, diamondMaterial);
    top.position.y = 3.4;
    group.add(body, top);
    if (withRing) group.add(new THREE.Mesh(ring, materials.ring));
    group.userData.top = top;
    group.visible = false;
    for (const child of group.children) { child.castShadow = false; child.receiveShadow = false; child.frustumCulled = true; }
    root.add(group);
    return group;
  }

  const starts = new Map();                     // missionId -> group
  const objective = marker(beam, materials.beam, materials.diamond, true);
  objective.userData.top.visible = false;
  const marks = [];
  for (let i = 0; i < MAX_MARKS; i += 1) {
    const mark = marker(small, materials.mark, materials.markDiamond, false);
    mark.userData.top.position.y = 2.3;
    mark.userData.top.scale.setScalar(0.6);
    marks.push(mark);
  }
  let time = 0;

  function put(group, point) {
    const y = typeof point.y === 'number' ? point.y : groundAt(point.x, point.z);
    group.position.set(point.x, y, point.z);
    group.visible = true;
  }

  return {
    /** Shows the start marker of a mission at a point, or hides it with null. */
    setStart(missionId, point) {
      let group = starts.get(missionId);
      if (!point) { if (group) group.visible = false; return; }
      if (!group) { group = marker(shell, materials.shell, materials.diamond, true); starts.set(missionId, group); }
      put(group, point);
    },
    hideStarts() { for (const group of starts.values()) group.visible = false; },
    /** The beam at the current objective (null hides it). */
    setObjective(point) {
      if (point) put(objective, point);
      else objective.visible = false;
    },
    /** Small marks at points (photograph spots, pickups, checkpoints); null hides them. */
    setMarks(points) {
      for (let i = 0; i < MAX_MARKS; i += 1) {
        const point = points && points[i];
        if (point) put(marks[i], point);
        else marks[i].visible = false;
      }
    },
    /** Spins and bobs the diamonds; follows a moving objective (a vehicle's position). */
    update(deltaSeconds, followed) {
      time += deltaSeconds;
      const bob = Math.sin(time * 2.2) * 0.18;
      for (const group of starts.values()) {
        if (!group.visible) continue;
        group.userData.top.rotation.y = time * 1.6;
        group.userData.top.position.y = 3.4 + bob;
      }
      if (objective.visible && followed) objective.position.set(followed.x, followed.y ?? objective.position.y, followed.z);
      for (const mark of marks) if (mark.visible) mark.userData.top.rotation.y = time * 2;
    },
    dispose() {
      layer.remove(root);
      for (const geometry of [shell, beam, small, ring, diamond]) geometry.dispose();
      for (const material of Object.values(materials)) material.dispose();
    },
  };
}

/** An open cylinder whose vertex alpha fades from the ground (bright) to the top (clear). */
function fadingCylinder(radius, height) {
  const geometry = new THREE.CylinderGeometry(radius, radius, height, 40, 6, true).translate(0, height / 2, 0);
  const position = geometry.attributes.position;
  const colours = new Float32Array(position.count * 4);
  for (let i = 0; i < position.count; i += 1) {
    const t = position.getY(i) / height;
    colours.set([1, 1, 1, Math.pow(1 - t, 1.6)], i * 4);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 4));
  return geometry;
}
