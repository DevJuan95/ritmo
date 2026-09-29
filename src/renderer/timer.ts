import { $, button, getState, hasState } from './context.js';
import { timerActions, timerView } from './view.js';

let lastActionsKey = '';

export function renderTimer(): void {
  if (!hasState()) return;
  const state = getState();
  const view = timerView(state, Date.now());
  $('#timer-value').textContent = view.value;
  const beats = $('#timer-beats');
  beats.style.setProperty('--progress', view.progress);
  beats.style.setProperty('--beats', String(view.beats));
  $('#timer-panel').dataset.mode = view.mode;
  $('#timer-kind').textContent = view.kind;
  $('#timer-caption').textContent = view.caption;
  $('#timer-status').textContent = view.status;
  if (view.actionsKey === lastActionsKey) return;
  lastActionsKey = view.actionsKey;
  $('#timer-actions').replaceChildren(...timerActions(state).map(item => button(item.label, item.style, () => item.run(window.ritmo), state.busy)));
}
