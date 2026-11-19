// The error overlay: when a system fails, the game says so on screen with the system's name
// instead of dying silently. The panel lists each fault once, stays out of the way of play, and
// can be dismissed.
//
//   const overlay = createErrorOverlay(document.body);
//   overlay.report({ system: 'traffic', phase: 'fixedUpdate', error });

/**
 * Creates the overlay. Nothing is added to the page until the first fault.
 * @param {HTMLElement} parent The element the panel is appended to.
 * @param {Object} [options]
 * @param {number} [options.maxEntries] Faults listed before the rest are only counted; default 8.
 * @returns {ReturnType<typeof buildErrorOverlay>}
 */
export function createErrorOverlay(parent, options = {}) {
  return buildErrorOverlay(parent, options);
}

function buildErrorOverlay(parent, options) {
  const maxEntries = options.maxEntries ?? 8;
  const documentRef = parent.ownerDocument;
  /** @type {{system: string, phase: string, message: string, count: number}[]} */
  const faults = [];
  let panel = null;
  let list = null;
  let hidden = false;

  const overlay = {
    report,
    /** The faults reported so far, for the debug object. */
    faults: () => faults.map((fault) => ({ ...fault })),
    /** How many distinct faults were reported. */
    get count() {
      return faults.length;
    },
    dismiss,
  };

  /**
   * Shows a fault.
   * @param {{system: string, phase: string, error: Error | string}} fault Which system failed,
   *   in which lifecycle phase, and how.
   */
  function report(fault) {
    const message = fault.error instanceof Error ? fault.error.message : String(fault.error);
    const known = faults.find((entry) => entry.system === fault.system && entry.phase === fault.phase && entry.message === message);
    if (known) {
      known.count += 1;
    } else {
      faults.push({ system: fault.system, phase: fault.phase, message, count: 1 });
    }
    hidden = false;
    draw();
  }

  /** Hides the panel until the next fault. */
  function dismiss() {
    hidden = true;
    if (panel) panel.hidden = true;
  }

  function draw() {
    if (!panel) {
      panel = documentRef.createElement('div');
      panel.className = 'error-overlay';
      panel.setAttribute('role', 'alert');
      const title = documentRef.createElement('div');
      title.className = 'error-overlay-title';
      title.textContent = 'Something went wrong';
      const close = documentRef.createElement('button');
      close.type = 'button';
      close.className = 'error-overlay-dismiss';
      close.textContent = 'Dismiss';
      close.addEventListener('click', dismiss);
      title.appendChild(close);
      list = documentRef.createElement('ul');
      panel.append(title, list);
      parent.appendChild(panel);
    }
    panel.hidden = hidden;
    list.textContent = '';
    for (const fault of faults.slice(0, maxEntries)) {
      const item = documentRef.createElement('li');
      const name = documentRef.createElement('strong');
      name.textContent = `${fault.system} (${fault.phase})`;
      item.append(name, ` ${fault.message}${fault.count > 1 ? ` (x${fault.count})` : ''}`);
      list.appendChild(item);
    }
    if (faults.length > maxEntries) {
      const more = documentRef.createElement('li');
      more.textContent = `and ${faults.length - maxEntries} more`;
      list.appendChild(more);
    }
  }

  return overlay;
}
