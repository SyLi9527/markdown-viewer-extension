import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BorderStyle } from 'docx';
import { convertTableDomToDocx } from '../src/exporters/docx-table-from-dom';

const model = {
  rowCount: 2,
  colCount: 2,
  cells: [
    [
      {
        row: 0,
        col: 0,
        originRow: 0,
        originCol: 0,
        rowspan: 2,
        colspan: 1,
        text: 'A',
        nestedTables: [],
        padding: { top: 4, right: 4, bottom: 4, left: 4 },
        border: {
          top: { widthPx: 2, style: 'solid', color: 'rgb(255, 0, 0)' },
          right: { widthPx: 2, style: 'solid', color: 'rgb(255, 0, 0)' },
          bottom: { widthPx: 2, style: 'solid', color: 'rgb(255, 0, 0)' },
          left: { widthPx: 2, style: 'solid', color: 'rgb(255, 0, 0)' }
        },
        background: 'rgb(255, 255, 255)',
        textAlign: 'center',
        verticalAlign: 'middle',
        font: { family: 'Arial', sizePx: 12, weight: '700', style: 'normal', color: '#111111', lineHeightPx: 16 }
      },
      {
        row: 0,
        col: 1,
        originRow: 0,
        originCol: 1,
        rowspan: 1,
        colspan: 1,
        text: 'B',
        nestedTables: [],
        padding: { top: 4, right: 4, bottom: 4, left: 4 },
        border: {
          top: { widthPx: 0, style: 'none', color: '#000000' },
          right: { widthPx: 0, style: 'none', color: '#000000' },
          bottom: { widthPx: 0, style: 'none', color: '#000000' },
          left: { widthPx: 0, style: 'none', color: '#000000' }
        },
        background: '#ffffff',
        textAlign: 'left',
        verticalAlign: 'middle',
        font: { family: 'Arial', sizePx: 12, weight: '400', style: 'normal', color: '#111111', lineHeightPx: 16 }
      }
    ],
    [
      {
        row: 1,
        col: 0,
        originRow: 0,
        originCol: 0,
        rowspan: 2,
        colspan: 1,
        text: 'A',
        nestedTables: [],
        padding: { top: 4, right: 4, bottom: 4, left: 4 },
        border: {
          top: { widthPx: 2, style: 'solid', color: 'rgb(255, 0, 0)' },
          right: { widthPx: 2, style: 'solid', color: 'rgb(255, 0, 0)' },
          bottom: { widthPx: 2, style: 'solid', color: 'rgb(255, 0, 0)' },
          left: { widthPx: 2, style: 'solid', color: 'rgb(255, 0, 0)' }
        },
        background: 'rgb(255, 255, 255)',
        textAlign: 'center',
        verticalAlign: 'middle',
        font: { family: 'Arial', sizePx: 12, weight: '700', style: 'normal', color: '#111111', lineHeightPx: 16 }
      },
      {
        row: 1,
        col: 1,
        originRow: 1,
        originCol: 1,
        rowspan: 1,
        colspan: 1,
        text: 'C',
        nestedTables: [],
        padding: { top: 4, right: 4, bottom: 4, left: 4 },
        border: {
          top: { widthPx: 0, style: 'none', color: '#000000' },
          right: { widthPx: 0, style: 'none', color: '#000000' },
          bottom: { widthPx: 0, style: 'none', color: '#000000' },
          left: { widthPx: 0, style: 'none', color: '#000000' }
        },
        background: '#ffffff',
        textAlign: 'left',
        verticalAlign: 'middle',
        font: { family: 'Arial', sizePx: 12, weight: '400', style: 'normal', color: '#111111', lineHeightPx: 16 }
      }
    ]
  ]
};

test('convertTableDomToDocx maps borders, spans, and padding', () => {
  const table = convertTableDomToDocx(model as any);
  const root = table.root[0];
  assert.ok(root);

  const rows = (root as any).options.rows || (root as any).rows;
  assert.equal(rows.length, 2);

  const firstRowCells = rows[0].options.children;
  assert.equal(firstRowCells.length, 2);

  const firstCell = firstRowCells[0].options;
  assert.equal(firstCell.rowSpan, 2);
  assert.equal(firstCell.margins.left, 60);
  assert.equal(firstCell.borders.top.style, BorderStyle.SINGLE);
  assert.equal(firstCell.borders.top.color, 'FF0000');
});

test('convertTableDomToDocx skips shading for transparent background', () => {
  const transparentModel = {
    rowCount: 1,
    colCount: 1,
    cells: [[{
      row: 0,
      col: 0,
      originRow: 0,
      originCol: 0,
      rowspan: 1,
      colspan: 1,
      text: 'A',
      nestedTables: [],
      padding: { top: 4, right: 4, bottom: 4, left: 4 },
      border: {
        top: { widthPx: 0, style: 'none', color: '#000000' },
        right: { widthPx: 0, style: 'none', color: '#000000' },
        bottom: { widthPx: 0, style: 'none', color: '#000000' },
        left: { widthPx: 0, style: 'none', color: '#000000' }
      },
      background: 'rgba(0, 0, 0, 0)',
      textAlign: 'left',
      verticalAlign: 'middle',
      font: { family: 'Arial', sizePx: 12, weight: '400', style: 'normal', color: '#111111', lineHeightPx: 16 }
    }]]
  };

  const table = convertTableDomToDocx(transparentModel as any);
  const root = table.root[0];
  const rows = (root as any).options.rows || (root as any).rows;
  const cell = rows[0].options.children[0].options;
  assert.equal(cell.shading, undefined);
});
