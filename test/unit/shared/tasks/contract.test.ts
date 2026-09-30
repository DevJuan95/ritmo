import test from 'node:test';
import assert from 'node:assert/strict';
import { safePlannedDate, safeTaskTitle } from '../../../../src/shared/tasks/contract';

test('los títulos de tarea tienen formato estable', () => {
  assert.equal(safeTaskTitle('  Terminar   reporte  '), 'Terminar reporte');
  assert.equal(safeTaskTitle('a'.repeat(160)).length, 160);
  for (const invalid of ['   ', '', undefined, 'a'.repeat(161)]) assert.throws(() => safeTaskTitle(invalid));
});

test('valida fechas de calendario en formato ISO', () => {
  assert.equal(safePlannedDate('2026-09-29'), '2026-09-29');
  assert.equal(safePlannedDate('2028-02-29'), '2028-02-29');
  for (const value of ['2026-02-29', '2026-02-30', '2026-9-1', '2026-13-01', 'ayer', 20260929, undefined]) {
    assert.throws(() => safePlannedDate(value), /Fecha inválida/);
  }
});

test('solo acepta fechas entre 2000 y 2100', () => {
  assert.equal(safePlannedDate('2000-01-01'), '2000-01-01');
  assert.equal(safePlannedDate('2100-12-31'), '2100-12-31');
  for (const value of ['0202-09-29', '1999-12-31', '2101-01-01']) {
    assert.throws(() => safePlannedDate(value), /entre 2000 y 2100/);
  }
});
