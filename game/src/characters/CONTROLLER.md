# The character controller: reference

`game/src/characters/controller/locomotionController.js` turns "where this person wants to go, face, aim, sit or do" into a person walking, running, strafing, aiming, firing, swinging, throwing, surrendering, sitting, phoning, falling and getting up, driving or riding, like a person. One call per frame; deterministic for the same inputs and seed; no allocation per update; any body of the shared skeleton.

## The basic loop (player, combat, police, pedestrians)

```js
import { createLocomotionController } from '../characters/controller/locomotionController.js';
const person = assets.instantiate('dez_tolliver');               // any character asset
scene.add(person);
const walker = createLocomotionController(person, { seed: 7 });  // stature: the asset's extras.height
const input = { moveX: 0, moveZ: 0, facing: NaN, strafe: false, measuredSpeed: undefined }; // reuse

// every rendered frame (variable dt is fine: frame-rate independent):
input.moveX = wantX; input.moveZ = wantZ;  // wanted ground velocity, m/s, world axes
input.facing = NaN;                         // or a yaw (rotation.y) to face
input.strafe = false;                       // true: face `facing` while moving (strafe, back away)
walker.update(dt, input);                   // (update(dt) alone reads walker.input)
capsule.move(walker.state.vx * dt, walker.state.vz * dt);   // move by the controller's velocity
person.position.copy(interpolatedCapsuleFeet);              // the controller never moves it
```

walker.update has already set `person.rotation.y = walker.state.yaw` and posed the bones. If the capsule is blocked, pass the speed it really made as `input.measuredSpeed` (m/s). Set the instance's position before update: world targets (aim, point, seats) are converted with it.

## Weapons (combat, police)

The weapon mesh is a child of `rig.node('anchor_hand_r')`, its origin at the grip (the anchor's -Z along the barrel; a melee weapon hangs with its handle through the fist, its striking end along the anchor's +Y).

- `walker.holdWeapon(hold)`: low ready; aimed, the whole body takes the hold's stance (motion/aimStance.js under motion/aimPose.js; `WEAPON_HOLDS`):
  - `'pistol'` (= `'pistol_two_hand'`): two-handed isosceles, the sights at the right eye, the chest about 8 degrees right of the target; `'revolver_two_hand'` the same with a heavier lift.
  - `'smg'` (= `'smg_compact'`): compact at the eye, elbows tucked, hand on the magazine well.
  - `'shotgun'` (= `'shotgun_pump'`): cheeked, hand under the pump, which racks after each `play('fire')`.
  - `'rifle'`: cheeked, hand far forward under the handguard, elbow out. `'sniper'`: steadier, more upright.
  - `'launcher_shoulder'`: the tube on the right shoulder along the sight, the head beside it, both hands beneath; lowered it rides on the shoulder pointing forward and up.
  - Carried (motion/carryPose.js): `'two_hand_bat'` cocked over the right shoulder, both hands at the knob, the front elbow up (lowered: resting on the shoulder); `'one_hand_club'` (tire iron) raised at the shoulder, the other hand forward (lowered: hanging); `'throw'` side-on, the support arm pointing, the throwing hand cocked back, the weight back (lowered: at the side).
  - Seated, handguns go one-handed by themselves.
- `walker.holdWeapon(null)`: put it away (faded).
- `walker.setWeaponGrip(x, y, z)`: the weapon's anchor_grip_off in its own frame (where the off hand holds; default per kind).
- `walker.setWeaponMuzzle(x, y, z)`: the weapon's anchor_muzzle in its own frame (an aimed handgun lays it on its sight line). Call both after holdWeapon.
- `walker.aimAt(x, y, z)`: world point: raises the weapon (a carried hold: its ready stance), twists the spine, turns and strafes towards it; call each frame to track. Aims within 15 degrees of level keep the gun level at the shoulder (`AIM_LEVEL_BAND`). `walker.aimAlong(dx, dy, dz)`: along a world direction (the aim camera's). `walker.lowerWeapon()`: back to the low ready.
- `walker.play('rack', { duration: 0.42, delay: 0.1 })`: the pump's stroke (back over 45 % of the duration, forward over the rest, after the delay: the same curve as combat's pumpRack, the off hand riding the pump 7 cm, the gun kicking a little). From the first call on, a shot no longer racks by itself.
- `walker.play('fire')`: recoil kick (event `'fire'` at once). `walker.play('reload', { duration: 1.6 })`: events `'reload'` { stage: `'mag_out'` | `'mag_in'` | `'done'` }.
- `walker.play('swing', { duration: 0.55 })` (bat, tire iron) and `walker.play('throw', { duration: 0.7 })`: the hips wind up, drive through the target and follow through (a throw steps onto the front foot); the stance comes with them even when not aiming. Events `'action'` { action: `'swing'` | `'throw'`, stage: `'start'` | `'impact'` (a throw: `'release'`) | `'done'` }; impact at the hold's `impact` share (bat 0.5, tire iron 0.45, throw 0.5).

