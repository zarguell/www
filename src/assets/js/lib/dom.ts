/** Visibility helpers shared by the interactive tools. */
export type Display = '' | 'none' | 'block' | 'flex' | 'inline-block';

/**
 * Set an element's display while keeping the `is-hidden` class in sync.
 * `''` restores the element's natural display.
 */
export function setDisplay(element: HTMLElement | null, value: Display): void {
  if (!element) return;
  element.classList.toggle('is-hidden', value === 'none');
  element.style.display = value;
}
