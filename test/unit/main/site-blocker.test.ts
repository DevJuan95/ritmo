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
    installerPath: '/app/install-block-helper.sh',
    installedHelperPath: '/Library/PrivilegedHelperTools/ritmo-block-sites',
    account: 'student',
    readFile: () => 'helper version 1',
    exec: async (file, args) => { calls.push({ file, args }); },
    ...overrides
  });
  return { blocker, calls };
}

test('bloquear usa el helper instalado sin pedir autorización', async () => {
  const { blocker, calls } = blockerWith();
  await blocker.changeBlock('block', ['x.com', 'facebook.com']);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].file, '/usr/bin/sudo');
  assert.deepEqual(calls[0].args, ['-n', '-k', '/Library/PrivilegedHelperTools/ritmo-block-sites', 'block', 'x.com\nfacebook.com']);
});

test('desbloquear no envía dominios', async () => {
  const { blocker, calls } = blockerWith();
  await blocker.changeBlock('unblock', ['x.com']);
  assert.deepEqual(calls[0].args.slice(3), ['unblock', '']);
});

test('instala el helper cuando falta o su versión cambió', async () => {
  for (const installed of [undefined, 'helper version 0']) {
    const { blocker, calls } = blockerWith({
      readFile: file => {
        if (file === '/Library/PrivilegedHelperTools/ritmo-block-sites') {
          if (!installed) throw new Error('ENOENT');
          return installed;
        }
        return 'helper version 1';
      }
    });
    await blocker.changeBlock('block', ['x.com']);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].file, '/usr/bin/osascript');
    assert.deepEqual(calls[0].args.slice(2), ['/app/install-block-helper.sh', '/app/block-sites.sh', 'student']);
    assert.match(calls[0].args[1], /with administrator privileges/);
    assert.equal(calls[1].file, '/usr/bin/sudo');
  }
});

test('fuera de macOS falla sin ejecutar nada', async () => {
  const { blocker, calls } = blockerWith({ platform: 'linux' });
  await assert.rejects(blocker.changeBlock('block', ['x.com']), /requiere macOS/);
  assert.equal(calls.length, 0);
});

test('traduce errores de instalación y ejecución', async () => {
  const missing = { readFile: () => { throw new Error('ENOENT'); } };
  const failingInstall = (error: Error & { stderr?: string }) => blockerWith({ ...missing, exec: async () => { throw error; } }).blocker;
  await assert.rejects(failingInstall(new Error('execution error: User canceled. (-128)')).changeBlock('block', ['x.com']), /^Error: Se canceló la autorización de macOS\.$/);
  await assert.rejects(failingInstall(Object.assign(new Error('Command failed'), { stderr: '(-128)' })).changeBlock('unblock', []), /Se canceló/);
  await assert.rejects(failingInstall(new Error('boom')).changeBlock('block', ['x.com']), /No se pudo instalar el helper/);
  const failingRun = blockerWith({ exec: async (file, args) => { if (file === '/usr/bin/sudo' && args[3] !== 'check') throw new Error('helper failed'); } }).blocker;
  await assert.rejects(failingRun.changeBlock('block', ['x.com']), /No se pudo activar el bloqueo/);
  await assert.rejects(failingRun.changeBlock('unblock', []), /No se pudo quitar el bloqueo/);
});

test('recupera el permiso perdido y reintenta quitar un bloqueo activo', async () => {
  let allowed = false;
  const { blocker, calls } = blockerWith({
    exec: async (file, args) => {
      calls.push({ file, args });
      if (file === '/usr/bin/osascript') { allowed = true; return; }
      if (!allowed) throw new Error('sudo: a password is required');
    }
  });
  await blocker.changeBlock('unblock', []);
  assert.deepEqual(calls.map(call => call.file), ['/usr/bin/sudo', '/usr/bin/sudo', '/usr/bin/osascript', '/usr/bin/sudo']);
  assert.equal(calls[1].args[3], 'check');
  assert.deepEqual(calls[3].args.slice(3), ['unblock', '']);
});

test('no reinstala si el helper falla por una causa distinta al permiso', async () => {
  const { blocker, calls } = blockerWith({
    exec: async (file, args) => {
      calls.push({ file, args });
      if (args[3] !== 'check') throw new Error('No se pudo escribir hosts');
    }
  });
  await assert.rejects(blocker.changeBlock('unblock', []), /No se pudo quitar el bloqueo/);
  assert.deepEqual(calls.map(call => call.file), ['/usr/bin/sudo', '/usr/bin/sudo']);
});

test('no pide autorización dos veces si el helper recién instalado falla', async () => {
  const { blocker, calls } = blockerWith({
    readFile: () => { throw new Error('ENOENT'); },
    exec: async (file, args) => {
      calls.push({ file, args });
      if (file === '/usr/bin/sudo') throw new Error('sudo: a password is required');
    }
  });
  await assert.rejects(blocker.changeBlock('block', ['x.com']), /No se pudo activar el bloqueo/);
  assert.deepEqual(calls.map(call => call.file), ['/usr/bin/osascript', '/usr/bin/sudo']);
});

test('informa si la recuperación del permiso se cancela o falla el segundo intento', async () => {
  const cancelled = blockerWith({ exec: async file => { throw new Error(file === '/usr/bin/osascript' ? 'User canceled (-128)' : 'sudo denied'); } }).blocker;
  await assert.rejects(cancelled.changeBlock('unblock', []), /Se canceló la autorización/);

  for (const [action, message] of [['block', /No se pudo activar el bloqueo/], ['unblock', /No se pudo quitar el bloqueo/]] as const) {
    const { blocker: retryFails, calls } = blockerWith({ exec: async (file, args) => {
      calls.push({ file, args });
      if (file === '/usr/bin/sudo') throw new Error('sudo denied');
    } });
    await assert.rejects(retryFails.changeBlock(action, action === 'block' ? ['x.com'] : []), message);
    assert.deepEqual(calls.map(call => call.file), ['/usr/bin/sudo', '/usr/bin/sudo', '/usr/bin/osascript', '/usr/bin/sudo']);
  }
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
