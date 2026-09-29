import type { BlockAction, IpcRegistrar, Notifier, QuitReason, QuitSignals, SiteBlocker, SoundPlayer, TimerHandle, Timers } from '../../src/main/ports';

/** Bloqueador en memoria: registra llamadas, puede fallar a demanda o quedarse esperando. */
export class FakeBlocker implements SiteBlocker {
  blocked = false;
  readonly calls: Array<{ action: BlockAction; domains: string[] }> = [];
  private readonly failures: Error[] = [];
  private gate?: Promise<void>;

  failNext(error = new Error('No se pudo cambiar el bloqueo.')): void { this.failures.push(error); }

  /** Deja la siguiente llamada pendiente hasta invocar la función devuelta. */
  hold(): () => void {
    let release!: () => void;
    this.gate = new Promise(resolve => { release = resolve; });
    return () => { this.gate = undefined; release(); };
  }

  hasManagedBlock(): boolean { return this.blocked; }

  async changeBlock(action: BlockAction, domains: string[]): Promise<void> {
    this.calls.push({ action, domains: [...domains] });
    if (this.gate) await this.gate;
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

type Listener = (event: unknown, ...args: any[]) => unknown;

/** Sustituto de ipcMain que permite invocar los manejadores como lo haría el renderer. */
export class FakeIpc implements IpcRegistrar {
  readonly handlers = new Map<string, Listener>();

  handle(channel: string, listener: Listener): void {
    if (this.handlers.has(channel)) throw new Error(`Canal duplicado: ${channel}`);
    this.handlers.set(channel, listener);
  }

  async invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    const handler = this.handlers.get(channel);
    if (!handler) throw new Error(`No hay manejador para ${channel}.`);
    return handler({}, ...args);
  }
}

export function sequentialIds(prefix = 'task'): () => string {
  let next = 0;
  return () => `${prefix}-${++next}`;
}
