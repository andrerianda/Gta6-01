// Prop sign faces: the names painted on the blank sign anchors of the pooled street props, all of
// our own invention: shop names on the awning valances, fruit stalls, news stands and hot-dog
// carts of set_commerce, drinks brands on its vending machines, shipping lines and hauliers on
// set_port's containers, stacks, trailers and shed fascias, and an advert on set_roadside's
// billboard. One city-wide instanced quad (one draw), an atlas painted once with the texture
// toolkit's paintBrandSign / paintBillboard, the name of an item picked from a stable hash of its
// position. Each face has its own reach (a valance name is dropped beyond 90 m, a billboard
// beyond 700 m) and glow (vending fronts and billboards light up at night, a container does not).
//
//   const faces = createPropSignFaces({ assets });
//   const handle = faces.addSector(pooledInstances);   // the groups handed to the street item pools
//   faces.setNightFactor(night); faces.update();       // once per frame
import * as THREE from 'three';
import { BRANDS_AND_SIGNAGE, SIGN_STYLES } from '../../catalog/brandsAndSignage.js';
import { createSignCanvas, paintBillboard, paintBrandSign } from '../../render/textures/signs/signPainter.js';

/** Shops of our own for the shop furniture (Spanish, as the city's signs are). */
export const SHOP_NAMES = Object.freeze(['Panadería Mar Chica', 'Ferretería Hermanos Vidal', 'Farmacia Alba', 'Frutería Tamarindo',
  'Barbería El Faro', 'Lavandería Burbuja', 'Bodega Doña Celia', 'Zapatería Paso Firme', 'Óptica Claridad', 'Mango Verde',
  'Peluquería Rizos', 'Kiosko La Esquina', 'Café Brisa', 'Mariscos El Bote', 'Tacos Marazul', 'Joyería Perla Negra',
  'Prensa del Puerto', 'Perritos Tito', 'Licores La Ola', 'Bazar Coralito']);
/** Street food stands of our own (hot-dog carts). */
export const STAND_NAMES = Object.freeze(['Perritos Tito', 'Doble Mostaza', 'El Pancho Feliz', 'Salchi Playa', 'Hot Dog Coral', 'Don Chorizo']);
/** Shipping lines and hauliers of our own, besides the catalog's. */
export const CARGO_NAMES = Object.freeze(['Marítima Coralina', 'Línea Azul Caribe', 'Transportes Ibarra', 'Cargas del Sur',
  'Atlántica Bermeja', 'Naviera Punta Brava']);
const CARGO_IDS = Object.freeze(['naviera_tamarindo', 'gaviota_express', 'frigorificos_golfo']);

/**
 * Each object's sign anchors: [anchor, width, height, class]. A face stands on the anchor's
 * outward side (the one of its +-Z that points away from the object's centre).
 */
export const PROP_SIGN_ANCHORS = Object.freeze({
  awning_shop: [['anchor_sign', 2.7, 0.2, 'band']],
  fruit_stall: [['anchor_sign', 2.0, 0.2, 'band']],
  news_stand: [['anchor_sign', 1.6, 0.19, 'band']],
  hotdog_cart: [['anchor_sign', 1.1, 0.36, 'stand']],
  vending_drinks: [['anchor_sign', 0.56, 1.34, 'vending']],
  container_20: [['anchor_sign_a', 3.6, 0.75, 'cargo'], ['anchor_sign_b', 3.6, 0.75, 'cargo']],
  container_40: [['anchor_sign_a', 7.6, 0.95, 'cargoBand'], ['anchor_sign_b', 7.6, 0.95, 'cargoBand']],
  container_stack: [['anchor_sign_a', 7.6, 0.95, 'cargoBand'], ['anchor_sign_b', 7.6, 0.95, 'cargoBand']],
  box_trailer: [['anchor_sign_a', 10.5, 1.9, 'cargo'], ['anchor_sign_b', 10.5, 1.9, 'cargo']],
  steel_shed: [['anchor_sign', 3.8, 1.1, 'cargo']],
  billboard_monopole: [['anchor_sign', 12, 4, 'billboard']],
});
/** Per class: atlas cell size (pixels), cells per row, first row's y, reach (m), night glow. */
const CLASSES = Object.freeze({
  billboard: { width: 512, height: 176, columns: 4, y: 0, reach: 700, glow: 0.8 },
  cargo: { width: 512, height: 128, columns: 4, y: 352, reach: 260, glow: 0 },
  cargoBand: { width: 512, height: 64, columns: 4, y: 736, reach: 260, glow: 0 },
  band: { width: 512, height: 64, columns: 4, y: 928, reach: 90, glow: 0.25 },
  vending: { width: 128, height: 256, columns: 16, y: 1504, reach: 60, glow: 0.9 },
  stand: { width: 256, height: 96, columns: 8, y: 1760, reach: 60, glow: 0.2 },
});
const ATLAS_SIZE = 2048;
/** Faces stand this far proud of their anchor. */
const LIFT = 0.012;

