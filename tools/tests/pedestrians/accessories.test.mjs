// Optional accessories: a La Corriente stevedore wears the hard hat by the catalog's chance (0.4),
// rolled from the person's own picks so the rest of the crowd's looks do not shift; a body base
// that carries a 'hard_hat' node keeps it out of the merged body and shows it only on the people
// who wear it, at the level of detail drawn (the nearest lower one when a level has none).
import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

register('../city-world/vendoredThreeHook.mjs', import.meta.url);
const THREE = await import('three');
const { pickAppearance, accessoryRoll } = await import('../../../game/src/pedestrians/crowdSpawning.js');
const { accessoryOf } = await import('../../../game/src/pedestrians/pedestrianBodies.js');
const { GANGS_AND_FACTIONS, FACTION_MEMBERS } = await import('../../../game/src/catalog/gangsAndFactions.js');

function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function stevedoreAppearance() {
  const faction = GANGS_AND_FACTIONS.la_corriente;
  for (const id of faction.members) {
    const member = FACTION_MEMBERS[id];
    if (member && member.appearance && member.appearance.outfits.some((o) => (o.accessories || []).some((a) => a.piece === 'hard_hat'))) return member.appearance;
  }
  return null;
}

test('about 40% of stevedores wear the hard hat, and the roll leaves the other picks alone', () => {
  const appearance = stevedoreAppearance();
  assert.ok(appearance, 'La Corriente has an outfit with a hard hat');
  const hatChance = appearance.outfits.flatMap((o) => o.accessories || []).find((a) => a.piece === 'hard_hat').chance;
  const random = seeded(11);
  let worn = 0, withHatOutfit = 0;
  for (let i = 0; i < 2000; i += 1) {
    const look = pickAppearance(appearance, random);
    assert.ok(Array.isArray(look.accessories));
    if (look.outfit === 'vest') withHatOutfit += 1;
    if (look.accessories.includes('hard_hat')) worn += 1;
  }
  const share = worn / withHatOutfit;
  assert.ok(Math.abs(share - hatChance) < 0.06, `hard hat on ${(share * 100).toFixed(1)}% of the vest outfits (catalog ${hatChance})`);
  // The same random sequence gives the same people with or without accessories in the outfit.
  const bare = { ...appearance, outfits: appearance.outfits.map((o) => ({ ...o, accessories: [] })) };
  const a = seeded(5), b = seeded(5);
  for (let i = 0; i < 50; i += 1) {
    const x = pickAppearance(appearance, a), y = pickAppearance(bare, b);
    assert.deepEqual(x.paints, y.paints);
    assert.equal(x.height, y.height);
  }
  assert.equal(accessoryRoll(1.8, '#8D5A3B', '#F28C28', 2), accessoryRoll(1.8, '#8D5A3B', '#F28C28', 2), 'repeatable');
});

test('a hard_hat node is recognised by its own or its parent\'s name, not other parts', () => {
  const root = new THREE.Object3D();
  const lod0 = new THREE.Object3D(); lod0.name = 'lod0'; root.add(lod0);
  const hat = new THREE.Mesh(); hat.name = 'hard_hat_lod0'; lod0.add(hat);
  const group = new THREE.Object3D(); group.name = 'acc_hard_hat'; lod0.add(group);
  const inner = new THREE.Mesh(); inner.name = 'Mesh_12'; group.add(inner);
  const body = new THREE.Mesh(); body.name = 'body_lod0'; lod0.add(body);
  assert.equal(accessoryOf(hat, root), 'hard_hat');
  assert.equal(accessoryOf(inner, root), 'hard_hat');
  assert.equal(accessoryOf(body, root), null);
});
