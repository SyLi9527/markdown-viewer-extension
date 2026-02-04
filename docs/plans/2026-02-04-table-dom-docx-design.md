# Table DOM Rendering + High-Fidelity DOCX Export (Design)

Date: 2026-02-04
Owner: codex
Status: Proposed

## Summary

We will replace image-based table rendering with DOM-based tables in the Markdown viewer and export those tables to DOCX as native table structures. The rendered HTML tables must match the previous image output 1:1 (the former HtmlPlugin renderer output is the gold standard). The DOCX output must preserve complex layout, borders, backgrounds, and nested tables with high fidelity.

## Goals

- Render Markdown, HTML, and plugin-emitted HTML tables as real DOM tables (not images).
- Match the previous image-based render output 1:1 in visual appearance.
- Export tables to DOCX as native table structures (no rasterization).
- Support nested tables, col/row spans, custom borders, background colors, and layout.
- Provide deterministic, testable rendering and export behavior.

## Non-goals

- Full CSS feature parity (e.g., transforms, shadows, gradients, filters) in DOCX.
- Perfect fidelity for background images or complex CSS effects.
- Re-implementing Word layout engine behaviors.

## Constraints

- The new DOM rendering must visually match the legacy image output (pixel-diff tolerance).
- Cross-platform behavior (Chrome/VSCode/Mobile) must be consistent.
- Must integrate with current Markdown pipeline and DOCX exporter.

## Current State (Relevant Files)

- HTML rendering pipeline: `src/core/markdown-processor.ts`
- HTML plugin: `src/plugins/html-plugin.ts`
- Table merge utilities: `src/utils/table-merge-utils.ts`
- Table structure analyzer: `src/utils/table-structure-analyzer.ts`
- Table styles: `src/themes/table-styles/*.json`
- Theme -> CSS: `src/utils/theme-to-css.ts`
- DOCX export: `src/exporters/docx-exporter.ts`
- DOCX table conversion: `src/exporters/docx-table-converter.ts`
- HTML table parsing (current): `src/utils/html-table-to-docx.ts`

## Proposed Architecture

### 1) Table DOM Model (TDM)

Introduce a unified intermediate representation that captures DOM-computed table structure and style:

```
TableDomModel {
  table: { width, layout, borderCollapse, background, margin, padding }
  columns: [{ width }]
  rows: [{ height, background }]
  cells: [
    {
      row, col, rowspan, colspan,
      padding, border, background,
      textAlign, verticalAlign,
      font: { family, size, weight, style, color, lineHeight },
      content: [inline + block],
      nestedTables: [TableDomModel]
    }
  ]
}
```

This is derived from computed styles and normalized structure, not from raw Markdown AST.

### 2) DOM Rendering Context (offscreen)

Create a consistent offscreen render container (or iframe) that loads the same CSS and theme as the main viewer. This ensures DOM tables render identically to the legacy image output. It also provides a safe environment for computed style extraction.

Key points:
- Load theme CSS, fonts, container width, zoom.
- Apply existing `processTablesForWordCompatibility` if needed.
- Ensure the environment matches legacy HtmlPlugin rendering context.

### 3) DOM -> TDM Extraction

Traverse each `<table>` in the offscreen DOM, normalize its structure, and extract computed styles:
- Use `getComputedStyle` for borders, padding, background, text, alignment.
- Record explicit row/col spans based on rendered layout.
- Resolve nested tables recursively.

### 4) TDM -> DOCX Conversion

Convert TDM to docx `Table/TableRow/TableCell`:
- Map borders, padding, background, alignment, and fonts.
- Respect rowspan/colspan from the model.
- For nested tables, insert child `Table` inside parent `TableCell`.

### 5) Visual Regression Harness

Introduce a pixel-diff mode that compares old image output vs new DOM output for the same table HTML. This enforces 1:1 fidelity.

## Detailed Mapping Rules

### Structure
- DOM `table/tr/th/td` => DOCX `Table/TableRow/TableCell`.
- Row and column spans taken from normalized cell matrix.

### Layout
- `table-layout: fixed|auto` => DOCX `TableLayoutType.FIXED|AUTOFIT`.
- Table width and col widths use computed pixel values when explicit.

### Borders
- Read `border-*-width/style/color` per cell from computed style.
- Map to DOCX border size (eighths of a point) and style.
- For `border-collapse: collapse`, assign the resolved edge border to the cell edge.

### Backgrounds
- Cell background color => DOCX cell shading.
- Row background (zebra stripes) expanded to all cells in the row.

### Padding
- Cell `padding` => DOCX cell margins.

### Text
- `font-family`, `font-size`, `font-weight`, `font-style`, `color`, `line-height` mapped to TextRun.
- `text-align` => Paragraph alignment.
- `vertical-align` => TableCell verticalAlign.

### Nested Tables
- Cell content can include nested `Table` objects; Word supports nested tables.
- Provide a fallback option to flatten nested tables when needed.

### Degradation Policy
- Ignore `border-radius`, `box-shadow`, `transform`, `filter`, `background-image`.
- If color alpha is present, pre-blend with table background.

## Integration Changes

### HTML Plugin
- Do not render tables as images.
- Mark tables in HTML output with `data-table-dom` for extraction.

### Markdown Pipeline
- Add a small rehype pass to ensure each `<table>` has a stable ID for extraction.

### DOCX Exporter
- When encountering HTML that contains tables, use DOM -> TDM -> DOCX conversion.
- Fallback to `html-table-to-docx` when DOM extraction is unavailable.

## Performance

- Cache TDM by (table HTML hash + theme id + container width).
- Chunk extraction for very large tables to avoid blocking UI.
- Optionally defer extraction until export time (if live DOM already exists).

## Testing & Validation

### Visual Diff Tests
- Compare old image output vs new DOM output for a fixed set of tables.
- Use pixel-diff thresholds (e.g., <0.5%).

### DOCX Unit Tests
- Validate rowspan/colspan, border widths/colors, padding, backgrounds.
- Nested table structure tests.

### Fixtures
- Maintain `fixtures/tables/` for complex tables: colgroup, nested, row/col spans, varied borders.

## Risks & Mitigations

- Word rendering differences: provide a flatten fallback.
- CSS features unsupported in DOCX: clear degradation policy + docs.
- Cross-platform CSS differences: offscreen render environment with shared CSS and fonts.

## Rollout Plan

1) Implement TDM + DOM extraction for non-nested tables.
2) Add DOCX mapping with borders/background/alignments.
3) Add nested tables and colgroup support.
4) Add visual diff harness and regression fixtures.
5) Performance optimizations and caching.

## Open Questions

- Exact pixel-diff threshold for 1:1 match.
- Strategy for async font loading before DOM extraction.
- Preferred fallback behavior for unsupported CSS.
