import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { distRoot, repoRoot } from '../helpers/paths';
import { tempDir } from '../helpers/temp';

const script = path.join(repoRoot, 'resources', 'block-sites.sh');
const installer = path.join(repoRoot, 'resources', 'install-block-helper.sh');
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

test('el helper ignora el PATH de quien lo llama', { skip: asRoot }, t => {
  const { hosts, read } = hostsFile(t);
  // Órdenes falsas primero en el PATH: si el script las usara, dejarían una marca.
  const fakes = tempDir(t);
  const marker = path.join(fakes, 'usado');
  for (const command of ['id', 'mktemp', 'awk', 'cat', 'rm', 'dscacheutil', 'killall']) {
    fs.writeFileSync(path.join(fakes, command), `#!/bin/sh\necho ${command} >> '${marker}'\nexit 1\n`, { mode: 0o755 });
  }
  const env = { ...process.env, RITMO_TEST_HOSTS: hosts, PATH: `${fakes}:${process.env.PATH}` };
  assert.equal(spawnSync('/bin/sh', [script, 'block', 'x.com'], { env, encoding: 'utf8' }).status, 0);
  assert.match(read(), /0\.0\.0\.0 x\.com/);
  assert.equal(fs.existsSync(marker), false);
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

test('una señal antes de escribir termina el script sin tocar hosts', { skip: asRoot }, async t => {
  // Con hosts como FIFO, awk se queda leyendo hasta que se escribe en él: la señal llega a mitad.
  const hosts = path.join(tempDir(t, { base: '/tmp' }), 'hosts');
  assert.equal(spawnSync('/usr/bin/mkfifo', [hosts]).status, 0);
  // En su propio grupo, para poder terminar también sus hijos si el script no sale.
  const child = spawn('/bin/sh', [script, 'unblock'], { env: { ...process.env, RITMO_TEST_HOSTS: hosts }, detached: true });
  const exited = once(child, 'exit');
  const writer = await fs.promises.open(hosts, 'w');
  child.kill('SIGTERM');
  await writer.writeFile(original);
  await writer.close();
  // Si el script siguiera, se quedaría esperando para escribir en el FIFO en lugar de salir.
  const timer = setTimeout(() => process.kill(-child.pid!, 'SIGKILL'), 5000);
  const [code, signal] = await exited;
  clearTimeout(timer);
  assert.deepEqual([code, signal], [1, null]);
});

test('comprobar el helper no modifica hosts', { skip: asRoot }, t => {
  const { run, read } = hostsFile(t);
  assert.equal(run('check').status, 0);
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

test('el instalador valida el nombre de la cuenta y acepta puntos', { skip: asRoot }, () => {
  const install = (account: string) => spawnSync('/bin/sh', [installer, script, account], { encoding: 'utf8' });
  for (const account of ['', '-root', '.oculto', 'juan hoyos', 'juan/../root', 'juan;id']) {
    const result = install(account);
    assert.equal(result.status, 2, account);
    assert.match(result.stderr, /Usuario inválido/, account);
  }
  // Un nombre con punto pasa la validación y solo se detiene por no ser root.
  for (const account of ['juan.hoyos', 'student', 'ana_maria-2']) assert.match(install(account).stderr, /Instalación inválida/, account);
});
