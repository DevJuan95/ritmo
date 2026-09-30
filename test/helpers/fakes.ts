import type { BridgeHandler, BridgeServer } from '../../src/main/bridge/ports';
import type { BlockAction, ChangeBlockOptions, SiteBlocker } from '../../src/main/blocking/ports';
import type { Notifier, TimerHandle, Timers } from '../../src/main/common/ports';
import type { SoundPlayer } from '../../src/main/focus/ports';
import type { IpcRegistrar } from '../../src/main/ipc/ports';
import type { QuitReason, QuitSignals } from '../../src/main/lifecycle/ports';
import { buildAgentRequest, buildRoadmapRequest, readAgentProposals, readAgentRoadmap, type AgentRequest, type RoadmapSchema } from '../../src/main/study/agent-prompt';
import type { AgentDetector, AgentLogin, StudyAgent, StudyAgentCli, StudyAgentContext, StudyAgentFactory, StudyAgentOptions } from '../../src/main/study/ports';
import type { RoadmapBrief, RoadmapDraft, StudyProvider, TaskProposal } from '../../src/shared/study/contract';
import type { IpcResult } from '../../src/shared/ipc';

/** Rechaza cuando se aborta `signal`, como `execFile` al terminar el proceso hijo. */
function aborted(signal?: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    signal?.addEventListener('abort', () => reject(new Error('Se canceló el cambio del bloqueo de sitios.')), { once: true });
  });
}

/** Bloqueador en memoria: registra llamadas, puede fallar a demanda o quedarse esperando. */
export class FakeBlocker implements SiteBlocker {
  blocked = false;
  /** `authorize: false` solo aparece en las llamadas que no pueden pedir autorización. */
  readonly calls: Array<{ action: BlockAction; domains: string[]; authorize?: false }> = [];
  private readonly failures: Error[] = [];
  private gate?: Promise<void>;

  failNext(error = new Error('No se pudo cambiar el bloqueo.')): void { this.failures.push(error); }

  /** Deja la siguiente llamada pendiente hasta invocar la función devuelta o abortar su `signal`. */
  hold(): () => void {
    let release!: () => void;
    this.gate = new Promise(resolve => { release = resolve; });
    return () => { this.gate = undefined; release(); };
  }

  hasManagedBlock(): boolean { return this.blocked; }

  async changeBlock(action: BlockAction, domains: string[], options: ChangeBlockOptions = {}): Promise<void> {
    this.calls.push({ action, domains: [...domains], ...(options.authorize === false ? { authorize: false as const } : {}) });
    if (this.gate) await Promise.race([this.gate, aborted(options.signal)]);
    const failure = this.failures.shift();
    if (failure) throw failure;
    this.blocked = action === 'block';
  }
}

export class FakeNotifier implements Notifier {
  readonly sent: Array<{ title: string; body: string }> = [];
  notify(title: string, body: string): void { this.sent.push({ title, body }); }
  titles(): string[] { return this.sent.map(item => item.title); }
}

/** Reproductor en memoria: cuenta las reproducciones y puede fallar a demanda. */
export class FakeSoundPlayer implements SoundPlayer {
  plays = 0;
  private failure?: Error;
  failNext(error = new Error('No se pudo reproducir el sonido.')): void { this.failure = error; }
  play(): void {
    this.plays += 1;
    const failure = this.failure;
    this.failure = undefined;
    if (failure) throw failure;
  }
}

interface ScheduledTimer {
  at: number;
  callback: () => void;
  every?: number;
}

/**
 * Reloj controlable que también hace de `Timers`: `advance` ejecuta en orden los temporizadores que
 * vencen. Por defecto: 29 de septiembre de 2026, 09:00 hora local.
 */
export class FakeClock implements Timers {
  private readonly scheduled = new Map<number, ScheduledTimer>();
  private nextTimer = 0;
  constructor(public current = new Date(2026, 8, 29, 9, 0, 0).getTime()) {}
  readonly now = (): number => this.current;

  advance(ms: number): void {
    const target = this.current + ms;
    for (let next = this.due(target); next; next = this.due(target)) {
      const [id, timer] = next;
      this.current = timer.at;
      if (timer.every) timer.at += timer.every;
      else this.scheduled.delete(id);
      timer.callback();
    }
    this.current = target;
  }

  advanceMinutes(minutes: number): void { this.advance(minutes * 60000); }
  nextDay(): void { this.advance(24 * 60 * 60000); }

  /** Temporizadores programados y sin cancelar. */
  get pendingTimers(): number { return this.scheduled.size; }

  setTimeout(callback: () => void, ms: number): TimerHandle { return this.schedule({ at: this.current + ms, callback }); }
  setInterval(callback: () => void, ms: number): TimerHandle { return this.schedule({ at: this.current + ms, callback, every: ms }); }
  clearTimeout(handle: TimerHandle): void { this.scheduled.delete(handle as number); }
  clearInterval(handle: TimerHandle): void { this.scheduled.delete(handle as number); }

  private schedule(timer: ScheduledTimer): number {
    this.scheduled.set(++this.nextTimer, timer);
    return this.nextTimer;
  }

  private due(target: number): [number, ScheduledTimer] | undefined {
    let found: [number, ScheduledTimer] | undefined;
    for (const entry of this.scheduled) {
      if (entry[1].at <= target && (!found || entry[1].at < found[1].at)) found = entry;
    }
    return found;
  }
}

/** Vías de salida simuladas: `emit` avisa a los oyentes como lo haría una señal o `before-quit`. */
export class FakeQuitSignals implements QuitSignals {
  private readonly listeners: Array<(reason: QuitReason) => void> = [];
  subscribe(listener: (reason: QuitReason) => void): void { this.listeners.push(listener); }
  emit(reason: QuitReason): void { this.listeners.forEach(listener => listener(reason)); }
}

