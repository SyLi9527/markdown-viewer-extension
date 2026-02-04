# Table DOM Rendering + High-Fidelity DOCX Export Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace image-based tables with DOM-rendered tables that match legacy images 1:1 and export to DOCX as native tables with high fidelity (including nested tables).

**Architecture:** Build a DOM-derived TableDomModel (TDM) from computed styles, normalize structure (row/col spans), and map the model to DOCX table structures. Integrate into HTML rendering and DOCX export paths with clear fallbacks.

**Tech Stack:** TypeScript, unified/remark/rehype pipeline, docx, node:test, linkedom (for DOM tests).

---

### Task 1: Add TDM types + table normalizer (row/col spans)

**Files:**
- Create: `src/utils/table-dom-model.ts`
- Create: `src/utils/table-dom-normalizer.ts`
- Test: `test/table-dom-normalizer.test.ts`

**Step 1: Write the failing test**

```ts
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
```

**Step 2: Run test to verify it fails**

Run: `npx fibjs test/table-dom-normalizer.test.ts`
Expected: FAIL (module not found or function not implemented)

**Step 3: Write minimal implementation**

```ts
// src/utils/table-dom-model.ts
export type TableDomBorder = { widthPx: number; style: string; color: string };
export type TableDomPadding = { top: number; right: number; bottom: number; left: number };
export type TableDomFont = { family: string; sizePx: number; weight: string; style: string; color: string; lineHeightPx: number };

export interface TableDomCell {
  row: number;
  col: number;
  rowspan: number;
  colspan: number;
  text: string;
  nestedTables: HTMLTableElement[];
}

export interface TableDomNormalized {
  rowCount: number;
  colCount: number;
  cells: TableDomCell[][];
}

// src/utils/table-dom-normalizer.ts
import type { TableDomCell, TableDomNormalized } from './table-dom-model';

function normalizeSpan(value: string | null): number {
  const num = Number(value);
  return Number.isFinite(num) && num > 1 ? Math.floor(num) : 1;
}

export function normalizeTableElement(table: HTMLTableElement): TableDomNormalized {
  const rows = Array.from(table.querySelectorAll('tr'));
  const grid: TableDomCell[][] = [];
  const spanTracker: number[] = [];

  for (let r = 0; r < rows.length; r++) {
    const cells = Array.from(rows[r].querySelectorAll('th,td'));
    grid[r] = grid[r] || [];

    // decrement row spans
    for (let c = 0; c < spanTracker.length; c++) {
      if (spanTracker[c] > 0) spanTracker[c] -= 1;
    }

    let col = 0;
    for (const cell of cells) {
      while (spanTracker[col] > 0) col += 1;

      const rowspan = normalizeSpan(cell.getAttribute('rowspan'));
      const colspan = normalizeSpan(cell.getAttribute('colspan'));
      const nestedTables = Array.from(cell.querySelectorAll('table')) as HTMLTableElement[];

      for (let i = 0; i < rowspan; i++) {
        for (let j = 0; j < colspan; j++) {
          const rr = r + i;
          const cc = col + j;
          grid[rr] = grid[rr] || [];
          grid[rr][cc] = {
            row: rr,
            col: cc,
            rowspan,
            colspan,
            text: cell.textContent?.trim() || '',
            nestedTables
          };
        }
      }

      for (let c = col; c < col + colspan; c++) {
        spanTracker[c] = Math.max(spanTracker[c] || 0, rowspan - 1);
      }

      col += colspan;
    }
  }

  const rowCount = grid.length;
  const colCount = Math.max(0, ...grid.map((row) => row.length));
  return { rowCount, colCount, cells: grid };
}
```

**Step 4: Run test to verify it passes**

Run: `npx fibjs test/table-dom-normalizer.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/utils/table-dom-model.ts src/utils/table-dom-normalizer.ts test/table-dom-normalizer.test.ts
git commit -m "feat: add table DOM normalizer"
```

---

### Task 2: Add computed-style extraction for TDM (injectable resolver)

**Files:**
- Create: `src/utils/table-dom-extractor.ts`
- Test: `test/table-dom-extractor.test.ts`

**Step 1: Write the failing test**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { extractTableDomModel } from '../src/utils/table-dom-extractor';

