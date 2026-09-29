import type { Task } from '../shared/contracts.js';
import { todayKey } from '../shared/validation.js';
import { $, action, hasMessage, showError } from './context.js';
import { completionText } from './view.js';

let visible = false;
let request = 0;

function selectedDay(): string { return $<HTMLInputElement>('#planner-date').value; }

function show(view: 'today' | 'planner'): void {
  visible = view === 'planner';
  $('#today-view').hidden = visible;
  $('#planner-view').hidden = !visible;
  for (const name of ['today', 'planner'] as const) {
    const button = $<HTMLButtonElement>(`#nav-${name}`);
    const active = name === view;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  if (visible) refreshPlanner();
}

function taskRow(task: Task): HTMLLIElement {
  const row = document.createElement('li');
  const check = document.createElement('input');
  check.type = 'checkbox'; check.className = 'checkbox checkbox-primary checkbox-sm task-check';
  check.checked = task.done;
  check.setAttribute('aria-label', `Completar ${task.title}`);
  check.addEventListener('change', () => action(() => window.ritmo.updateTask(task.id, { done: check.checked })));

  const title = document.createElement('span');
  title.className = `task-title${task.done ? ' done' : ''}`;
  title.textContent = task.title;

  const actions = document.createElement('div');
  actions.className = 'planner-actions';
  const edit = document.createElement('button');
  edit.type = 'button'; edit.className = 'btn btn-ghost btn-xs row-action'; edit.textContent = 'Editar';
  edit.setAttribute('aria-label', `Editar ${task.title}`);
  edit.addEventListener('click', () => {
    const form = document.createElement('form');
    form.className = 'planner-edit-form';
    const input = document.createElement('input');
    input.type = 'text'; input.className = 'input input-bordered input-sm'; input.value = task.title; input.maxLength = 160;
    input.setAttribute('aria-label', `Nuevo título de ${task.title}`);
    const save = document.createElement('button');
    save.type = 'submit'; save.className = 'btn btn-primary btn-xs'; save.textContent = 'Guardar';
    const cancel = document.createElement('button');
    cancel.type = 'button'; cancel.className = 'btn btn-ghost btn-xs row-action'; cancel.textContent = 'Cancelar';
    cancel.addEventListener('click', () => form.replaceWith(title));
    form.addEventListener('submit', event => {
      event.preventDefault();
      action(() => window.ritmo.updateTask(task.id, { title: input.value }));
    });
    input.addEventListener('keydown', event => {
      if (event.key === 'Escape') form.replaceWith(title);
    });
    form.append(input, save, cancel);
    title.replaceWith(form); input.focus(); input.select();
  });

  const move = document.createElement('input');
  move.type = 'date'; move.className = 'input input-bordered input-xs row-date'; move.value = task.plannedDate;
  move.setAttribute('aria-label', `Mover ${task.title} a otro día`);
  move.addEventListener('change', () => action(() => window.ritmo.updateTask(task.id, { plannedDate: move.value })));

  const remove = document.createElement('button');
  remove.type = 'button'; remove.className = 'btn btn-ghost btn-xs row-action row-action-danger'; remove.textContent = 'Eliminar';
  remove.setAttribute('aria-label', `Eliminar ${task.title}`);
  remove.addEventListener('click', () => action(() => window.ritmo.deleteTask(task.id)));
  actions.append(edit, move, remove);
  row.append(check, title, actions);
  return row;
}

export async function refreshPlanner(): Promise<void> {
  if (!visible) return;
  const current = ++request;
  try {
    const tasks = await window.ritmo.getTasksForDay(selectedDay());
    if (current !== request || !visible) return;
    const list = $('#planner-list');
    list.replaceChildren(...tasks.map(taskRow));
    $('#planner-empty').hidden = tasks.length > 0;
    $('#planner-progress').textContent = completionText(tasks, '');
  } catch (error) { if (current === request) showError(error); }
}

export function initPlanner(): void {
  $<HTMLInputElement>('#planner-date').value = todayKey();
  $('#nav-today').addEventListener('click', () => show('today'));
  $('#nav-planner').addEventListener('click', () => show('planner'));
  $('#planner-date').addEventListener('change', refreshPlanner);
  $('#planner-form').addEventListener('submit', async event => {
    event.preventDefault();
    const input = $<HTMLInputElement>('#planner-task-input');
    if (!input.value.trim()) return;
    await action(() => window.ritmo.addTask(input.value, selectedDay()));
    if (!hasMessage()) input.value = '';
  });
}
