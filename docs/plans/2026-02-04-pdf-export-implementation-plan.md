# PDF Export (Preview 1:1) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add PDF export for Chrome/Firefox/Mobile using the current preview HTML as the WYSIWYG source, with a format selector on export.

**Architecture:** Build a PDF exporter that clones the preview DOM, applies print CSS, paginates with Paged.js, then prints/saves. Web uses a print window; mobile sends the paginated HTML to Flutter for HTML→PDF and sharing.

**Tech Stack:** TypeScript, Paged.js (dynamic import), existing toolbar UI, Flutter `flutter_html_to_pdf_plus` + `share_plus`.

---

### Task 1: Add PDF filename helper + tests

**Files:**
- Modify: `src/core/document-utils.ts`
- Create: `test/document-utils.test.ts`

**Step 1: Write the failing test**

```ts
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
```

**Step 2: Run test to verify it fails**

Run: `npx fibjs test/document-utils.test.ts`
Expected: FAIL (function missing).

**Step 3: Write minimal implementation**

```ts
export function toPdfFilename(filename: string): string {
  let pdfFilename = filename || 'document.pdf';
  if (pdfFilename.toLowerCase().endsWith('.md')) {
    pdfFilename = pdfFilename.slice(0, -3) + '.pdf';
  } else if (pdfFilename.toLowerCase().endsWith('.markdown')) {
    pdfFilename = pdfFilename.slice(0, -9) + '.pdf';
  } else if (!pdfFilename.toLowerCase().endsWith('.pdf')) {
    pdfFilename = pdfFilename + '.pdf';
  }
  return pdfFilename;
}
```

**Step 4: Run test to verify it passes**

Run: `npx fibjs test/document-utils.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add test/document-utils.test.ts src/core/document-utils.ts
git commit -m "feat: add pdf filename helper"
```

---

### Task 2: Add PDF export styles helper + tests

**Files:**
- Create: `src/exporters/pdf-export-styles.ts`
- Create: `test/pdf-export-styles.test.ts`

**Step 1: Write the failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { getPdfExportCss } from '../src/exporters/pdf-export-styles';

