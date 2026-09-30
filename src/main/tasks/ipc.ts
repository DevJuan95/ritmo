import type { TasksChannels } from '../../shared/tasks/contract';
import type { Handle } from '../ipc/ports';
import type { TaskServicePort } from './ports';

export function registerTasksIpc(handle: Handle<TasksChannels>, tasks: TaskServicePort): void {
  handle('add-task', (title: unknown, date: unknown, link: unknown) => tasks.add(title, date, link));
  handle('toggle-task', (id: unknown) => tasks.toggle(id));
  handle('delete-task', (id: unknown) => tasks.remove(id));
  handle('get-tasks-for-day', (date: unknown) => tasks.listByDay(date));
  handle('get-task-summary', (from: unknown, to: unknown) => tasks.summarize(from, to));
  handle('update-task', (id: unknown, patch: unknown) => tasks.update(id, patch));
}
