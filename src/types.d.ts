type SessionKind = 'focus' | 'shortBreak' | 'longBreak';
type BreakKind = Exclude<SessionKind, 'focus'>;

interface Task {
  id: string;
  title: string;
  done: boolean;
}

interface Session {
  kind: SessionKind;
  endsAt: number;
}

interface AppState {
  day: string;
  tasks: Task[];
  domains: string[];
  session: Session | null;
  focusCount: number;
  blockError: string | null;
}

interface PublicState extends AppState {
  busy: boolean;
  now: number;
}

interface RitmoAPI {
  getState(): Promise<PublicState>;
  startFocus(): Promise<void>;
  finishFocus(): Promise<void>;
  startBreak(kind: BreakKind): Promise<void>;
  finishBreak(): Promise<void>;
  addTask(title: string): Promise<void>;
  toggleTask(id: string): Promise<void>;
  deleteTask(id: string): Promise<void>;
  addDomain(domain: string): Promise<void>;
  removeDomain(domain: string): Promise<void>;
  retryUnblock(): Promise<void>;
  onState(callback: (state: PublicState) => void): () => void;
}

interface Window {
  ritmo: RitmoAPI;
}
