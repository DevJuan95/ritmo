import test from 'node:test';
import assert from 'node:assert/strict';
import { CliStudyAgentFactory } from '../../../../src/main/study/agent-factory';
import { ClaudeCodeAgent } from '../../../../src/main/study/claude-code-agent';
import { CodexAgent } from '../../../../src/main/study/codex-agent';

test('crea el adaptador del proveedor con el ejecutable y el modelo, o sin modelo si está vacío', () => {
  const factory = new CliStudyAgentFactory();
  const claude = factory.create('claude', { command: '/bin/claude', model: 'haiku' });
  assert.ok(claude instanceof ClaudeCodeAgent);
  assert.deepEqual((claude as unknown as { options: object }).options, { command: '/bin/claude', model: 'haiku' });
  const codex = factory.create('codex', { command: '/bin/codex', model: '' });
  assert.ok(codex instanceof CodexAgent);
  assert.deepEqual((codex as unknown as { options: object }).options, { command: '/bin/codex', model: undefined });
});
