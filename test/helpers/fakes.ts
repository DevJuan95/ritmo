import type { BlockAction, IpcRegistrar, Notifier, SiteBlocker } from '../../src/main/ports';

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

/** Reloj controlable. Por defecto: 29 de septiembre de 2026, 09:00 hora local. */
export class FakeClock {
  constructor(public current = new Date(2026, 8, 29, 9, 0, 0).getTime()) {}
  readonly now = (): number => this.current;
  advance(ms: number): void { this.current += ms; }
  advanceMinutes(minutes: number): void { this.advance(minutes * 60000); }
  nextDay(): void { this.advance(24 * 60 * 60000); }
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
