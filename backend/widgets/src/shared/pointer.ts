/**
 * Whether a click came from a mouse. Keyboard presses (Enter or Space on a button) click
 * with detail 0; touch and pen taps are left out too, so moving focus to a text field
 * never opens an on-screen keyboard. Browsers that don't say which pointer it was count a
 * click as a mouse click only on a device whose main pointer is fine (a mouse or trackpad).
 */
export function isMouseClick(
  e: Pick<MouseEvent, 'detail'> & { pointerType?: string },
  finePointer: () => boolean = () => typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches,
): boolean {
  if (e.detail === 0) return false;
  if (e.pointerType) return e.pointerType === 'mouse';
  return finePointer();
}
