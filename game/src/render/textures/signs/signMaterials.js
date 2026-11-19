// The sign library: paints signs with signPainter.js from the brand catalog and hands out cached
// three.js materials for them, each with the real size of its face.
//
//   const signs = createSignLibrary();
//   const { material, aspect } = signs.brandSign('dos_soles_diner', { aspect: 4 });
//   const plate = signs.licencePlate('MZL 4821');             // plate.widthMetres = 0.305
//   // every frame, or when the hour changes: signs glow at night
//   signs.setNight(atmosphere.state.nightFactor);
//
// A sign is a quad with 0..1 UVs (u to the reader's right, v up). Materials are physically based
// and lit by the scene; the emissive map (neon tubes, light boxes) is scaled by setNight().

import * as THREE from 'three';
import { BRANDS_AND_SIGNAGE, SIGN_STYLES } from '../../../catalog/brandsAndSignage.js';
import { textureAnisotropyFor } from '../textureQuality.js';
import { paintBillboard, paintBrandSign, paintLicencePlate, paintStreetNamePlate } from './signPainter.js';

/**
 * Creates a sign library.
 * @returns {{brandSign: Function, billboard: Function, streetNamePlate: Function, licencePlate: Function,
 *   setNight: (nightFactor: number) => void, stats: {signs: number}, dispose: () => void}}
 */
export function createSignLibrary() {
  /** @type {Map<string, SignEntry>} */
  const entries = new Map();
  let night = 0;

  /** Returns the cached entry for a key, painting it on first use. */
  function entry(key, paint) {
    let found = entries.get(key);
    if (!found) {
      found = createSignEntry(paint());
      found.material.emissiveIntensity = found.glow * night;
      entries.set(key, found);
    }
    return found;
  }

  const brandOf = (brand) => {
    const resolved = typeof brand === 'string' ? BRANDS_AND_SIGNAGE[brand] : brand;
    if (!resolved) throw new Error(`unknown brand "${brand}"`);
    return resolved;
  };
  const styleOf = (brand, options) => SIGN_STYLES[options.style ?? brand.signStyle] ?? SIGN_STYLES.block_letters;
  const keyOf = (kind, id, options) => `${kind}|${id}|${Object.keys(options).sort().map((name) => `${name}=${options[name]}`).join(',')}`;

  return {
    /**
     * A shop sign of a brand.
     * @param {string | Object} brand A brand id or an entry of BRANDS_AND_SIGNAGE.
     * @param {Object} [options] paintBrandSign options, plus `style` to override the brand's sign style.
     * @returns {SignEntry}
     */
    brandSign: (brand, options = {}) => {
      const resolved = brandOf(brand);
      return entry(keyOf('sign', resolved.id, options), () => paintBrandSign(resolved, styleOf(resolved, options), options));
    },
    /** A billboard poster of a brand (aspect 2.9 by default). @returns {SignEntry} */
    billboard: (brand, options = {}) => {
      const resolved = brandOf(brand);
      return entry(keyOf('billboard', resolved.id, options), () => paintBillboard(resolved, styleOf(resolved, options), options));
    },
    /** A street-name plate, 0.9 m wide. @returns {SignEntry} */
    streetNamePlate: (name, options = {}) => entry(keyOf('street', name, options), () => paintStreetNamePlate(name, options)),
    /** A licence plate, 0.305 m wide. @returns {SignEntry} */
    licencePlate: (text, options = {}) => entry(keyOf('plate', text, options), () => paintLicencePlate(text, options)),

    /** Scales every sign's glow by the atmosphere's night factor (0 by day, 1 at night). */
    setNight: (nightFactor) => {
      if (nightFactor === night) return;
      night = nightFactor;
      for (const found of entries.values()) found.material.emissiveIntensity = found.glow * night;
    },
    get stats() {
      return { signs: entries.size };
    },
    /** Frees every texture and material. */
    dispose: () => {
      for (const found of entries.values()) {
        found.material.map?.dispose();
        if (found.material.emissiveMap !== found.material.map) found.material.emissiveMap?.dispose();
        found.material.dispose();
      }
      entries.clear();
    },
  };
}

/**
 * @typedef {Object} SignEntry
 * @property {THREE.MeshStandardMaterial} material
 * @property {number} aspect Width over height of the face.
 * @property {number} glow Emissive intensity at full night.
 * @property {number | undefined} widthMetres Real width for plates.
 */

/** A mipmapped sRGB texture of a painted canvas. */
function createSignTexture(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = textureAnisotropyFor('sign');
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  return texture;
}

/** The material of a painted sign. @param {import('./signPainter.js').PaintedSign} sign */
function createSignEntry(sign) {
  const map = createSignTexture(sign.canvas);
  const material = new THREE.MeshStandardMaterial({ map, roughness: sign.roughness, metalness: 0 });
  if (sign.emissive) {
    material.emissiveMap = sign.emissive === sign.canvas ? map : createSignTexture(sign.emissive);
    material.emissive.set(0xffffff);
    material.emissiveIntensity = 0;
  }
  material.name = 'sign';
  material.userData.signGlow = sign.glow;
  return { material, aspect: sign.aspect, glow: sign.glow, widthMetres: sign.widthMetres };
}
