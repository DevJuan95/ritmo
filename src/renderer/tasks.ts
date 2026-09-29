import { $, action, getState } from './context.js';
import { completionText } from './view.js';

export function renderTasks(): void {
  const state = getState();
  const list = $('#task-list');
  list.replaceChildren();
  $('#task-progress').textContent = completionText(state.tasks, 'Elige lo que importa.');
  $('#task-empty').hidden = state.tasks.length > 0;
  for (const task of state.tasks) {
    const row = document.createElement('li');
    const check = document.createElement('input');
    check.type = 'checkbox'; check.className = 'checkbox checkbox-primary checkbox-sm task-check'; check.checked = task.done;
    check.setAttribute('aria-label', `Completar ${task.title}`);
    check.addEventListener('change', () => action(() => window.ritmo.toggleTask(task.id)));
    const title = document.createElement('span');
    title.className = `task-title${task.done ? ' done' : ''}`;
    title.textContent = task.title;
    const remove = document.createElement('button');
    remove.type = 'button'; remove.className = 'btn btn-ghost btn-xs btn-square task-remove'; remove.textContent = '×';
    remove.setAttribute('aria-label', `Eliminar ${task.title}`);
    remove.addEventListener('click', () => action(() => window.ritmo.deleteTask(task.id)));
    row.append(check, title, remove);
    list.append(row);
  }
}