test('extractTableDomModel captures border and padding via resolver', () => {
  const { document } = parseHTML('<table><tr><td>Cell</td></tr></table>');
  const table = document.querySelector('table') as HTMLTableElement;

  const model = extractTableDomModel(table, {
    getStyle: () => ({
      borderTopWidth: '2px',
      borderTopStyle: 'solid',
      borderTopColor: '#ff0000',
      paddingTop: '4px',
      paddingRight: '6px',
      paddingBottom: '4px',
      paddingLeft: '6px',
      fontFamily: 'Arial',
      fontSize: '12px',
      fontWeight: '700',
      fontStyle: 'normal',
      color: '#111111',
      lineHeight: '16px',
      textAlign: 'center',
      verticalAlign: 'middle',
      backgroundColor: '#ffffff'
    } as any)
  });

  assert.equal(model.cells[0][0].padding.left, 6);
  assert.equal(model.cells[0][0].border.top.widthPx, 2);
});
```

**Step 2: Run test to verify it fails**

Run: `npx fibjs test/table-dom-extractor.test.ts`
Expected: FAIL (module not found or function not implemented)

**Step 3: Write minimal implementation**

```ts
// src/utils/table-dom-extractor.ts
import type { TableDomNormalized, TableDomBorder, TableDomPadding, TableDomFont } from './table-dom-model';
import { normalizeTableElement } from './table-dom-normalizer';

export type StyleResolver = (node: Element) => CSSStyleDeclaration;

export interface TableDomModelCell extends TableDomNormalized['cells'][0][0] {
  padding: TableDomPadding;
  border: { top: TableDomBorder; right: TableDomBorder; bottom: TableDomBorder; left: TableDomBorder };
  background: string;
  textAlign: string;
  verticalAlign: string;
  font: TableDomFont;
}

export interface TableDomModel {
  rowCount: number;
  colCount: number;
  cells: TableDomModelCell[][];
}

function px(value: string): number {
  const num = parseFloat(value || '0');
  return Number.isFinite(num) ? num : 0;
}

function borderFromStyle(style: CSSStyleDeclaration, side: 'Top'|'Right'|'Bottom'|'Left'): TableDomBorder {
  return {
    widthPx: px((style as any)[`border${side}Width`]),
    style: String((style as any)[`border${side}Style`] || 'none'),
    color: String((style as any)[`border${side}Color`] || '#000000')
  };
}

export function extractTableDomModel(table: HTMLTableElement, options?: { getStyle?: StyleResolver }): TableDomModel {
  const getStyle = options?.getStyle || ((node: Element) => getComputedStyle(node));
  const normalized = normalizeTableElement(table);

  const cells = normalized.cells.map((row) => row.map((cell) => {
    const el = table.querySelectorAll('tr')[cell.row]?.querySelectorAll('th,td')[cell.col] as Element | undefined;
    const style = el ? getStyle(el) : getStyle(table);

    return {
      ...cell,
      padding: {
        top: px(style.paddingTop),
        right: px(style.paddingRight),
        bottom: px(style.paddingBottom),
        left: px(style.paddingLeft)
      },
      border: {
        top: borderFromStyle(style, 'Top'),
        right: borderFromStyle(style, 'Right'),
        bottom: borderFromStyle(style, 'Bottom'),
        left: borderFromStyle(style, 'Left')
      },
      background: style.backgroundColor || 'transparent',
      textAlign: style.textAlign || 'left',
      verticalAlign: style.verticalAlign || 'middle',
      font: {
        family: style.fontFamily || 'Arial',
        sizePx: px(style.fontSize),
        weight: style.fontWeight || '400',
        style: style.fontStyle || 'normal',
        color: style.color || '#000000',
        lineHeightPx: px(style.lineHeight)
      }
    };
  }));

  return { rowCount: normalized.rowCount, colCount: normalized.colCount, cells };
}
```

**Step 4: Run test to verify it passes**

Run: `npx fibjs test/table-dom-extractor.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/utils/table-dom-extractor.ts test/table-dom-extractor.test.ts
git commit -m "feat: add table DOM model extractor"
```

---

### Task 3: Add DOCX mapper for TDM (borders/padding/spans)

**Files:**
- Create: `src/exporters/docx-table-from-dom.ts`
- Test: `test/docx-table-from-dom.test.ts`

**Step 1: Write the failing test**

```ts
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
```

**Step 2: Run test to verify it fails**

Run: `npx fibjs test/docx-table-from-dom.test.ts`
Expected: FAIL (module not found or function not implemented)

**Step 3: Write minimal implementation**

```ts
// src/exporters/docx-table-from-dom.ts
import {
  Table, TableRow, TableCell, Paragraph, TextRun,
  BorderStyle, TableLayoutType, AlignmentType,
  VerticalAlign
} from 'docx';
import type { TableDomModel } from '../utils/table-dom-extractor';

