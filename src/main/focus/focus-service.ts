import { PublicError } from '../../shared/contracts';
import { MINUTES } from '../../shared/validation';
import type { BlockAction, ChangeBlockOptions, SiteBlocker } from '../blocking/ports';
import type { Notifier } from '../common/ports';
import type { StateStorePort } from '../state/ports';
import type { FocusLifecyclePort, FocusServicePort, SoundPlayer } from './ports';

export interface FocusDeps {
  blocker: SiteBlocker;
  notifier: Notifier;
  sound: SoundPlayer;
}

export class FocusService implements FocusServicePort, FocusLifecyclePort {
  private readonly blocker: SiteBlocker;
  private readonly notifier: Notifier;
  private readonly sound: SoundPlayer;
  /** Cancela el cambio de bloqueo en curso. Solo hay uno a la vez: todos pasan por `guarded` o `closeWith`. */
  private pending?: AbortController;
  /** El cierre ordenado canceló un cambio de bloqueo; el aviso lo da el cierre, no el tic. */
  private aborted = false;

  constructor(private readonly store: StateStorePort, deps: FocusDeps) {
    this.blocker = deps.blocker;
    this.notifier = deps.notifier;
    this.sound = deps.sound;
  }

  recover(): void {
    const state = this.store.state;
    const blocked = this.blocker.hasManagedBlock();
    if (blocked && state.session?.kind !== 'focus') state.blockError = 'Se encontró un bloqueo anterior. Usa “Quitar bloqueo” para recuperar el acceso.';
    if (!blocked && state.session?.kind === 'focus') state.session = null;
    if (!blocked) state.blockError = null;
  }

  /**
   * Cancela el cambio de bloqueo en curso: termina el `osascript` o el `sudo` que esté esperando.
   * La operación que lo pidió falla sin cambiar el estado.
   */
  abortBlockChange(): void {
    if (!this.pending) return;
    this.aborted = true;
    this.pending.abort();
  }

  private async changeBlock(action: BlockAction, options: ChangeBlockOptions = {}): Promise<void> {
    const controller = new AbortController();
    this.pending = controller;
    try { await this.blocker.changeBlock(action, this.store.state.domains, { ...options, signal: controller.signal }); }
    finally { this.pending = undefined; }
  }

  mustReleaseBeforeQuit(): boolean {
    return this.store.state.session?.kind === 'focus' || !!this.store.state.blockError;
  }

  async endFocus(completed: boolean, options: ChangeBlockOptions = {}): Promise<void> {
    const state = this.store.state;
    if (state.session?.kind !== 'focus' && !state.blockError) return;
    await this.changeBlock('unblock', options);
    state.session = null;
    state.blockError = null;
    if (completed) {
      state.focusCount += 1;
      this.notifier.notify('Foco completado', 'Terminó tu pomodoro. Es momento de descansar.');
      try { this.sound.play(); } catch { /* Sin sonido, el pomodoro ya quedó contado y desbloqueado. */ }
    }
  }

  startFocus(): Promise<void> {
    return this.store.guarded(async () => {
      const state = this.store.state;
      if (state.session || state.blockError) throw new PublicError('Termina la sesión actual o quita el bloqueo pendiente.');
      if (!state.domains.length) throw new PublicError('Añade al menos un sitio para bloquear.');
      await this.changeBlock('block');
      state.blockError = null;
      state.session = { kind: 'focus', endsAt: this.store.now() + MINUTES.focus * 60000 };
    });
  }

  finishFocus(): Promise<void> { return this.store.guarded(() => this.endFocus(false)); }

  startBreak(kind: unknown): Promise<void> {
    return this.store.guarded(async () => {
      if (kind !== 'shortBreak' && kind !== 'longBreak') throw new PublicError('Tipo de descanso inválido.');
      const state = this.store.state;
      if (state.session || state.blockError) throw new PublicError('Termina la sesión actual primero.');
      state.session = { kind, endsAt: this.store.now() + MINUTES[kind] * 60000 };
    });
  }

  finishBreak(): Promise<void> {
    return this.store.guarded(async () => { if (this.store.state.session?.kind !== 'focus') this.store.state.session = null; });
  }

  async tick(): Promise<void> {
    this.store.rollDay();
    const state = this.store.state;
    if (this.store.busy || !state.session || this.store.now() < state.session.endsAt) return;
    const kind = state.session.kind;
    await this.store.guarded(async () => {
      if (kind === 'focus') {
        try { await this.endFocus(true); }
        catch (error) {
          if (this.aborted) return;
          state.blockError = error instanceof Error ? error.message : String(error);
          state.session = null;
          this.notifier.notify('Bloqueo aún activo', 'Abre Ritmo y usa “Quitar bloqueo”.');
        }
      } else {
        state.session = null;
        this.notifier.notify('Descanso terminado', 'Puedes iniciar otro pomodoro.');
      }
    });
  }
}
