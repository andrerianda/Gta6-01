// The sniper rifle's scope view: once the aim camera has eased in with a scoped weapon, the view
// zooms to the weapon's scopeZoom through the camera's own zoom (the follow camera keeps
// steering its field of view; the dressing's levels of detail already divide by camera.zoom),
// a lens of our own design covers the screen (a dark tube round a round clear field, a fine
// crosshair broken at the centre with range ticks, an amber centre chevron, a faint lens rim) and
// the view breathes: a slow figure-eight sway (stance.scope swayRadians, breathSeconds) made with
// the camera's view offset, so the crosshair at the screen centre drifts over the scene and the
// shot goes where it points (combat aims along the centre ray, not the camera's forward).
// The lead's body is hidden while the scope is up.

/**
 * The breathing sway at time `t`, radians, into out {yaw, pitch}: a slow figure eight with a
 * second, faster wobble on the yaw.
 * @param {{yaw: number, pitch: number}} out
 * @param {number} t Seconds.
 * @param {number} amplitude Radians.
 * @param {number} period Seconds of one breath.
 */
export function breathingSway(out, t, amplitude, period) {
  const w = (2 * Math.PI) / Math.max(0.5, period);
  out.yaw = amplitude * (Math.sin(w * t) + 0.3 * Math.sin(w * 2.7 * t + 1.3));
  out.pitch = amplitude * 0.75 * Math.sin(w * 2 * t + 0.5);
  return out;
}

const STYLE = `
.mz-scope{position:fixed;inset:0;pointer-events:none;display:none;z-index:6}
.mz-scope .lens{position:absolute;left:50%;top:50%;width:84vmin;height:84vmin;transform:translate(-50%,-50%);
border-radius:50%;box-shadow:0 0 0 200vmax rgba(6,8,10,.94),inset 0 0 6vmin 1vmin rgba(0,0,0,.55),inset 0 0 0 .35vmin rgba(255,190,120,.18)}
.mz-scope .h,.mz-scope .v{position:absolute;background:rgba(10,10,10,.85)}
.mz-scope .h{top:50%;height:1px;width:38vmin;transform:translateY(-.5px)}
.mz-scope .v{left:50%;width:1px;height:38vmin;transform:translateX(-.5px)}
.mz-scope .l{right:calc(50% + 2.2vmin)}.mz-scope .r{left:calc(50% + 2.2vmin)}
.mz-scope .t{bottom:calc(50% + 2.2vmin)}.mz-scope .b{top:calc(50% + 2.2vmin)}
.mz-scope .b{width:3px;transform:translateX(-1.5px)}
.mz-scope .tick{position:absolute;left:50%;width:1.6vmin;height:1px;background:rgba(10,10,10,.8);transform:translateX(-50%)}
.mz-scope .chev{position:absolute;left:50%;top:50%;width:1.4vmin;height:1.4vmin;transform:translate(-50%,-15%) rotate(45deg);
border-left:2px solid #ffb35c;border-top:2px solid #ffb35c;filter:drop-shadow(0 0 2px rgba(0,0,0,.6))}
.mz-scope .zoom{position:absolute;left:50%;top:calc(50% + 36vmin);transform:translateX(-50%);font:600 1.6vmin/1 system-ui,sans-serif;
letter-spacing:.2em;color:rgba(255,200,140,.75)}`;

/**
 * Creates the scope view.
 * @param {Document | null} document
 */
export function createSniperScope(document) {
  let root = null;
  let zoom = 0, time = 0, offset = false, hidden = null, shown = false;
  const sway = { yaw: 0, pitch: 0 };

  function build() {
    const style = document.createElement('style');
    style.textContent = STYLE;
    document.head.appendChild(style);
    root = document.createElement('div');
    root.className = 'mz-scope';
    const parts = ['lens', 'h l', 'h r', 'v t', 'v b', 'chev', 'zoom'];
    for (const name of parts) { const part = document.createElement('div'); part.className = name; root.appendChild(part); }
    // Range ticks under the centre on the thick lower post's way down.
    for (let i = 1; i <= 4; i += 1) {
      const tick = document.createElement('div');
      tick.className = 'tick';
      tick.style.top = `calc(50% + ${i * 4.5}vmin)`;
      tick.style.width = `${2.4 - i * 0.35}vmin`;
      root.appendChild(tick);
    }
    document.body.appendChild(root);
    return root;
  }

  return {
    /** How far the zoom has come in, 0 (none) .. 1 (full). */
    get amount() { return zoom; },
    /**
     * Per frame.
     * @param {number} dt
     * @param {object} camera The view's PerspectiveCamera.
     * @param {{scopeZoom?: number, stance?: object} | null} weapon The scoped weapon while the scope is up, else null.
     * @param {object | null} figure The lead's body (hidden while scoped).
     */
    update(dt, camera, weapon, figure) {
      const want = weapon && weapon.scopeZoom ? weapon.scopeZoom : 1;
      const was = camera.zoom || 1;
      const next = Math.abs(want - was) < 0.01 ? want : was + (want - was) * (1 - Math.exp(-dt * 12));
      const scoped = next > 1.05;
      if (scoped && !root && document) build();
      if (root && shown !== scoped) {
        shown = scoped;
        root.style.display = scoped ? 'block' : 'none';
        if (scoped) root.querySelector('.zoom').textContent = `${Math.round(want)}x`;
      }
      if (figure) {
        if (scoped && hidden === null) { hidden = figure.visible; figure.visible = false; }
        else if (!scoped && hidden !== null) { figure.visible = hidden; hidden = null; }
      }
      if (next === was && !scoped && !offset) return;
      camera.zoom = next;
      zoom = (next - 1) / Math.max(0.01, want - 1);
      if (scoped) {
        time += dt;
        const scope = weapon?.stance?.scope ?? {};
        breathingSway(sway, time, (scope.swayRadians ?? 0.0035) * Math.min(1, zoom), scope.breathSeconds ?? 4.2);
        const height = 1000, width = height * (camera.aspect || 1.6);
        const focal = (height / 2) / Math.tan((camera.fov * Math.PI) / 360) * next;
        camera.setViewOffset(width, height, sway.yaw * focal, sway.pitch * focal, width, height);
        offset = true;
      } else if (offset) {
        camera.clearViewOffset();
        offset = false;
        zoom = 0;
      }
      camera.updateProjectionMatrix();
    },
    dispose() { if (root) root.remove(); root = null; },
  };
}
