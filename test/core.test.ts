import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDomain, normalizeDomains, todayKey, safeTaskTitle } from '../src/shared/validation';

test('normaliza dominios sin aceptar comandos ni rutas', () => {
  assert.equal(normalizeDomain(' HTTPS://LinkedIn.com/jobs '), 'linkedin.com');
  assert.deepEqual(normalizeDomains(['X.com', 'x.com', 'facebook.com']), ['x.com', 'facebook.com']);
  for (const invalid of ['localhost', 'evil.com;id', 'a..com', 'https://bad.com\n0.0.0.0 bank.com']) {
    assert.throws(() => normalizeDomain(invalid));
  }
});

test('las tareas y fechas tienen formato estable', () => {
  assert.equal(safeTaskTitle('  Terminar   reporte  '), 'Terminar reporte');
  assert.throws(() => safeTaskTitle('   '));
  assert.equal(todayKey(new Date(2026, 8, 29)), '2026-09-29');
});
