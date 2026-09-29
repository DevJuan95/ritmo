import { $, button, getState, hasState } from './context.js';
import { timerActions, timerView } from './view.js';

let lastActionsKey = '';

export function renderTimer(): void {
  if (!hasState()) return;
  const state = getState();
  const view = timerView(state, Date.now());
  $('#timer-value').textContent = view.value;
  $('#timer-ring').style.setProperty('--progress', view.progress);
  $('#timer-kind').textContent = view.kind;
  $('#timer-caption').textContent = view.caption;
  const status = $('#timer-status');
  status.textContent = view.status;
  status.className = view.statusClass;
  if (view.actionsKey === lastActionsKey) return;
  lastActionsKey = view.actionsKey;
  $('#timer-actions').replaceChildren(...timerActions(state).map(item => button(item.label, item.style, () => item.run(window.ritmo), state.busy)));
}