## Stances (police, pedestrians)

`walker.setStance(name, options)`:

| name | what | moves |
| --- | --- | --- |
| `stand` | standing | yes |
| `hands_up`, `hands_on_head`, `cuffed` (wrists behind the back) | upper body | yes |
| `kneel` (hands on head), `kneel_hands_up`, `kneel_cuffed` | arrest | ignored |
| `crouch` | low on the balls of the feet, forearms on the knees: behind cover | ignored |
| `cower` | crouched, arms over the head, face down: shots, explosions | ignored |
| `sit_bench` | options.seatHeight (default 0.45 m): place the instance on the ground at the middle of the seat's front edge, facing away from the bench | ignored |
| `fallen` | lying on the back; `play('fall')` gets there with the fall | ignored |
| `watch` | a still watch: hands clasped in front of the belt, the head slowly scanning (an upper-body hands layer; walking still works) | works |
| `lean_wall` | leaning back on a wall or car about 0.3 m behind the instance (motion/loiterPose.js LEAN_WALL_DISTANCE), the right sole up on it, thumbs in the pockets | ignored |
| `guard`, `block` | unarmed fighting (below) | yes |

Event `'stance'` { stance, settled: true } when the fade into it is complete. A change from one whole-body stance to another passes through standing.

## Gestures (pedestrians)

Upper body over standing, walking, running or sitting; faded 0.35 s; a weapon or a hands stance takes precedence: `walker.setGesture('phone')` (the right hand at the ear), `'talk'` (talking with the hands), `'panic'` (arms thrown up: with a run, the panic run), `'smoke'` (the cigarette hand to the mouth every 6-10 s, the other forearm across the waist), `walker.pointAt(x, y, z)` (the right arm straight at a world point), `walker.setGesture(null)`.

## Actions: walker.play(name, options)

- `'hit'` { fromX, fromZ, strength = 1 }: the trunk and head jolt away from a blow coming from world direction (fromX, fromZ) (from the person towards the attacker; default from in front); 0.06 s jolt, 0.2 s settle, on top of anything.
- `'fall'`: a death fall or knock-down (FALL_SECONDS 1.0); the person stays lying and the stance becomes `'fallen'`. Options: { direction: `'back'` | `'forward'` | `'left'` | `'right'` } or { fromX, fromZ } (a blow from the front falls back, from behind forward, from the left to the right); none: back. Events `'action'` { action: `'fall'`, stage: `'start'` | `'landed'` }; walker.fallDirection tells how the person lies.
- `'getup'`: from lying to standing (GETUP_SECONDS 1.7), the way the fall left them. Events { action: `'getup'`, stage: `'start'` | `'done'` }. `setStance('fallen', { direction | fromX, fromZ })` lays a person down without the fall.
- `'fire'`, `'reload'`, `'swing'`, `'throw'`: see Weapons.

## Unarmed combat (combat, gang members, police)

Face the opponent with input.facing (or turn the instance), then `walker.setStance('guard')` (fists at the chin, left hand leading, on the fighting stance; walks and strafes; `'stand'` drops it), `setStance('block')` (forearms up before the face), `walker.play('jab')` (0.38 s, lands at 38 %), `'cross'` (0.48 s, 42 %), `'hook'` (0.55 s, 46 %), `'kick'` (right front push kick, 0.85 s, 42 %; stands still), `'combo'` (jab, cross, hook). Events `'action'` { action, stage: `'start'` | `'impact'` | `'done'`, x, y, z }: at impact x, y, z is the world point of the fist or the kicking foot's ball. Strikes work from any upright stance; a fall, ragdoll, vehicle or reset cancels them. Being hit: `play('hit', { fromX, fromZ, strength })` (jab 0.6, cross or hook 1, kick 1.3); knocked down: `play('fall', ...)` then `play('getup')`. STRIKES and COMBO are exported from motion/brawlPose.js.

## Seats (player, traffic, police)

Place the instance at the seat anchor every frame (anchor_seat_driver / anchor_seat_passenger_N: the hip joints go there, facing its -Z; set person.quaternion from the anchor and pass driveRotation: false, or copy only its yaw), then:

