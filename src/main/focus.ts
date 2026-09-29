import { Notification } from 'electron';
import { MINUTES } from '../shared/validation';
import { StateStore } from './state';
import { changeBlock, hasManagedBlock } from './site-blocker';

function notify(title: string, body: string): void {
  if (Notification.isSupported()) new Notification({ title, body }).show();
}

export class FocusService {
  constructor(private readonly store: StateStore) {}

  recover(): void {
    const state = this.store.state;
    const blocked = hasManagedBlock();
    if (blocked && state.session?.kind !== 'focus') state.blockError = 'Se encontró un bloqueo anterior. Usa “Quitar bloqueo” para recuperar el acceso.';
    if (!blocked && state.session?.kind === 'focus') state.session = null;
    if (!blocked) state.blockError = null;
  }

  async endFocus(completed: boolean): Promise<void> {
    const state = this.store.state;
    if (state.session?.kind !== 'focus' && !state.blockError) return;
    await changeBlock('unblock', state.domains);
    state.session = null;
    state.blockError = null;
    if (completed) {
      state.focusCount += 1;
      notify('Foco completado', 'Terminó tu pomodoro. Es momento de descansar.');
    }
  }

  startFocus(): Promise<void> {
    return this.store.guarded(async () => {
      const state = this.store.state;
      if (state.session || state.blockError) throw new Error('Termina la sesión actual o quita el bloqueo pendiente.');
      if (!state.domains.length) throw new Error('Añade al menos un sitio para bloquear.');
      await changeBlock('block', state.domains);
      state.blockError = null;
      state.session = { kind: 'focus', endsAt: Date.now() + MINUTES.focus * 60000 };
    });
  }

  finishFocus(): Promise<void> { return this.store.guarded(() => this.endFocus(false)); }

  startBreak(kind: unknown): Promise<void> {
    return this.store.guarded(async () => {
      if (kind !== 'shortBreak' && kind !== 'longBreak') throw new Error('Tipo de descanso inválido.');
      const state = this.store.state;
      if (state.session || state.blockError) throw new Error('Termina la sesión actual primero.');
      state.session = { kind, endsAt: Date.now() + MINUTES[kind] * 60000 };
    });
  }

  finishBreak(): Promise<void> {
    return this.store.guarded(async () => { if (this.store.state.session?.kind !== 'focus') this.store.state.session = null; });
  }

  async tick(): Promise<void> {
    this.store.rollDay();
    const state = this.store.state;
    if (this.store.busy || !state.session || Date.now() < state.session.endsAt) return;
    const kind = state.session.kind;
    await this.store.guarded(async () => {
      if (kind === 'focus') {
        try { await this.endFocus(true); }
        catch (error) {
          state.blockError = error instanceof Error ? error.message : String(error);
          state.session = null;
          notify('Bloqueo aún activo', 'Abre Ritmo y usa “Quitar bloqueo”.');
        }
      } else {
        state.session = null;
        notify('Descanso terminado', 'Puedes iniciar otro pomodoro.');
      }
    });
  }
}
