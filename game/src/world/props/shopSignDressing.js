// Lit shop signs of the shopping streets (Gran Via and Centro, the beach strip): neon tubes and
// light boxes of the city's own brands (catalog/brandsAndSignage.js) over the shop fronts the
// building assembly names (buildingMeshAssembly's `shopSigns`). Each shop gets a fascia sign flat
// on the facade over its window; about one in three also a blade sign standing out over the
// pavement, painted on both sides, so the street reads in colour seen along it. The signs are
// emissive panels only: they light no ground pool and register no light, but the wet streets'
// mirror (world/streets/wetStreetReflection.js) draws them, so they streak in the soaked road.
//
//   const signs = createShopSigns();
//   const handle = signs.addSector(buildings.shopSigns);    // when a sector streams in
//   signs.setNightFactor(atmosphere.state.nightFactor);    // every frame
//   handle.dispose();                                      // when it streams out
//
// One instanced quad for the whole city (one draw), an atlas of 4 x 16 painted cells (base colour
// and glow), signs dropped in the vertex shader beyond SHOP_SIGN_DISTANCE; no shadows.

import * as THREE from 'three';
import { BRANDS_AND_SIGNAGE, SIGN_STYLES } from '../../catalog/brandsAndSignage.js';
import { createSignCanvas, paintBrandSign } from '../../render/textures/signs/signPainter.js';

/** Signs are not drawn beyond this distance from the camera (metres). */
export const SHOP_SIGN_DISTANCE = 280;
/** Districts whose shop fronts carry lit signs. */
export const SHOP_SIGN_DISTRICTS = Object.freeze(new Set(['centro', 'playa_dorada']));
/** Glow of a neon tube at full night (the light boxes are painted at a quarter of it). */
const NEON_GLOW = 2.2;
const ATLAS = Object.freeze({ width: 2048, height: 2048, columns: 4, rows: 16 });
const FASCIA = Object.freeze({ height: 0.62, maxWidth: 3.4, centreY: 3.62, out: 0.14 });
const BLADE = Object.freeze({ width: 1.25, height: 0.32, centreY: 4.55, out: 0.85, every: 3 });

/** The lit storefront brands, neon first, by district (the beach strip leans to hotels and bars). */
export function shopSignBrands(district) {
  const lit = Object.values(BRANDS_AND_SIGNAGE).filter((brand) => brand.uses?.includes('storefront')
    && (SIGN_STYLES[brand.signStyle]?.glow || SIGN_STYLES[brand.signStyle]?.lit === 'lightbox'));
  const beach = new Set(['hotel', 'motel', 'nightclub', 'bar', 'diner', 'ice_cream', 'fast_food', 'fashion', 'coffee', 'casino']);
  return district === 'playa_dorada' ? lit.filter((brand) => beach.has(brand.kind)) : lit;
}

/**
 * Lays out the sign quads of a sector's shop fronts (pure; Node-tested).
 * @param {{x: number, y: number, z: number, nx: number, nz: number, width: number, district: string | null, key: number}[]} fronts
 * @returns {{x: number, y: number, z: number, rotationY: number, width: number, height: number, brand: string, blade: boolean}[]}
 */
export function layOutShopSigns(fronts) {
  const out = [];
  for (const front of fronts ?? []) {
    if (!SHOP_SIGN_DISTRICTS.has(front.district)) continue;
    const brands = shopSignBrands(front.district);
    if (!brands.length || front.width < 2) continue;
    const brand = brands[front.key % brands.length].id;
    // A quad faces +Z; turn it so +Z points out of the wall (n).
    const facing = Math.atan2(front.nx, front.nz);
    const width = Math.min(front.width - 0.7, FASCIA.maxWidth);
    out.push({ x: front.x + front.nx * FASCIA.out, y: front.y + FASCIA.centreY, z: front.z + front.nz * FASCIA.out,
      rotationY: facing, width, height: Math.min(FASCIA.height, width / 3), brand, blade: false });
    if ((front.key >>> 3) % BLADE.every !== 0) continue;
    // The blade: perpendicular to the wall, one quad per side so both read the right way round.
    // At the bay's edge (wall tangent t = (-nz, nx)), clear of the fascia's lettering.
    const edge = front.width / 2 - 0.3;
    const bx = front.x + front.nx * BLADE.out - front.nz * edge;
    const bz = front.z + front.nz * BLADE.out + front.nx * edge;
    const along = Math.atan2(-front.nz, front.nx);
    const bladeBrand = brands[(front.key >>> 5) % brands.length].id;
    for (const side of [0, Math.PI]) {
      out.push({ x: bx, y: front.y + BLADE.centreY, z: bz, rotationY: along + side, width: BLADE.width, height: BLADE.height, brand: bladeBrand, blade: true });
    }
  }
  return out;
}

/**
 * Creates the city's shop signs.
 * @returns {{object3d: THREE.Object3D, addSector: (fronts: object[]) => {dispose: () => void},
 *   setNightFactor: (nightFactor: number) => void, update: () => void,
 *   stats: () => {signs: number, draws: number, cells: number}, dispose: () => void}}
 */
