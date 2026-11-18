# MARAZUL physics: the interface

The game's own physics library, `game/src/physics/`. Pure simulation, no three.js, testable in Node.
Units and axes are those of `docs/CONVENTIONS.md`. One difference to remember: the physics speaks of a
**heading** as a compass angle (0 looks along -Z, a quarter turn looks along +X, clockwise seen from
above), which is **minus** a three.js `rotation.y`. Quaternions are the same in both.

Status: the collision world with trigger volumes, four-wheeled vehicles, motorcycles (lean model, a
rider who is thrown in crashes), boats on the injected sea, the helicopter (with a hover assist and an
autopilot), the character capsule (seen by queries, kept apart from other characters, pushed by
explosions) and `world.explode()` are done and tested. Knockable props and the cheap crowd and
traffic modes are not written yet.

## The world

    import { PhysicsWorld } from './physics/PhysicsWorld.js';
    const world = new PhysicsWorld({ ground, waterHeightAt });
    // ground: { heightAt(x, z), normalAt?(x, z, out), surfaceAt?(x, z) -> id or name, wetness? (0..1, read live) }

    world.advance(frameSeconds);      // runs 0..5 fixed steps of 1/60 s; world.alpha is the blend for drawing
    world.step();                     // or exactly one step (deterministic: same calls, same world.digest())

A slow frame never piles up work: `advance(seconds, maxSteps = 5)` drops time beyond `maxSteps`.

## Static geometry, streamed by sector

    const handles = world.addStatics(asset.colliders, { x, y, z, heading | quaternion, scale },
                                     { layer, surface, userRef, group: sectorId });
    world.addStaticBox(x, y, z, halfX, halfY, halfZ, heading, { group, userRef, surface, layer });
    world.addStaticCylinder(x, y, z, radius, halfHeight, { ... });
    world.addTriggerBox(x, y, z, halfX, halfY, halfZ, heading, { userRef, group });   // blocks nothing, reports
    world.removeStatic(handle);
    world.removeStaticGroup(sectorId);   // a sector streaming out

Descriptions are plain data, and the asset library's collider proxies fit as they are:
`{ shape: 'box' | 'cyl' | 'sphere' | 'capsule' | 'hull' | 'mesh', position, quaternion, size, vertices, indices }`
(`describePrism(footprint, yBottom, yTop)` and `describeRamp(width, length, height)` in
`collision/colliderDescriptions.js` make city shapes). Layers and ready-made masks are in
`collisionLayers.js` (`LAYER.STATIC` blocks sight, `LAYER.SEE_THROUGH` does not, `LAYER.TRIGGER` only
shows up in overlap queries that ask for it); surfaces are in `surfaceTypes.js`.

## Queries

All take a unit direction, a layer mask (default `MASK.SOLID`) and an ignore list (static handles, bodies
or your `userRef`s), allocate nothing, and write into `world.hit` (or the `out` you pass):

    world.raycast(ox, oy, oz, dx, dy, dz, maxDistance, mask, ignore, out)        -> boolean
    world.sphereCast(ox, oy, oz, dx, dy, dz, maxDistance, radius, mask, ignore, out)
    world.capsuleCast(ax, ay, az, bx, by, bz, radius, dx, dy, dz, maxDistance, mask, ignore, out)
    world.supportBelow(x, y, z, maxDrop, mask, ignore, out)       // what holds a point up; out.y is its height
    world.lineOfSight(ax, ay, az, bx, by, bz, mask = MASK.SIGHT, ignore)          -> true when clear
    world.overlapSphere(x, y, z, radius, mask, ignore, results)   -> count; world.overlaps.{kinds, indices, bodies}
    world.overlapCapsule(ax, ay, az, bx, by, bz, radius, mask, ignore, results)

A hit has `hit, kind (HIT_KIND.GROUND | STATIC | BODY | CHARACTER), distance, x, y, z, nx, ny, nz, body,
character, handle, userRef, surface, layer`.

