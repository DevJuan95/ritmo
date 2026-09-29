import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { distRoot, repoRoot } from '../helpers/paths';
import { tempDir } from '../helpers/temp';

const script = path.join(repoRoot, 'src', 'block-sites.sh');
const installer = path.join(repoRoot, 'src', 'install-block-helper.sh');
const original = '127.0.0.1 localhost\n1.2.3.4 ejemplo.local\n';
const asRoot = process.getuid?.() === 0;

/** Prepara un hosts falso en /tmp; el script rechaza cualquier otra ruta. */
function hostsFile(t: TestContext) {
  const hosts = path.join(tempDir(t, { base: '/tmp' }), 'hosts');
  fs.writeFileSync(hosts, original);
  const run = (...args: string[]) => spawnSync('/bin/sh', [script, ...args], { env: { ...process.env, RITMO_TEST_HOSTS: hosts }, encoding: 'utf8' });
  return { hosts, run, read: () => fs.readFileSync(hosts, 'utf8') };
}

test('el bloqueo añade y retira solo su sección de hosts', { skip: asRoot }, t => {
  const { run, read } = hostsFile(t);
  assert.equal(run('block', 'facebook.com\nx.com').status, 0);
  const blocked = read();
  assert.match(blocked, /0\.0\.0\.0 facebook\.com www\.facebook\.com/);
  assert.match(blocked, /::1 x\.com www\.x\.com/);
  assert.match(blocked, /1\.2\.3\.4 ejemplo\.local/);
  assert.equal(run('unblock').status, 0);
  assert.equal(read().trim(), original.trim());
});

test('bloquear dos veces reemplaza la sección en lugar de duplicarla', { skip: asRoot }, t => {
  const { run, read } = hostsFile(t);
  assert.equal(run('block', 'facebook.com').status, 0);
  assert.equal(run('block', 'x.com').status, 0);
  const contents = read();
  assert.equal(contents.split('# >>> RITMO FOCUS BLOCK >>>').length - 1, 1);
  assert.doesNotMatch(contents, /facebook\.com/);
  assert.match(contents, /0\.0\.0\.0 x\.com/);
});

test('desbloquear sin sección previa deja el archivo igual', { skip: asRoot }, t => {
  const { run, read } = hostsFile(t);
  assert.equal(run('unblock').status, 0);
  assert.equal(read(), original);
});

test('entradas inválidas terminan con error y no modifican hosts', { skip: asRoot }, t => {
  const { run, read } = hostsFile(t);
  const cases: Array<[string[], RegExp]> = [
    [['block', 'x.com\nevil.com;id'], /Dominio inválido/],
    [['block', 'a..com'], /Dominio inválido/],
    [['block', '.x.com'], /Dominio inválido/],
    [['block', ''], /No hay dominios/],
    [['reboot'], /Acción inválida/]
  ];
  for (const [args, message] of cases) {
    const result = run(...args);
    assert.equal(result.status, 2, `${args.join(' ')} debe fallar`);
    assert.match(result.stderr, message);
    assert.equal(read(), original, `${args.join(' ')} no debe tocar hosts`);
  }
});

test('rechaza dominios con mayúsculas', { skip: asRoot }, t => {
  const { run, read } = hostsFile(t);
  assert.equal(run('block', 'X.com').status, 2);
  assert.equal(read(), original);
});

test('rechaza rutas de prueba fuera de /tmp', { skip: asRoot }, t => {
  const outside = path.join(tempDir(t, { base: distRoot }), 'hosts');
  fs.writeFileSync(outside, original);
  const result = spawnSync('/bin/sh', [script, 'block', 'x.com'], { env: { ...process.env, RITMO_TEST_HOSTS: outside }, encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Ruta de prueba inválida/);
  assert.equal(fs.readFileSync(outside, 'utf8'), original);
});

test('el instalador rechaza la ejecución sin privilegios', { skip: asRoot }, () => {
  const result = spawnSync('/bin/sh', [installer, script, 'student'], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Instalación inválida/);
});