/** The names (as brand-like entries) each class paints. */
export function signNamesOf(signClass) {
  const all = Object.values(BRANDS_AND_SIGNAGE);
  const own = (names, kind, style, palette) => names.map((name, i) => ({ id: `own_${kind}_${i}`, name, slogan: '', signStyle: style,
    colors: palette[i % palette.length], logo: '' }));
  const cargo = [...CARGO_IDS.map((id) => BRANDS_AND_SIGNAGE[id]).filter(Boolean),
    ...own(CARGO_NAMES, 'cargo', 'block_letters', [{ primary: '#F2F0E8', secondary: '#14294A', accent: '#C8372D' }, { primary: '#14294A', secondary: '#F2F0E8', accent: '#F2B544' }])];
  switch (signClass) {
    case 'billboard': return all.filter((brand) => brand.uses?.includes('billboard')).slice(0, 8);
    case 'vending': return all.filter((brand) => brand.uses?.includes('vending') || brand.kind === 'soft_drink' || brand.kind === 'beer').slice(0, 16);
    case 'cargo': case 'cargoBand': return cargo.slice(0, 12);
    case 'stand': return own(STAND_NAMES, 'stand', 'bubble_letters', [{ primary: '#D8432F', secondary: '#FFE08A', accent: '#1E1E20' },
      { primary: '#FFD23F', secondary: '#C8372D', accent: '#FFFFFF' }]);
    default: return own(SHOP_NAMES, 'shop', 'painted_wall', [{ primary: '#F4EFE6', secondary: '#7C1F2B', accent: '#2F6F6A' },
      { primary: '#1E1E20', secondary: '#F2C230', accent: '#D8432F' }, { primary: '#2F6F6A', secondary: '#FFFFFF', accent: '#F2B544' },
      { primary: '#FFFFFF', secondary: '#14294A', accent: '#C8372D' }]).slice(0, 36);
  }
}

/** The anchor transforms of a set's sign-bearing objects, relative to each object's node. */
function readAnchors(asset) {
  const found = new Map();
  const scene = asset?.scene;
  if (!scene) return found;
  scene.updateMatrixWorld(true);
  const inverse = new THREE.Matrix4();
  const box = new THREE.Box3();
  const centre = new THREE.Vector3();
  const position = new THREE.Vector3();
  const axis = new THREE.Vector3();
  for (const [objectName, faces] of Object.entries(PROP_SIGN_ANCHORS)) {
    const node = scene.getObjectByName(objectName);
    if (!node) continue;
    inverse.copy(node.matrixWorld).invert();
    const level = scene.getObjectByName(`${objectName}_lod0`) ?? node;
    box.setFromObject(level).getCenter(centre).applyMatrix4(inverse);
    const list = [];
    for (const [anchorName, width, height, signClass] of faces) {
      const anchor = scene.getObjectByName(`${anchorName}__${objectName}`);
      if (!anchor) continue;
      const local = new THREE.Matrix4().multiplyMatrices(inverse, anchor.matrixWorld);
      // The quad faces +Z: turn it to the anchor's outward side, then lift it off the surface.
      position.setFromMatrixPosition(local);
      axis.set(local.elements[8], local.elements[9], local.elements[10]).normalize();
      const outward = (position.x - centre.x) * axis.x + (position.z - centre.z) * axis.z >= 0 ? 1 : -1;
      if (outward < 0) local.multiply(new THREE.Matrix4().makeRotationY(Math.PI));
      local.multiply(new THREE.Matrix4().makeTranslation(0, 0, LIFT)).multiply(new THREE.Matrix4().makeScale(width, height, 1));
      list.push({ local, signClass, anchor: anchorName });
    }
    if (list.length) found.set(objectName, list);
  }
  return found;
}

/** A stable small hash of an item's position. */
const positionHash = (x, z, salt) => Math.abs(Math.floor(x * 7.31 + z * 13.17 + salt * 101)) >>> 0;

