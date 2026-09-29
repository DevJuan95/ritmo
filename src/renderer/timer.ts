import { $, button, getState, hasState } from './context.js';

let lastActionsKey = '';

export function renderTimer(): void {
  if (!hasState()) return;
  const state = getState();
  const session = state.session;
  const kind = session?.kind;
  const focus = kind === 'focus';
  const breakTime = kind === 'shortBreak' || kind === 'longBreak';
  const total = kind ? ({ focus:25, shortBreak:5, longBreak:15 })[kind] * 60 : 25 * 60;
  const remaining = session ? Math.max(0, Math.ceil((session.endsAt - Date.now()) / 1000)) : total;
  const minutes = String(Math.floor(remaining / 60)).padStart(2, '0');
  const seconds = String(remaining % 60).padStart(2, '0');
  $('#timer-value').textContent = `${minutes}:${seconds}`;
  $('#timer-ring').style.setProperty('--progress', `${((total - remaining) / total) * 100}%`);
  $('#timer-kind').textContent = focus ? 'Tiempo de foco' : breakTime ? 'Descanso' : 'Tiempo de foco';
  $('#timer-caption').textContent = focus ? 'Tus sitios están en pausa' : breakTime ? 'Respira y recarga' : 'Sin distracciones';
  const status = $('#timer-status');
  status.textContent = state.blockError ? 'Bloqueo pendiente' : focus ? 'En foco' : breakTime ? 'Descansando' : 'Listo para empezar';
  status.className = `badge badge-soft status-pill ${state.blockError ? 'badge-error' : focus ? 'badge-warning' : 'badge-secondary'}`;
  const actions = $('#timer-actions');
  const actionsKey = `${state.blockError ? 'blocked' : kind || 'ready'}:${state.busy}`;
  if (actionsKey === lastActionsKey) return;
  lastActionsKey = actionsKey;
  actions.replaceChildren();
  if (state.blockError) actions.append(button('Quitar bloqueo', 'primary', () => window.ritmo.retryUnblock(), state.busy));
  else if (focus) actions.append(button('Terminar foco', 'secondary', () => window.ritmo.finishFocus(), state.busy));
  else if (breakTime) actions.append(button('Terminar descanso', 'secondary', () => window.ritmo.finishBreak(), state.busy));
  else {
    actions.append(button('Iniciar foco', 'primary', () => window.ritmo.startFocus(), state.busy));
    actions.append(button('Descanso 5 min', 'secondary', () => window.ritmo.startBreak('shortBreak'), state.busy));
    actions.append(button('Descanso 15 min', 'ghost', () => window.ritmo.startBreak('longBreak'), state.busy));
  }
}

