function $<T extends HTMLElement = HTMLElement>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Falta el elemento ${selector}.`);
  return found;
}

let state: PublicState;
let message = '';
let lastActionsKey = '';

function showError(error: unknown): void {
  message = error instanceof Error ? error.message : String(error);
  renderError();
}

function renderError() {
  const banner = $('#error');
  const text = state?.blockError || message;
  banner.hidden = !text;
  banner.textContent = text || '';
}

async function action(work: () => Promise<void>): Promise<void> {
  message = '';
  renderError();
  try { await work(); }
  catch (error) { showError(error); }
}

function button(text: string, style: 'primary' | 'secondary' | 'ghost', work: () => Promise<void>, disabled = false): HTMLButtonElement {
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

function renderTimer(): void {
  if (!state) return;
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

function renderTasks(): void {
  const list = $('#task-list');
  list.replaceChildren();
  const done = state.tasks.filter(task => task.done).length;
  $('#task-progress').textContent = state.tasks.length ? `${done} de ${state.tasks.length} completadas` : 'Elige lo que importa.';
  $('#task-empty').hidden = state.tasks.length > 0;
  for (const task of state.tasks) {
    const row = document.createElement('li');
    const check = document.createElement('input');
    check.type = 'checkbox'; check.className = 'checkbox checkbox-secondary checkbox-sm task-check'; check.checked = task.done;
    check.setAttribute('aria-label', `Completar ${task.title}`);
    check.addEventListener('change', () => action(() => window.ritmo.toggleTask(task.id)));
    const title = document.createElement('span');
    title.className = `task-title${task.done ? ' done' : ''}`;
    title.textContent = task.title;
    const remove = document.createElement('button');
    remove.type = 'button'; remove.className = 'btn btn-ghost btn-xs btn-square icon-button'; remove.textContent = '×';
    remove.setAttribute('aria-label', `Eliminar ${task.title}`);
    remove.addEventListener('click', () => action(() => window.ritmo.deleteTask(task.id)));
    row.append(check, title, remove);
    list.append(row);
  }
}

function renderDomains(): void {
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

function render(): void {
  if (!state) return;
  const date = new Intl.DateTimeFormat('es-CO', { weekday:'long', day:'numeric', month:'long' }).format(new Date());
  $('#date-label').textContent = date;
  $('#focus-count').textContent = `${state.focusCount} ${state.focusCount === 1 ? 'pomodoro' : 'pomodoros'} hoy`;
  renderError(); renderTimer(); renderTasks(); renderDomains();
}

$('#task-form').addEventListener('submit', async event => {
  event.preventDefault();
  const input = $<HTMLInputElement>('#task-input');
  if (!input.value.trim()) return;
  await action(() => window.ritmo.addTask(input.value));
  if (!message) input.value = '';
});

$('#domain-form').addEventListener('submit', async event => {
  event.preventDefault();
  const input = $<HTMLInputElement>('#domain-input');
  if (!input.value.trim()) return;
  await action(() => window.ritmo.addDomain(input.value));
  if (!message) input.value = '';
});

window.ritmo.onState(next => { state = next; render(); });
window.ritmo.getState().then(next => { state = next; render(); }).catch(showError);
setInterval(renderTimer, 500);