export function createShopSigns() {
  const root = new THREE.Group();
  root.name = 'city_dressing_shop_signs';
  const sectors = new Set();
  const cells = new Map();
  let atlas = null;
  let mesh = null;
  let capacity = 0;
  let dirty = false;
  let total = 0;
  const material = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0, emissive: 0xffffff, emissiveIntensity: 0,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  material.name = 'shop_sign_faces';
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 signCell;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>
#ifdef USE_MAP
	vMapUv = signCell.xy + uv * signCell.zw;
#endif
#ifdef USE_EMISSIVEMAP
	vEmissiveMapUv = signCell.xy + uv * signCell.zw;
#endif`)
      .replace('#include <project_vertex>', `#include <project_vertex>
#ifdef USE_INSTANCING
	if ( distance( ( modelMatrix * instanceMatrix[ 3 ] ).xyz, cameraPosition ) > ${SHOP_SIGN_DISTANCE.toFixed(1)} ) gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 );
#endif`);
  };
  material.customProgramCacheKey = () => 'shop_sign_faces';

  /** Paints the atlas on first use: every lit brand once, base colour and glow. */
  function ensureAtlas() {
    if (atlas) return;
    const width = ATLAS.width / ATLAS.columns;
    const height = ATLAS.height / ATLAS.rows;
    const base = createSignCanvas(ATLAS.width, ATLAS.height);
    const glow = createSignCanvas(ATLAS.width, ATLAS.height);
    const baseContext = base.getContext('2d');
    const glowContext = glow.getContext('2d');
    glowContext.fillStyle = '#000';
    glowContext.fillRect(0, 0, ATLAS.width, ATLAS.height);
    const brands = shopSignBrands('centro').slice(0, ATLAS.columns * ATLAS.rows);
    brands.forEach((brand, index) => {
      const column = index % ATLAS.columns;
      const row = Math.floor(index / ATLAS.columns);
      const painted = paintBrandSign(brand, SIGN_STYLES[brand.signStyle], { aspect: 4, width, slogan: false, wear: 0.1, seed: index });
      baseContext.drawImage(painted.canvas, column * width, row * height, width, height);
      if (painted.emissive) {
        // Neon tubes at full glow; a light box (its whole face) at about half.
        glowContext.globalAlpha = painted.glow >= 1 ? 1 : 0.45;
        glowContext.drawImage(painted.emissive, column * width, row * height, width, height);
        glowContext.globalAlpha = 1;
      }
      // Canvas rows run down, texture v up: the cell's bottom-left corner in uv.
      cells.set(brand.id, [column / ATLAS.columns, 1 - (row + 1) / ATLAS.rows, 1 / ATLAS.columns, 1 / ATLAS.rows]);
    });
    const map = new THREE.CanvasTexture(base);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    const emissiveMap = new THREE.CanvasTexture(glow);
    emissiveMap.colorSpace = THREE.SRGBColorSpace;
    material.map = map;
    material.emissiveMap = emissiveMap;
    material.needsUpdate = true;
    atlas = { map, emissiveMap };
  }

  function rebuild() {
    dirty = false;
    total = 0;
    for (const sector of sectors) total += sector.signs.length;
    if (total > capacity) {
      if (mesh) { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.dispose(); }
      capacity = Math.max(256, Math.ceil(total * 1.5));
      const geometry = new THREE.PlaneGeometry(1, 1);
      geometry.setAttribute('signCell', new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4));
      mesh = new THREE.InstancedMesh(geometry, material, capacity);
      mesh.name = 'shop_sign_faces';
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.matrixAutoUpdate = false;
      root.add(mesh);
    }
    if (!mesh) return;
    const matrices = mesh.instanceMatrix.array;
    const cellArray = mesh.geometry.getAttribute('signCell');
    let index = 0;
    for (const sector of sectors) {
      matrices.set(sector.matrices, index * 16);
      cellArray.array.set(sector.cells, index * 4);
      index += sector.signs.length;
    }
    mesh.count = total;
    mesh.visible = total > 0;
    mesh.instanceMatrix.needsUpdate = true;
    cellArray.needsUpdate = true;
  }

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  return {
    object3d: root,
    addSector(fronts) {
      const signs = layOutShopSigns(fronts);
      if (!signs.length) return { dispose() {} };
      ensureAtlas();
      const matrices = new Float32Array(signs.length * 16);
      const cellData = new Float32Array(signs.length * 4);
      signs.forEach((sign, index) => {
        position.set(sign.x, sign.y, sign.z);
        rotation.setFromAxisAngle(up, sign.rotationY);
        scale.set(sign.width, sign.height, 1);
        matrix.compose(position, rotation, scale).toArray(matrices, index * 16);
        cellData.set(cells.get(sign.brand) ?? cells.values().next().value, index * 4);
      });
      const sector = { signs, matrices, cells: cellData };
      sectors.add(sector);
      dirty = true;
      return { dispose() { if (sectors.delete(sector)) dirty = true; } };
    },
    setNightFactor(nightFactor) {
      material.emissiveIntensity = NEON_GLOW * Math.max(0, Math.min(1, nightFactor));
    },
    update() { if (dirty) rebuild(); },
    stats: () => ({ signs: total, draws: total > 0 ? 1 : 0, cells: cells.size }),
    dispose() {
      sectors.clear();
      if (mesh) { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.dispose(); }
      atlas?.map.dispose();
      atlas?.emissiveMap.dispose();
      material.dispose();
    },
  };
}
