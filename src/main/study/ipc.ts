import type { StudyChannels } from '../../shared/study/contract';
import type { Handle } from '../ipc/ports';
import type { AgentServicePort, ProposalServicePort, StudyServicePort } from './ports';

export function registerStudyIpc(handle: Handle<StudyChannels>, { study, agents, proposals }: { study: StudyServicePort; agents: AgentServicePort; proposals: ProposalServicePort }): void {
  handle('list-study-routes', () => study.list());
  handle('create-study-route', (route: unknown) => study.create(route));
  handle('update-study-route', (id: unknown, route: unknown) => study.update(id, route));
  handle('delete-study-route', (id: unknown) => study.remove(id));
  handle('get-study-progress', () => study.progress());
  handle('get-agent-settings', () => agents.settings());
  handle('save-agent-settings', (settings: unknown) => agents.saveSettings(settings));
  handle('check-study-agents', () => agents.status());
  handle('get-agent-notices', () => proposals.notices());
  handle('accept-agent-notice', (provider: unknown) => proposals.acceptNotice(provider));
  handle('propose-study-tasks', (routeId: unknown) => proposals.propose(routeId));
  handle('draft-study-route', (brief: unknown) => proposals.draft(brief));
  handle('cancel-study-proposals', () => proposals.cancel());
}
