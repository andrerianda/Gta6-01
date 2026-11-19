// Text labels for key and mouse-button codes, for on-screen prompts and the controls menu:
// 'KeyE' reads "E", 'Mouse0' reads "Left Mouse", 'ShiftLeft' reads "Shift".

/**
 * The label to show for an input code.
 * @param {string} code A KeyboardEvent.code value, or 'Mouse0', 'Mouse1', 'Mouse2', 'WheelUp',
 *   'WheelDown'.
 * @returns {string} A short label in plain words.
 */
export function describeInputCode(code) {
  const named = NAMED_CODE_LABELS[code];
  if (named) return named;
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return `Num ${code.slice(6)}`;
  if (/^F[0-9]{1,2}$/.test(code)) return code;
  if (/^Mouse[0-9]+$/.test(code)) return `Mouse ${Number(code.slice(5)) + 1}`;
  // An unknown code: split its words ('IntlBackslash' -> 'Intl Backslash').
  return code.replace(/([a-z])([A-Z0-9])/g, '$1 $2');
}

/** Labels of the codes that are not a plain letter or digit. */
export const NAMED_CODE_LABELS = Object.freeze({
  Mouse0: 'Left Mouse',
  Mouse1: 'Middle Mouse',
  Mouse2: 'Right Mouse',
  WheelUp: 'Wheel Up',
  WheelDown: 'Wheel Down',
  Space: 'Space',
  Enter: 'Enter',
  NumpadEnter: 'Num Enter',
  Escape: 'Esc',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'Page Up',
  PageDown: 'Page Down',
  CapsLock: 'Caps Lock',
  ShiftLeft: 'Shift',
  ShiftRight: 'Right Shift',
  ControlLeft: 'Ctrl',
  ControlRight: 'Right Ctrl',
  AltLeft: 'Alt',
  AltRight: 'Right Alt',
  MetaLeft: 'Meta',
  MetaRight: 'Right Meta',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  NumpadAdd: 'Num +',
  NumpadSubtract: 'Num -',
  NumpadMultiply: 'Num *',
  NumpadDivide: 'Num /',
  NumpadDecimal: 'Num .',
});
