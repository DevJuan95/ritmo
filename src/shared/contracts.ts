export type SessionKind = 'focus' | 'shortBreak' | 'longBreak';
export type BreakKind = Exclude<SessionKind, 'focus'>;

export interface Task {
  id: string;
  title: string;
  done: boolean;
  plannedDate: string;
  createdAt: string;
  completedAt: string | null;
}

export interface Session {
  kind: SessionKind;
  endsAt: number;
}

export interface AppState {
  day: string;
  tasks: Task[];
  domains: string[];
  session: Session | null;
  focusCount: number;
  blockError: string | null;
}

export interface PublicState extends AppState {
  busy: boolean;
  now: number;
}

export interface RitmoAPI {
  getState(): Promise<PublicState>;
  startFocus(): Promise<void>;
  finishFocus(): Promise<void>;
  startBreak(kind: BreakKind): Promise<void>;
  finishBreak(): Promise<void>;
  addTask(title: string, date?: string): Promise<void>;
  toggleTask(id: string): Promise<void>;
  deleteTask(id: string): Promise<void>;
  getTasksForDay(date: string): Promise<Task[]>;
  updateTask(id: string, patch: { title?: string; plannedDate?: string; done?: boolean }): Promise<void>;
  addDomain(domain: string): Promise<void>;
  removeDomain(domain: string): Promise<void>;
  retryUnblock(): Promise<void>;
  onState(callback: (state: PublicState) => void): () => void;
}

declare global {
  interface Window {
    ritmo: RitmoAPI;
  }
}