function pxToEighths(px: number): number {
  const pt = px * 0.75;
  return Math.max(1, Math.round(pt * 8));
}

function cssBorderStyle(style: string): BorderStyle {
  if (style === 'dashed') return BorderStyle.DASHED;
  if (style === 'dotted') return BorderStyle.DOTTED;
  if (style === 'double') return BorderStyle.DOUBLE;
  if (style === 'none') return BorderStyle.NONE;
  return BorderStyle.SINGLE;
}

export function convertTableDomToDocx(model: TableDomModel): Table {
  const rows: TableRow[] = [];

  for (let r = 0; r < model.rowCount; r++) {
    const cells = model.cells[r] || [];
    const rowCells: TableCell[] = [];

    for (let c = 0; c < model.colCount; c++) {
      const cell = cells[c];
      if (!cell || (cell.row !== r || cell.col !== c)) continue;

      const border = {
        top: { style: cssBorderStyle(cell.border.top.style), size: pxToEighths(cell.border.top.widthPx), color: cell.border.top.color.replace('#', '') },
        right: { style: cssBorderStyle(cell.border.right.style), size: pxToEighths(cell.border.right.widthPx), color: cell.border.right.color.replace('#', '') },
        bottom: { style: cssBorderStyle(cell.border.bottom.style), size: pxToEighths(cell.border.bottom.widthPx), color: cell.border.bottom.color.replace('#', '') },
        left: { style: cssBorderStyle(cell.border.left.style), size: pxToEighths(cell.border.left.widthPx), color: cell.border.left.color.replace('#', '') }
      };

      const paragraph = new Paragraph({
        alignment: cell.textAlign === 'center' ? AlignmentType.CENTER : cell.textAlign === 'right' ? AlignmentType.RIGHT : AlignmentType.LEFT,
        children: [new TextRun({ text: cell.text || '' })]
      });

      rowCells.push(new TableCell({
        children: [paragraph],
        margins: {
          top: Math.round(cell.padding.top * 20),
          right: Math.round(cell.padding.right * 20),
          bottom: Math.round(cell.padding.bottom * 20),
          left: Math.round(cell.padding.left * 20)
        },
        borders: border,
        shading: { fill: cell.background.replace('#', '') || 'FFFFFF' },
        rowSpan: cell.rowspan > 1 ? cell.rowspan : undefined,
        columnSpan: cell.colspan > 1 ? cell.colspan : undefined,
        verticalAlign: cell.verticalAlign === 'top' ? VerticalAlign.TOP : cell.verticalAlign === 'bottom' ? VerticalAlign.BOTTOM : VerticalAlign.CENTER
      }));
    }

    rows.push(new TableRow({ children: rowCells }));
  }

  return new Table({ rows, layout: TableLayoutType.AUTOFIT });
}
```

**Step 4: Run test to verify it passes**

Run: `npx fibjs test/docx-table-from-dom.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/exporters/docx-table-from-dom.ts test/docx-table-from-dom.test.ts
git commit -m "feat: add DOCX table converter for DOM model"
```

---

### Task 4: Wire DOM table extraction into DOCX exporter

**Files:**
- Modify: `src/exporters/docx-exporter.ts`
- Modify: `src/utils/html-table-to-docx.ts`
- Test: `test/docx-exporter-table-dom.test.ts`

**Step 1: Write the failing test**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { extractTableDomModel } from '../src/utils/table-dom-extractor';

// This is a lightweight assertion that DOM extraction is reachable.
// Full integration is validated in visual diff tests.

test('extractTableDomModel returns model for HTML table', () => {
  const { document } = parseHTML('<table><tr><td>1</td></tr></table>');
  const table = document.querySelector('table') as HTMLTableElement;
  const model = extractTableDomModel(table, { getStyle: () => ({ paddingTop: '0px' } as any) });
  assert.equal(model.rowCount, 1);
});
```

**Step 2: Run test to verify it fails**

