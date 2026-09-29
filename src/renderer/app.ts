import { $, action, getState, hasMessage, hasState, renderError, setState, showError } from './context.js';
import { renderTimer } from './timer.js';
import { renderTasks } from './tasks.js';
import { renderDomains } from './domains.js';
import { initPlanner, refreshPlanner } from './planner.js';

function render(): void {
  if (!hasState()) return;
  const state = getState();
  const date = new Intl.DateTimeFormat('es-CO', { weekday:'long', day:'numeric', month:'long' }).format(new Date());
  $('#date-label').textContent = date;
  $('#focus-count').textContent = `${state.focusCount} ${state.focusCount === 1 ? 'pomodoro' : 'pomodoros'} hoy`;
  renderError(); renderTimer(); renderTasks(); renderDomains(); refreshPlanner();
}

initPlanner();

$('#task-form').addEventListener('submit', async event => {
  event.preventDefault();
  const input = $<HTMLInputElement>('#task-input');
  if (!input.value.trim()) return;
  await action(() => window.ritmo.addTask(input.value));
  if (!hasMessage()) input.value = '';
});

$('#domain-form').addEventListener('submit', async event => {
  event.preventDefault();
  const input = $<HTMLInputElement>('#domain-input');
  if (!input.value.trim()) return;
  await action(() => window.ritmo.addDomain(input.value));
  if (!hasMessage()) input.value = '';
});

window.ritmo.onState(next => { setState(next); render(); });
window.ritmo.getState().then(next => { setState(next); render(); }).catch(showError);
setInterval(renderTimer, 500);
