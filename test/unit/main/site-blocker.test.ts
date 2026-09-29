import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { BLOCK_MARKER, createSiteBlocker, type SiteBlockerDeps } from '../../../src/main/site-blocker';
import { tempDir } from '../../helpers/temp';

function blockerWith(overrides: Partial<SiteBlockerDeps> = {}) {
  const calls: Array<{ file: string; args: string[] }> = [];
  const blocker = createSiteBlocker({
    platform: 'darwin',
    helperPath: '/app/block-sites.sh',
    exec: async (file, args) => { calls.push({ file, args }); },
    ...overrides
  });
  return { blocker, calls };
}

test('bloquear envía la lista de dominios al script mediante osascript', async () => {
  const { blocker, calls } = blockerWith();
  await blocker.changeBlock('block', ['x.com', 'facebook.com']);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].file, '/usr/bin/osascript');
  assert.deepEqual(calls[0].args.slice(2), ['/app/block-sites.sh', 'block', 'x.com\nfacebook.com']);
  assert.match(calls[0].args[1], /with administrator privileges/);
});

test('desbloquear no envía dominios', async () => {
  const { blocker, calls } = blockerWith();
  await blocker.changeBlock('unblock', ['x.com']);
  assert.deepEqual(calls[0].args.slice(3), ['unblock', '']);
});

test('fuera de macOS falla sin ejecutar nada', async () => {
  const { blocker, calls } = blockerWith({ platform: 'linux' });
  await assert.rejects(blocker.changeBlock('block', ['x.com']), /requiere macOS/);
  assert.equal(calls.length, 0);
});

test('traduce la cancelación de macOS y otros errores a mensajes claros', async () => {
  const failing = (error: Error & { stderr?: string }) => blockerWith({ exec: async () => { throw error; } }).blocker;
  await assert.rejects(failing(new Error('execution error: User canceled. (-128)')).changeBlock('block', ['x.com']), /^Error: Se canceló la autorización de macOS\.$/);
  await assert.rejects(failing(Object.assign(new Error('Command failed'), { stderr: '(-128)' })).changeBlock('unblock', []), /Se canceló/);
  await assert.rejects(failing(new Error('boom')).changeBlock('block', ['x.com']), /No se pudo activar el bloqueo/);
  await assert.rejects(failing(new Error('boom')).changeBlock('unblock', []), /No se pudo quitar el bloqueo/);
});

test('detecta la sección de Ritmo en hosts y tolera errores de lectura', () => {
  const read = (contents: string) => blockerWith({ readFile: () => contents }).blocker.hasManagedBlock();
  assert.equal(read(`127.0.0.1 localhost\n${BLOCK_MARKER}\n0.0.0.0 x.com\n`), true);
  assert.equal(read('127.0.0.1 localhost\n'), false);
  assert.equal(blockerWith({ readFile: () => { throw new Error('EACCES'); } }).blocker.hasManagedBlock(), false);
});

test('por defecto lee el archivo hosts configurado', t => {
  const hostsPath = path.join(tempDir(t), 'hosts');
  const blocker = createSiteBlocker({ hostsPath });
  assert.equal(blocker.hasManagedBlock(), false, 'sin archivo no hay bloqueo');
  fs.writeFileSync(hostsPath, `127.0.0.1 localhost\n${BLOCK_MARKER}\n`);
  assert.equal(blocker.hasManagedBlock(), true);
});