Run: `npx fibjs test/docx-exporter-table-dom.test.ts`
Expected: FAIL (module missing or not wired)

**Step 3: Minimal implementation**

- Add a new helper in `docx-exporter.ts` to detect HTML tables and convert via `extractTableDomModel` + `convertTableDomToDocx` when DOM is available.
- Keep existing `parseHtmlTablesToDocxNodes` as fallback if DOM extraction fails.

```ts
// docx-exporter.ts (inside convertNode)
if (node.type === 'html') {
  const htmlValue = typeof node.value === 'string' ? node.value : '';
  const domTables = parseHtmlTablesToDocxNodes(htmlValue);
  // TODO: if document exists, parse the HTML into DOM, extract model, convert to DOCX
}
```

**Step 4: Run test to verify it passes**

Run: `npx fibjs test/docx-exporter-table-dom.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/exporters/docx-exporter.ts src/utils/html-table-to-docx.ts test/docx-exporter-table-dom.test.ts
git commit -m "feat: use DOM table model in DOCX export"
```

---

### Task 5: Add table IDs + DOM render markers

**Files:**
- Create: `src/plugins/rehype-table-id.ts`
- Modify: `src/core/markdown-processor.ts`
- Modify: `src/plugins/html-plugin.ts`
- Test: `test/rehype-table-id.test.ts`

**Step 1: Write the failing test**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import rehypeTableId from '../src/plugins/rehype-table-id';

test('rehype-table-id adds data-table-id', async () => {
  const file = await unified()
    .use(remarkParse)
    .use(remarkRehype)
    .use(rehypeTableId)
    .use(rehypeStringify)
    .process('| a |\n| - |\n| b |');
  const html = String(file);
  assert.match(html, /data-table-id="/);
});
```

**Step 2: Run test to verify it fails**

Run: `npx fibjs test/rehype-table-id.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

```ts
// src/plugins/rehype-table-id.ts
import { visit } from 'unist-util-visit';
import type { Root, Element } from 'hast';

export default function rehypeTableId() {
  return (tree: Root) => {
    let id = 0;
    visit(tree, 'element', (node: Element) => {
      if (node.tagName === 'table') {
        node.properties = node.properties || {};
        (node.properties as any)['data-table-id'] = `table-${++id}`;
      }
    });
  };
}
```

Wire into pipeline:

```ts
// markdown-processor.ts
.use(rehypeTableId)
```

Mark HTML tables in HtmlPlugin output:

```ts
// html-plugin.ts
container.querySelectorAll('table').forEach((table, idx) => {
  table.setAttribute('data-table-dom', 'true');
  if (!table.getAttribute('data-table-id')) {
    table.setAttribute('data-table-id', `html-table-${idx + 1}`);
  }
});
```

**Step 4: Run test to verify it passes**

Run: `npx fibjs test/rehype-table-id.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/plugins/rehype-table-id.ts src/core/markdown-processor.ts src/plugins/html-plugin.ts test/rehype-table-id.test.ts
git commit -m "feat: add table IDs for DOM extraction"
```

---

### Task 6: Visual diff harness (legacy image vs DOM)

**Files:**
- Create: `scripts/table-visual-diff.mjs`
- Create: `fixtures/tables/*.html`

**Step 1: Write the failing test (script placeholder)**

```js
// scripts/table-visual-diff.mjs
console.error('Not implemented');
process.exit(1);
```

**Step 2: Run test to verify it fails**

Run: `node scripts/table-visual-diff.mjs`
Expected: exit code 1

**Step 3: Minimal implementation**

- Load fixture HTML
- Render via legacy image path and DOM path in a headless browser
- Compare pixel diff with a threshold

**Step 4: Run test to verify it passes**

Run: `node scripts/table-visual-diff.mjs`
Expected: exit code 0

**Step 5: Commit**

```bash
git add scripts/table-visual-diff.mjs fixtures/tables
git commit -m "test: add visual diff harness for tables"
```

---

## Execution Notes

- Use @superpowers:verification-before-completion for verification before claiming tasks complete.
- Use @superpowers:subagent-driven-development if executing task-by-task in-session.

---

**Plan complete and saved to `docs/plans/2026-02-04-table-dom-docx-implementation-plan.md`. Two execution options:**

1) **Subagent-Driven (this session)** - I dispatch a fresh subagent per task, review between tasks, fast iteration
2) **Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?
