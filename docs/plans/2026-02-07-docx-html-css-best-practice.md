# DOCX HTML/CSS Best-Practice Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让 DOCX 导出正确处理 HTML `<style>`，不再把 CSS 当正文输出，并将可映射的 CSS 应用到表格与基础文本（含嵌套表格），采用成熟 CSS 解析器以符合最佳实践。

**Architecture:** 使用 PostCSS 解析 `<style>`，用 `postcss-selector-parser` 计算选择器特异性与匹配。将 CSS 规则按级联规则写回元素 `style` 属性，然后沿用现有 HTML→DOCX 解析链路（表格/文本解析均基于 inline style 生效）。在 HTML 解析器中忽略 `<style>` 标签、支持样式继承与段落对齐映射。

**Tech Stack:** TypeScript, docx, PostCSS, postcss-selector-parser, unified/remark pipeline, linkedom (tests).

---

## Task 0: Add best‑practice CSS dependencies
**Files:**
- Modify: `/Users/test/Documents/GitHub/markdown-viewer-extension/package.json`
- Modify: `/Users/test/Documents/GitHub/markdown-viewer-extension/pnpm-lock.yaml`

**Step 1: Update dependencies**
Add to `dependencies`:
```json
"postcss": "^8.5.6",
"postcss-selector-parser": "^6.1.2"
```

**Step 2: Install to lock**
Run:
```
cd /Users/test/Documents/GitHub/markdown-viewer-extension
pnpm add postcss postcss-selector-parser
```
Expected: `package.json` + `pnpm-lock.yaml` updated.

**Step 3: Commit**
```bash
git add /Users/test/Documents/GitHub/markdown-viewer-extension/package.json \
        /Users/test/Documents/GitHub/markdown-viewer-extension/pnpm-lock.yaml
git commit -m "chore: add postcss for html css preprocessing"
```

---

## Task 1: Specificity helper (robust selector parsing)
**Files:**
- Create: `/Users/test/Documents/GitHub/markdown-viewer-extension/src/utils/css-specificity.ts`
- Create: `/Users/test/Documents/GitHub/markdown-viewer-extension/test/css-specificity.test.ts`

**Step 1: Write failing test**
```ts
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
```

**Step 2: Run test (expect fail)**
```
node --import tsx/esm /Users/test/Documents/GitHub/markdown-viewer-extension/test/css-specificity.test.ts
```

**Step 3: Implement helper**
```ts
// /Users/test/Documents/GitHub/markdown-viewer-extension/src/utils/css-specificity.ts
import selectorParser from 'postcss-selector-parser';

export type Specificity = [number, number, number];

const PSEUDO_ELEMENTS = new Set([
  'before', 'after', 'first-line', 'first-letter', 'marker', 'placeholder'
]);

const PSEUDO_SELECTOR_LIST = new Set([
  'not', 'is', 'has', 'matches', '-webkit-any', '-moz-any', 'any'
]);

const ZERO_SPECIFICITY = new Set(['where']);

export function calculateSpecificity(selector: string): Specificity {
  let result: Specificity = [0, 0, 0];

  const processor = selectorParser((root) => {
    root.each((sel) => {
      const spec = calcSelectorSpecificity(sel);
      if (compareSpecificity(spec, result) > 0) result = spec;
    });
  });

  try {
    processor.processSync(selector);
  } catch {
    return [0, 0, 0];
  }

  return result;
}

function calcSelectorSpecificity(sel: selectorParser.Selector): Specificity {
  let spec: Specificity = [0, 0, 0];

  sel.walk((node) => {
    if (node.type === 'id') {
      spec[0] += 1;
      return;
    }

    if (node.type === 'class' || node.type === 'attribute') {
      spec[1] += 1;
      return;
    }

    if (node.type === 'tag') {
      if (node.value !== '*') spec[2] += 1;
      return;
    }

    if (node.type === 'pseudo') {
      const value = node.value.replace(/^:+/, '').toLowerCase();

      if (ZERO_SPECIFICITY.has(value)) return;

      if (PSEUDO_SELECTOR_LIST.has(value) && node.nodes?.length) {
        // :not(), :is(), :has(), :matches() => max specificity of selector list
        let max: Specificity = [0, 0, 0];
        node.nodes.forEach((n) => {
          if (n.type !== 'selector') return;
          const s = calcSelectorSpecificity(n);
          if (compareSpecificity(s, max) > 0) max = s;
        });
        spec = addSpecificity(spec, max);
        return;
      }

      if (node.value.startsWith('::') || PSEUDO_ELEMENTS.has(value)) {
        spec[2] += 1;
        return;
      }

      // pseudo-class
      spec[1] += 1;
    }
  });

  return spec;
}

function addSpecificity(a: Specificity, b: Specificity): Specificity {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function compareSpecificity(a: Specificity, b: Specificity): number {
  if (a[0] !== b[0]) return a[0] - b[0];
  if (a[1] !== b[1]) return a[1] - b[1];
  if (a[2] !== b[2]) return a[2] - b[2];
  return 0;
}
```

