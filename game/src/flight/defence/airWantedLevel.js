// The air wanted level from what the air guard is doing: 0 none, 1 watched (warned at the sea
// boundary, or the pair is on its way home and still has an eye on him), 2 intercepted (the pair
// is up), 3 weapons free. Pure.

/**
 * @param {string} stage The interception stage (INTERCEPT_STAGES).
 * @param {string} boundaryState 'inside' | 'warned' | 'violated' | 'open'.
 * @param {boolean} weaponsFree Beyond the weapons-free radius of the closed sea.
 * @returns {0 | 1 | 2 | 3}
 */
export function airWantedLevel(stage, boundaryState, weaponsFree) {
  if (stage === 'fire' || (weaponsFree && stage !== 'idle' && stage !== 'returning')) return 3;
  if (stage !== 'idle' && stage !== 'returning') return 2;
  if (stage === 'returning' || boundaryState === 'warned' || boundaryState === 'violated') return 1;
  return 0;
}

/** The word the HUD shows beside the three chevrons for a stage, or '' when there is nothing to show. */
export function airWantedWord(stage, level) {
  switch (stage) {
    case 'scramble': return 'SCRAMBLE';
    case 'intercept': return 'INTERCEPT';
    case 'formate': return 'INTERCEPT';
    case 'order': return 'FOLLOW ORDER';
    case 'escort': return 'ESCORT';
    case 'warningShots': return 'WARNING SHOTS';
    case 'fire': return 'WEAPONS FREE';
    case 'searching': return 'LOST';
    case 'returning': return level > 0 ? 'WATCHED' : '';
    default: return level >= 3 ? 'WEAPONS FREE' : level > 0 ? 'WATCHED' : '';
  }
}
