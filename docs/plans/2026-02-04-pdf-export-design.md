# PDF Export (Preview 1:1) Design

**Goal:** Add PDF export for Chrome/Firefox/Mobile using the existing preview HTML as the 1:1 source of truth, with a format selector on the export button.

**Scope:** Chrome/Firefox webviews and Mobile app (Flutter + WebView). Local-only export. PDF output should match the preview layout, theme, and content. Default export remains Word (DOCX).

**Non-goals:** VS Code support, server-side conversion, DOCX→PDF conversion, custom page-size UI, or fully automated cloud fallback.

## Current Export System (Summary)
- DOCX export is implemented in `src/exporters/docx-exporter.ts` and triggered via toolbar download button in `chrome/src/webview/ui/toolbar.ts`.
- Shared helper `exportDocxFlow` lives in `src/core/viewer/viewer-host.ts` and is used by VS Code and Mobile webviews.
- Chrome/Firefox have a separate “Print” button (local files only) that calls `window.print()`.
- Mobile export is routed through `window.exportDocx()` and Flutter bridge logic in `mobile/lib/main.dart`.

## User-Facing Requirements
- Export button shows a **format picker** (Word / PDF). Default remains Word; remember last choice.
- PDF output should be **WYSIWYG with preview** (same theme, layout, content).
- Export should show progress/processing state and recover gracefully on failures.
- No uploads; local-only export. Online conversion is deferred to backlog.

## Approach (Chosen)
**Preview HTML → Pagination Engine → Print/Save PDF**
- Clone the preview DOM (`#markdown-content` inside `#markdown-page`) to an offscreen container.
- Apply dedicated **print CSS** for PDF (page size, margins, break rules, typography fixes).
- Use **Paged.js** (dynamic import) to paginate the cloned HTML.
- Open a lightweight print view (new window/iframe) with the paginated HTML and call `window.print()`.
- On mobile, notify Flutter to trigger platform print/share flow after pagination.

This keeps PDF output aligned to preview and avoids DOCX re-interpretation.

## Architecture & Flow
1. **exportPdfFlow** (new, in `viewer-host.ts`)
   - Inputs: markdown, filename, renderer, onProgress/onSuccess/onError
   - Fetch current preview DOM + theme config
   - Delegate to `PdfExporter`

2. **PdfExporter** (new, `src/exporters/pdf-exporter.ts`)
   - Clone preview DOM into offscreen container (`data-export="pdf"`)
   - Wait for fonts/images/diagrams (e.g., `document.fonts.ready` + image load)
   - Dynamically load Paged.js and paginate
   - Emit a “print-ready” HTML string

3. **Print/Save**
   - **Chrome/Firefox:** open a print window/iframe, inject HTML + CSS, call `window.print()`
   - **Mobile:** send bridge message `EXPORT_PDF_READY` with HTML payload (or a token), Flutter triggers system print/share

## UI & UX
- Replace “download” with a **format dropdown** (Word / PDF) anchored to the existing button.
- Remember last selection via `platform.storage` (key: `lastExportFormat`).
- Word remains default if no preference exists.
- Indeterminate progress state for PDF (Paged.js doesn’t report granular progress).
- Error dialog with **Retry** and “Online conversion (coming soon)” placeholder.

## Print CSS Rules (PDF)
- Define `@page` size (default A4) and margins (theme-aligned).
- Normalize zoom to 100% in export container (preview zoom should not affect PDF).
- Apply page-break rules for headings, tables, code blocks, blockquotes, and images.
- Ensure background colors and table borders match preview.

## Mobile Notes
- Add `export_pdf` item in Flutter menu, invoke `window.exportPdf()`.
- WebView emits `EXPORT_PDF_*` bridge events for progress/errors.
- Flutter uses platform print/share (exact plugin/API TBD).
- If mobile print is not available, show error with “Save HTML” fallback (optional future).

## Error Handling
- If pagination fails: show error and allow retry.
- If print window blocked: show guidance to allow popups or use the Print button.
- If resources not ready (images/fonts): retry after preloading.
- Optional online conversion prompt is deferred to backlog.

## Testing Strategy
- Manual: compare PDF vs preview for documents with tables, code blocks, diagrams, math, images.
- Manual: large file performance (100+ diagrams), and remote/local sources.
- Mobile: verify export action, progress UI, and share flow.
- Regression: DOCX export and print button unaffected.

## Open Questions
- Best mobile PDF path: native printing plugin vs WebView print bridge.
- Default page size for PDF (A4 vs Letter) and how to choose per locale.
- How to handle “full screen” and “narrow” layout modes in export (recommend keep layout mode, reset zoom).

## Affected Files (Expected)
- `src/core/viewer/viewer-host.ts` (new `exportPdfFlow`)
- `src/exporters/pdf-exporter.ts` (new)
- `src/core/document-utils.ts` (new `toPdfFilename` helper)
- `chrome/src/webview/ui/toolbar.ts` (format dropdown + PDF export trigger)
- `src/ui/styles.css` (dropdown styles + print-specific export styles)
- `mobile/src/webview/main.ts` (window.exportPdf + bridge events)
- `mobile/lib/main.dart` (menu item + bridge handling)
- `src/_locales/*/messages.json` (new UI strings)

## Backlog Items
- Optional online PDF conversion fallback (service selection + privacy prompt)
- Advanced PDF settings (page size, margins, page numbering)
- PDF generation without print dialog (true file download)
