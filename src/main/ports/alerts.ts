export interface Notifier {
  notify(title: string, body: string): void;
}

export interface SoundPlayer {
  play(): void;
}
