// Global quality switches of the texture toolkit: one detail scale that every generated texture
// obeys (a low quality tier halves every resolution with one call), and the anisotropy cap.
// The engine's quality table sets these once, before textures are requested; cached textures
// are keyed by their resolved size, so changing the scale later simply generates new ones.
//
//   setTextureDetailScale(0.5);              // low tier: 1024 -> 512, 512 -> 256
//   setTextureAnisotropy(renderer.capabilities.getMaxAnisotropy());

const settings = { detailScale: 1, anisotropy: 8, maxSize: 2048, minSize: 32 };

/**
 * Sets the global detail scale of generated textures.
 * @param {number} scale 1 for full resolution, 0.5 to halve every texture, 2 to double (the
 *   cinematic tier); the result is always a power of two between 32 and 2048.
 */
export function setTextureDetailScale(scale) {
  settings.detailScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
}

/** The current detail scale. @returns {number} */
export function getTextureDetailScale() {
  return settings.detailScale;
}

/**
 * Sets the anisotropic filtering level used for textures seen at grazing angles (ground, roads,
 * long walls). Pass the renderer's maximum; the toolkit never asks for more than 16.
 * @param {number} level
 */
export function setTextureAnisotropy(level) {
  settings.anisotropy = Math.max(1, Math.min(16, Math.floor(level) || 1));
}

/**
 * The anisotropy to use for a kind of texture.
 * @param {'ground' | 'wall' | 'sign' | 'decal'} [kind] Ground and decals lie flat and get the
 *   full level; walls and signs half of it.
 * @returns {number}
 */
export function textureAnisotropyFor(kind = 'ground') {
  if (kind === 'ground' || kind === 'decal') return settings.anisotropy;
  return Math.max(1, Math.min(settings.anisotropy, Math.ceil(settings.anisotropy / 2)));
}

/**
 * The resolution a texture is generated at: its nominal size times the detail scale, rounded to
 * a power of two.
 * @param {number} nominalSize The size the recipe was designed for (512, 1024 ...).
 * @returns {number}
 */
export function resolveTextureSize(nominalSize) {
  const wanted = nominalSize * settings.detailScale;
  const power = Math.round(Math.log2(Math.max(1, wanted)));
  return Math.max(settings.minSize, Math.min(settings.maxSize, 2 ** power));
}
