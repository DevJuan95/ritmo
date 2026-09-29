import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('el bloqueo añade y retira solo su sección de hosts', { skip: process.getuid?.() === 0 }, () => {
  const directory = fs.mkdtempSync('/tmp/ritmo-test-');
  const hosts = path.join(directory, 'hosts');
  const original = '127.0.0.1 localhost\n1.2.3.4 ejemplo.local\n';
  fs.writeFileSync(hosts, original);
  const env = { ...process.env, RITMO_TEST_HOSTS: hosts };
  const run = (action: 'block' | 'unblock', domains = '') => spawnSync('/bin/sh', [path.join(__dirname, '../src/block-sites.sh'), action, domains], { env, encoding: 'utf8' });
  try {
    assert.equal(run('block', 'facebook.com\nx.com').status, 0);
    const blocked = fs.readFileSync(hosts, 'utf8');
    assert.match(blocked, /0\.0\.0\.0 facebook\.com www\.facebook\.com/);
    assert.match(blocked, /::1 x\.com www\.x\.com/);
    assert.match(blocked, /1\.2\.3\.4 ejemplo\.local/);
    assert.equal(run('unblock').status, 0);
    assert.equal(fs.readFileSync(hosts, 'utf8').trim(), original.trim());
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