**Step 4: Run test (expect pass)**
```
node --import tsx/esm /Users/test/Documents/GitHub/markdown-viewer-extension/test/css-specificity.test.ts
```

**Step 5: Commit**
```bash
git add /Users/test/Documents/GitHub/markdown-viewer-extension/src/utils/css-specificity.ts \
        /Users/test/Documents/GitHub/markdown-viewer-extension/test/css-specificity.test.ts
git commit -m "feat: add css specificity helper"
```

---

## Task 2: HTML style preprocessor (PostCSS + cascade)
**Files:**
- Create: `/Users/test/Documents/GitHub/markdown-viewer-extension/src/utils/html-style-preprocessor.ts`
- Create: `/Users/test/Documents/GitHub/markdown-viewer-extension/test/html-style-preprocessor.test.ts`

**Step 1: Write failing tests**
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preprocessHtmlForDocx } from '../src/utils/html-style-preprocessor.ts';

const { DOMParser } = await import('linkedom');
globalThis.DOMParser = DOMParser;

test('applies css rules and strips style tags', () => {
  const html = `
    <style>.outer td { border: 1px solid #333; padding: 6px; color: #ff0000; }</style>
    <table class="outer"><tr><td>Cell</td></tr></table>
  `;
  const out = preprocessHtmlForDocx(html);
  const doc = new DOMParser().parseFromString(out, 'text/html');
  assert.equal(doc.querySelectorAll('style').length, 0);
  const td = doc.querySelector('td')!;
  const style = td.getAttribute('style') || '';
  assert.match(style, /border:\s*1px solid #333/i);
  assert.match(style, /padding:\s*6px/i);
  assert.match(style, /color:\s*#ff0000/i);
});

test('honors !important over inline', () => {
  const html = `
    <style>td { color: #0000ff !important; }</style>
    <table><tr><td style="color:#ff0000">Cell</td></tr></table>
  `;
  const out = preprocessHtmlForDocx(html);
  const doc = new DOMParser().parseFromString(out, 'text/html');
  const td = doc.querySelector('td')!;
  const style = td.getAttribute('style') || '';
  assert.match(style, /color:\s*#0000ff/i);
});

test('later rules with same specificity override earlier', () => {
  const html = `
    <style>
      td { color: #111111; }
      td { color: #222222; }
    </style>
    <table><tr><td>Cell</td></tr></table>
  `;
  const out = preprocessHtmlForDocx(html);
  const doc = new DOMParser().parseFromString(out, 'text/html');
  const td = doc.querySelector('td')!;
  const style = td.getAttribute('style') || '';
  assert.match(style, /color:\s*#222222/i);
});
```

**Step 2: Run tests (expect fail)**
```
node --import tsx/esm /Users/test/Documents/GitHub/markdown-viewer-extension/test/html-style-preprocessor.test.ts
```

**Step 3: Implement preprocessor**
```ts
// /Users/test/Documents/GitHub/markdown-viewer-extension/src/utils/html-style-preprocessor.ts
import postcss from 'postcss';
import { calculateSpecificity, compareSpecificity, type Specificity } from './css-specificity';

const SUPPORTED_PROPERTIES = new Set([
  'color',
  'background',
  'background-color',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-decoration',
  'text-align',
  'vertical-align',
  'border',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'line-height'
]);

type DeclMeta = {
  value: string;
  important: boolean;
  specificity: Specificity;
  order: number;
};

export function preprocessHtmlForDocx(html: string): string {
  if (!html) return '';
  if (typeof DOMParser === 'undefined') {
    return html.replace(/<style[\\s\\S]*?>[\\s\\S]*?<\\/style>/gi, '');
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const styleNodes = Array.from(doc.querySelectorAll('style'));

  const cssText = styleNodes.map((n) => n.textContent || '').join('\\n');
  styleNodes.forEach((n) => n.remove());

  if (cssText.trim()) {
    applyCss(doc, cssText);
  }

  return doc.body?.innerHTML ?? '';
}

function applyCss(doc: Document, cssText: string): void {
  let order = 0;
  const root = postcss.parse(cssText);

  root.walkRules((rule) => {
    // Skip rules inside @media/@supports/etc for DOCX
    if (rule.parent && rule.parent.type === 'atrule') return;

    const selectors = rule.selectors || [];
    for (const selector of selectors) {
      const specificity = calculateSpecificity(selector);
      let elements: Element[] = [];
      try {
        elements = Array.from(doc.querySelectorAll(selector));
      } catch {
        continue;
      }

      for (const el of elements) {
        const current = readInlineStyles(el);

        rule.walkDecls((decl) => {
          const prop = decl.prop.toLowerCase();
          if (!SUPPORTED_PROPERTIES.has(prop)) return;

          const next: DeclMeta = {
            value: decl.value,
            important: decl.important,
            specificity,
            order: order++
          };

          const prev = current.get(prop);
          if (!prev || compareDecl(next, prev) > 0) {
            current.set(prop, next);
          }
        });

        writeInlineStyles(el, current);
      }
    }
  });
}

function readInlineStyles(el: Element): Map<string, DeclMeta> {
  const map = new Map<string, DeclMeta>();
  const attr = el.getAttribute('style') || '';
  const parts = attr.split(';').map((p) => p.trim()).filter(Boolean);

  let order = 0;
  for (const part of parts) {
    const idx = part.indexOf(':');
    if (idx === -1) continue;
    const prop = part.slice(0, idx).trim().toLowerCase();
    let value = part.slice(idx + 1).trim();
    let important = false;
    if (value.toLowerCase().endsWith('!important')) {
      important = true;
      value = value.replace(/\\s*!important\\s*$/i, '');
    }
    if (!prop || !value) continue;

    map.set(prop, {
      value,
      important,
      specificity: [1000, 0, 0], // inline styles outrank any selector
      order: order++
    });
  }

  return map;
}

function writeInlineStyles(el: Element, map: Map<string, DeclMeta>): void {
  const entries = Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([prop, meta]) => `${prop}: ${meta.value}${meta.important ? ' !important' : ''}`);
  if (entries.length === 0) return;
  el.setAttribute('style', entries.join('; '));
}

function compareDecl(a: DeclMeta, b: DeclMeta): number {
  if (a.important !== b.important) return a.important ? 1 : -1;
  const spec = compareSpecificity(a.specificity, b.specificity);
  if (spec !== 0) return spec;
  return a.order - b.order;
}
```

**Step 4: Run tests (expect pass)**
```
node --import tsx/esm /Users/test/Documents/GitHub/markdown-viewer-extension/test/html-style-preprocessor.test.ts
```

**Step 5: Commit**
```bash
git add /Users/test/Documents/GitHub/markdown-viewer-extension/src/utils/html-style-preprocessor.ts \
        /Users/test/Documents/GitHub/markdown-viewer-extension/test/html-style-preprocessor.test.ts
git commit -m "feat: preprocess html css via postcss"
```

---

## Task 3: HTML parser – skip `<style>`, inherit styles, paragraph alignment
**Files:**
- Modify: `/Users/test/Documents/GitHub/markdown-viewer-extension/src/utils/html-editable-parser.ts`
- Modify: `/Users/test/Documents/GitHub/markdown-viewer-extension/test/html-editable-parser.test.ts`

**Step 1: Add tests**
```ts
it('skips style tags', () => {
  const html = `<style>p{color:red}</style><p>Hi</p>`;
  const blocks = parseHtmlToEditableAst(html, { maxTableDepth: 3 });
  assert.equal(blocks?.length, 1);
  assert.equal((blocks?.[0] as any).type, 'paragraph');
});

it('inherits container color to text', () => {
  const html = `<div style="color:#ff0000"><p>Hi</p></div>`;
  const blocks = parseHtmlToEditableAst(html, { maxTableDepth: 3 });
  const text = (blocks?.[0] as any)?.children?.[0];
  assert.equal(text?.style?.color, 'FF0000');
});

it('captures paragraph alignment', () => {
  const html = `<p style="text-align:center">Center</p>`;
  const blocks = parseHtmlToEditableAst(html, { maxTableDepth: 3 });
  assert.equal((blocks?.[0] as any).alignment, 'center');
});
```

**Step 2: Run tests (expect fail)**
```
node --import tsx/esm /Users/test/Documents/GitHub/markdown-viewer-extension/test/html-editable-parser.test.ts
```

**Step 3: Implement parser changes (style inheritance + alignment)**
Apply changes similar to:

```ts
// add BlockStyle + readBlockStyle + parseBlockContainer args for inherited styles
// skip tag === 'style' early
// apply alignment/spacing to paragraph nodes
// add line-through to readInlineStyle
```

Use the exact implementation previously drafted in the plan (with `readBlockStyle`, `parseBlockContainer` signature update, and `parseParagraph` storing `alignment` + `spacing`).

**Step 4: Run tests (expect pass)**

**Step 5: Commit**
```bash
git add /Users/test/Documents/GitHub/markdown-viewer-extension/src/utils/html-editable-parser.ts \
        /Users/test/Documents/GitHub/markdown-viewer-extension/test/html-editable-parser.test.ts
git commit -m "feat: inherit html styles and map paragraph alignment"
```

---

## Task 4: Inline converter uses `node.style`
**Files:**
- Modify: `/Users/test/Documents/GitHub/markdown-viewer-extension/src/exporters/docx-inline-converter.ts`
- Create: `/Users/test/Documents/GitHub/markdown-viewer-extension/test/docx-inline-style.test.ts`

**Step 1: Add test**
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInlineConverter } from '../src/exporters/docx-inline-converter.ts';

const themeStyles: any = {
  default: { run: { font: 'Arial', size: 24 }, paragraph: { spacing: { before: 0, after: 0, line: 276 } } },
  characterStyles: { code: { font: 'Consolas', size: 20, background: 'F6F8FA' } },
  linkColor: '0000FF',
  tableStyles: { cell: { margins: { top: 80, right: 80, bottom: 80, left: 80 } } },
  paragraphStyles: {}
};

test('inline converter applies node.style', async () => {
  const converter = createInlineConverter({
    themeStyles,
    fetchImageAsBuffer: async () => ({ buffer: new ArrayBuffer(0), width: 0, height: 0 }),
    reportResourceProgress: () => {}
  });

  const runs = await converter.convertInlineNodes([{ type: 'text', value: 'Hi', style: { color: 'FF0000', bold: true, size: 28 } } as any]);
  const run: any = runs[0];
  assert.equal(run.options.color, 'FF0000');
  assert.equal(run.options.bold, true);
  assert.equal(run.options.size, 28);
});
```

**Step 2: Implement converter updates**
Merge `node.style` into parentStyle in both `convertInlineNodes` and `convertInlineNode`.

**Step 3: Run test (expect pass)**

**Step 4: Commit**
```bash
git add /Users/test/Documents/GitHub/markdown-viewer-extension/src/exporters/docx-inline-converter.ts \
        /Users/test/Documents/GitHub/markdown-viewer-extension/test/docx-inline-style.test.ts
git commit -m "feat: apply inline node style in docx converter"
```

---

## Task 5: Export pipeline uses preprocessor + allow `<style>` with tables
**Files:**
- Modify: `/Users/test/Documents/GitHub/markdown-viewer-extension/src/exporters/docx-exporter.ts`
- Modify: `/Users/test/Documents/GitHub/markdown-viewer-extension/src/utils/html-table-to-docx.ts`
- Create: `/Users/test/Documents/GitHub/markdown-viewer-extension/test/html-table-to-docx.test.ts`

**Step 1: Add test**
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHtmlTablesToDocxNodes } from '../src/utils/html-table-to-docx.ts';

const { DOMParser } = await import('linkedom');
globalThis.DOMParser = DOMParser;

test('tables parse when html contains style', () => {
  const html = `<style>td{border:1px solid #000}</style><table><tr><td>A</td></tr></table>`;
  const nodes = parseHtmlTablesToDocxNodes(html);
  assert.ok(nodes && nodes.length === 1);
});
```

**Step 2: Update html-table-to-docx**
```ts
// in containsOnlyTables
clone.querySelectorAll('style,script').forEach((node) => node.remove());
```

**Step 3: Update docx-exporter**
Use preprocessor for HTML:

```ts
import { preprocessHtmlForDocx } from '../utils/html-style-preprocessor';

if (node.type === 'html' && this.tableConverter) {
  const rawHtml = typeof node.value === 'string' ? node.value : '';
  const htmlValue = preprocessHtmlForDocx(rawHtml);

  const domTables = this.convertHtmlTablesFromDom(htmlValue);
  // ...
  const tableNodes = parseHtmlTablesToDocxNodes(htmlValue);
  // ...
  const editableAst = parseHtmlToEditableAst(htmlValue, { maxTableDepth: 3 });
  // ...
}
```

Also map paragraph alignment/spacing:

```ts
const nodeAlignment = (node as any).alignment;
const nodeSpacing = (node as any).spacing;
```

**Step 4: Run test (expect pass)**

**Step 5: Commit**
```bash
git add /Users/test/Documents/GitHub/markdown-viewer-extension/src/exporters/docx-exporter.ts \
        /Users/test/Documents/GitHub/markdown-viewer-extension/src/utils/html-table-to-docx.ts \
        /Users/test/Documents/GitHub/markdown-viewer-extension/test/html-table-to-docx.test.ts
git commit -m "feat: preprocess html for docx tables and alignment"
```

---

## Task 6: Wire new tests + run suite
**Files:**
- Modify: `/Users/test/Documents/GitHub/markdown-viewer-extension/test/all.test.mjs`

**Step 1: Add imports**
```js
import './css-specificity.test.ts';
import './html-style-preprocessor.test.ts';
import './docx-inline-style.test.ts';
import './html-table-to-docx.test.ts';
```

**Step 2: Run full tests**
```
node /Users/test/Documents/GitHub/markdown-viewer-extension/test/all.test.js
```
Expected: PASS

**Step 3: Commit**
```bash
git add /Users/test/Documents/GitHub/markdown-viewer-extension/test/all.test.mjs
git commit -m "test: add docx html/css best-practice tests"
```

---

## Test Cases / Scenarios
- `<style>` 不再作为正文输出到 DOCX。
- `<style>` 规则可作用到表格/嵌套表格并产生正确边框/对齐/填充。
- `!important`、后写规则、选择器特异性三者级联顺序正确。
- 内联样式优先级高于一般规则（除非 `!important`）。
- `div/p` 样式可继承到文本 runs，`text-align` 映射到段落对齐。

---

## Assumptions / Defaults
- 仅应用“可映射到 DOCX”的 CSS 属性；忽略布局类属性（flex/grid/position）。
- 不处理 `@media` / `@supports` 内规则（DOCX 无响应式语义）。
- 使用 `querySelectorAll` 来匹配选择器；无法匹配的选择器直接跳过。
