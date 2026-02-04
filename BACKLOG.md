# Backlog

## HTML Table DOM Rendering Follow-ups
- Add table whitelist sanitizer (tags, attributes, style allowlist) to reduce risk while keeping layout control.
- Consider a user setting for HTML table render mode (dom vs image) with auto-fallback for large/complex tables.
- Add optional "prefer theme styles" toggle (theme CSS vs inline style priority).
- Add table render decision heuristics (complex HTML detection, thresholds).
- Add documentation for HTML table behavior and recommendations.

## DOCX Layout Mapping Parity
- Map layoutScheme.blocks (list, listItem, blockquote, codeBlock, table, horizontalRule) to DOCX spacing/indent so Word output matches preview layout.
- Align blockquote padding/indent and list spacing with layoutScheme settings.
- Add tests to validate DOCX spacing/indent reflects layoutScheme values.

## Table Alignment Preview Rendering Bug
- Symptom: when table alignment is left/right/justify, the "paper" background/shadow and bottom divider appear truncated; only center alignment renders correctly.
- Likely cause: `processTablesForWordCompatibility()` sets `align` on `<table>` and its wrapper `<div>`. `align="left|right"` causes legacy float behavior, so the table is taken out of normal flow and `#markdown-content` does not expand to contain it.
- Repro: set table alignment to left/right/justify in settings and render a table with background/borders; observe parent background ends early and table border/divider missing; switch to center and issue disappears.
- Fix direction: avoid float effects in preview by overriding `float: none` for tables and wrappers, or wrap with `display: flow-root`/clear floats; alternatively, set `align` only for export paths and rely on CSS (`data-table-align`) for preview alignment.
- Acceptance: left/right/justify tables do not truncate `#markdown-content` background or shadows; border/divider renders consistently across all alignments; no regression to Word alignment output.

## Testing
- Add sanitizer-specific test cases once whitelist is implemented.
- Add DOM/image render mode tests if settings are added.

## PDF Export Follow-ups
- Add optional online PDF conversion fallback (service selection, privacy prompt, and opt-in settings).
- Add PDF export settings (page size, margins, page numbering, filename template).
- Investigate true PDF file generation without print dialog (browser-safe download).
- Decide mobile-native PDF printing/preview implementation (plugin/API selection).
