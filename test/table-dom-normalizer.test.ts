import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { normalizeTableElement } from '../src/utils/table-dom-normalizer';

test('normalizeTableElement expands rowspan/colspan into a full matrix', () => {
  const { document } = parseHTML(`
    <table>
      <tr><th>A</th><th>B</th><th>C</th></tr>
      <tr><td rowspan="2">R</td><td>1</td><td>2</td></tr>
      <tr><td colspan="2">X</td></tr>
    </table>
  `);
  const table = document.querySelector('table') as HTMLTableElement;
  const result = normalizeTableElement(table);

  assert.equal(result.rowCount, 3);
  assert.equal(result.colCount, 3);
  assert.equal(result.cells[1][0].rowspan, 2);
  assert.equal(result.cells[2][1].colspan, 2);
});

test('normalizeTableElement ignores nested tables when selecting rows and text', () => {
  const { document } = parseHTML(
    '<table><tr><td>Outer</td><td>Outer-<table><tr><td>Inner</td></tr></table>-After</td></tr></table>'
  );
  const table = document.querySelector('table') as HTMLTableElement;
  const result = normalizeTableElement(table);

  assert.equal(result.rowCount, 1);
  assert.equal(result.colCount, 2);
  assert.ok(!result.cells[0][1].text.includes('Inner'));
  assert.ok(result.cells[0][1].text.includes('Outer-'));
  assert.ok(result.cells[0][1].text.includes('-After'));
});

test('normalizeTableElement treats rowspan="0" as span to end of row group', () => {
  const { document } = parseHTML(`
    <table>
      <tbody>
        <tr><td rowspan="0">A</td><td>1</td></tr>
        <tr><td>2</td></tr>
        <tr><td>3</td></tr>
      </tbody>
    </table>
  `);
  const table = document.querySelector('table') as HTMLTableElement;
  const result = normalizeTableElement(table);

  assert.equal(result.rowCount, 3);
  assert.equal(result.colCount, 2);
  assert.equal(result.cells[0][0].rowspan, 3);
  assert.equal(result.cells[2][0].text, 'A');
});

test('normalizeTableElement treats colspan="0" as span to end of row', () => {
  const { document } = parseHTML(`
    <table>
      <tr><td>A</td><td colspan="0">B</td></tr>
      <tr><td>C</td><td>D</td><td>E</td></tr>
    </table>
  `);
  const table = document.querySelector('table') as HTMLTableElement;
  const result = normalizeTableElement(table);

  assert.equal(result.rowCount, 2);
  assert.equal(result.colCount, 3);
  assert.equal(result.cells[0][1].colspan, 2);
  assert.equal(result.cells[0][2].text, 'B');
});

test('normalizeTableElement produces a dense grid', () => {
  const { document } = parseHTML(`
    <table>
      <tr><td>A</td><td>B</td></tr>
      <tr><td>C</td></tr>
    </table>
  `);
  const table = document.querySelector('table') as HTMLTableElement;
  const result = normalizeTableElement(table);

  assert.equal(result.rowCount, 2);
  assert.equal(result.colCount, 2);
  assert.ok(result.cells[1][1]);
  assert.equal(result.cells[1][1].text, '');
});
