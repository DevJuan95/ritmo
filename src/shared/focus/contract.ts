import type { ChannelMap } from '../ipc';

export type SessionKind = 'focus' | 'shortBreak' | 'longBreak';
export type BreakKind = Exclude<SessionKind, 'focus'>;

export interface Session {
  kind: SessionKind;
  endsAt: number;
}

/** Parte del estado de la app que pertenece al foco. */
export interface FocusState {
  session: Session | null;
  focusCount: number;
}

export const MINUTES: Record<SessionKind, number> = { focus: 25, shortBreak: 5, longBreak: 15 };

export interface FocusAPI {
  startFocus(): Promise<void>;
  finishFocus(): Promise<void>;
  startBreak(kind: BreakKind): Promise<void>;
  finishBreak(): Promise<void>;
}

export type FocusChannels = ChannelMap<FocusAPI, {
  startFocus: 'start-focus';
  finishFocus: 'finish-focus';
  startBreak: 'start-break';
  finishBreak: 'finish-break';
}>;
