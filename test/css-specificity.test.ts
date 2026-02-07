import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateSpecificity, compareSpecificity } from '../src/utils/css-specificity.ts';

test('specificity counts id > class > element', () => {
  const a = calculateSpecificity('#id');
  const b = calculateSpecificity('.cls');
  const c = calculateSpecificity('div');
  assert.ok(compareSpecificity(a, b) > 0);
  assert.ok(compareSpecificity(b, c) > 0);
});

test(':not() uses argument specificity; :where() is zero', () => {
  const notSpec = calculateSpecificity(':not(.a #b)');
  const whereSpec = calculateSpecificity(':where(#x .y)');
  assert.ok(compareSpecificity(notSpec, whereSpec) > 0);
});
