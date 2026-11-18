// Cash and the player's condition on the HUD. The cash counter rolls toward a new amount and
// shows the change beside it for a moment (green for money in, coral for money out); health and
// armour are two thin bars side by side flush under the minimap (health the wider, on the left),
// with no icons or text, the health bar pulsing red when the player is close to death and the
// armour track dim when there is none.
import { approachCounter, formatCash, formatCashDelta } from './hudFormatting.js';
import { createHudElement, replayHudAnimation, setHudText } from './hudElements.js';

/**
 * Builds the cash counter.
 * @param {Document} document
 * @param {HTMLElement} container `hud-cash`.
 */
export function createCashCounter(document, container) {
  container.classList.add('hud-cash');
  const amount = createHudElement(document, 'span', 'hud-cash-amount', container);
  const change = createHudElement(document, 'span', 'hud-cash-change', container);
  let target = 0;
  let shown = 0;
  setHudText(amount, formatCash(0));

  return {
    /**
     * Shows a new cash total; `delta` (when given and not zero) flashes beside it.
     * @param {number} cash
     * @param {number} [delta]
     * @param {boolean} [instant] Jump without rolling (loading a game).
     */
    set(cash, delta = 0, instant = false) {
      target = Number.isFinite(cash) ? cash : 0;
      if (instant) shown = target;
      if (delta) {
        setHudText(change, formatCashDelta(delta));
        change.classList.toggle('is-loss', delta < 0);
        replayHudAnimation(change, 'is-shown');
      }
      setHudText(amount, formatCash(shown));
    },
    /** @param {number} deltaSeconds */
    update(deltaSeconds) {
      if (shown === target) return;
      shown = approachCounter(shown, target, deltaSeconds, 0.09);
      setHudText(amount, formatCash(shown));
    },
  };
}

/**
 * Builds the health and armour bars.
 * @param {Document} document
 * @param {HTMLElement} container `hud-health-and-armour`.
 */
export function createHealthAndArmour(document, container) {
  container.classList.add('hud-vitals');
  const row = (kind, icon) => {
    const line = createHudElement(document, 'div', `hud-vital hud-vital-${kind}`, container);
    createHudElement(document, 'span', 'hud-vital-icon', line, icon);
    const track = createHudElement(document, 'span', 'hud-vital-track', line);
    return { line, fill: createHudElement(document, 'span', 'hud-vital-fill', track) };
  };
  const health = row('health', HEALTH_ICON);
  const armour = row('armour', ARMOUR_ICON);
  let lastHealth = -1;
  let lastArmour = -1;

  return {
    /**
     * @param {number} healthValue 0..maxHealth.
     * @param {number} armourValue 0..100.
     * @param {number} [maxHealth]
     */
    set(healthValue, armourValue, maxHealth = 100) {
      const healthFraction = Math.max(0, Math.min(1, healthValue / maxHealth));
      const armourFraction = Math.max(0, Math.min(1, armourValue / 100));
      if (healthFraction !== lastHealth) {
        if (healthFraction < lastHealth) replayHudAnimation(health.line, 'is-hit');
        health.fill.style.transform = `scaleX(${healthFraction})`;
        health.line.classList.toggle('is-critical', healthFraction > 0 && healthFraction <= 0.25);
        lastHealth = healthFraction;
      }
      if (armourFraction !== lastArmour) {
        armour.fill.style.transform = `scaleX(${armourFraction})`;
        armour.line.classList.toggle('is-empty', armourFraction === 0);
        lastArmour = armourFraction;
      }
    },
  };
}
