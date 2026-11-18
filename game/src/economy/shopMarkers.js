// The shop and property markers in the world: a modest ground ring with a low glow at each shop
// door, coloured by what the place is (gun shops coral, clothes pink, paint and garages sky blue,
// food gold, a property for sale green and an owned one amber, PROPERTY_RULES' sign colours).
// Small on purpose (SHOP_MARKER_SHAPE: 0.85 m, 1.1 m of glow): a marker reads as a sign on the
// pavement, not a shell over the street. The glow fades out when the lead or the camera comes
// close (missions' markerFade), so nobody stands tinted inside it; the ring stays. A small pool
// is placed at the nearest places each time the lead moves on; the whole pool is hidden outside
// free play (shopMarkerRules.js). Additive, unlit, no shadows, shared geometry, no allocation per
// frame.
import * as THREE from 'three';
import { easeFade, markerFade, nearestViewerGap } from '../missions/markerFade.js';
import { SHOP_MARKER_SHAPE } from './shopMarkerRules.js';

/** Marker colour by shop kind, and for properties. */
export const MARKER_COLOURS = Object.freeze({
  gun_shop: '#FF6F59', clothing_store: '#F6A6D2', paint_and_body_shop: '#7CC8FF', mod_garage: '#7CC8FF', fuel_station: '#7CC8FF',
  diner: '#FFD36B', bar_cantina: '#FFD36B', convenience_store: '#FFD36B', motel: '#B9A8FF', property_for_sale: '#3FBF6A', property_owned: '#FFC53D',
});

/**
 * Creates the pool.
 * @param {THREE.Object3D} layer context.view.layers.dynamic.
 * @param {{count?: number}} [options]
 */
export function createShopMarkers(layer, options = {}) {
  const count = options.count ?? 6;
  const shape = SHOP_MARKER_SHAPE;
  const root = new THREE.Group();
  root.name = 'economy-shop-markers';
  root.visible = false;
  layer.add(root);
  const shell = fadingCylinder(shape.radius, shape.height);
  const ring = new THREE.RingGeometry(shape.ringInner, shape.radius, 40, 1).rotateX(-Math.PI / 2);
  const markers = [];
  for (let i = 0; i < count; i += 1) {
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0, vertexColors: true, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false,
    });
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: shape.ring, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
    const group = new THREE.Group();
    const column = new THREE.Mesh(shell, material);
    const base = new THREE.Mesh(ring, ringMaterial);
    base.position.y = 0.04;
    column.castShadow = base.castShadow = false;
    column.receiveShadow = base.receiveShadow = false;
    group.add(column, base);
    group.visible = false;
    root.add(group);
    markers.push({ group, material, ringMaterial, placeId: null, fade: 0 });
  }
  const colour = new THREE.Color();
  let time = 0;
  let hiddenId = null;

  return {
    root,

    /** Whether any marker is drawn (false outside free play). */
    setShown(on) {
      root.visible = Boolean(on);
    },

    /**
     * Shows the markers at these places (at most the pool's size), hides the rest.
     * @param {({id: string, x: number, y: number, z: number, spotX?: number, spotZ?: number, colour: string} | null)[]} places
     *   Nearest first; spotX/spotZ, when given, is where the marker is drawn (off cars and people).
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
        if (marker.placeId !== place.id) marker.fade = 0;
        marker.placeId = place.id;
        marker.group.visible = true;
        marker.group.position.set(place.spotX ?? place.x, place.y, place.spotZ ?? place.z);
        colour.set(place.colour);
        marker.material.color.copy(colour);
        marker.ringMaterial.color.copy(colour);
      }
    },

    /**
     * Breathes the glow a little and fades it near the lead and the camera.
     * @param {number} deltaSeconds
     * @param {{x: number, z: number} | null} [lead]
     * @param {{x: number, z: number} | null} [camera]
     */
    update(deltaSeconds, lead = null, camera = null) {
      if (!root.visible) return;
      time += deltaSeconds;
      const pulse = shape.glow + shape.pulse * Math.sin(time * 2.4);
      for (const marker of markers) {
        if (!marker.group.visible) continue;
        const { x, z } = marker.group.position;
        const target = marker.placeId === hiddenId ? 0 : markerFade(nearestViewerGap(x, z, lead, camera), shape.radius);
        marker.fade = easeFade(marker.fade, target, deltaSeconds);
        marker.material.opacity = pulse * marker.fade;
        marker.group.children[0].visible = marker.fade > 0.01;
      }
    },

    /** Hides the glow of one place (the shop whose menu is open). */
    hideColumn(placeId) {
      hiddenId = placeId;
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
