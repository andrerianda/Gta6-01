// The shop and property markers in the world: a soft column of light with a ground ring at each
// shop door, coloured by what the place is (gun shops coral, clothes pink, paint and garages
// sky blue, food gold, a property for sale green and an owned one amber, PROPERTY_RULES' sign
// colours). A small pool of markers is placed at the nearest places each time the lead moves
// on, so only a handful are drawn; additive, unlit, no shadows, shared geometry, no allocation
// per frame.
import * as THREE from 'three';

/** Marker colour by shop kind, and for properties. */
export const MARKER_COLOURS = Object.freeze({
  gun_shop: '#FF6F59', clothing_store: '#F6A6D2', paint_and_body_shop: '#7CC8FF', mod_garage: '#7CC8FF', fuel_station: '#7CC8FF',
  diner: '#FFD36B', bar_cantina: '#FFD36B', convenience_store: '#FFD36B', motel: '#B9A8FF', property_for_sale: '#3FBF6A', property_owned: '#FFC53D',
});

/**
 * Creates the pool.
 * @param {THREE.Object3D} layer context.view.layers.dynamic.
 * @param {{count?: number, radius?: number}} [options]
 */
export function createShopMarkers(layer, options = {}) {
  const count = options.count ?? 6;
  const radius = options.radius ?? 1.6;
  const root = new THREE.Group();
  root.name = 'economy-shop-markers';
  layer.add(root);
  const shell = fadingCylinder(radius, 2.2);
  const ring = new THREE.RingGeometry(radius * 0.7, radius, 40, 1).rotateX(-Math.PI / 2);
  const markers = [];
  for (let i = 0; i < count; i += 1) {
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.8, vertexColors: true, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false,
    });
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
    const group = new THREE.Group();
    const column = new THREE.Mesh(shell, material);
    const base = new THREE.Mesh(ring, ringMaterial);
    base.position.y = 0.04;
    column.castShadow = base.castShadow = false;
    group.add(column, base);
    group.visible = false;
    root.add(group);
    markers.push({ group, material, ringMaterial, placeId: null });
  }
  const colour = new THREE.Color();
  let time = 0;

  return {
    /**
     * Shows the markers at these places (at most the pool's size), hides the rest.
     * @param {{id: string, x: number, y: number, z: number, colour: string}[]} places Nearest first.
     */
    place(places) {
      for (let i = 0; i < markers.length; i += 1) {
        const marker = markers[i];
        const place = places[i];
        if (!place) {
          marker.group.visible = false;
          marker.placeId = null;
          continue;
        }
        marker.placeId = place.id;
        marker.group.visible = true;
        marker.group.position.set(place.x, place.y, place.z);
        colour.set(place.colour);
        marker.material.color.copy(colour);
        marker.ringMaterial.color.copy(colour);
      }
    },

    /** Breathes the light a little. */
    update(deltaSeconds) {
      time += deltaSeconds;
      const pulse = 0.7 + 0.15 * Math.sin(time * 2.4);
      for (const marker of markers) if (marker.group.visible) marker.material.opacity = pulse;
    },

    dispose() {
      root.removeFromParent();
      shell.dispose();
      ring.dispose();
      for (const marker of markers) {
        marker.material.dispose();
        marker.ringMaterial.dispose();
      }
    },
  };
}

/** An open cylinder whose vertex alpha fades from the ground up. */
function fadingCylinder(radius, height) {
  const geometry = new THREE.CylinderGeometry(radius, radius, height, 32, 1, true).translate(0, height / 2, 0);
  const position = geometry.attributes.position;
  const colours = new Float32Array(position.count * 4);
  for (let i = 0; i < position.count; i += 1) {
    const fade = 1 - position.getY(i) / height;
    colours.set([1, 1, 1, fade * fade], i * 4);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 4));
  return geometry;
}
