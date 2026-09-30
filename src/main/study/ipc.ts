import type { StudyChannels } from '../../shared/study/contract';
import type { Handle } from '../ipc/ports';
import type { StudyServicePort } from './ports';

export function registerStudyIpc(handle: Handle<StudyChannels>, study: StudyServicePort): void {
  handle('list-study-routes', () => study.list());
  handle('create-study-route', (route: unknown) => study.create(route));
  handle('update-study-route', (id: unknown, route: unknown) => study.update(id, route));
  handle('delete-study-route', (id: unknown) => study.remove(id));
  handle('get-study-progress', () => study.progress());
}
