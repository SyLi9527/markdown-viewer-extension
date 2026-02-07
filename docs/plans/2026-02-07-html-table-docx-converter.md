# HTML Table DOCX Converter Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an HTML table to DOCX converter that supports nested tables for the editable HTML export pipeline.

**Architecture:** Implement a dedicated `createHtmlTableConverter` that maps `HtmlTableNode` to `docx` `Table` objects. It uses the inline converter for paragraph runs and delegates non-paragraph blocks back to `convertBlock` so nested HTML tables become nested DOCX tables. Styling is minimal and derived from theme defaults and HTML cell styles.

**Tech Stack:** TypeScript, `docx`, existing html-editable parser types and DOCX theme types.

### Task 1: HTML table → DOCX converter (supports nested tables)

**Files:**
- Create: `/Users/test/Documents/GitHub/markdown-viewer-extension/.worktrees/codex/html-editable-export/src/exporters/docx-html-table-converter.ts`
- Create: `/Users/test/Documents/GitHub/markdown-viewer-extension/.worktrees/codex/html-editable-export/test/docx-html-table-converter.test.ts`

**Step 1: Write the failing test**

```ts
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
```

**Step 2: Run test to verify it fails**

Run: `npx fibjs test/docx-html-table-converter.test.ts`
Expected: FAIL with “module not found” or “createHtmlTableConverter is not a function”.
Note: If fibjs still unavailable, skip and record.

**Step 3: Write minimal implementation**

