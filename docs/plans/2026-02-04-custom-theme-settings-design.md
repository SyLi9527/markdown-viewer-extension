# Custom Theme Settings (Chrome) Design

**Goal:** Add a Custom Theme editor in the Chrome popup settings that lets users adjust theme fields via form inputs (no raw JSON), save as “Custom”, and apply it as a selectable theme.

**Scope:** Chrome popup only (A). Data should persist in storage and be used when `themeId === 'custom'`. The Custom theme must be selectable in the theme dropdown and remain editable.

**Non-goals:** VSCode/Mobile UI; live JSON editor; visual theme preview page.

## Current Theme System (Summary)
- Theme is composed of **preset + schemes**: `fontScheme` + `layoutScheme` + `colorScheme` + `tableStyle` + `codeTheme` (+ optional `diagramStyle`).
- Presets in `src/themes/presets/*.json` reference scheme IDs in `src/themes/{layout-schemes,color-schemes,table-styles,code-themes}/*.json`.
- Runtime applies theme via `src/utils/theme-to-css.ts` → `loadAndApplyTheme(themeId)` and DOCX via `src/exporters/theme-to-docx.ts`.
- Chrome popup settings live in `chrome/src/popup/popup.html` + `src/ui/popup/settings-tab.ts`.

## User-Facing Requirements
- Provide a **Custom Theme** editor that uses **form fields** (not JSON textarea).
- Allow choosing a **base preset** and then overriding fields.
- **Save as Custom** (persist), **Apply**, **Restore last saved**.
- Add “Custom” option to theme dropdown when data exists; description should indicate base preset.

## Data Model (Custom Bundle)
Store a single “bundle” but keep it in structured form for merging with base preset.

```ts
interface CustomThemeBundle {
  basePresetId: string;
  overrides: {
    fontScheme?: Partial<Theme['fontScheme']>;
    diagramStyle?: 'normal' | 'handDrawn';
  };
  schemes: {
    layoutScheme?: Partial<LayoutScheme>;
    colorScheme?: Partial<ColorScheme>;
    tableStyle?: Partial<TableStyleConfig>;
    codeTheme?: Partial<CodeThemeConfig>;
  };
}
```

Storage keys (Chrome storage):
- `customThemeBundle`: the latest saved bundle
- `customThemeDraft`: optional in-progress edits (restore on reopen)

## UI Design (Chrome Popup)
Add a new section under the theme selector in `chrome/src/popup/popup.html`:

- **Custom Theme (collapsible)**
  - **Base preset** dropdown (existing theme list)
  - **Form groups** with “Advanced” toggles:
    1) Font
       - Common: body font, headings font, code font
       - Advanced: per-heading fonts (h1–h6)
    2) Layout
       - Common: body font size, line height, h1/h2 size
       - Advanced: h1–h6 spacing/alignment; block spacing/padding
    3) Color
       - Common: text primary, link/linkHover, code background, blockquote border, table header/border/zebra colors
       - Advanced: text secondary/muted, heading colors h1–h6
    4) Table
       - Common: border width/style, header bold, cell padding, zebra on/off
       - Advanced: headerTop/headerBottom/rowBottom/lastRowBottom specifics, header fontSize
    5) Code Highlight
       - Common: select codeTheme preset
       - Advanced: token color map
    6) Diagram
       - Common: diagramStyle (normal/handDrawn)

Actions:
- **Generate from current** (fills form using current preset + scheme values)
- **Apply** (validate, persist draft, set `themeId='custom'`)
- **Save** (persist bundle as custom)
- **Restore last saved**

## Validation & Error Handling
- Validate numeric fields (pt sizes, line height) and color hex strings.
- If invalid: show inline error + block Apply/Save.
- If `customThemeBundle` is missing or invalid at apply time: fallback to `basePresetId` and show warning.

## Theme Application Flow (Custom)
Modify `loadAndApplyTheme(themeId)` in `src/utils/theme-to-css.ts`:
- If `themeId !== 'custom'` → existing behavior.
- If `themeId === 'custom'`:
  1) Read `customThemeBundle` from `platform.storage`.
  2) Load base preset + scheme files as today.
  3) Deep-merge `overrides` + `schemes` into the base objects.
  4) Continue with CSS generation + renderer config.

For DOCX, update `loadThemeForDOCX` similarly to use custom bundle when `themeId === 'custom'`.

## i18n
Add new strings for:
- “Custom Theme”, “Base preset”, “Apply”, “Save”, “Restore”, “Advanced”, and validation messages.

## Testing Strategy
- Unit: deep-merge correctness with partial overrides.
- Unit: validation rules for numeric/color inputs.
- Manual: create custom theme, apply, reload popup, ensure dropdown shows “Custom” and it re-applies.
- Manual: switch back to a preset and ensure custom still available.

## Open Questions
- Should `customThemeBundle` also be applied in VSCode/Mobile later? (design supports it)
- Do we need a “Reset Custom” button to clear storage keys?

## Affected Files (expected)
- `chrome/src/popup/popup.html`
- `src/ui/popup/settings-tab.ts`
- `src/utils/theme-to-css.ts`
- `src/exporters/theme-to-docx.ts`
- `src/types/theme.ts` (if additional typing helpers are needed)
- `src/types/settings.ts` (optional if we choose to store in settings)
- `src/_locales/*/messages.json`