- `walker.sit({ kind: 'driver', wheel: steeringWheelNode, wheelRadius: 0.185 })`: both hands on the rim at ten to two, following the wheel (sliding on the rim past WHEEL_FOLLOW_LIMIT); the rim's 12 o'clock is taken when sit() is called, so call it while the wheel is straight.
- `walker.sit({ kind: 'passenger' })`: hands on the thighs, glancing about.
- `walker.sit({ kind: 'rider', gripL, gripR, footL, footR })`: motorcycle anchors (any missing: a typical bike's), crouched forward.
- `walker.sit(seat, { fade: 0.6 })`: fade seconds (0: at once). `walker.seat.lean` (rad, + left), `walker.seat.lookBack` (0..1).
- `walker.sit(null)`: back to standing (move the instance to the door anchor while walker.layers.seat fades).

Events `'action'` { action: `'sit'` | `'stand_up'`, stage: `'done'` }. Seated, moves are ignored; holdWeapon/aimAt still work over the seat (drive-by).

## Vehicles: in and out through the door

1. Walk to the door anchor: `steerTo(walker.input, at.x, at.z, door.x, door.z, 1.4)` writes the move and returns the distance left.
2. Under about 0.2 m: `walker.enterVehicle({ door, seat, kind: 'driver', wheel, wheelRadius: 0.185, jack: false })`. Until { action: `'enter'`, stage: `'done'` } THE CONTROLLER PLACES THE INSTANCE (stop writing its position and rotation.y): turn to the door, reach the handle, open it, step round it ducking, sit, swing in, pull it shut (TRANSIT_SECONDS enter 3.0 s, jack 3.55 s). Every frame pass `walker.transit.door` (0 shut .. 1 open) to fleet.setDoorOpen. At done the person is seated as after `walker.sit({ kind, wheel })`. jack: true adds a stage `'pull'`: then call the occupant's `walker.exitVehicle({ door, seat, dragged: true })`.
3. Out: `walker.exitVehicle({ door, seat })` (2.6 s); the controller places the instance until { action: `'exit'`, stage: `'done'` }, then hand the capsule back at walker.transit.x / z facing walker.state.yaw.
4. Dragged out: `walker.exitVehicle({ door, seat, dragged: true })` (1.35 s); at { action: `'dragged'`, stage: `'done'` } the stance is `'fallen'`.

Stage events: enter: start, reach, open, (pull), step_in, close, done; exit: start, step_out, close, done; dragged: start, thrown, done. walker.action reads `'enter'` | `'exit'` | `'dragged'` meanwhile. The door is hinged at its front edge (DOOR_SHAPE in motion/vehicleTransit.js). walker.sit(...) or walker.reset() cancel a transit.

## Ragdoll (hit by a car, thrown by an explosion)

`walker.ragdoll(options)`: points and constraints over the skeleton (physics/ragdoll.js). Options: vx, vy, vz (world velocity, m/s: a car's plus 1-2 up; a blast 4-8 away and 3-5 up), at (height of the blow as a share of the stature: bumper 0.3, blast 0.5), spin (rad/s), ground(x, z), boxes [{ x, y, z, hx, hy, hz, yaw }], getUp (true: get up once at rest). Until { action: `'ragdoll'`, stage: `'rest'` } THE CONTROLLER MOVES THE INSTANCE with the pelvis. At rest the pose blends (RAGDOLL_SETTLE_SECONDS 0.5) into the lying pose of that way; the stance is `'fallen'`. A held weapon is dropped. walker.ragdolling is true meanwhile. `walker.setGround((x, z) => height)` makes lying, falling, getting up and the settle follow slopes (motion/groundTilt.js).

## Events and state

`walker.on(type, handler)` returns an unsubscribe function; types `'footstrike'`, `'fire'`, `'reload'`, `'stance'`, `'action'`. `'footstrike'` { side: -1 left | 1 right, foot, x, y, z (world, the ankle), speed, run (0 walk .. 1 run), time }. Event objects are reused: copy what you keep.

Read: walker.state (vx, vz, speed, yaw, yawRate, spotTurn, phase, lean, bank, headYaw, travelX, travelZ, strafe, gait), walker.aim (AimInput: hold, raise, recoil, reload, rack, swing), walker.stance, walker.gesture, walker.action, walker.seated, walker.layers (eased weights: weapon, aim, hands, body, gesture, seat), walker.rig. `walker.reset(yaw)` stands the person still facing yaw.

## Crowds

An update costs about 5 to 8 microseconds in Node (60 people: about 0.4 ms a frame); the pedestrian system calls update every 1, 2 or 4 frames by distance (with the summed dt) and only stepLocomotionState off screen.
