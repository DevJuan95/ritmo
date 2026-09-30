import test from 'node:test';
import assert from 'node:assert/strict';
import { CLAUDE_CODE_API_KEY, CLAUDE_CODE_FAILED, CLAUDE_CODE_LOGIN, checkClaudeCodeLogin, claudeCodeArgs, readClaudeCodeOutput } from '../../../../src/main/study/claude-code-agent';
import { PublicError } from '../../../../src/shared/ipc';
import { INVALID_AGENT_RESPONSE } from '../../../../src/shared/study/contract';

// Estas pruebas no lanzan procesos; las que ejecutan `ClaudeCodeAgent` con un CLI falso están en
// test/integration/claude-code-agent.test.ts.

const proposal = { title: 'Implementar un pool de hilos', stageId: 'e2', pomodoros: 3, doneWhen: 'Pasa las pruebas.', reason: 'Sigue a los hilos.' };

const success = (fields: Record<string, unknown>) => JSON.stringify({ type: 'result', subtype: 'success', is_error: false, ...fields });

const publicError = (message: string) => (error: Error) => error instanceof PublicError && error.message === message;

test('claudeCodeArgs pide salida JSON con el esquema, sin herramientas ni sesión guardada', () => {
  const schema = { type: 'object' };
  assert.deepEqual(claudeCodeArgs('prompt', schema), [
    '-p', 'prompt', '--output-format', 'json', '--json-schema', JSON.stringify(schema),
    '--tools', '', '--strict-mcp-config', '--safe-mode', '--no-session-persistence',
  ]);
});

test('claudeCodeArgs añade el modelo con --model', () => {
  assert.deepEqual(claudeCodeArgs('p', {}, 'sonnet').slice(-2), ['--model', 'sonnet']);
  assert.deepEqual(claudeCodeArgs('p', {}, 'claude-sonnet-4-5[1m]').slice(-2), ['--model', 'claude-sonnet-4-5[1m]']);
});

test('claudeCodeArgs rechaza un modelo que parece una opción o tiene espacios', () => {
  for (const model of ['--dangerously-skip-permissions', 'haiku extra', '']) {
    assert.throws(() => claudeCodeArgs('p', {}, model), publicError('El modelo de Claude Code no es válido.'));
  }
});

test('readClaudeCodeOutput prefiere structured_output a result', () => {
  assert.deepEqual(readClaudeCodeOutput(success({ structured_output: { proposals: [] }, result: 'texto' }), 0), { proposals: [] });
});

test('readClaudeCodeOutput devuelve el texto de result sin salida estructurada', () => {
  assert.equal(readClaudeCodeOutput(success({ result: 'texto' }), 0), 'texto');
  assert.equal(readClaudeCodeOutput(success({}), 0), undefined);
});

test('readClaudeCodeOutput da respuesta inválida si la salida correcta no es un objeto JSON', () => {
  for (const stdout of ['no es JSON', '[]', 'null']) {
    assert.throws(() => readClaudeCodeOutput(stdout, 0), publicError(INVALID_AGENT_RESPONSE));
  }
});

test('readClaudeCodeOutput da un error sin detalles con is_error o un código distinto de 0', () => {
  const cases: Array<[string, number]> = [
    [JSON.stringify({ type: 'result', subtype: 'success', is_error: true, result: 'Invalid API key · detalles internos' }), 0],
    [success({ structured_output: { proposals: [proposal] } }), 1],
    ['Error: algo interno', 1],
    ['null', 2],
  ];
  for (const [stdout, exitCode] of cases) {
    assert.throws(() => readClaudeCodeOutput(stdout, exitCode), publicError(CLAUDE_CODE_FAILED));
  }
});

test('checkClaudeCodeLogin acepta la sesión de claude.ai o un estado que no reconoce con código 0', () => {
  const status = (fields: Record<string, unknown>) => JSON.stringify({ apiProvider: 'firstParty', ...fields });
  for (const stdout of [status({ loggedIn: true, authMethod: 'claude.ai' }), status({ loggedIn: true, authMethod: 'oauth_token' }), 'Logged in', '[]']) {
    assert.doesNotThrow(() => checkClaudeCodeLogin(stdout, 0));
  }
});

test('checkClaudeCodeLogin pide iniciar sesión sin sesión o con un error que no reconoce', () => {
  const cases: Array<[string, number]> = [
    [JSON.stringify({ loggedIn: false, authMethod: 'none' }), 1],
    [JSON.stringify({ loggedIn: false, authMethod: 'none' }), 0],
    ['error: unknown command', 1],
    ['null', 1],
  ];
  for (const [stdout, exitCode] of cases) {
    assert.throws(() => checkClaudeCodeLogin(stdout, exitCode), publicError(CLAUDE_CODE_LOGIN));
  }
});

test('checkClaudeCodeLogin rechaza una sesión con clave de API', () => {
  const stdout = JSON.stringify({ loggedIn: true, authMethod: 'api_key', apiKeySource: 'apiKeyHelper' });
  assert.throws(() => checkClaudeCodeLogin(stdout, 0), publicError(CLAUDE_CODE_API_KEY));
});
