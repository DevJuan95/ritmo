import { PublicError } from '../../shared/ipc';
import { AGENT_CANCELLED, AGENT_NAMES, safeStudyProvider, safeStudyRouteId, STUDY_PROVIDERS, type AgentSettings, type StudyProvider, type StudyRoute, type TaskProposal } from '../../shared/study/contract';
import type { TodayPort } from '../state/ports';
import type { RouteTasksPort } from '../tasks/ports';
import type { AgentLocator, AgentNoticeRepositoryPort, AgentSettingsReaderPort, ProposalServicePort, StudyAgentFactory, StudyRouteReaderPort } from './ports';

export const AGENT_BUSY = 'Ya hay una petición al agente en curso. Espera a que termine o cancélala.';

/** Error de una petición sin el aviso de privacidad del proveedor aceptado. */
export function agentNoticeRequired(provider: StudyProvider): string {
  return `Acepta el aviso de privacidad antes de enviar la ruta a ${AGENT_NAMES[provider]}.`;
}

/** Error de una petición sin el CLI del proveedor. */
export function agentMissing(provider: StudyProvider): string {
  return `No se encontró ${AGENT_NAMES[provider]}. Revisa su ruta en Ajustes.`;
}

export interface ProposalServiceDeps {
  routes: StudyRouteReaderPort;
  tasks: RouteTasksPort;
  settings: AgentSettingsReaderPort;
  notices: AgentNoticeRepositoryPort;
  locator: AgentLocator;
  agents: StudyAgentFactory;
  day: TodayPort;
}

/**
 * Pide al agente elegido en Ajustes las siguientes tareas de una ruta guardada. Solo envía la ruta
 * si el usuario aceptó el aviso de privacidad de ese proveedor, hace una petición a la vez y la
 * puede cancelar. La sesión del CLI la comprueba el adaptador antes de enviar el prompt.
 */
export class ProposalService implements ProposalServicePort {
  private running: AbortController | undefined;

  constructor(private readonly deps: ProposalServiceDeps) {}

  notices(): StudyProvider[] {
    return this.deps.notices.loadAgentNotices();
  }

  acceptNotice(provider: unknown): StudyProvider[] {
    const accepted = new Set([...this.notices(), safeStudyProvider(provider)]);
    const notices = STUDY_PROVIDERS.filter(item => accepted.has(item));
    this.deps.notices.saveAgentNotices(notices);
    return notices;
  }

  async propose(routeId: unknown): Promise<TaskProposal[]> {
    const id = safeStudyRouteId(routeId);
    if (this.running) throw new PublicError(AGENT_BUSY);
    const route = this.deps.routes.get(id);
    const settings = this.deps.settings.loadAgentSettings();
    const provider = settings.provider;
    if (!this.notices().includes(provider)) throw new PublicError(agentNoticeRequired(provider));
    const controller = new AbortController();
    this.running = controller;
    return this.ask(route, settings, controller.signal)
      // Al cancelar, el adaptador puede fallar de cualquier forma: el usuario solo ve que se canceló.
      .catch(error => { throw controller.signal.aborted ? new PublicError(AGENT_CANCELLED) : error; })
      .finally(() => { this.running = undefined; });
  }

  private async ask(route: StudyRoute, settings: AgentSettings, signal: AbortSignal): Promise<TaskProposal[]> {
    const provider = settings.provider;
    const command = await this.deps.locator.locate(provider, settings[provider].path);
    if (signal.aborted) throw new PublicError(AGENT_CANCELLED);
    if (command === null) throw new PublicError(agentMissing(provider));
    const agent = this.deps.agents.create(provider, { command, model: settings[provider].model });
    const context = { route, tasks: this.deps.tasks.routeTasks(route.id), today: this.deps.day.today() };
    return agent.propose(context, { signal });
  }

  cancel(): void {
    this.running?.abort();
  }
}
