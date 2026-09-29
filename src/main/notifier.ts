import { Notification } from 'electron';
import type { Notifier } from './ports';

export const electronNotifier: Notifier = {
  notify(title, body) {
    if (Notification.isSupported()) new Notification({ title, body }).show();
  }
};