Characters are upright capsules on `LAYER.CHARACTER`: only masks with that bit see them (`MASK.SHOT`,
`MASK.ALL`, or your own); `MASK.SOLID` and `MASK.SIGHT` do not. A character hit has
`kind === HIT_KIND.CHARACTER`, `character` (the CharacterController), `userRef` (its userRef),
`body === null`. Overlap lists put the controller in `bodies[i]` with `kinds[i] === HIT_KIND.CHARACTER`.
Ignore a character by its controller or its userRef (the shooter, the driver getting out).

## Bodies and actors

    const crate = world.createBody({ colliders: [{ shape: 'box', size: { x: 1, y: 1, z: 1 } }], mass: 40,
                                     x, y, z, heading, layer: LAYER.PROP, userRef });
    crate.applyImpulse(ix, iy, iz, px, py, pz);  crate.wake();
    crate.interpolatedPose(world.alpha, position, quaternion);   // where to draw the model's origin
    world.removeBody(crate);

An actor is anything with `beforeStep(world, dt)` (apply impulses; runs after gravity, before contacts)
and/or `afterStep(world, dt)`; add it with `world.addActor(actor)`. Vehicles are actors.

## Events

After stepping, read `world.events.items[0 .. world.events.count)` and then call `world.events.clear()`
(the world never clears them, so nothing is lost across several steps). Every event has the same
fields; the types reported today are `IMPACT` (bodies), `LANDING` and `KNOCKDOWN` (characters, in `a`;
a knockdown by a vehicle has it in `b`, one by `push()` has `nx, ny, nz` along the shove), `RIDER_THROWN`
(a motorcycle's body in `a`, its userRef in `aRef`, the seat point in `x, y, z`; read the launch from
`bike.riderThrow`), and `TRIGGER_ENTER` / `TRIGGER_EXIT` (`a` is the body or character whose centre
crossed, `staticHandle` and `bRef` are the trigger's handle and `userRef`).
`PHYSICS_EVENT.IMPACT`: `{ a, b, aRef, bRef, staticHandle, ground, x, y, z, nx, ny, nz (from a to b),
speed (closing, m/s), impulse (N s), energy (J), surface }`. `b` is null for the fixed world, and `bRef`
is then the static collider's `userRef`. A hard crash may be reported in two consecutive steps: add the
energies.

## Vehicles

    import { Vehicle } from './physics/vehicles/Vehicle.js';
    import { deriveVehicleTuning } from './physics/vehicles/vehicleTuning.js';
    const tuning = deriveVehicleTuning(VEHICLE_CATALOG.sports_coupe, wheels);   // once per model
    const car = new Vehicle(world, tuning, { x, z, heading, userRef });         // stands on the ground
    car.input.drive = 1;        // 1 ahead, -1 back; brakes first when rolling the other way
    car.input.steer = -1;       // -1 left .. 1 right (speed-sensitive lock is applied inside)
    car.input.handbrake = 1;    // locks the rear wheels
    car.speed, car.rpm, car.gear (-1 reverse), car.throttle, car.brake, car.heading, car.groundedWheels
    car.body.interpolatedPose(world.alpha, position, quaternion);               // the model's origin
    car.wheelHubPosition(i, out)  car.wheelSteer[i]  car.wheelSpin[i]  car.wheelContact[i]
    car.wheelSlip[i] (0 rolling .. 1 sliding: skid marks, smoke, squeal)  car.wheelSurface[i]
    car.placeAt(x, y, z, heading);  car.dispose();

`wheels` is optional: four `{ x, y, z, radius }` in **model space** (origin on the ground at the centre
of the vehicle, facing -Z, +X to its right), in the order front left, front right, rear left, rear right,
read from the model's `wheel_fl`, `wheel_fr`, `wheel_rl`, `wheel_rr` hubs. Without them the catalog's
wheelbase, width and wheel radius are used. The tuning reads from the catalog entry: `mass`,
`dimensions.{length, width, height, wheelbase, wheelRadius, groundClearance}`,
`handling.{topSpeed, zeroToHundred, timeToTopSpeed, braking, grip, driftTendency, driveWheels, suspension}`
and `engine.gears`. Engine power is solved from the 0 to 100 km/h time and drag from the top speed, so a
vehicle reaches the top speed its catalog entry states.

A parked car brakes itself, does not creep on slopes, and sleeps after a second; any `input.drive` or a
collision wakes it. A car left on its roof or side and nearly still is rolled back onto its wheels.

## Motorcycles

    import { Motorcycle } from './physics/vehicles/Motorcycle.js';
    const tuning = deriveVehicleTuning(VEHICLE_CATALOG.sport_motorcycle, [wheelF, wheelR]);   // or no hubs
    const bike = new Motorcycle(world, tuning, { x, z, heading, userRef, rider: false });
    bike.mount();  bike.dismount();                 // the rider gets on / off (off while fast: it falls)
    bike.input.drive / steer / handbrake            // as for a car; the lean follows by itself
    bike.lean (radians, + = top to the right), bike.riderSeated, bike.fallen, bike.seatPosition(out)
    bike.speed, bike.rpm, bike.gear, bike.wheelHubPosition(0 front | 1 rear, out), wheelSpin, wheelSlip ...

It is a `Vehicle` (everything in the section above applies) with two hubs in model space, `wheel_f`
then `wheel_r`; `deriveVehicleTuning` takes a two-wheeler from the catalog class `motorcycle`, the flag
`two_wheeled`, or two hubs given. While a rider sits on it a lean controller rolls the bike to the lean
the turn needs (`atan(sideways acceleration / g)`, at most `atan(grip)`); the tyres touch on a round
profile, so draw the wheels at `wheelHubPosition` and they stay on the road at full lean. A parked bike
without a rider stands on its side stand (a little lean to the left).
A sudden change of velocity above `bike.crashSpeedChange` (5.5 m/s within a step: a wall, a car) throws
the rider: `riderSeated` turns false, `fallen` true, a `RIDER_THROWN` event is reported and
`bike.riderThrow` holds `{x, y, z, vx, vy, vz}`. The game puts the rider's character there and calls
`character.push(vx, vy, vz, true)`. A fallen bike lies and slides on its side until `mount()` picks it up.

## Boats

    import { Boat, deriveBoatTuning } from './physics/watercraft/Boat.js';
    const world = new PhysicsWorld({ ground, waterHeightAt: (x, z, time) => sampleWaveHeight(...) });
    const boat = new Boat(world, deriveBoatTuning(VEHICLE_CATALOG.speedboat), { x, z, heading, userRef });
    boat.input.drive = 1;    // 1 full ahead .. -1 astern
    boat.input.steer = -1;   // -1 left .. 1 right
    boat.speed, boat.heading, boat.planing (0..1), boat.submerged (0..1), boat.propellerWet, boat.throttle, boat.rpm
    boat.spray (0..1) at tuning.sprayAnchors[0..1], boat.wake (0..1) at tuning.wakeAnchor
    boat.anchorPosition(anchor, out)   // model-space anchor to world, for the spray and wake effects
    boat.body.interpolatedPose(world.alpha, position, quaternion);  boat.placeAt(x, z, heading);  boat.dispose();

The sea is the world's `waterHeightAt(x, z, time)`: pass the same wave function the water is drawn
with (the physics never imports render code). Twelve hull points float the boat at the catalog
`dimensions.draft`; it heaves, pitches and rolls on the waves and settles level on a calm sea. The
outboards push only while the propeller is wet, the keel makes a turn carve, and past about a third of
the top speed the hull planes (bow up first, then less drag). On a beach the hull rests on the terrain.
The model's origin is the bottom of the keel, facing -Z.

## Helicopters

    import { Helicopter, deriveHelicopterTuning } from './physics/aircraft/Helicopter.js';
    const heli = new Helicopter(world, deriveHelicopterTuning(VEHICLE_CATALOG.police_helicopter),
                                { x, y, z, heading, userRef });   // y given: in the air, rotor running
    heli.engineOn = true;                // the rotor spins up over 4 s (rotorSpeed 0..1)
    heli.input.collective = 1;           // -1..1: climb / descend
    heli.input.pitch = 1;  heli.input.roll = -1;  heli.input.yaw = 1;   // forward, left, turn right
    heli.assist = true;                  // default: the hover assist (keyboard flying)
    heli.flyTowards(x, y, z, { speed, arriveRadius });  heli.arrived;  heli.clearTarget();  // autopilot
    heli.speed, heli.verticalSpeed, heli.altitude (over what is below), heli.groundEffect, heli.load,
    heli.rotorSpeed, heli.rotorAngle (for the blades), heli.heading, heli.placeAt(x, y, z, heading), heli.dispose()

The rotor's thrust acts along the body's up axis: the cyclic tilts the body and the tilt pulls it
along; the collective sets the thrust; the tail rotor sets the yaw rate. Within a rotor diameter of the
ground the rotor gains up to a fifth more thrust (ground effect). Drag is solved so the deepest tilt
gives the catalog top speed; the climb rate, turn rate and ceiling come from `handling.climbRate`,
`turnRate`, `maxAltitude`.
With the assist (default) the inputs ask for velocities: nothing pressed holds a level hover at the
current height; `collective` climbs or descends at up to the catalog climb rate (the sink rate shrinks
near the ground, so full-down lands it softly on the skids); `pitch` and `roll` ask for forward and
sideways speed; `yaw` turns. With `assist = false` they are attitude and thrust. `flyTowards` overrides
the inputs: it flies to the point (turning the nose towards it when far), slows down and hovers there;
call it every frame to follow a moving target (police pursuit). Model origin: under the skids.

## Characters

    import { CharacterController } from './physics/characters/CharacterController.js';
    const walker = new CharacterController(world, { x, z, userRef });   // feet on the ground; radius 0.3, height 1.75
    walker.input.x = vx;  walker.input.z = vz;    // wanted horizontal velocity, world axes, m/s
    walker.input.jump = true;                     // while held on the ground it jumps
    walker.position (the feet), walker.previousPosition (blend with world.alpha), walker.velocity,
    walker.grounded, walker.surface, walker.waterDepth (wade from about 0.4, swim from about 1.3),
    walker.knockedDown (set with a KNOCKDOWN event when a vehicle hits it or push() knocks it; the game clears it),
    walker.ignore (bodies, characters or userRefs the capsule passes through), walker.placeAt(x, y, z), walker.dispose()
    walker.push(vx, vy, vz, knockDown)   // the official shove: a velocity change in m/s, world axes
    walker.active = false                // out of the world without disposing (seated in a vehicle)
    walker.solid = false                 // other characters walk through it (it is still seen by queries)

It slides along static geometry, vehicles and props, steps up to 0.35 m, refuses slopes steeper than
about 50 degrees, follows the ground downhill and reports hard landings (`PHYSICS_EVENT.LANDING`).
Characters keep apart from each other: after every step overlapping capsules are moved apart (the
lighter one more, never through a wall) and lose the speed they close with, so crowds spread and two
people walking into each other slip past. Queries see them on `LAYER.CHARACTER` (see Queries).
`push()` adds the velocity change; an upward part lifts the character off the ground. A shove with
`knockDown`, or faster than 3.5 m/s, sets `knockedDown` and reports a `KNOCKDOWN` event (`nx, ny, nz`
along the shove). While `knockedDown` the controller ignores its input and jump and tumbles to a stop
(9 m/s^2 on the ground); the game plays the fall and get-up and then clears `knockedDown`.

## Explosions

    const pushed = world.explode(x, y, z, { radius: 8, power: 9000, characterSpeed: 14, ignore: null });

Bodies within the radius get an impulse away from the centre (with a lift) with a quadratic falloff,
`power` N s at the centre; characters get `push()` with `characterSpeed` m/s out and 0.43 of it up at
the centre, same falloff, knocked down in the inner half of the radius (falloff above a quarter). It
returns how many it pushed and reports nothing: the game announces the explosion and deals damage.

## Tests

    node --test "tools/tests/physics/*.test.mjs"
