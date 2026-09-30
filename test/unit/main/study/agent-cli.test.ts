import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_API_KEY_VARIABLES, agentEnv } from '../../../../src/main/study/agent-cli';

// Estas pruebas no lanzan procesos; las que ejecutan `runAgentCli` con un CLI falso están en
// test/integration/agent-cli.test.ts.

test('agentEnv quita las claves de API de Claude Code y de Codex y conserva el resto', () => {
  const env = {
    PATH: '/usr/bin',
    HOME: '/Users/ana',
    ANTHROPIC_API_KEY: 'sk-ant',
    ANTHROPIC_AUTH_TOKEN: 'token',
    OPENAI_API_KEY: 'sk',
    CODEX_API_KEY: 'sk-codex',
    CLAUDE_CODE_OAUTH_TOKEN: 'sesion',
  };
  assert.deepEqual(agentEnv(env), { PATH: '/usr/bin', HOME: '/Users/ana', CLAUDE_CODE_OAUTH_TOKEN: 'sesion' });
  assert.equal(env.ANTHROPIC_API_KEY, 'sk-ant');
  assert.deepEqual([...AGENT_API_KEY_VARIABLES].sort(), ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CODEX_API_KEY', 'OPENAI_API_KEY']);
});
