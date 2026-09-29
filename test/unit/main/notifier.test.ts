import test from 'node:test';
import assert from 'node:assert/strict';
import { createNotifier, type NotificationApi } from '../../../src/main/notifier';

/** Sustituye a `Notification` de Electron y registra lo que se mostraría. */
function fakeNotification(supported: boolean) {
  const shown: Array<{ title: string; body: string }> = [];
  const Notification = class {
    static isSupported() { return supported; }
    constructor(private readonly options: { title: string; body: string }) {}
    show() { shown.push(this.options); }
  } satisfies NotificationApi;
  return { Notification, shown };
}

test('muestra la notificación cuando el sistema la admite', () => {
  const { Notification, shown } = fakeNotification(true);
  createNotifier(Notification).notify('Foco completado', 'Descansa.');
  assert.deepEqual(shown, [{ title: 'Foco completado', body: 'Descansa.' }]);
});

test('no hace nada si el sistema no admite notificaciones', () => {
  const { Notification, shown } = fakeNotification(false);
  createNotifier(Notification).notify('Foco completado', 'Descansa.');
  assert.deepEqual(shown, []);
});
