import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_AGENT_SETTINGS } from '../../../../src/shared/study/contract';
import { createHarness } from '../../../helpers/harness';

test('guarda la configuración validada y la devuelve', t => {
  const { agents, studyRepository } = createHarness(t);
  assert.deepEqual(agents.settings(), DEFAULT_AGENT_SETTINGS);
  const saved = agents.saveSettings({ provider: 'codex', claude: { path: ' ~/bin/claude ', model: 'sonnet' }, codex: { path: '', model: '' } });
  assert.deepEqual(saved, { provider: 'codex', claude: { path: '~/bin/claude', model: 'sonnet' }, codex: { path: '', model: '' } });
  assert.deepEqual(studyRepository.loadAgentSettings(), saved);
  assert.throws(() => agents.saveSettings({ ...saved, codex: { path: 'codex', model: '' } }), /La ruta de Codex debe ser absoluta/);
  assert.deepEqual(agents.settings(), saved, 'una configuración inválida no se guarda');
});

test('informa de cada proveedor si se encontró y si tiene sesión, sin comprobar la sesión del que falta', async t => {
  const { agents, detector } = createHarness(t);
  detector.logins.claude = 'logged-out';
  assert.deepEqual(await agents.status(), [
    { provider: 'claude', availability: 'logged-out', path: '/usr/local/bin/claude', configured: false },
    { provider: 'codex', availability: 'missing', path: null, configured: false },
  ]);
  assert.deepEqual(detector.calls, [
    { method: 'locate', provider: 'claude', configured: '' },
    { method: 'locate', provider: 'codex', configured: '' },
    { method: 'login', provider: 'claude', command: '/usr/local/bin/claude' },
  ]);
});

test('busca en la ruta configurada de cada proveedor', async t => {
  const { agents, detector } = createHarness(t);
  detector.executables.add('~/tools/codex');
  detector.logins.codex = 'api-key';
  agents.saveSettings({ ...DEFAULT_AGENT_SETTINGS, claude: { path: '/no/existe/claude', model: 'haiku' }, codex: { path: '~/tools/codex', model: '' } });
  assert.deepEqual(await agents.status(), [
    { provider: 'claude', availability: 'missing', path: null, configured: true },
    { provider: 'codex', availability: 'api-key', path: '~/tools/codex', configured: true },
  ]);
});
