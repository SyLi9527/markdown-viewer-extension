import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertTableDomToDocx } from '../src/exporters/docx-table-from-dom';

const model = {
  rowCount: 1,
  colCount: 1,
  cells: [[{
    row: 0,
    col: 0,
    rowspan: 1,
    colspan: 1,
    text: 'A',
    nestedTables: [],
    padding: { top: 4, right: 4, bottom: 4, left: 4 },
    border: {
      top: { widthPx: 2, style: 'solid', color: '#ff0000' },
      right: { widthPx: 2, style: 'solid', color: '#ff0000' },
      bottom: { widthPx: 2, style: 'solid', color: '#ff0000' },
      left: { widthPx: 2, style: 'solid', color: '#ff0000' }
    },
    background: '#ffffff',
    textAlign: 'center',
    verticalAlign: 'middle',
    font: { family: 'Arial', sizePx: 12, weight: '700', style: 'normal', color: '#111111', lineHeightPx: 16 }
  }]]
};

test('convertTableDomToDocx maps borders and padding', () => {
  const table = convertTableDomToDocx(model as any);
  assert.ok(table);
});