export function createPropSignFaces({ assets }) {
  const root = new THREE.Group();
  root.name = 'city_dressing_prop_signs';
  const anchorsBySet = new Map();
  const cells = {};
  const sectors = new Set();
  let atlas = null;
  let mesh = null;
  let capacity = 0;
  let total = 0;
  let dirty = false;
  const material = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0, emissive: 0xffffff, emissiveIntensity: 0,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  material.name = 'prop_sign_faces';
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 signCell;\nattribute vec2 signLook;\nvarying float vSignGlow;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n\tvMapUv = signCell.xy + uv * signCell.zw;\n#endif\n#ifdef USE_EMISSIVEMAP\n\tvEmissiveMapUv = signCell.xy + uv * signCell.zw;\n#endif\n\tvSignGlow = signLook.x;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n#ifdef USE_INSTANCING\n\tif ( distance( ( modelMatrix * instanceMatrix[ 3 ] ).xyz, cameraPosition ) > signLook.y ) gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 );\n#endif');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vSignGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vSignGlow;');
  };
  material.customProgramCacheKey = () => 'prop_sign_faces';

  function ensureAtlas() {
    if (atlas) return;
    const canvas = createSignCanvas(ATLAS_SIZE, ATLAS_SIZE);
    const context = canvas.getContext('2d');
    context.fillStyle = '#808080';
    context.fillRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);
    for (const [signClass, layout] of Object.entries(CLASSES)) {
      const names = signNamesOf(signClass);
      cells[signClass] = names.map((brand, index) => {
        const x = (index % layout.columns) * layout.width;
        const y = layout.y + Math.floor(index / layout.columns) * layout.height;
        const style = SIGN_STYLES[brand.signStyle] ?? SIGN_STYLES.block_letters;
        const aspect = layout.width / layout.height;
        const painted = signClass === 'billboard'
          ? paintBillboard(brand, style, { aspect, width: layout.width * 2, wear: 0.1, seed: index })
          : paintBrandSign(brand, style, { aspect, width: Math.max(256, layout.width), slogan: false, emblem: aspect < 6, wear: signClass.startsWith('cargo') ? 0.35 : 0.15, seed: index });
        context.drawImage(painted.canvas, x, y, layout.width, layout.height);
        return [x / ATLAS_SIZE, 1 - (y + layout.height) / ATLAS_SIZE, layout.width / ATLAS_SIZE, layout.height / ATLAS_SIZE];
      });
    }
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    material.map = map;
    material.emissiveMap = map;
    material.needsUpdate = true;
    atlas = map;
  }

  function anchorsOf(assetId) {
    if (!anchorsBySet.has(assetId)) anchorsBySet.set(assetId, assets?.has?.(assetId) ? readAnchors(assets.get(assetId)) : new Map());
    return anchorsBySet.get(assetId);
  }

  function rebuild() {
    dirty = false;
    total = 0;
    for (const sector of sectors) total += sector.count;
    if (total > capacity) {
      if (mesh) { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.dispose(); }
      capacity = Math.max(256, Math.ceil(total * 1.5));
      const geometry = new THREE.PlaneGeometry(1, 1);
      geometry.setAttribute('signCell', new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4));
      geometry.setAttribute('signLook', new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2));
      mesh = new THREE.InstancedMesh(geometry, material, capacity);
      mesh.name = 'prop_sign_faces';
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      root.add(mesh);
    }
    if (!mesh) return;
    const cellAttribute = mesh.geometry.getAttribute('signCell');
    const lookAttribute = mesh.geometry.getAttribute('signLook');
    let index = 0;
    for (const sector of sectors) {
      mesh.instanceMatrix.array.set(sector.matrices, index * 16);
      cellAttribute.array.set(sector.cells, index * 4);
      lookAttribute.array.set(sector.looks, index * 2);
      index += sector.count;
    }
    mesh.count = total;
    mesh.visible = total > 0;
    mesh.instanceMatrix.needsUpdate = true;
    cellAttribute.needsUpdate = true;
    lookAttribute.needsUpdate = true;
  }

  const item = new THREE.Matrix4();
  const face = new THREE.Matrix4();
  return {
    object3d: root,
    /** The faces of a sector's pooled groups ({source: {assetId, object, select?}, matrices, count}). */
    addSector(instances) {
      const faces = [];
      for (const group of instances ?? []) {
        const { source } = group;
        if (!source?.object || (source.select && source.select !== 'body') || !PROP_SIGN_ANCHORS[source.object]) continue;
        const anchors = anchorsOf(source.assetId).get(source.object);
        if (anchors) faces.push({ group, anchors });
      }
      if (!faces.length) return { dispose() {} };
      ensureAtlas();
      let count = 0;
      for (const { group, anchors } of faces) count += group.count * anchors.length;
      const matrices = new Float32Array(count * 16);
      const cellData = new Float32Array(count * 4);
      const looks = new Float32Array(count * 2);
      let n = 0;
      for (const { group, anchors } of faces) {
        for (let i = 0; i < group.count; i += 1) {
          item.fromArray(group.matrices, i * 16);
          // One name per item (both sides of a box carry the same line).
          const hash = positionHash(group.matrices[i * 16 + 12], group.matrices[i * 16 + 14], 3);
          for (const each of anchors) {
            const list = cells[each.signClass];
            face.multiplyMatrices(item, each.local).toArray(matrices, n * 16);
            cellData.set(list[hash % list.length], n * 4);
            looks[n * 2] = CLASSES[each.signClass].glow;
            looks[n * 2 + 1] = CLASSES[each.signClass].reach;
            n += 1;
          }
        }
      }
      const sector = { count: n, matrices, cells: cellData, looks };
      sectors.add(sector);
      dirty = true;
      return { dispose() { if (sectors.delete(sector)) dirty = true; } };
    },
    setNightFactor(night) { material.emissiveIntensity = 1.4 * Math.max(0, Math.min(1, night)); },
    update() { if (dirty) rebuild(); },
    stats: () => ({ faces: total, draws: total > 0 ? 1 : 0 }),
    dispose() {
      sectors.clear();
      if (mesh) { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.dispose(); }
      atlas?.dispose();
      material.dispose();
    },
  };
}
