import test from 'node:test';
import assert from 'node:assert/strict';
import { toPdfFilename } from '../src/core/document-utils';

test('toPdfFilename converts md/markdown to .pdf', () => {
  assert.equal(toPdfFilename('note.md'), 'note.pdf');
  assert.equal(toPdfFilename('note.markdown'), 'note.pdf');
});

test('toPdfFilename appends .pdf when missing', () => {
  assert.equal(toPdfFilename('note'), 'note.pdf');
});

test('toPdfFilename defaults to document.pdf', () => {
  assert.equal(toPdfFilename(''), 'document.pdf');
});
