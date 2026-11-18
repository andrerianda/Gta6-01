// What the player sees of the stealth guards' attention: a sight cone painted on the ground in
// front of each guard (a soft fan that fades outward and stops at walls and parked cars), pale
// blue while calm, warming to amber as suspicion builds and red at the alarm, and a mark over
// the guard's head: an amber "?" that grows with suspicion, a red "!" when the guard raises the
// alarm. Pooled (at most eight guards), one draw for each cone and each mark, buffers written
// in place; the rays are re-clipped against the walls a few times a second, staggered.
import * as THREE from 'three';

const MAX_GUARDS = 8;
const RAYS = 16;
const CLIP_SECONDS = 0.25;
const CALM = new THREE.Color('#3FB8FF');
const WARY = new THREE.Color('#FFB23E');
const ALARM = new THREE.Color('#FF3B30');

/**
 * Creates the guards' sight view on a scene layer.
 * @param {THREE.Object3D} layer context.view.layers.dynamic
 * @param {{groundHeightAt?: (x: number, z: number) => number,
 *   clip?: (x: number, y: number, z: number, dx: number, dz: number, max: number) => number}} [options]
 *   clip: how far a ray from a guard's eyes goes before a wall (metres, at most max).
 */
export function createGuardSightView(layer, options = {}) {
  const groundAt = options.groundHeightAt ?? (() => 0);
  const clip = options.clip ?? ((x, y, z, dx, dz, max) => max);
  const root = new THREE.Group();
  root.name = 'guard-sight';
  layer.add(root);
  const marks = { wary: glyphTexture('?', '#FFB23E'), alarm: glyphTexture('!', '#FF3B30') };
  const slots = [];
  let range = 14, half = 0.6;
  for (let i = 0; i < MAX_GUARDS; i += 1) slots.push(makeSlot(i));

  function makeSlot(i) {
    const positions = new Float32Array((RAYS + 2) * 3);
    const colours = new Float32Array((RAYS + 2) * 4).fill(1);
    colours[3] = 0.62;                                    // the apex at the guard's feet
    for (let j = 1; j < RAYS + 2; j += 1) colours[j * 4 + 3] = 0.2;    // the far rim: still reads by day
    const index = [];
    for (let j = 0; j < RAYS; j += 1) index.push(0, j + 1, j + 2);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colours, 4));
    geometry.setIndex(index);
    const material = new THREE.MeshBasicMaterial({
      color: CALM.clone(), vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      toneMapped: false, fog: false,   // no polygon offset: at a grazing view it pulled the fan over the lead's shins
    });
    const cone = new THREE.Mesh(geometry, material);
    cone.name = 'guard-sight-cone';
    cone.frustumCulled = false;
    cone.renderOrder = 2;
    const mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: marks.wary, transparent: true, depthWrite: false, toneMapped: false, fog: false }));
    mark.name = 'guard-alert-mark';
    cone.visible = false;
    mark.visible = false;
    root.add(cone, mark);
    return { cone, mark, positions, lengths: new Float32Array(RAYS + 1).fill(1), clipIn: i * (CLIP_SECONDS / MAX_GUARDS) };
  }

  /** Lays the rim of a slot's fan at its clipped lengths (local space; the mesh turns by yaw). */
  function shape(slot) {
    const p = slot.positions;
    for (let j = 0; j <= RAYS; j += 1) {
      const a = -half + (2 * half * j) / RAYS;
      const reach = range * slot.lengths[j];
      p[(j + 1) * 3] = -Math.sin(a) * reach;
      p[(j + 1) * 3 + 1] = 0;
      p[(j + 1) * 3 + 2] = -Math.cos(a) * reach;
    }
    slot.cone.geometry.attributes.position.needsUpdate = true;
  }

  function reclip(slot, guard, y) {
    for (let j = 0; j <= RAYS; j += 1) {
      const a = guard.yaw - half + (2 * half * j) / RAYS;
      slot.lengths[j] = Math.max(0.05, clip(guard.x, y + 0.9, guard.z, -Math.sin(a), -Math.cos(a), range) / range);
    }
  }

  return {
    /** Sets the cones' reach and width for the guards about to be drawn. */
    configure(visionRange, visionDegrees) {
      range = visionRange;
      half = (visionDegrees * Math.PI) / 360;
      for (const slot of slots) { slot.lengths.fill(1); shape(slot); }
    },
    /** Draws each standing guard's cone and mark (the guards of guardVision/stealthObjective). */
    update(guards, dt) {
      for (let i = 0; i < slots.length; i += 1) {
        const slot = slots[i], guard = guards[i];
        if (!guard || !guard.standing) { slot.cone.visible = false; slot.mark.visible = false; continue; }
        const y = groundAt(guard.x, guard.z);
        slot.clipIn -= dt;
        if (slot.clipIn <= 0) { slot.clipIn = CLIP_SECONDS; reclip(slot, guard, y); shape(slot); }
        const s = guard.alerted ? 1 : guard.suspicion;
        const material = slot.cone.material;
        if (guard.alerted) material.color.copy(ALARM);
        else if (s < 0.5) material.color.copy(CALM).lerp(WARY, s * 2);
        else material.color.copy(WARY).lerp(ALARM, (s - 0.5) * 2);
        material.opacity = 0.75 + 0.25 * s;
        // Above a pavement's top (the ground height is the road's), so kerbs do not swallow it.
        slot.cone.position.set(guard.x, y + 0.2, guard.z);
        slot.cone.rotation.y = guard.yaw;
        slot.cone.visible = true;
        const shown = guard.alerted || s > 0.08;
        slot.mark.visible = shown;
        if (!shown) continue;
        const alarmed = guard.alerted || s >= 1;
        if (slot.mark.material.map !== (alarmed ? marks.alarm : marks.wary)) slot.mark.material.map = alarmed ? marks.alarm : marks.wary;
        const size = alarmed ? 0.62 : 0.3 + 0.26 * s;
        slot.mark.scale.set(size, size, 1);
        slot.mark.material.opacity = alarmed ? 1 : Math.min(1, 0.35 + s);
        slot.mark.position.set(guard.x, y + 2.3, guard.z);
      }
    },
    hide() { for (const slot of slots) { slot.cone.visible = false; slot.mark.visible = false; } },
    dispose() {
      for (const slot of slots) { slot.cone.geometry.dispose(); slot.cone.material.dispose(); slot.mark.material.dispose(); }
      marks.wary.dispose();
      marks.alarm.dispose();
      root.removeFromParent();
    },
  };
}

/** A mark's picture: the glyph in its colour on a dark diamond with a bright rim. */
function glyphTexture(glyph, colour) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  g.translate(32, 32);
  g.rotate(Math.PI / 4);
  g.fillStyle = 'rgba(12, 14, 20, 0.82)';
  g.strokeStyle = colour;
  g.lineWidth = 4;
  g.beginPath();
  g.rect(-19, -19, 38, 38);
  g.fill();
  g.stroke();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = colour;
  g.font = 'bold 34px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(glyph, 32, 34);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
