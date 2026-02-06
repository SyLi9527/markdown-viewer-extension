# HTML mixed content export as editable DOCX (tables + text)

Date: 2026-02-06
Status: Approved (design)

## Summary
Enable HTML fragments that mix tables and text to export as fully editable DOCX
content across Word, Google Docs, LibreOffice, WPS, and OnlyOffice by defining
and enforcing a stable HTML/CSS subset, converting it into a structured
intermediate model, and generating DOCX elements without image fallbacks.

## Goals
- Export HTML tables as editable DOCX tables even when mixed with text blocks.
- Preserve layout and styling within a supported HTML/CSS subset.
- Support nested tables with bounded depth and predictable behavior.
- Maintain existing Markdown table and image export paths.

## Non-goals
- Full-fidelity support for arbitrary HTML/CSS.
- Perfect 1:1 rendering of advanced layout features (e.g., float, grid,
  positioning, filters, animations).
- Cross-editor pixel-identical output beyond the defined subset.

## Supported HTML/CSS subset (initial)
Blocks:
- table, thead, tbody, tfoot, tr, th, td
- p, div, span, br, hr
- ul, ol, li

Inline:
- strong, em, u, code, a

Styles (inline or computed, normalized):
- font-family, font-size, font-weight, font-style
- color, background-color
- text-align, vertical-align, line-height
- border (width, style, color), padding
- text-decoration (underline)

Ignored or downgraded:
- position, float, display variants (flex/grid), z-index
- width/height constraints beyond table cell span handling
- filters, transforms, animations, pseudo elements

## Architecture

### Entry point
In docx export, when encountering AST nodes of type `html`, attempt a new
HTML-to-editable conversion path before falling back to existing image-based
plugin rendering.

### Pipeline
1) DOM parse + sanitize
- DOMParser on the HTML fragment
- Remove unsupported tags while preserving child text nodes
- Strip unsupported styles, normalize values

2) DOM to editable model
- Build a structured model:
  - blocks: paragraph, list, table
  - inlines: text, strong, em, u, code, link
  - table: rows, cells, spans, cell blocks
- Nested table is allowed inside a cell, with max depth (e.g., 3)

3) Editable model to DOCX
- Paragraphs -> Paragraph/TextRun
- Lists -> List converter
- Tables -> DOCX Table (cells can contain block sequences)

### Fallbacks
- If DOM parse fails: revert to existing HTML plugin (image or placeholder)
- If a block fails conversion: downgrade that block to plain text paragraph
- Record warnings for unsupported tags/styles

## Components and file changes

New modules:
- src/utils/html-editable-model.ts
  - types for editable model and helpers
- src/utils/html-editable-parser.ts
  - DOM parse/sanitize + model builder
- src/exporters/docx-html-editable.ts
  - model -> DOCX conversion

Updates:
- src/exporters/docx-exporter.ts
  - `convertNode` path for html nodes to call new converter
- src/utils/table-dom-extractor.ts
  - allow cell content to be blocks (not just text) or provide helper to
    extract nested model from cell nodes

## Detailed behavior

### Mixed content ordering
- Walk DOM body and emit block sequence in document order.
- Coalesce adjacent text nodes into a single paragraph.
- Keep explicit block elements as separators.

### Tables
- Preserve rowspan/colspan and cell styles from supported subset.
- Nested tables are emitted as block children inside the cell.
- If nested depth exceeds limit, replace nested table with its text content and
  add a warning entry.

### Style mapping rules
- Normalize units (px/pt) and apply conversion for DOCX.
- Unrecognized color formats are ignored with warnings.
- Bold/italic/underline are inferred from tags and styles.

## Error handling and telemetry
- Collect warnings into an export report (console log or in-memory list for UI).
- Fail-soft: avoid aborting the whole export for isolated failures.

## Testing plan
- Unit tests for DOM -> model conversion (tags, styles, mixed ordering).
- Unit tests for table conversion (spans, nested tables, borders, padding).
- E2E export fixtures for Word, Google Docs, LibreOffice comparison.

## Migration and compatibility
- No change to Markdown table export.
- HTML fragments still render as images when outside the supported subset or
  when parsing fails.

## Open questions
- How to expose warning list to UI (export report vs console only)?
- Depth limit default for nested tables (2 vs 3).
- Minimum style subset for link rendering (color + underline only?).