/**
 * Agente en memoria que se comporta como un adaptador: arma la petición con `buildAgentRequest()` o
 * `buildRoadmapRequest()`, la registra y valida con `readAgentProposals()` o `readAgentRoadmap()` la
 * salida preparada con `respondWith()`, que puede ser JSON o texto. Puede fallar a demanda o quedarse
 * esperando hasta que se aborte su `signal`.
 */
export class FakeStudyAgent implements StudyAgent {
  readonly requests: Array<AgentRequest & { context: StudyAgentContext }> = [];
  readonly roadmapRequests: Array<AgentRequest<RoadmapSchema> & { brief: RoadmapBrief }> = [];
  private output: unknown = { proposals: [] };
  private failure?: Error;
  private waiting = false;

  respondWith(output: unknown): void { this.output = output; }
  failNext(error = new Error('No se pudo lanzar el agente.')): void { this.failure = error; }
  /** La siguiente petición no responde hasta que se aborta. */
  hang(): void { this.waiting = true; }

  async propose(context: StudyAgentContext, options: StudyAgentOptions = {}): Promise<TaskProposal[]> {
    this.requests.push({ ...buildAgentRequest(context), context });
    return readAgentProposals(await this.answer(options), context.route);
  }

  async draftRoadmap(brief: RoadmapBrief, options: StudyAgentOptions = {}): Promise<RoadmapDraft> {
    this.roadmapRequests.push({ ...buildRoadmapRequest(brief), brief });
    return readAgentRoadmap(await this.answer(options));
  }

  /** La salida preparada, después de esperar o fallar si se pidió. */
  private async answer({ signal }: StudyAgentOptions): Promise<unknown> {
    if (this.waiting) {
      this.waiting = false;
      await new Promise((_resolve, reject) => {
        if (signal?.aborted) reject(new Error('Se canceló la petición al agente.'));
        signal?.addEventListener('abort', () => reject(new Error('Se canceló la petición al agente.')), { once: true });
      });
    }
    const failure = this.failure;
    this.failure = undefined;
    if (failure) throw failure;
    return this.output;
  }
}

/** Fábrica que siempre devuelve el mismo `FakeStudyAgent` y registra con qué CLI se pidió. */
export class FakeStudyAgentFactory implements StudyAgentFactory {
  readonly agent = new FakeStudyAgent();
  readonly created: Array<{ provider: StudyProvider } & StudyAgentCli> = [];

  create(provider: StudyProvider, cli: StudyAgentCli): StudyAgent {
    this.created.push({ provider, ...cli });
    return this.agent;
  }
}

/**
 * Detector de CLI en memoria. Cada proveedor tiene un ejecutable detectado y un estado de sesión;
 * una ruta configurada solo se encuentra si está en `executables`. Registra las llamadas.
 */
export class FakeAgentDetector implements AgentDetector {
  readonly detected: Record<StudyProvider, string | null> = { claude: '/usr/local/bin/claude', codex: null };
  readonly logins: Record<StudyProvider, AgentLogin> = { claude: 'ready', codex: 'ready' };
  /** Rutas configuradas que existen y se pueden ejecutar. */
  readonly executables = new Set<string>();
  readonly calls: Array<{ method: 'locate'; provider: StudyProvider; configured: string } | { method: 'login'; provider: StudyProvider; command: string }> = [];

  async locate(provider: StudyProvider, configured: string): Promise<string | null> {
    this.calls.push({ method: 'locate', provider, configured });
    if (configured) return this.executables.has(configured) ? configured : null;
    return this.detected[provider];
  }

  async login(provider: StudyProvider, command: string): Promise<AgentLogin> {
    this.calls.push({ method: 'login', provider, command });
    return this.logins[provider];
  }
}

type Listener = (event: unknown, ...args: any[]) => unknown;

/** Sustituto de ipcMain que permite invocar los manejadores como lo haría el renderer. */
export class FakeIpc implements IpcRegistrar {
  readonly handlers = new Map<string, Listener>();

  handle(channel: string, listener: Listener): void {
    if (this.handlers.has(channel)) throw new Error(`Canal duplicado: ${channel}`);
    this.handlers.set(channel, listener);
  }

  async invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    const result = await this.invokeRaw(channel, ...args) as IpcResult<unknown>;
    if (result.ok) return result.value;
    throw new Error(result.error.kind === 'expected' ? result.error.message : 'Error inesperado.');
  }

  async invokeRaw(channel: string, ...args: unknown[]): Promise<unknown> {
    const handler = this.handlers.get(channel);
    if (!handler) throw new Error(`No hay manejador para ${channel}.`);
    return handler({}, ...args);
  }
}

/** Servidor del puente en memoria: guarda el manejador para invocarlo sin socket y puede fallar a demanda. */
export class FakeBridgeServer implements BridgeServer {
  socketPath?: string;
  handler?: BridgeHandler;
  closes = 0;
  failListen?: Error;
  failClose?: Error;

  async listen(socketPath: string, handler: BridgeHandler): Promise<void> {
    if (this.failListen) throw this.failListen;
    this.socketPath = socketPath;
    this.handler = handler;
  }

  async close(): Promise<void> {
    this.closes++;
    this.handler = undefined;
    if (this.failClose) throw this.failClose;
  }

  get listening(): boolean { return this.handler !== undefined; }
}

export function sequentialIds(prefix = 'task'): () => string {
  let next = 0;
  return () => `${prefix}-${++next}`;
}
