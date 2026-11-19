// How a playable lead looks on the shared character body: the catalog's appearance (skin, hair,
// jacket, top, trousers, shoes) turned into the body's six paint roles, written onto the lead's
// own copies of those materials (the asset library shares materials between instances), and the
// lead's height as a scale of the body. Used when a lead has no model of their own yet
// (sol_arrieta is drawn on dez_tolliver's body, recoloured).
import { STORY_CHARACTERS } from '../catalog/storyCharacters.js';

/** The paint roles of a character body, in the order the assets name them. */
export const LEAD_PAINT_ROLES = Object.freeze(['paint_skin', 'paint_hair', 'paint_jacket', 'paint_top', 'paint_bottom', 'paint_shoes']);

/**
 * A story character from the catalog by id, or null.
 * @param {string} characterId
 */
export function storyCharacter(characterId) {
  if (Array.isArray(STORY_CHARACTERS)) return STORY_CHARACTERS.find((entry) => entry.id === characterId) ?? null;
  return STORY_CHARACTERS[characterId] ?? null;
}

/**
 * The six paint colours of an appearance.
 * @param {{skinTone: string, hairColor: string, outfit: {top: {color: string, secondaryColor?: string}, bottom: {color: string}, shoes: {color: string}}}} appearance
 * @returns {Record<string, string>}
 */
export function leadPaints(appearance) {
  const outfit = appearance.outfit || {};
  const top = outfit.top || { color: '#3A3D40' };
  return {
    paint_skin: appearance.skinTone,
    paint_hair: appearance.hairColor,
    paint_jacket: top.color,
    paint_top: top.secondaryColor || top.color,
    paint_bottom: outfit.bottom ? outfit.bottom.color : '#3A3D40',
    paint_shoes: outfit.shoes ? outfit.shoes.color : '#2A2A2E',
  };
}

/**
 * Paints a lead's body from their catalog look and scales it to their height.
 * @param {import('three').Object3D} instance The lead's body (its paint materials are copied once).
 * @param {string} characterId
 * @param {number} [bodyHeight] The model's own height, metres.
 * @returns {boolean} Whether the character was found.
 */
export function dressLead(instance, characterId, bodyHeight = 1.86) {
  const character = storyCharacter(characterId);
  if (!character || !character.appearance) return false;
  const paints = leadPaints(character.appearance);
  const copies = new Map();
  instance.traverse((node) => {
    if (!node.isMesh) return;
    const list = Array.isArray(node.material) ? node.material : [node.material];
    for (let i = 0; i < list.length; i += 1) {
      const material = list[i];
      const colour = paints[material.name];
      if (!colour) continue;
      let own = material.userData.leadCopy ? material : copies.get(material.name);
      if (!own) {
        own = material.clone();
        own.userData.leadCopy = true;
        copies.set(material.name, own);
      }
      own.color.set(colour);
      if (Array.isArray(node.material)) node.material[i] = own; else node.material = own;
    }
  });
  instance.scale.setScalar((character.appearance.height || bodyHeight) / bodyHeight);
  return true;
}
