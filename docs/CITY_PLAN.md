# The city plan of Marazul

`game/src/world/plan/` turns a seeded generator into the whole city as plain data, with queries.
Nothing in it imports three.js, so it runs in Node and in the browser alike.

    import { createSeededRandom } from '../../core/random/seededRandom.js';
    import { generateCityPlan } from '../world/plan/cityPlanGenerator.js';
    const plan = generateCityPlan(createSeededRandom('marazul'), { landmarks, streetNames });   // options are optional

The default seed gives about 77 km of road, 570 segments, 308 intersections (70 with signals),
2570 lots and all 87 landmarks of `game/src/catalog/cityDistricts.js`, in about 0.35 s (0.5 s the
first time). The same seed always gives the same plan (`plan.digest`).

## Coordinates

World: metres, +X east, -Z north, sea level y = 0. The street grid is turned six degrees, so the
plan is drawn in **city coordinates** (e east, n north) and converted by `cityToWorld(e, n)` and
`worldToCity(x, z)` in `cityFrame.js`. The long east-west streets head 276 degrees when driven
westwards. `CITY_FRAME.extent` is the world rectangle of the height field (x -2048..2048,
z -1856..2240).

## What the plan holds

| Field | What it is |
| --- | --- |
| `plan.terrain` | Height field, 4 m grid: `heights`, `columns`, `rows`, `minX`, `minZ`, `heightAt`, `normalAt`, `shoreDistanceAt`, `isWaterAt`, `shoreKindAt`, `naturalSandAt` |
| `plan.coast` | `landRings` (mainland, island; each vertex has a shore kind), `carves` (river, channels, ponds: centre line, half widths, outline), `waterBodies` |
| `plan.districts`, `plan.districtById` | Nine polygons: `id`, `pattern`, `ring` (world), `x`, `z` (label point) |
| `plan.roads.nodes` | Intersections: `id`, `x`, `y`, `z`, `segments`, `arms` (sorted by angle: `segment`, `atStart`, `dx`, `dz`, `trim`, `phase`, `mustStop`), `control` (`signals`, `stop`, `none`, `cul_de_sac`, `exit`), `signal` (`phases` of arm indices with `green` and `yellow`, `allRed`, `cycle`, `offset`), `crosswalks`, `radius` |
| `plan.roads.segments` | Road pieces between two nodes: `id`, `a`, `b`, `points` (flat x, z; at most 10 m apart), `along`, `heights`, `length`, `key`, `name`, `district`, `bridge`, `trimA`, `trimB`, and the cross-section of `roadSpecifications.js`: `roadClass`, `lanesForward`, `lanesBackward`, `oneWay`, `laneWidth`, `medianWidth`, `parkingLeft/Right`, `sidewalkLeft/Right`, `width`, `halfWidth`, `corridorLeft/Right`, `speedLimit`, `streetscape` |
| `plan.lanes` | Directed traffic lanes (about 1430): `id`, `segment`, `direction` (1 along the segment, -1 against), `index` (0 innermost), `lanesInGroup`, `points` (centre line in the direction of travel, between the junction areas), `length`, `speedLimit`, `fromNode`, `toNode`, `leftLane`, `rightLane` (lane changes, -1 for none), `control`, `signalNode`, `phase`, `mustStop`, `successors` (`{lane, turn}` with turn `straight`, `left`, `right` or `uturn`; cul-de-sacs and map exits turn back) |
| `plan.lots` | Oriented rectangles: `id`, `ring` (counter-clockwise: front right, front left, back left, back right), `x`, `y` (ground), `z`, `frontX`, `frontZ`, `heading`, `width`, `depth`, `area`, `frontages` (`segment`, edge `ax, az, bx, bz`), `entrance`, `district`, `zone`, `zoning`, `floorsMin`, `floorsMax`, `style`, `corner`, `landmarkId`, `landmarkKind` |
| `plan.landmarks`, `plan.landmarkById` | `id`, `kind`, `name`, `district`, `lot`, `x`, `y`, `z`, `entrance`, `frontX`, `frontZ`, `facing` |
| `plan.cover` | 2 m raster of what is on the ground: 0 open, 1 paved road corridor, 2 dirt road, 3 + lot id |
| `plan.sectors` | 128 m grid; each cell lists `segments`, `nodes`, `lots` |
| `plan.stats`, `plan.diagnostics` | Totals for reports; problems found while building (empty on a good plan) |

