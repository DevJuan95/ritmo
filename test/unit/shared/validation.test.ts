import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDomain, normalizeDomains, safePlannedDate, safeTaskTitle, todayKey } from '../../../src/shared/validation';

test('normaliza dominios sin aceptar comandos ni rutas', () => {
  assert.equal(normalizeDomain(' HTTPS://LinkedIn.com/jobs '), 'linkedin.com');
  assert.equal(normalizeDomain('news.ycombinator.com:443'), 'news.ycombinator.com');
  assert.deepEqual(normalizeDomains(['X.com', 'x.com', 'facebook.com']), ['x.com', 'facebook.com']);
  for (const invalid of ['localhost', 'evil.com;id', 'a..com', '-bad.com', '', null, 'https://bad.com\n0.0.0.0 bank.com']) {
    assert.throws(() => normalizeDomain(invalid), /dominio válido/);
  }
});

test('limita la lista de dominios a un arreglo de 50 elementos', () => {
  assert.throws(() => normalizeDomains('x.com'), /no es válida/);
  assert.throws(() => normalizeDomains(Array.from({ length: 51 }, (_, i) => `sitio${i}.com`)), /no es válida/);
  assert.equal(normalizeDomains(Array.from({ length: 50 }, (_, i) => `sitio${i}.com`)).length, 50);
});

test('las tareas y fechas tienen formato estable', () => {
  assert.equal(safeTaskTitle('  Terminar   reporte  '), 'Terminar reporte');
  assert.equal(safeTaskTitle('a'.repeat(160)).length, 160);
  for (const invalid of ['   ', '', undefined, 'a'.repeat(161)]) assert.throws(() => safeTaskTitle(invalid));
  assert.equal(todayKey(new Date(2026, 8, 29)), '2026-09-29');
  assert.equal(todayKey(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});

test('valida fechas de calendario en formato ISO', () => {
  assert.equal(safePlannedDate('2026-09-29'), '2026-09-29');
  assert.equal(safePlannedDate('2028-02-29'), '2028-02-29');
  for (const value of ['2026-02-29', '2026-02-30', '2026-9-1', '2026-13-01', 'ayer', 20260929, undefined]) {
    assert.throws(() => safePlannedDate(value), /Fecha inválida/);
  }
});
