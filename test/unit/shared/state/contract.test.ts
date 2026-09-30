import test from 'node:test';
import assert from 'node:assert/strict';
import { todayKey } from '../../../../src/shared/state/contract';

test('la clave del día usa la fecha local con formato estable', () => {
  assert.equal(todayKey(new Date(2026, 8, 29)), '2026-09-29');
  assert.equal(todayKey(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});
