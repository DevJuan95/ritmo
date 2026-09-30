import { registerBlockingIpc } from '../blocking/ipc';
import type { DomainServicePort } from '../blocking/ports';
import { registerFocusIpc } from '../focus/ipc';
import type { FocusServicePort } from '../focus/ports';
import { registerStateIpc } from '../state/ipc';
import type { PublicStatePort } from '../state/ports';
import { registerStudyIpc } from '../study/ipc';
import type { AgentServicePort, StudyServicePort } from '../study/ports';
import { registerTasksIpc } from '../tasks/ipc';
import type { TaskServicePort } from '../tasks/ports';
import { createHandle } from './handle';
import type { IpcRegistrar } from './ports';

export interface Services {
  store: PublicStatePort;
  focus: FocusServicePort;
  tasks: TaskServicePort;
  domains: DomainServicePort;
  study: StudyServicePort;
  agents: AgentServicePort;
}

/** Registra los canales de cada módulo; cada uno solo conoce los de su contrato. */
export function registerHandlers(ipc: IpcRegistrar, { store, focus, tasks, domains, study, agents }: Services): void {
  registerStateIpc(createHandle(ipc), store);
  registerFocusIpc(createHandle(ipc), focus);
  registerTasksIpc(createHandle(ipc), tasks);
  registerBlockingIpc(createHandle(ipc), { domains, focus });
  registerStudyIpc(createHandle(ipc), { study, agents });
}
