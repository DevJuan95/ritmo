import type { PublicState } from '../shared/contracts.js';

let state: PublicState | undefined;
let message = '';

export function $<T extends HTMLElement = HTMLElement>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Falta el elemento ${selector}.`);
  return found;
}

export function setState(next: PublicState): void { state = next; }
export function getState(): PublicState { if (!state) throw new Error('El estado aún no está disponible.'); return state; }
export function hasState(): boolean { return !!state; }
export function hasMessage(): boolean { return !!message; }

export function renderError(): void {
  const banner = $('#error');
  const text = state?.blockError || message;
  banner.hidden = !text;
  banner.textContent = text || '';
}

export function showError(error: unknown): void {
  message = error instanceof Error ? error.message : String(error);
  renderError();
}

export async function action(work: () => Promise<void>): Promise<void> {
  message = '';
  renderError();
  try { await work(); }
  catch (error) { showError(error); }
}

export function button(text: string, style: 'primary' | 'secondary' | 'ghost', work: () => Promise<void>, disabled = false): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  const styles = {
    primary: 'btn btn-primary timer-button-primary',
    secondary: 'btn btn-outline timer-button-secondary',
    ghost: 'btn btn-ghost timer-button-ghost'
  };
  element.className = styles[style];
  element.textContent = text;
  element.disabled = disabled;
  element.addEventListener('click', () => action(work));
  return element;
}
