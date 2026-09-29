import type { Notifier } from './ports';

/** La parte de `Notification` de Electron que usa Ritmo; permite probar el adaptador sin Electron. */
export interface NotificationApi {
  isSupported(): boolean;
  new (options: { title: string; body: string }): { show(): void };
}

export function createNotifier(Notification: NotificationApi): Notifier {
  return {
    notify(title, body) {
      if (Notification.isSupported()) new Notification({ title, body }).show();
    }
  };
}
