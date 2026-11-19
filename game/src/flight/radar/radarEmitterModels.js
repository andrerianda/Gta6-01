// The radar emitters in the world: the coastal radar tower of Cabo Lejano on its concrete pad
// (antenna turning, a red beacon, a static collider; swapped for its wreck when bombed), the three
// navy picket ships while they are on station (steaming, antenna turning, navigation lamps, a
// faint wake, and at night a thin beam sweeping the sea), and the falling guided bomb.
// Each model is the artists' asset when the registry has it (radar_tower, radar_tower_wreck,
// navy_picket_ship, guided_bomb) and a plain stand-in of the right size until then.
import * as THREE from 'three';

/** Ships are drawn while the camera is within this distance, metres. */
export const SHIP_DRAW_DISTANCE = 9000;
const TOWER_COLLIDER = Object.freeze({ group: 'radar:tower', standing: [4, 17, 4], wreck: [7, 2.5, 7] });
const GREY = 0x7d8488;

/**
 * Creates the emitter models.
 * @param {import('../../core/systems/gameContext.js').GameContext} context
 * @returns {{sync: Function, setTowerWrecked: (wrecked: boolean) => void, dispose: () => void, readonly real: Record<string, boolean>} | null}
 *   Null when there is no scene to draw in.
 */
export function createRadarEmitterModels(context) {
  const parent = context.view?.layers?.dynamic ?? context.view?.scene ?? null;
  if (!parent) return null;
  const root = new THREE.Group();
  root.name = 'radar_network';
  parent.add(root);
  const disposables = [];
  const real = {};
  const keep = (thing) => { disposables.push(thing); return thing; };
  const lit = (colour) => keep(new THREE.MeshBasicMaterial({ color: colour, toneMapped: false }));
  const matt = (colour) => keep(new THREE.MeshStandardMaterial({ color: colour, roughness: 0.85, metalness: 0.1 }));
  const box = (w, h, d, material, x, y, z) => {
    const mesh = new THREE.Mesh(keep(new THREE.BoxGeometry(w, h, d)), material);
    mesh.position.set(x, y, z);
    return mesh;
  };

  /** A place for one model: the stand-in now, the asset as soon as it is loaded. */
  function slot(assetId, standIn) {
    const holder = new THREE.Group();
    holder.add(standIn);
    const entry = { holder, model: standIn, antenna: standIn.getObjectByName('antenna') ?? null, real: false };
    real[assetId] = false;
    const assets = context.assets;
    if (assets && assets.registry && assets.registry[assetId] && typeof assets.load === 'function') {
      Promise.resolve()
        .then(() => (assets.has(assetId) ? null : assets.load([assetId])))
        .then(() => {
          const model = assets.instantiate(assetId);
          holder.remove(standIn);
          holder.add(model);
          entry.model = model;
          entry.antenna = model.getObjectByName('antenna') ?? null;
          entry.real = true;
          real[assetId] = true;
          for (const group of ['nav_red', 'nav_green', 'mast', 'beacon', 'stern', 'nav']) setLampGroup(model, group);
        })
        .catch(() => { /* the stand-in stays */ });
    }
    return entry;
  }

  /** Lights a lamp group of an asset by the contract's node name (lamp_<group>). */
  function setLampGroup(model, group) {
    model.traverse((node) => {
      if (node.isMesh && node.name.startsWith(`lamp_${group}`) && node.material && 'emissiveIntensity' in node.material) {
        node.material.emissiveIntensity = Math.max(node.material.emissiveIntensity, 2.5);
      }
    });
  }

  // ---- the tower -------------------------------------------------------------------------
  const concrete = matt(0x9a9a94);
  const towerStandIn = new THREE.Group();
  const shaft = new THREE.Mesh(keep(new THREE.CylinderGeometry(1.8, 3, 30, 10)), concrete);
  shaft.position.y = 15;
  const dish = new THREE.Group();
  dish.name = 'antenna';
  dish.position.y = 31.5;
  dish.add(box(9, 3.4, 0.6, matt(GREY), 0, 1.2, -0.8));
  towerStandIn.add(shaft, dish);
  const wreckStandIn = new THREE.Group();
  const scorched = matt(0x2a2826);
  const stump = new THREE.Mesh(keep(new THREE.CylinderGeometry(2.6, 3, 5, 10)), scorched);
  stump.position.y = 2.5;
  const fallen = box(3.2, 3.2, 22, scorched, 4, 1.6, 12);
  fallen.rotation.y = 0.35;
  wreckStandIn.add(stump, fallen, box(8, 1.2, 3, scorched, -5, 0.6, 7));
  const tower = new THREE.Group();
  tower.visible = false;
  const standing = slot('radar_tower', towerStandIn);
  const wreck = slot('radar_tower_wreck', wreckStandIn);
  wreck.holder.visible = false;
  const pad = box(18, 1.6, 18, concrete, 0, -0.65, 0);
  const beacon = new THREE.Mesh(keep(new THREE.SphereGeometry(0.45, 8, 6)), lit(0xff2a1a));
  beacon.position.y = 36;
  tower.add(pad, standing.holder, wreck.holder, beacon);
  root.add(tower);
  let towerPlaced = false;
  let wrecked = false;
  let towerAt = null;

  function towerCollider() {
    const physics = context.systems.find('physics');
    if (!physics?.world?.addStaticBox || !towerAt) return;
    physics.removeStaticColliders?.(TOWER_COLLIDER.group);
    const [hx, hy, hz] = wrecked ? TOWER_COLLIDER.wreck : TOWER_COLLIDER.standing;
    physics.world.addStaticBox(towerAt.x, towerAt.groundY + hy, towerAt.z, hx, hy, hz, 0, { group: TOWER_COLLIDER.group, surface: 'concrete' });
  }

  // ---- the ships -------------------------------------------------------------------------
  const wakeGeometry = keep(new THREE.PlaneGeometry(13, 130));
  wakeGeometry.rotateX(-Math.PI / 2);
  const ships = [];
  function shipFor(index, record) {
    while (ships.length <= index) ships.push(null);
    if (ships[index]) return ships[index];
    const hull = matt(GREY);
    const standIn = new THREE.Group();
    const mast = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.35, 0.6, 14, 6)), hull);
    mast.position.set(0, 17, -4);
    const antenna = new THREE.Group();
    antenna.name = 'antenna';
    antenna.position.set(0, 24, -4);
    antenna.add(box(5.5, 1.3, 0.4, hull, 0, 0, 0));
    standIn.add(box(10.5, 5, 82, hull, 0, 1.2, 0), box(7.5, 5.5, 27, hull, 0, 6.4, -3), box(5, 3, 9, hull, 0, 10.6, -6), mast, antenna,
      box(0.5, 0.5, 0.5, lit(0xff2a1a), -3.9, 9.6, -12), box(0.5, 0.5, 0.5, lit(0x2aff5a), 3.9, 9.6, -12), box(0.5, 0.5, 0.5, lit(0xfff2d0), 0, 24.6, -4));
    const model = slot('navy_picket_ship', standIn);
    const wakeMaterial = keep(new THREE.MeshBasicMaterial({ color: 0xdfeef0, transparent: true, opacity: 0.16, depthWrite: false }));
    const wake = new THREE.Mesh(wakeGeometry, wakeMaterial);
    wake.position.set(0, 0.25, 41 + 62);
    const group = new THREE.Group();
    group.add(model.holder, wake);
    // The beam on the sea: a thin additive wedge as long as the radar reaches.
    const half = ((record.beamWidth / 2) * Math.PI) / 180;
    const beamGeometry = keep(new THREE.CircleGeometry(record.range, 2, Math.PI / 2 - half, half * 2));
    beamGeometry.rotateX(-Math.PI / 2);
    const beamMaterial = keep(new THREE.MeshBasicMaterial({ color: 0x9fffd0, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    const beam = new THREE.Mesh(beamGeometry, beamMaterial);
    beam.renderOrder = 3;
    root.add(group, beam);
    ships[index] = { group, model, wake, wakeMaterial, beam, beamMaterial };
    return ships[index];
  }

  // ---- the bomb --------------------------------------------------------------------------
  const bombBody = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.23, 0.23, 3.6, 8).rotateX(Math.PI / 2)), matt(0x30343a));
  const bombStandIn = new THREE.Group();
  bombStandIn.add(bombBody, box(1.1, 0.05, 0.5, matt(0x30343a), 0, 0, 1.5), box(0.05, 1.1, 0.5, matt(0x30343a), 0, 0, 1.5));
  const bombSlot = slot('guided_bomb', bombStandIn);
  bombSlot.holder.visible = false;
  root.add(bombSlot.holder);
  const ahead = new THREE.Vector3();

  /** How dark it is, 0 (day) .. 1 (night and dawn), from the clock. */
  function darkness() {
    const hour = context.clock?.timeOfDay;
    if (!Number.isFinite(hour)) return 0;
    const fromNoon = Math.abs(hour - 13);
    return Math.min(1, Math.max(0, (fromNoon - 5) / 1.2));
  }

  return {
    real,

    /**
     * One frame.
     * @param {Array<object>} records The emitter records of radarNetworkRuntime.js (tower first).
     * @param {boolean} placed The tower's ground height is known.
     * @param {{active: boolean, x: number, y: number, z: number, vx: number, vy: number, vz: number}} bomb
     * @param {object | null} lead @param {number} time @param {number} dt
     */
    sync(records, placed, bomb, lead, time, dt) {
      void lead; void dt;
      const camera = context.view?.camera?.position ?? null;
      const record = records[0];
      if (placed && !towerPlaced) {
        towerPlaced = true;
        towerAt = record;
        tower.position.set(record.x, record.groundY, record.z);
        tower.visible = true;
        towerCollider();
      }
      if (towerPlaced) {
        if (standing.antenna && !wrecked) standing.antenna.rotation.y = (-record.beamAzimuth * Math.PI) / 180;
        beacon.visible = !wrecked && time % 1.4 < 0.7;
      }
      const dark = darkness();
      const sea = context.systems.find('openSea');
      for (let i = 1; i < records.length; i += 1) {
        const r = records[i];
        const distance = camera ? Math.hypot(camera.x - r.x, camera.z - r.z) : 0;
        const show = r.active && distance < SHIP_DRAW_DISTANCE;
        if (!show && !ships[i - 1]) continue;
        const ship = shipFor(i - 1, r);
        ship.group.visible = show;
        ship.beam.visible = show && dark > 0.02;
        if (!show) continue;
        ship.group.position.set(r.x, 0, r.z);
        ship.group.rotation.y = -r.heading;
        if (ship.model.antenna) ship.model.antenna.rotation.y = -((r.beamAzimuth * Math.PI) / 180 - r.heading);
        const haze = typeof sea?.hazeAmountAt === 'function' ? sea.hazeAmountAt(distance, camera ? camera.y : 0) : Math.max(0, (distance - 6500) / 2500);
        const clear = 1 - Math.min(1, Math.max(0, Number.isFinite(haze) ? haze : 0));
        ship.model.holder.visible = clear > 0.03;
        ship.wakeMaterial.opacity = 0.16 * clear;
        ship.beam.position.set(r.x, 1.5, r.z);
        ship.beam.rotation.y = (-r.beamAzimuth * Math.PI) / 180;
        ship.beamMaterial.opacity = 0.055 * dark * clear;
      }
      bombSlot.holder.visible = bomb.active;
      if (bomb.active) {
        bombSlot.holder.position.set(bomb.x, bomb.y, bomb.z);
        ahead.set(bomb.x - bomb.vx, bomb.y - bomb.vy, bomb.z - bomb.vz); // the nose is -Z: look away from where it came
        bombSlot.holder.lookAt(ahead);
      }
    },

    /** Swaps the standing tower and its wreck (and their colliders). */
    setTowerWrecked(next) {
      wrecked = Boolean(next);
      standing.holder.visible = !wrecked;
      wreck.holder.visible = wrecked;
      beacon.visible = !wrecked;
      if (towerPlaced) towerCollider();
    },

    dispose() {
      context.systems.find('physics')?.removeStaticColliders?.(TOWER_COLLIDER.group);
      root.removeFromParent();
      for (const thing of disposables) thing.dispose();
    },
  };
}
