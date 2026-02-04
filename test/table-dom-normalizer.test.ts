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