```ts
import {
  Table,
  TableRow,
  TableCell,
  Paragraph,
  AlignmentType,
  VerticalAlign,
  BorderStyle,
  TableLayoutType,
  WidthType
} from 'docx';
import type { FileChild } from 'docx';
import type { DOCXThemeStyles, DOCXASTNode } from '../types/docx';
import type { InlineConverter } from './docx-inline-converter';
import type { HtmlTableNode, HtmlTableCellNode, HtmlBorderSet } from '../utils/html-editable-parser';

export interface HtmlTableConverter {
  convertTable(node: HtmlTableNode, listLevel: number): Promise<Table>;
}

interface HtmlTableConverterOptions {
  themeStyles: DOCXThemeStyles;
  inlineConverter: InlineConverter;
  convertBlock: (node: DOCXASTNode, listLevel: number) => Promise<FileChild | FileChild[] | null>;
}

export function createHtmlTableConverter({ themeStyles, inlineConverter, convertBlock }: HtmlTableConverterOptions): HtmlTableConverter {
  const defaultMargins = themeStyles.tableStyles.cell?.margins || { top: 80, right: 80, bottom: 80, left: 80 };
  const defaultSpacing = themeStyles.default.paragraph?.spacing || { line: 276 };

  async function convertCellBlocks(cell: HtmlTableCellNode, listLevel: number): Promise<FileChild[]> {
    const children: FileChild[] = [];
    const align = mapAlignment(cell.style.textAlign);
    const parentStyle = cell.isHeaderCell ? { bold: true } : {};

    for (const block of cell.children || []) {
      if (block.type === 'paragraph') {
        const runs = await inlineConverter.convertInlineNodes((block.children || []) as any, parentStyle);
        children.push(new Paragraph({
          children: runs as any,
          alignment: align,
          spacing: { before: 0, after: 0, line: defaultSpacing.line ?? 276 },
        }));
        continue;
      }

      const converted = await convertBlock(block as DOCXASTNode, listLevel);
      if (converted) {
        if (Array.isArray(converted)) children.push(...converted);
        else children.push(converted);
      }
    }

    if (children.length === 0) {
      children.push(new Paragraph({ text: '', spacing: { before: 0, after: 0, line: defaultSpacing.line ?? 276 } }));
    }

    return children;
  }

  async function convertTable(node: HtmlTableNode, listLevel = 0): Promise<Table> {
    const rows: TableRow[] = [];
    for (const row of node.rows || []) {
      const cells: TableCell[] = [];
      for (const cell of row.cells || []) {
        const children = await convertCellBlocks(cell, listLevel);
        const borders = normalizeHtmlBorders(cell.style.borders);
        const shading = cell.style.backgroundColor ? { fill: cell.style.backgroundColor } : undefined;
        const padding = cell.style.padding || {};

        cells.push(new TableCell({
          children,
          verticalAlign: mapVerticalAlign(cell.style.verticalAlign),
          margins: {
            top: pxToTwips(padding.top ?? defaultMargins.top),
            right: pxToTwips(padding.right ?? defaultMargins.right),
            bottom: pxToTwips(padding.bottom ?? defaultMargins.bottom),
            left: pxToTwips(padding.left ?? defaultMargins.left),
          },
          borders: borders || undefined,
          shading,
          rowSpan: cell.rowSpan > 1 ? cell.rowSpan : undefined,
          columnSpan: cell.colSpan > 1 ? cell.colSpan : undefined,
        }));
      }
      rows.push(new TableRow({ children: cells, tableHeader: row.isHeaderRow }));
    }

    const indentSize = listLevel > 0 ? Math.round((listLevel * 0.5 * 1440) / 2) : undefined;
    return new Table({
      rows,
      layout: TableLayoutType.AUTOFIT,
      alignment: AlignmentType.CENTER,
      indent: indentSize ? { size: indentSize, type: WidthType.DXA } : undefined,
    });
  }

  return { convertTable };
}

function mapAlignment(value?: string): typeof AlignmentType.LEFT | typeof AlignmentType.CENTER | typeof AlignmentType.RIGHT | typeof AlignmentType.JUSTIFIED {
  if (value === 'center') return AlignmentType.CENTER;
  if (value === 'right') return AlignmentType.RIGHT;
  if (value === 'justify') return AlignmentType.JUSTIFIED;
  return AlignmentType.LEFT;
}

function mapVerticalAlign(value?: string): VerticalAlign {
  if (value === 'top') return VerticalAlign.TOP;
  if (value === 'bottom') return VerticalAlign.BOTTOM;
  return VerticalAlign.CENTER;
}

function pxToTwips(px: number): number {
  return Math.round(px * 15);
}

function normalizeCssColor(value?: string): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]+$/.test(trimmed)) {
    return trimmed.replace('#', '').slice(0, 6).toUpperCase();
  }
  if (/^[0-9A-F]{6}$/i.test(trimmed)) return trimmed.toUpperCase();
  return undefined;
}

function cssBorderStyle(style?: string): (typeof BorderStyle)[keyof typeof BorderStyle] {
  if (style === 'dashed') return BorderStyle.DASHED;
  if (style === 'dotted') return BorderStyle.DOTTED;
  if (style === 'double') return BorderStyle.DOUBLE;
  if (style === 'none') return BorderStyle.NONE;
  return BorderStyle.SINGLE;
}

function normalizeHtmlBorders(borders?: HtmlBorderSet) {
  if (!borders) return undefined;
  const normalize = (border?: { style?: string; width?: number; color?: string }) => {
    if (!border) return undefined;
    return {
      style: cssBorderStyle(border.style),
      size: pxToEighths(border.width ?? 0),
      color: normalizeCssColor(border.color) || '000000',
    };
  };

  return {
    top: normalize(borders.top),
    right: normalize(borders.right),
    bottom: normalize(borders.bottom),
    left: normalize(borders.left),
  };
}

function pxToEighths(px: number): number {
  const pt = px * 0.75;
  return Math.max(1, Math.round(pt * 8));
}
```

**Step 4: Run test to verify it passes**

Run: `npx fibjs test/docx-html-table-converter.test.ts`
Expected: PASS
Note: If fibjs still unavailable, skip and record.

**Step 5: Commit**

```bash
git add /Users/test/Documents/GitHub/markdown-viewer-extension/.worktrees/codex/html-editable-export/src/exporters/docx-html-table-converter.ts \
  /Users/test/Documents/GitHub/markdown-viewer-extension/.worktrees/codex/html-editable-export/test/docx-html-table-converter.test.ts

git commit -m "feat: add html table converter for editable export"
```