`laneOffset(spec, direction, laneIndex)` and `walkwayOffset(spec, side)` in `roadSpecifications.js`
give lane centre lines and sidewalk lines from a segment. Traffic keeps to the right.

## Queries

| Call | Returns |
| --- | --- |
| `plan.heightAt(x, z)` | Ground height anywhere on the plane; falls away to the sea floor (-32) outside the city |
| `plan.normalAt(x, z, out?)` | Unit surface normal `[x, y, z]` |
| `plan.shoreDistanceAt(x, z)` | Metres to the coast: positive on land, negative in the water, valid far outside |
| `plan.isWaterAt(x, z)` | Whether the ground is below sea level |
| `plan.districtAt(x, z)` | District id (always answers) |
| `plan.surfaceAt(x, z)` | `paved`, `dirt`, `water`, `sand` or `grass` |
| `plan.lotAt(x, z)` | The lot at the point, or null |
| `plan.nearestRoad(x, z, maxDistance = 96)` | `{segment, along, distance, x, z}` or null |
| `plan.streetNameAt(x, z)` | Name of the nearest road |
| `plan.sectorAt(x, z)` | The 128 m sector, or null outside the extent |

## The map painter

`paintCityPlan(context, plan, {centerX, centerZ, scale, width, height}, style)` in
`cityPlanPainter.js` draws the plan to a 2D canvas, north up. `style` switches `lots`, `labels`,
`landmarks`, `landmarkLabels` and `zones`, and can override `CITY_MAP_PALETTE`. Preview:

    node tools/capture.mjs --root . --size 1100x1000 --page "tools/preview/city-plan.html?zones=1" --out /tmp/marazul/cityplan/plan.jpg

## Staging streets (`plan.stagingStreets`)

Both are dead straight and head 276 degrees westwards, so the golden-hour sun (azimuth 286.7)
stands just right of the vanishing point.

| Street | District | East end (x, z) | West end (x, z) | Length | Notes |
| --- | --- | --- | --- | --- | --- |
| Bulevar Dorado | playa_dorada | 989, 969 | -776, 783 | 1775 m | The beachfront drive with the palm median; the sand and the sea are on the south (left looking west), hotels on the north. Ground about 3.5 m |
| Gran Vía Marazul | centro | 1632, 353 | -705, 107 | 2350 m | The palm-lined grand avenue; the towers stand between city e -250 and 760, about x -240..770. Ground about 3 m |

## Skyline vantage points (`plan.vantagePoints`)

| Id | World x, z | Looks at | View |
| --- | --- | --- | --- |
| `mirador_de_la_loma` | 1153, -447 (ground 45 m) | 217, 324 | From the summit lookout of Las Lomas over Centro to the beach |
| `calzada_coral` | 1495, 1464 (bridge deck 6 m) | 346, 539 | From the island causeway across the water to the hotel front and the towers |
| `muelle_dorado` | 79, 1165 (over the sea) | 238, 226 | The beach, the hotels and the skyline head-on from offshore |
| `puente_rio_tamarindo` | -1125, -867 (bridge deck 6 m) | 89, 110 | From the highway bridge over factories to downtown |

## Not there yet

A nearest-lane query, kerbside and parking-bay spawn points, the pedestrian graph and boat lanes
(the lane graph itself is in `plan.lanes`); terrain conformed to roads and lot pads
(road heights live in `segment.heights`, lot pads in `lot.y`); special areas (promenade, pier,
marina slips, quays, rail, runway, parking bays); second frontages of corner lots.

## Tests

    node --test "tools/tests/world-plan/*.test.mjs"