test('pdf export css includes @page and export root selector', () => {
  const css = getPdfExportCss({ pageSize: 'A4', margin: '18mm' });
  assert.match(css, /@page\s*\{/);
  assert.match(css, /\[data-export=\"pdf\"\]/);
});
```

**Step 2: Run test to verify it fails**

Run: `npx fibjs test/pdf-export-styles.test.ts`
Expected: FAIL (module missing)

**Step 3: Write minimal implementation**

```ts
export function getPdfExportCss({ pageSize, margin }: { pageSize: string; margin: string }): string {
  return `
@page { size: ${pageSize}; margin: ${margin}; }
[data-export="pdf"] { zoom: 1 !important; }
[data-export="pdf"] img { max-width: 100%; }
[data-export="pdf"] pre, [data-export="pdf"] blockquote, [data-export="pdf"] table {
  break-inside: avoid;
}
`;
}
```

**Step 4: Run test to verify it passes**

Run: `npx fibjs test/pdf-export-styles.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add test/pdf-export-styles.test.ts src/exporters/pdf-export-styles.ts
git commit -m "feat: add pdf export css helper"
```

---

### Task 3: Add PdfExporter core (paged HTML builder)

**Files:**
- Create: `src/exporters/pdf-exporter.ts`
- Modify: `src/types/index.ts`

**Step 1: Write the failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPdfExportHtml } from '../src/exporters/pdf-exporter';

const html = '<div id="markdown-content"><h1>Title</h1></div>';

test('buildPdfExportHtml wraps content in export root', async () => {
  const result = await buildPdfExportHtml(html, { pageSize: 'A4', margin: '18mm' });
  assert.match(result, /data-export=\"pdf\"/);
});
```

**Step 2: Run test to verify it fails**

Run: `npx fibjs test/pdf-exporter.test.ts`
Expected: FAIL (module missing)

**Step 3: Write minimal implementation**

```ts
import { getPdfExportCss } from './pdf-export-styles';

export async function buildPdfExportHtml(rawHtml: string, options: { pageSize: string; margin: string }): Promise<string> {
  const css = getPdfExportCss(options);
  return `<!doctype html><html><head><style>${css}</style></head><body data-export="pdf">${rawHtml}</body></html>`;
}
```

**Step 4: Run test to verify it passes**

Run: `npx fibjs test/pdf-exporter.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/exporters/pdf-exporter.ts test/pdf-exporter.test.ts src/types/index.ts
git commit -m "feat: add pdf exporter html builder"
```

---

### Task 4: Add exportPdfFlow and wire core to viewer

**Files:**
- Modify: `src/core/viewer/viewer-host.ts`
- Modify: `src/core/document-utils.ts`

**Step 1: Write the failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { toPdfFilename } from '../src/core/document-utils';

test('toPdfFilename defaults to document.pdf', () => {
  assert.equal(toPdfFilename(''), 'document.pdf');
});
```

**Step 2: Run test to verify it fails**

Run: `npx fibjs test/document-utils.test.ts`
Expected: FAIL until helper default is added

**Step 3: Implement exportPdfFlow**

```ts
export async function exportPdfFlow(options: PdfExportFlowOptions): Promise<void> {
  const { filename, onSuccess, onError } = options;
  try {
    const pdfFilename = toPdfFilename(filename);
    const PdfExporterModule = await import('../../exporters/pdf-exporter');
    await PdfExporterModule.exportPdfFromPreview({ filename: pdfFilename });
    onSuccess?.(pdfFilename);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    onError?.(errMsg);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx fibjs test/document-utils.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/viewer/viewer-host.ts src/core/document-utils.ts test/document-utils.test.ts
git commit -m "feat: add pdf export flow"
```

---

### Task 5: Chrome/Firefox toolbar format selector + export hook

**Files:**
- Modify: `chrome/src/webview/ui/toolbar.ts`
- Modify: `src/ui/styles.css`
- Modify: `chrome/src/webview/viewer-main.ts`

**Step 1: Write the failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { getExportFormatFromStorage } from '../src/ui/export-format';

test('export format defaults to docx', async () => {
  const format = await getExportFormatFromStorage({ get: async () => ({}) });
  assert.equal(format, 'docx');
});
```

**Step 2: Run test to verify it fails**

Run: `npx fibjs test/export-format.test.ts`
Expected: FAIL (module missing)

**Step 3: Implement selector & handlers**

```ts
// toolbar.ts (sketch)
const exportBtn = document.getElementById('download-btn');
const exportMenu = document.getElementById('export-menu');
exportBtn?.addEventListener('click', toggleMenu);
exportMenu?.addEventListener('click', async (e) => {
  const target = e.target as HTMLElement;
  const format = target.dataset.format as 'docx' | 'pdf';
  await saveExportFormat(format);
  format === 'docx' ? await docxExporter.exportToDocx(...) : await pdfExporter.exportToPdf(...);
});
```

**Step 4: Run test to verify it passes**

Run: `npx fibjs test/export-format.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add chrome/src/webview/ui/toolbar.ts src/ui/styles.css chrome/src/webview/viewer-main.ts test/export-format.test.ts src/ui/export-format.ts
git commit -m "feat: add export format selector"
```

---

### Task 6: Mobile export hook + HTML→PDF conversion

**Files:**
- Modify: `mobile/src/webview/main.ts`
- Modify: `mobile/lib/main.dart`
- Modify: `mobile/pubspec.yaml`

**Step 1: Write the failing test**

```dart
// Minimal widget test verifying PDF menu item exists
```

**Step 2: Run test to verify it fails**

Run: `flutter test`
Expected: FAIL (menu item missing)

**Step 3: Implement mobile flow**

```dart
// main.dart
case 'export_pdf':
  _exportPdf();
  break;

Future<void> _exportPdf() async {
  await _controller.runJavaScript('window.exportPdf()');
}

// On EXPORT_PDF_READY, generate PDF with flutter_html_to_pdf_plus
final targetDir = (await getTemporaryDirectory()).path;
final pdfFile = await FlutterHtmlToPdfPlus.convertFromHtmlContent(html, targetDir, filename);
await Share.shareXFiles([XFile(pdfFile.path)]);
```

**Step 4: Run test to verify it passes**

Run: `flutter test`
Expected: PASS

**Step 5: Commit**

```bash
git add mobile/src/webview/main.ts mobile/lib/main.dart mobile/pubspec.yaml
git commit -m "feat: add mobile pdf export"
```

---

### Task 7: i18n strings for PDF export

**Files:**
- Modify: `src/_locales/*/messages.json`

**Step 1: Add new keys to EN**

```json
"export_format_title": { "message": "Export format" },
"export_format_word": { "message": "Word (.docx)" },
"export_format_pdf": { "message": "PDF (.pdf)" },
"export_pdf_failed_alert": { "message": "PDF export failed" }
```

**Step 2: Run localization checks**

Run: `node scripts/check-missing-keys.js`
Expected: PASS

**Step 3: Commit**

```bash
git add src/_locales
git commit -m "chore: add pdf export strings"
```

---

### Task 8: QA + regression

**Step 1: Manual checks**
- Chrome/Firefox: export Word and PDF from same doc; verify PDF layout matches preview.
- Mobile: export PDF and verify share flow produces a PDF file.

**Step 2: Run tests**
- `pnpm run typecheck` (expect existing baseline failures unless fixed)
- `npx fibjs test/all.test.js`

**Step 3: Commit (if any QA fixes)**

```bash
git add ...
git commit -m "fix: address pdf export qa issues"
```

---

## Notes
- Dynamic import `pagedjs` inside exporter to avoid increasing initial bundle size.
- Keep export markup isolated to avoid side effects on the live preview.
- Persist export format choice via `platform.storage` key `lastExportFormat`.
