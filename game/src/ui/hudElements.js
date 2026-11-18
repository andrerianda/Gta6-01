// Small DOM helpers shared by the interface widgets: make an element with a class, set text only
// when it changes (so a widget can refresh every frame without touching the page), and replay a
// CSS animation.

/**
 * Creates an element, gives it a class name and appends it to a parent.
 * @param {Document} document
 * @param {string} tag
 * @param {string} [className]
 * @param {Element} [parent]
 * @param {string} [markup] Trusted inline markup (icons), never text from data.
 * @returns {HTMLElement}
 */
export function createHudElement(document, tag, className, parent, markup) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (markup) element.innerHTML = markup;
  if (parent) parent.append(element);
  return element;
}

/**
 * Sets an element's text when it differs from what it shows.
 * @param {HTMLElement} element
 * @param {string} text
 */
export function setHudText(element, text) {
  if (element.textContent !== text) element.textContent = text;
}

/**
 * Replays a CSS animation class on an element (removes it, forces a style flush, adds it back).
 * @param {HTMLElement} element
 * @param {string} className
 */
export function replayHudAnimation(element, className) {
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
}
