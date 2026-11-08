// Focus-trap helper for dialogs. Pure (no DOM access) so it can be tested in Node.
// Given the dialog's focusable elements in tab order, the currently focused element and whether Shift is held, returns the element
// that Tab should wrap to, or null when the browser's own movement is fine (the focus stays inside the dialog).
export function trapTarget(list, active, shift) {
  if (!list.length) return null;
  const i = list.indexOf(active);
  if (i === -1) return shift ? list[list.length - 1] : list[0];   // focus is outside the dialog: bring it back in
  if (shift && i === 0) return list[list.length - 1];             // Shift+Tab off the first control wraps to the last
  if (!shift && i === list.length - 1) return list[0];            // Tab off the last control wraps to the first
  return null;
}

export const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
