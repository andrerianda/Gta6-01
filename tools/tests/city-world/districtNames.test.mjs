// DISTRICT_ENTERED carries the district's display name from the catalog, not its id.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCityQueries } from '../../../game/src/world/cityQueries.js';
import { CITY_DISTRICTS } from '../../../game/src/catalog/cityDistricts.js';

/** The smallest plan createCityQueries accepts: one empty sector. */
const EMPTY_PLAN = {
  sectors: { minX: 0, minZ: 0, size: 128, columns: 1, rows: 1, cells: [{ lots: [], segments: [], nodes: [] }] },
  roads: { segments: [], nodes: [] },
  lanes: [],
  pedestrianGraph: { nodes: [], edges: [] },
  heightAt: () => 0,
  districtAt: () => 'barrio_hierro',
};

test('every catalog district has a display name and districtName returns it', () => {
  const queries = createCityQueries(EMPTY_PLAN);
  const ids = Object.keys(CITY_DISTRICTS);
  assert.ok(ids.length >= 8);
  for (const id of ids) {
    const name = queries.districtName(id);
    assert.equal(typeof name, 'string');
    assert.notEqual(name, id, `${id} has no display name`);
  }
  assert.equal(queries.districtName('barrio_hierro'), CITY_DISTRICTS.barrio_hierro.name);
  assert.equal(queries.districtName('nowhere'), 'nowhere');
});
