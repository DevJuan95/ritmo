import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SystemAgentDetector } from '../../src/main/study/agent-detector';
import { CLAUDE_CODE_STATUS_ARGS } from '../../src/main/study/claude-code-agent';
import { CODEX_STATUS_ARGS } from '../../src/main/study/codex-agent';
import { fakeCli } from '../helpers/fake-cli';
import { tempDir } from '../helpers/temp';

// Ejecutables falsos de Node en lugar de los CLI y de la shell reales.

/** Ruta de una shell de login que no existe, para no lanzar la del usuario. */
function missingShell(t: TestContext): string {
  return path.join(tempDir(t), 'no-existe');
}

/** Intérprete con un nombre que no está en el PATH de las pruebas, como `node` en una app abierta desde Finder. */
const INTERPRETER = 'ritmo-test-node';

/** Crea en `dir` el intérprete (un enlace al Node de las pruebas) y devuelve la carpeta. */
function interpreterIn(dir: string): string {
  fs.symlinkSync(process.execPath, path.join(dir, INTERPRETER));
  return dir;
}

/** CLI instalado como con npm: un script con `#!/usr/bin/env <intérprete>` que responde que hay sesión. */
function npmCli(dir: string, name: string, body: string): string {
  const file = path.join(dir, name);
  fs.writeFileSync(file, `#!/usr/bin/env ${INTERPRETER}\n${body}\n`, { mode: 0o755 });
  return file;
}

const CLAUDE_READY = `process.stdout.write(JSON.stringify({ loggedIn: true, authMethod: 'claude.ai' }));`;
const CODEX_READY = `process.stderr.write('Logged in using ChatGPT\\n');`;

test('comprueba la sesión de Claude Code con su comando de estado', async t => {
  const claude = fakeCli(t, `process.stdout.write(JSON.stringify({ loggedIn: true, authMethod: 'claude.ai' }));`);
  const agents = new SystemAgentDetector({ env: {}, knownDirs: [], shell: missingShell(t) });
  assert.equal(await agents.login('claude', claude.command), 'ready');
  assert.deepEqual(claude.calls().map(call => call.args), [CLAUDE_CODE_STATUS_ARGS]);
});

test('comprueba la sesión de Codex, que responde por la salida de error', async t => {
  const codex = fakeCli(t, `process.stderr.write('Not logged in\\n'); process.exitCode = 1;`);
  const agents = new SystemAgentDetector({ env: {}, knownDirs: [], shell: missingShell(t) });
  assert.equal(await agents.login('codex', codex.command), 'logged-out');
  assert.deepEqual(codex.calls().map(call => call.args), [CODEX_STATUS_ARGS]);
});

test('una sesión que no se puede comprobar queda sin confirmar', async t => {
  const agents = new SystemAgentDetector({ env: {}, knownDirs: [], shell: missingShell(t), loginTimeoutMs: 200 });
  assert.equal(await agents.login('claude', path.join(tempDir(t), 'no-existe')), 'unknown');
  const slow = fakeCli(t, 'setTimeout(() => {}, 10_000);');
  assert.equal(await agents.login('codex', slow.command), 'unknown');
});

test('si no está en el PATH ni en las carpetas conocidas, lo busca en el PATH de la shell de login y lo recuerda', async t => {
  const bin = tempDir(t);
  const claude = path.join(bin, 'claude');
  fs.writeFileSync(claude, '#!/bin/sh\n', { mode: 0o755 });
  const shell = fakeCli(t, `process.stdout.write('Hola desde .zshrc\\n__RITMO_PATH__/usr/bin:${bin}__RITMO_PATH__\\n');`);
  const agents = new SystemAgentDetector({ env: { PATH: '/usr/bin' }, home: tempDir(t), knownDirs: [], shell: shell.command });
  assert.equal(await agents.locate('claude', ''), claude);
  assert.equal(await agents.locate('codex', ''), null);
  const calls = shell.calls();
  assert.equal(calls.length, 1, 'lee el PATH de la shell una sola vez');
  assert.equal(calls[0].args[0], '-ilc');
});

test('si la shell de login no imprime su PATH, lo vuelve a intentar la próxima vez', async t => {
  const shell = fakeCli(t, `process.stdout.write('sin marcas');`);
  const agents = new SystemAgentDetector({ env: {}, home: tempDir(t), knownDirs: [], shell: shell.command });
  assert.equal(await agents.locate('codex', ''), null);
  assert.equal(await agents.locate('codex', ''), null);
  assert.equal(shell.calls().length, 2);
});

test('no espera más del tiempo máximo a la shell de login', async t => {
  const shell = fakeCli(t, 'setTimeout(() => {}, 10_000);');
  const agents = new SystemAgentDetector({ env: {}, home: tempDir(t), knownDirs: [], shell: shell.command, shellTimeoutMs: 200 });
  assert.equal(await agents.locate('claude', ''), null);
});

test('un CLI de npm encuentra su intérprete en su carpeta, en las carpetas conocidas o en el PATH de la shell de login', async t => {
  const sameDir = interpreterIn(tempDir(t));
  const own = new SystemAgentDetector({ env: {}, knownDirs: [], shell: missingShell(t) });
  assert.equal(await own.login('claude', npmCli(sameDir, 'claude', CLAUDE_READY)), 'ready');

  const known = interpreterIn(tempDir(t));
  const withKnown = new SystemAgentDetector({ env: {}, knownDirs: [known], shell: missingShell(t) });
  assert.equal(await withKnown.login('codex', npmCli(tempDir(t), 'codex', CODEX_READY)), 'ready');

  const fromShell = interpreterIn(tempDir(t));
  const shell = fakeCli(t, `process.stdout.write('__RITMO_PATH__${fromShell}__RITMO_PATH__');`);
  const withShell = new SystemAgentDetector({ env: {}, knownDirs: [], shell: shell.command });
  assert.equal(await withShell.login('claude', npmCli(tempDir(t), 'claude', CLAUDE_READY)), 'ready');
});

test('un CLI que no encuentra su intérprete (127) queda sin confirmar, no sin sesión', async t => {
  const agents = new SystemAgentDetector({ env: {}, knownDirs: [], shell: missingShell(t) });
  assert.equal(await agents.login('claude', npmCli(tempDir(t), 'claude', CLAUDE_READY)), 'unknown');
  assert.equal(await agents.login('codex', npmCli(tempDir(t), 'codex', CODEX_READY)), 'unknown');
});
