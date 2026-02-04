# Findings & Decisions
<!-- 
  WHAT: Your knowledge base for the task. Stores everything you discover and decide.
  WHY: Context windows are limited. This file is your "external memory" - persistent and unlimited.
  WHEN: Update after ANY discovery, especially after 2 view/browser/search operations (2-Action Rule).
-->

## Requirements
<!-- 
  WHAT: What the user asked for, broken down into specific requirements.
  WHY: Keeps requirements visible so you don't forget what you're building.
  WHEN: Fill this in during Phase 1 (Requirements & Discovery).
  EXAMPLE:
    - Command-line interface
    - Add tasks
    - List all tasks
    - Delete tasks
    - Python implementation
-->
<!-- Captured from user request -->
- Replace DOCX theme mapping checkboxes with numeric inputs (heading scale/spacing/alignment, code font size, table border width/padding).
- Empty input should keep theme default; allow 0 to force zero.
- Keep sanitizer deferred (backlog only).
- Update UI in Chrome/Firefox popup and VSCode settings panel.
- Update DOCX export mapping to honor numeric overrides and add tests.

## Research Findings
<!-- 
  WHAT: Key discoveries from web searches, documentation reading, or exploration.
  WHY: Multimodal content (images, browser results) doesn't persist. Write it down immediately.
  WHEN: After EVERY 2 view/browser/search operations, update this section (2-Action Rule).
  EXAMPLE:
    - Python's argparse module supports subcommands for clean CLI design
    - JSON module handles file persistence easily
    - Standard pattern: python script.py <command> [args]
-->
<!-- Key discoveries during exploration -->
- Existing DOCX theme mapping logic was reworked to numeric override helpers; tests need updates.
- UI currently uses checkbox-based mapping and must be replaced with numeric fields.
- VSCode and popup settings require new numeric inputs and alignment dropdown wiring.
- Added numeric DOCX override inputs in popup/VSCode and updated settings storage wiring.
- Added new en i18n keys for numeric overrides.
- Added missing numeric override keys to all locale files (copied en strings).
- Replaced EN fallback strings with locale translations for DOCX mapping labels.
- Removed unused legacy DOCX mapping/hr_page_break translation keys.

## Technical Decisions
<!-- 
  WHAT: Architecture and implementation choices you've made, with reasoning.
  WHY: You'll forget why you chose a technology or approach. This table preserves that knowledge.
  WHEN: Update whenever you make a significant technical choice.
  EXAMPLE:
    | Use JSON for storage | Simple, human-readable, built-in Python support |
    | argparse with subcommands | Clean CLI: python todo.py add "task" |
-->
<!-- Decisions made with rationale -->
| Decision | Rationale |
|----------|-----------|
| Use heading scale (%) + spacing before/after (pt) + alignment dropdown | Expresses layout intent directly and maps cleanly to DOCX units |
| Use code font size (pt) + table border width/padding (pt) | Matches DOCX units and allows precise overrides |

## Issues Encountered
<!-- 
  WHAT: Problems you ran into and how you solved them.
  WHY: Similar to errors in task_plan.md, but focused on broader issues (not just code errors).
  WHEN: Document when you encounter blockers or unexpected challenges.
  EXAMPLE:
    | Empty file causes JSONDecodeError | Added explicit empty file check before json.load() |
-->
<!-- Errors and how they were resolved -->
| Issue | Resolution |
|-------|------------|
| npx fibjs exits with code 1 in this environment | Tests could not be executed; noted in progress |

## Resources
<!-- 
  WHAT: URLs, file paths, API references, documentation links you've found useful.
  WHY: Easy reference for later. Don't lose important links in context.
  WHEN: Add as you discover useful resources.
  EXAMPLE:
    - Python argparse docs: https://docs.python.org/3/library/argparse.html
    - Project structure: src/main.py, src/utils.py
-->
<!-- URLs, file paths, API references -->
- src/exporters/docx-theme-mapping.ts
- src/exporters/docx-exporter.ts
- chrome/src/popup/popup.html
- src/ui/popup/settings-tab.ts
- vscode/src/webview/settings-panel.ts

## Visual/Browser Findings
<!-- 
  WHAT: Information you learned from viewing images, PDFs, or browser results.
  WHY: CRITICAL - Visual/multimodal content doesn't persist in context. Must be captured as text.
  WHEN: IMMEDIATELY after viewing images or browser results. Don't wait!
  EXAMPLE:
    - Screenshot shows login form has email and password fields
    - Browser shows API returns JSON with "status" and "data" keys
-->
<!-- CRITICAL: Update after every 2 view/browser operations -->
<!-- Multimodal content must be captured as text immediately -->
- Screenshot shows settings UI for DOCX mapping should be numeric inputs, not checkboxes.
- Screenshot context: HTML table borders appear missing in markdown render while DOCX export shows borders.

---
<!-- 
  REMINDER: The 2-Action Rule
  After every 2 view/browser/search operations, you MUST update this file.
  This prevents visual information from being lost when context resets.
-->
*Update this file after every 2 view/browser/search operations*
*This prevents visual information from being lost*
