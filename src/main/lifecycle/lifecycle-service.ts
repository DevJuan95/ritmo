import type { Notifier, TimerHandle, Timers } from '../common/ports';
import type { FocusLifecyclePort } from '../focus/ports';
import type { StateShutdownPort, StateStorePort } from '../state/ports';
import type { Database, LifecycleServicePort, QuitSignals } from './ports';

/**
 * Tiempo máximo de cada fase del cierre ordenado si no se configura otro: la espera de la operación
 * en curso y el desbloqueo. Una operación en curso puede estar reinstalando el helper en
 * `blocking/site-blocker.ts`: un diálogo de `osascript` (hasta 120 s) y hasta tres llamadas a `sudo` (hasta
 * 10 s cada una). El desbloqueo al salir no pide autorización, así que solo usa `sudo`.
 * Si se agota, se cancela el cambio de bloqueo en curso (lo que termina su `osascript` o su `sudo`)
 * y el cierre sigue por el camino de fallo del desbloqueo.
 */
export const DEFAULT_SHUTDOWN_TIMEOUT_MS = 160000;
export const TICK_INTERVAL_MS = 1000;

export interface LifecycleDeps {
  store: StateStorePort & StateShutdownPort;
  focus: FocusLifecyclePort;
  notifier: Notifier;
  /** Conexiones SQLite que se cierran al final, en orden. */
  databases: readonly Database[];
  timers: Timers;
  shutdownTimeoutMs?: number;
}

/** Arranque y cierre ordenado del proceso principal. */
export class LifecycleService implements LifecycleServicePort {
  private readonly store: StateStorePort & StateShutdownPort;
  private readonly focus: FocusLifecyclePort;
  private readonly notifier: Notifier;
  private readonly databases: readonly Database[];
  private readonly timers: Timers;
  private readonly timeoutMs: number;
  private ticker?: TimerHandle;
  private stopping?: Promise<void>;
  /** Se agotó el tiempo máximo: lo que termine después ya no cambia el estado guardado. */
  private expired = false;

  constructor(deps: LifecycleDeps) {
    this.store = deps.store;
    this.focus = deps.focus;
    this.notifier = deps.notifier;
    this.databases = deps.databases;
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
   * cancela el cambio de bloqueo en curso y guarda `blockError` para que `recover()` lo resuelva al arrancar.
   */
  shutdown(): Promise<void> {
    this.stopping ??= this.stop();
    return this.stopping;
  }

  private async stop(): Promise<void> {
    if (this.ticker !== undefined) this.timers.clearInterval(this.ticker);
    try {
      if (await this.within(this.store.drain())) await this.within(this.store.closeWith(() => this.release()));
    } finally {
      if (this.expired && this.focus.mustReleaseBeforeQuit()) {
        this.leavePending(this.store.state.blockError ?? 'Ritmo se cerró antes de quitar el bloqueo.');
      }
      try { this.store.seal(); }
      finally { this.closeDatabases(); }
    }
  }

  /** Cierra todas las conexiones aunque falle alguna, y lanza el primer error. */
  private closeDatabases(): void {
    const errors: unknown[] = [];
    for (const database of this.databases) {
      try { database.close(); }
      catch (error) { errors.push(error); }
    }
    if (errors.length) throw errors[0];
  }

  /**
   * Espera `work` como máximo `timeoutMs`. Si se agota, cancela el cambio de bloqueo en curso para no
   * dejar un diálogo de administrador ni un `sudo` vivos tras salir, y devuelve `false`.
   */
  private async within(work: Promise<unknown>): Promise<boolean> {
    let timeout: TimerHandle;
    const deadline = new Promise<false>(resolve => {
      timeout = this.timers.setTimeout(() => resolve(false), this.timeoutMs);
    });
    try {
      if (await Promise.race([work.then(() => true as const), deadline])) return true;
      this.expired = true;
      this.focus.abortBlockChange();
      return false;
    } finally { this.timers.clearTimeout(timeout); }
  }

  private async release(): Promise<void> {
    if (!this.focus.mustReleaseBeforeQuit()) return;
    // Sin autorización: nadie responde a tiempo a un diálogo de administrador mientras la app sale.
    // Si hace falta reinstalar el helper, el bloqueo queda pendiente para `recover()`.
    try { await this.focus.endFocus(false, { authorize: false }); }
    catch (error) {
      // Si se canceló por el tiempo máximo, `stop()` ya dejó el bloqueo pendiente y guardó el estado.
      if (!this.expired) this.leavePending(error instanceof Error ? error.message : String(error));
    }
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
