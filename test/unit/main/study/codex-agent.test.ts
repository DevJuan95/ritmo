import test from 'node:test';
import assert from 'node:assert/strict';
import { CODEX_API_KEY, CODEX_FAILED, CODEX_LOGIN, CODEX_OUTPUT_FILE, CODEX_SCHEMA_FILE, checkCodexLogin, codexArgs, codexLogin, readCodexOutput } from '../../../../src/main/study/codex-agent';
import { PublicError } from '../../../../src/shared/ipc';
import { INVALID_AGENT_RESPONSE } from '../../../../src/shared/study/contract';

// Estas pruebas no lanzan procesos; las que ejecutan `CodexAgent` con un CLI falso están en
// test/integration/codex-agent.test.ts.

const publicError = (message: string) => (error: Error) => error instanceof PublicError && error.message === message;

test('codexArgs pide sandbox de solo lectura, sin sesión ni configuración del usuario, con el esquema y la respuesta en archivos', () => {
  assert.deepEqual(codexArgs('prompt'), [
    'exec', '--skip-git-repo-check', '--ephemeral', '--ignore-user-config', '--sandbox', 'read-only', '--color', 'never',
    '--output-schema', CODEX_SCHEMA_FILE, '-o', CODEX_OUTPUT_FILE, '--', 'prompt',
  ]);
});

test('codexArgs añade el modelo con -m antes del prompt', () => {
  assert.deepEqual(codexArgs('p', 'gpt-5.1-codex-mini').slice(-4), ['-m', 'gpt-5.1-codex-mini', '--', 'p']);
});

test('codexArgs deja el prompt detrás de -- aunque empiece por -', () => {
  assert.deepEqual(codexArgs('--dangerously-bypass-approvals-and-sandbox').slice(-2), ['--', '--dangerously-bypass-approvals-and-sandbox']);
});

test('codexArgs rechaza un modelo que parece una opción o tiene espacios', () => {
  for (const model of ['--dangerously-bypass-approvals-and-sandbox', 'o3 extra', '']) {
    assert.throws(() => codexArgs('p', model), publicError('El modelo de Codex no es válido.'));
  }
});

test('readCodexOutput devuelve el último mensaje si Codex terminó bien', () => {
  assert.equal(readCodexOutput('{"proposals":[]}', 0), '{"proposals":[]}');
});

test('readCodexOutput da respuesta inválida sin archivo o con uno vacío', () => {
  for (const output of [undefined, '', ' \n']) {
    assert.throws(() => readCodexOutput(output, 0), publicError(INVALID_AGENT_RESPONSE));
  }
});

test('readCodexOutput da un error sin detalles con un código distinto de 0', () => {
  for (const output of ['{"proposals":[]}', undefined, 'Error: algo interno']) {
    assert.throws(() => readCodexOutput(output, 1), publicError(CODEX_FAILED));
  }
});

test('checkCodexLogin acepta la sesión de ChatGPT o un estado que no reconoce, sea cual sea el código', () => {
  for (const stdout of ['Logged in using ChatGPT\n', 'WARNING: algo\nLogged in using ChatGPT\n', '']) {
    assert.doesNotThrow(() => checkCodexLogin(stdout, 0));
  }
  for (const [stdout, exitCode] of [['Error: algo interno', 2], ['', 1], ['env: node: No such file or directory\n', 127]] as const) {
    assert.doesNotThrow(() => checkCodexLogin(stdout, exitCode));
  }
});

test('checkCodexLogin pide iniciar sesión solo si la salida dice que no hay sesión', () => {
  const cases: Array<[string, number]> = [['Not logged in\n', 1], ['Not logged in\n', 0]];
  for (const [stdout, exitCode] of cases) {
    assert.throws(() => checkCodexLogin(stdout, exitCode), publicError(CODEX_LOGIN));
  }
});

test('checkCodexLogin rechaza una sesión con clave de API', () => {
  assert.throws(() => checkCodexLogin('Logged in using an API key - sk-proj-***ABCDE\n', 0), publicError(CODEX_API_KEY));
});

test('codexLogin distingue la sesión lista, sin sesión, con clave de API o sin confirmar', () => {
  assert.equal(codexLogin('Logged in using ChatGPT\n', 0), 'ready');
  assert.equal(codexLogin('Not logged in\n', 1), 'logged-out');
  assert.equal(codexLogin('Logged in using an API key - sk-***\n', 0), 'api-key');
  assert.equal(codexLogin('', 0), 'unknown');
  assert.equal(codexLogin('Error loading config.toml: invalid type\n', 1), 'unknown', 'un error de configuración no es falta de sesión');
  assert.equal(codexLogin('env: node: No such file or directory\n', 127), 'unknown');
  assert.equal(codexLogin('Logged in using ChatGPT\n', 1), 'unknown');
});
