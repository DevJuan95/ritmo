import type { FocusService } from './focus';
import type { Notifier, QuitSignals, TaskRepositoryPort, TimerHandle, Timers } from './ports';
import type { StateStore } from './state';

/**
 * Tiempo máximo de cada fase del cierre ordenado si no se configura otro: la espera de la operación
 * en curso y el desbloqueo. Una operación en curso puede estar reinstalando el helper en
 * `site-blocker.ts`: un diálogo de `osascript` (hasta 120 s) y hasta tres llamadas a `sudo` (hasta
 * 10 s cada una). El desbloqueo al salir no pide autorización, así que solo usa `sudo`.
 * Si se agota, el cierre sigue por el camino de fallo del desbloqueo.
 */
export const DEFAULT_SHUTDOWN_TIMEOUT_MS = 160000;
export const TICK_INTERVAL_MS = 1000;

export interface LifecycleDeps {
  store: StateStore;
  focus: FocusService;
  notifier: Notifier;
  tasks: TaskRepositoryPort;
  timers: Timers;
  shutdownTimeoutMs?: number;
}

/** Arranque y cierre ordenado del proceso principal. */
export class LifecycleService {
  private readonly store: StateStore;
  private readonly focus: FocusService;
  private readonly notifier: Notifier;
  private readonly tasks: TaskRepositoryPort;
  private readonly timers: Timers;
  private readonly timeoutMs: number;
  private ticker?: TimerHandle;
  private stopping?: Promise<void>;

  constructor(deps: LifecycleDeps) {
    this.store = deps.store;
    this.focus = deps.focus;
    this.notifier = deps.notifier;
    this.tasks = deps.tasks;
    this.timers = deps.timers;
    this.timeoutMs = deps.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS;
  }

  /**
   * Reconcilia el bloqueo con `/etc/hosts`, hace el reinicio diario, cierra de inmediato una sesión
   * vencida con la app cerrada y empieza el tic de cada segundo.
   */
  start(onError: (error: unknown) => void): void {
    this.focus.recover();
    this.store.rollDay();
    const tick = () => { this.focus.tick().catch(onError); };
    tick();
    this.ticker = this.timers.setInterval(tick, TICK_INTERVAL_MS);
  }

  /**
   * Conecta las vías de salida con el cierre. Llama a `exit` una sola vez, al terminar el cierre,
   * con el error si lo hubo.
   */
  listen(signals: QuitSignals, exit: (error?: unknown) => void): void {
    let exiting: Promise<void> | undefined;
    signals.subscribe(() => {
      exiting ??= this.shutdown().then(() => exit(), error => exit(error));
    });
  }

  /**
   * Cierre ordenado e idempotente: detiene el tic, deja de aceptar operaciones protegidas, espera
   * la que esté en curso, quita el bloqueo si hace falta, guarda el estado y cierra SQLite.
   * La espera y el desbloqueo tienen cada uno el tiempo máximo completo; si se agota en cualquiera,
   * guarda `blockError` para que `recover()` lo resuelva al arrancar.
   */
  shutdown(): Promise<void> {
    this.stopping ??= this.stop();
    return this.stopping;
  }

  private async stop(): Promise<void> {
    if (this.ticker !== undefined) this.timers.clearInterval(this.ticker);
    let expired = false;
    try {
      expired = !await this.within(this.store.drain()) ||
        !await this.within(this.store.closeWith(() => this.release()));
    } finally {
      if (expired && this.focus.mustReleaseBeforeQuit()) {
        this.leavePending(this.store.state.blockError ?? 'Ritmo se cerró antes de quitar el bloqueo.');
      }
      try { this.store.save(); }
      finally { this.tasks.close(); }
    }
  }

  /** Espera `work` como máximo `timeoutMs`. Devuelve `false` si se agotó el tiempo. */
  private async within(work: Promise<unknown>): Promise<boolean> {
    let timeout: TimerHandle;
    const deadline = new Promise<false>(resolve => {
      timeout = this.timers.setTimeout(() => resolve(false), this.timeoutMs);
    });
    try { return await Promise.race([work.then(() => true as const), deadline]); }
    finally { this.timers.clearTimeout(timeout); }
  }

  private async release(): Promise<void> {
    if (!this.focus.mustReleaseBeforeQuit()) return;
    // Sin autorización: nadie responde a tiempo a un diálogo de administrador mientras la app sale.
    // Si hace falta reinstalar el helper, el bloqueo queda pendiente para `recover()`.
    try { await this.focus.endFocus(false, { authorize: false }); }
    catch (error) { this.leavePending(error instanceof Error ? error.message : String(error)); }
  }

  /**
   * Deja un bloqueo pendiente para `recover()` y lo notifica. Descarta el foco, como `tick()` al fallar
   * el desbloqueo: un foco interrumpido al salir no debe contarse como pomodoro al volver a abrir.
   */
  private leavePending(message: string): void {
    this.store.state.blockError = message;
    this.store.state.session = null;
    this.notifier.notify('Bloqueo aún activo', 'Ritmo se cerró sin quitar el bloqueo. Ábrelo y usa “Quitar bloqueo”.');
  }
}
