import test from 'node:test';
import assert from 'node:assert/strict';
import { initialWindowSize } from '../../../src/main/window-size';

test('usa un tamaño inicial mayor sin exceder el área utilizable', () => {
  assert.deepEqual(initialWindowSize({ width: 1920, height: 1080 }), { width: 1280, height: 840, minWidth: 850, minHeight: 620 });
  assert.deepEqual(initialWindowSize({ width: 1100, height: 700 }), { width: 1100, height: 700, minWidth: 850, minHeight: 620 });
  assert.deepEqual(initialWindowSize({ width: 700, height: 500 }), { width: 700, height: 500, minWidth: 700, minHeight: 500 });
});
