import { PublicError } from '../../shared/ipc';
import { AGENT_CANCELLED, AGENT_NAMES, safeRoadmapBrief, safeStudyProvider, safeStudyRouteId, STUDY_PROVIDERS, type RoadmapDraft, type StudyProvider, type TaskProposal } from '../../shared/study/contract';
import type { TodayPort } from '../state/ports';
import type { RouteTasksPort } from '../tasks/ports';
import type { AgentLocator, AgentNoticeRepositoryPort, AgentSettingsReaderPort, ProposalLifecyclePort, ProposalServicePort, StudyAgent, StudyAgentFactory, StudyRouteReaderPort } from './ports';

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
 * Peticiones al agente elegido en Ajustes: las siguientes tareas de una ruta guardada o un roadmap
 * completo a partir de un brief. Solo envía datos si el usuario aceptó el aviso de privacidad de ese
 * proveedor, hace una petición a la vez, de cualquiera de los dos tipos, y la puede cancelar. La
 * sesión del CLI la comprueba el adaptador antes de enviar el prompt. Al cerrar la app, `stop()` la
 * cancela y deja de aceptar otras.
 */
export class ProposalService implements ProposalServicePort, ProposalLifecyclePort {
  private running: { controller: AbortController; done: Promise<void> } | undefined;
  private stopped = false;

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
    return this.request(() => this.deps.routes.get(id), (agent, route, signal) => {
      const context = { route, tasks: this.deps.tasks.routeTasks(route.id), today: this.deps.day.today() };
      return agent.propose(context, { signal });
    });
  }

  async draft(brief: unknown): Promise<RoadmapDraft> {
    const text = safeRoadmapBrief(brief);
    return this.request(() => text, (agent, input, signal) => agent.draftRoadmap(input, { signal }));
  }

  /**
   * Hace una petición al agente: comprueba el cierre, que no haya otra en curso, lee su entrada con
   * `prepare` y exige el aviso de privacidad del proveedor antes de buscar su CLI y enviar nada.
   */
  private async request<I, T>(prepare: () => I, send: (agent: StudyAgent, input: I, signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.stopped) throw new PublicError(AGENT_CANCELLED);
    if (this.running) throw new PublicError(AGENT_BUSY);
    const input = prepare();
    const settings = this.deps.settings.loadAgentSettings();
    const provider = settings.provider;
    if (!this.notices().includes(provider)) throw new PublicError(agentNoticeRequired(provider));
    const controller = new AbortController();
    const { signal } = controller;
    const ask = async (): Promise<T> => {
      const command = await this.deps.locator.locate(provider, settings[provider].path);
      if (signal.aborted) throw new PublicError(AGENT_CANCELLED);
      if (command === null) throw new PublicError(agentMissing(provider));
      return send(this.deps.agents.create(provider, { command, model: settings[provider].model }), input, signal);
    };
    const request = ask()
      // Al cancelar, el adaptador puede fallar de cualquier forma: el usuario solo ve que se canceló.
      .catch(error => { throw signal.aborted ? new PublicError(AGENT_CANCELLED) : error; })
      .finally(() => { this.running = undefined; });
    this.running = { controller, done: request.then(() => {}, () => {}) };
    return request;
  }

  cancel(): void {
    this.running?.controller.abort();
  }

  stop(): Promise<void> {
    this.stopped = true;
    this.cancel();
    return this.running?.done ?? Promise.resolve();
  }
}
