import type { FocusChannels } from '../../shared/focus/contract';
import type { Handle } from '../ipc/ports';
import type { FocusServicePort } from './ports';

export function registerFocusIpc(handle: Handle<FocusChannels>, focus: FocusServicePort): void {
  handle('start-focus', () => focus.startFocus());
  handle('finish-focus', () => focus.finishFocus());
  handle('start-break', (kind: unknown) => focus.startBreak(kind));
  handle('finish-break', () => focus.finishBreak());
}
