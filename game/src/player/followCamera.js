// The follow camera: the third-person camera on foot (orbit, aim over the shoulder), the chase
// camera behind vehicles with speed, lean and look-behind, collision with the city, shake, and
// the cuts that cutscenes and showcase scenes ask for. It writes `context.focus` every frame.
// Second-wave entry module: this stub satisfies the lifecycle contract and does nothing yet.
// Its contract is docs/ARCHITECTURE.md, "followCamera".

/**
 * Creates the follow camera system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createFollowCameraSystem(context) {
  return {
    name: 'followCamera',
    dependsOn: ['player'],
  };
}
