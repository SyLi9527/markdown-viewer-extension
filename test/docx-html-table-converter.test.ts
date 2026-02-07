import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Table } from 'docx';
import { createInlineConverter } from '../src/exporters/docx-inline-converter';
import { createHtmlTableConverter } from '../src/exporters/docx-html-table-converter';
import type { HtmlTableNode } from '../src/utils/html-editable-parser';
import type { DOCXThemeStyles } from '../src/types/docx';

const theme: DOCXThemeStyles = {
  default: { run: { font: 'Times New Roman', size: 24 }, paragraph: { spacing: { line: 276, before: 0, after: 200 } } },
  paragraphStyles: {},
  characterStyles: { code: { font: 'Consolas', size: 26, background: 'F6F8FA' } },
  tableStyles: { borders: { all: { style: 1 as any, size: 8, color: 'A3A3A3' } }, header: { shading: { fill: 'E5E5E5' }, color: '171717', bold: true }, cell: { margins: { top: 80, bottom: 80, left: 80, right: 80 } }, zebra: false },
  codeColors: { background: 'F5F5F5', foreground: '24292E', colors: {} },
  linkColor: '0369A1',
  blockquoteColor: 'A3A3A3'
};

const inline = createInlineConverter({
  themeStyles: theme,
  fetchImageAsBuffer: async () => { throw new Error('no images'); },
  reportResourceProgress: () => {},
  linkDefinitions: new Map(),
  renderer: null,
  emojiStyle: 'system',
  linkColor: theme.linkColor,
});

test('convert html table with nested table', async () => {
  const nested: HtmlTableNode = {
    type: 'htmlTable',
    headerRowCount: 0,
    rows: [{
      type: 'htmlTableRow',
      isHeaderRow: false,
      cells: [{
        type: 'htmlTableCell',
        columnIndex: 0,
        rowSpan: 1,
        colSpan: 1,
        isHeaderCell: false,
        style: {},
        children: [{ type: 'paragraph', children: [{ type: 'text', value: 'Inner' }] }]
      }]
    }]
  } as any;

  const tableNode: HtmlTableNode = {
    type: 'htmlTable',
    headerRowCount: 0,
    rows: [{
      type: 'htmlTableRow',
      isHeaderRow: false,
      cells: [{
        type: 'htmlTableCell',
        columnIndex: 0,
        rowSpan: 1,
        colSpan: 1,
        isHeaderCell: false,
        style: {},
        children: [
          { type: 'paragraph', children: [{ type: 'text', value: 'Outer' }] },
          nested
        ]
      }]
    }]
  } as any;

  const converter = createHtmlTableConverter({
    themeStyles: theme,
    inlineConverter: inline,
    convertBlock: async (node) => node.type === 'htmlTable' ? converter.convertTable(node as HtmlTableNode, 0) : null,
  });

  const table = await converter.convertTable(tableNode, 0);
  assert.ok(table instanceof Table);
  const root = (table as any).root?.[0];
  const rows = root?.options?.rows || root?.rows;
  const cell = rows[0].options.children[0].options;
  const children = cell.children || [];
  const hasNestedTable = children.some((child: any) => child?.root);
  assert.ok(hasNestedTable, 'expected nested Table inside TableCell');
});
