import { $, action, getState } from './context.js';

export function renderDomains(): void {
  const state = getState();
  const list = $('#domain-list');
  list.replaceChildren();
  const locked = state.session?.kind === 'focus' || !!state.blockError || state.busy;
  for (const domain of state.domains) {
    const chip = document.createElement('span'); chip.className = 'badge badge-soft badge-secondary domain-chip';
    const label = document.createElement('span'); label.textContent = domain;
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'btn btn-ghost btn-xs btn-circle'; remove.textContent = '×';
    remove.disabled = locked;
    remove.setAttribute('aria-label', `Quitar ${domain}`);
    remove.addEventListener('click', () => action(() => window.ritmo.removeDomain(domain)));
    chip.append(label, remove); list.append(chip);
  }
  $<HTMLInputElement>('#domain-input').disabled = locked;
  $<HTMLButtonElement>('#domain-form button').disabled = locked;
}

