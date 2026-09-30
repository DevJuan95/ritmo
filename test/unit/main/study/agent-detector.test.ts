import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { expandHome, isExecutable, knownAgentDirs, pathDirs, readShellPath, SystemAgentDetector } from '../../../../src/main/study/agent-detector';
import { tempDir } from '../../../helpers/temp';

// Estas pruebas no lanzan procesos: la shell de login no existe o no hace falta. Las que ejecutan
// los comandos de estado y la shell con ejecutables falsos están en test/integration/agent-detector.test.ts.

/** Crea `name` en `dir` con ese modo y devuelve su ruta. */
function file(dir: string, name: string, mode = 0o755): string {
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, name);
  fs.writeFileSync(target, '#!/bin/sh\n', { mode });
  return target;
}

/** Detector sin shell de login utilizable, para probar solo el `PATH` y las carpetas conocidas. */
function detector(t: TestContext, options: { path?: string; knownDirs?: string[]; home?: string } = {}) {
  return new SystemAgentDetector({
    env: { PATH: options.path ?? '' },
    home: options.home ?? tempDir(t),
    knownDirs: options.knownDirs ?? [],
    shell: path.join(tempDir(t), 'no-existe'),
  });
}

test('knownAgentDirs incluye las carpetas de instalación habituales dentro de la carpeta personal', () => {
  assert.deepEqual(knownAgentDirs('/Users/ana'), [
    '/Users/ana/.local/bin', '/Users/ana/.claude/local', '/opt/homebrew/bin', '/usr/local/bin',
    '/Users/ana/.npm-global/bin', '/Users/ana/.bun/bin', '/Users/ana/.volta/bin',
  ]);
});

test('pathDirs separa el PATH sin repetir carpetas ni aceptar rutas relativas', () => {
  assert.deepEqual(pathDirs('/usr/bin::.:bin:/usr/bin:/opt/homebrew/bin'), ['/usr/bin', '/opt/homebrew/bin']);
  assert.deepEqual(pathDirs(undefined), []);
});

test('expandHome solo expande ~/ al principio', () => {
  assert.equal(expandHome('~/.local/bin/claude', '/Users/ana'), '/Users/ana/.local/bin/claude');
  assert.equal(expandHome('/usr/local/bin/claude', '/Users/ana'), '/usr/local/bin/claude');
});

test('readShellPath toma el PATH entre las marcas aunque la shell imprima más cosas', () => {
  assert.equal(readShellPath('Bienvenida\n__RITMO_PATH__/a:/b__RITMO_PATH__\nadiós'), '/a:/b');
  assert.equal(readShellPath('sin marcas'), undefined);
});

test('isExecutable acepta archivos ejecutables y rechaza carpetas, archivos sin permiso y rutas que no existen', t => {
  const dir = tempDir(t);
  assert.equal(isExecutable(file(dir, 'claude')), true);
  assert.equal(isExecutable(file(dir, 'codex', 0o644)), false);
  assert.equal(isExecutable(dir), false);
  assert.equal(isExecutable(path.join(dir, 'no-existe')), false);
});

test('con una ruta configurada solo mira esa ruta, con ~/ expandido', async t => {
  const home = tempDir(t);
  const dir = tempDir(t);
  const installed = file(path.join(home, 'herramientas'), 'claude');
  file(dir, 'claude');
  const agents = detector(t, { home, path: dir });
  assert.equal(await agents.locate('claude', '~/herramientas/claude'), installed);
  assert.equal(await agents.locate('claude', installed), installed);
  assert.equal(await agents.locate('claude', '~/herramientas/otro'), null, 'no busca en el PATH si la ruta configurada no existe');
});

test('busca primero en el PATH del proceso y después en las carpetas conocidas', async t => {
  const first = tempDir(t);
  const second = tempDir(t);
  const known = tempDir(t);
  file(first, 'codex', 0o644);
  const inPath = file(second, 'codex');
  const inKnown = file(known, 'claude');
  file(known, 'codex');
  const agents = detector(t, { path: `${first}:${second}`, knownDirs: [known] });
  assert.equal(await agents.locate('codex', ''), inPath);
  assert.equal(await agents.locate('claude', ''), inKnown);
});

test('sin el CLI en ningún sitio ni shell de login, no lo encuentra', async t => {
  assert.equal(await detector(t).locate('claude', ''), null);
});

test('usa $SHELL o /bin/zsh como shell de login y las carpetas conocidas de la carpeta personal', () => {
  const withShell = new SystemAgentDetector({ env: { SHELL: '/bin/bash' }, home: '/Users/ana' }) as unknown as { shell: string; knownDirs: string[] };
  assert.equal(withShell.shell, '/bin/bash');
  assert.deepEqual(withShell.knownDirs, knownAgentDirs('/Users/ana'));
  const withoutShell = new SystemAgentDetector({ env: {} }) as unknown as { shell: string };
  assert.equal(withoutShell.shell, '/bin/zsh');
  const defaults = new SystemAgentDetector() as unknown as { shell: string };
  assert.equal(defaults.shell, process.env.SHELL || '/bin/zsh');
});

test('searchDirs pone delante la carpeta del ejecutable y después el PATH y las carpetas conocidas, sin repetir', async t => {
  const agents = detector(t, { path: '/usr/bin:/opt/homebrew/bin', knownDirs: ['/opt/homebrew/bin', '/Users/ana/.local/bin'] });
  assert.deepEqual(await agents.searchDirs('/Users/ana/.npm-global/bin/codex'), [
    '/Users/ana/.npm-global/bin', '/usr/bin', '/opt/homebrew/bin', '/Users/ana/.local/bin',
  ]);
  assert.deepEqual(await agents.searchDirs('codex'), ['/usr/bin', '/opt/homebrew/bin', '/Users/ana/.local/bin'], 'un comando sin ruta no añade carpeta propia');
});
