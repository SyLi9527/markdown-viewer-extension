# Custom Theme Settings (Chrome) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Chrome popup Custom Theme editor (form-based, no JSON textarea) that saves a custom theme bundle, applies it when `themeId='custom'`, and keeps “Custom” selectable in the theme dropdown.

**Architecture:** Introduce a `CustomThemeBundle` and pure merge/validation utilities, then integrate them into theme loading (CSS + DOCX) and the popup settings UI. The UI writes a structured bundle to storage; runtime merges it over a base preset at render time.

**Tech Stack:** TypeScript, node:test, fibjs runner, Chrome MV3 popup (HTML + TS), existing theme system (theme-to-css, theme-to-docx).

---

### Task 1: Add Custom Theme bundle types + merge/validation utilities

**Files:**
- Create: `src/utils/custom-theme.ts`
- Modify: `src/types/theme.ts`
- Modify: `src/types/index.ts`
- Test: `test/custom-theme.test.ts`
- Modify: `test/all.test.js`

**Step 1: Write the failing tests**

Create `test/custom-theme.test.ts`:

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { mergeCustomTheme, validateCustomThemeBundle } from '../src/utils/custom-theme.ts';

const baseTheme = {
  fontScheme: {
    body: { fontFamily: 'Times New Roman' },
    headings: { fontFamily: 'Georgia' },
    code: { fontFamily: 'Monaco' }
  },
  layoutScheme: 'document',
  colorScheme: 'neutral',
  tableStyle: 'grid',
  codeTheme: 'light-clean',
  diagramStyle: 'normal'
};

const baseLayout = {
  id: 'document',
  name: 'Document',
  name_en: 'Document',
  description: 'Base',
  body: { fontSize: '12pt', lineHeight: 1.5 },
  headings: {
    h1: { fontSize: '22pt', spacingBefore: '0pt', spacingAfter: '12pt' },
    h2: { fontSize: '18pt', spacingBefore: '16pt', spacingAfter: '8pt' },
    h3: { fontSize: '16pt', spacingBefore: '14pt', spacingAfter: '7pt' },
    h4: { fontSize: '14pt', spacingBefore: '12pt', spacingAfter: '6pt' },
    h5: { fontSize: '13pt', spacingBefore: '10pt', spacingAfter: '5pt' },
    h6: { fontSize: '12pt', spacingBefore: '8pt', spacingAfter: '4pt' }
  },
  code: { fontSize: '10pt' },
  blocks: {
    paragraph: { spacingAfter: '10pt' },
    list: { spacingAfter: '13pt' },
    listItem: { spacingAfter: '3pt' },
    blockquote: { spacingBefore: '10pt', spacingAfter: '10pt', paddingVertical: '1pt', paddingHorizontal: '13pt' },
    codeBlock: { spacingAfter: '12pt' },
    table: { spacingAfter: '12pt' },
    horizontalRule: { spacingBefore: '20pt', spacingAfter: '20pt' }
  }
};

const baseColor = {
  id: 'neutral',
  name: 'Neutral',
  name_en: 'Neutral',
  description: 'Base',
  text: { primary: '#111111', secondary: '#333333', muted: '#777777' },
  accent: { link: '#0066cc', linkHover: '#004499' },
  background: { code: '#f5f5f5' },
  blockquote: { border: '#aaaaaa' },
  table: {
    border: '#cccccc',
    headerBackground: '#eeeeee',
    headerText: '#111111',
    zebraEven: '#fafafa',
    zebraOdd: '#ffffff'
  }
};

const baseTable = {
  border: { all: { width: '1pt', style: 'single' } },
  header: { fontWeight: 'bold' },
  cell: { padding: '8pt' },
  zebra: { enabled: true }
};

const baseCode = {
  foreground: '#24292e',
  colors: { keyword: '#d73a49' }
};

describe('custom-theme', () => {
  it('merges overrides over base theme and schemes', () => {
    const bundle = {
      basePresetId: 'default',
      overrides: {
        fontScheme: { body: { fontFamily: 'Arial' } },
        diagramStyle: 'handDrawn'
      },
      schemes: {
        layoutScheme: { body: { fontSize: '13pt' } },
        colorScheme: { text: { primary: '#222222' } },
        tableStyle: { cell: { padding: '10pt' } },
        codeTheme: { colors: { keyword: '#ff0000' } }
      }
    } as const;

    const merged = mergeCustomTheme(
      baseTheme,
      baseLayout,
      baseColor,
      baseTable,
      baseCode,
      bundle
    );

    assert.strictEqual(merged.theme.fontScheme.body.fontFamily, 'Arial');
    assert.strictEqual(merged.theme.diagramStyle, 'handDrawn');
    assert.strictEqual(merged.layout.body.fontSize, '13pt');
    assert.strictEqual(merged.color.text.primary, '#222222');
    assert.strictEqual(merged.table.cell.padding, '10pt');
    assert.strictEqual(merged.code.colors.keyword, '#ff0000');
  });

  it('returns validation errors for missing basePresetId', () => {
    const result = validateCustomThemeBundle({});
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some(e => e.includes('basePresetId')));
  });
});
```

Add import to `test/all.test.js`:

```js
import './custom-theme.test.ts';
```

**Step 2: Run tests to verify failure**

Run: `npx fibjs test/all.test.js`
Expected: FAIL with "Cannot find module '../src/utils/custom-theme.ts'".

**Step 3: Write minimal implementation**

Create `src/utils/custom-theme.ts` with:

```ts
import type { Theme, LayoutScheme, ColorScheme, TableStyleConfig, CodeThemeConfig } from '../types/index';

export interface CustomThemeBundle {
  basePresetId: string;
  overrides?: {
    fontScheme?: Theme['fontScheme'];
    diagramStyle?: Theme['diagramStyle'];
  };
  schemes?: {
    layoutScheme?: Partial<LayoutScheme>;
    colorScheme?: Partial<ColorScheme>;
    tableStyle?: Partial<TableStyleConfig>;
    codeTheme?: Partial<CodeThemeConfig>;
  };
}

export interface CustomThemeMergeResult {
  theme: Theme;
  layout: LayoutScheme;
  color: ColorScheme;
  table: TableStyleConfig;
  code: CodeThemeConfig;
}

export function validateCustomThemeBundle(bundle: unknown): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!bundle || typeof bundle !== 'object') {
    return { ok: false, errors: ['bundle must be an object'] };
  }
  const obj = bundle as Record<string, unknown>;
  if (typeof obj.basePresetId !== 'string' || obj.basePresetId.trim() === '') {
    errors.push('basePresetId is required');
  }
  return { ok: errors.length === 0, errors };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function deepMerge<T>(base: T, override?: Partial<T>): T {
  if (!override) return structuredClone(base);
  const result = structuredClone(base) as any;
  const merge = (target: any, source: any) => {
    Object.keys(source).forEach((key) => {
      const src = source[key];
      const tgt = target[key];
      if (isObject(src) && isObject(tgt)) {
        merge(tgt, src);
      } else {
        target[key] = src;
      }
    });
  };
  if (isObject(override)) merge(result, override);
  return result as T;
}

export function mergeCustomTheme(
  baseTheme: Theme,
  baseLayout: LayoutScheme,
  baseColor: ColorScheme,
  baseTable: TableStyleConfig,
  baseCode: CodeThemeConfig,
  bundle: CustomThemeBundle
): CustomThemeMergeResult {
  const theme = deepMerge(baseTheme, bundle.overrides as Partial<Theme> | undefined);
  const layout = deepMerge(baseLayout, bundle.schemes?.layoutScheme);
  const color = deepMerge(baseColor, bundle.schemes?.colorScheme);
  const table = deepMerge(baseTable, bundle.schemes?.tableStyle);
  const code = deepMerge(baseCode, bundle.schemes?.codeTheme);
  return { theme, layout, color, table, code };
}
```

Update types:
- `src/types/theme.ts`: export `CustomThemeBundle`
- `src/types/index.ts`: re-export `CustomThemeBundle`

**Step 4: Run tests to verify pass**

Run: `npx fibjs test/all.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add test/custom-theme.test.ts test/all.test.js src/utils/custom-theme.ts src/types/theme.ts src/types/index.ts
 git commit -m "feat: add custom theme bundle helpers"
```

---

### Task 2: Use custom theme bundle in CSS theme application

**Files:**
- Modify: `src/utils/theme-to-css.ts`
- Test: `test/custom-theme.test.ts` (extend)

**Step 1: Write failing test**

Add test to `test/custom-theme.test.ts`:

```ts
import { resolveCustomTheme } from '../src/utils/custom-theme.ts';

it('resolves custom theme via base preset id', async () => {
  const platform = {
    storage: { get: async () => ({ customThemeBundle: { basePresetId: 'default' } }) },
    resource: { getURL: (p: string) => p },
    settings: { get: async () => 'theme' }
  } as any;
  await assert.doesNotReject(() => resolveCustomTheme(platform, 'custom'));
});
```

**Step 2: Run tests to verify failure**

Run: `npx fibjs test/all.test.js`
Expected: FAIL with "resolveCustomTheme is not defined".

**Step 3: Write minimal implementation**

Extend `src/utils/custom-theme.ts` with `resolveCustomTheme` that:
- reads `customThemeBundle` from `platform.storage.get(['customThemeBundle'])`
- validates `basePresetId`
- fetches base preset + schemes (reusing `fetchJSON` and `platform.resource.getURL`)
- merges using `mergeCustomTheme` and returns `{ theme, layout, color, table, code }`

Then update `src/utils/theme-to-css.ts`:
- in `loadAndApplyTheme(themeId)`:
  - if `themeId === 'custom'`: call `resolveCustomTheme(...)` and use its return instead of loading by id

**Step 4: Run tests to verify pass**

Run: `npx fibjs test/all.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/utils/custom-theme.ts src/utils/theme-to-css.ts test/custom-theme.test.ts
 git commit -m "feat: apply custom theme bundle in CSS"
```

---

### Task 3: Use custom theme bundle in DOCX export

**Files:**
- Modify: `src/exporters/theme-to-docx.ts`
- Test: `test/custom-theme.test.ts` (extend)

**Step 1: Write failing test**

Add test to `test/custom-theme.test.ts`:

```ts
import { loadThemeForDOCX } from '../src/exporters/theme-to-docx.ts';

it('uses custom theme bundle for DOCX when themeId is custom', async () => {
  const platform = {
    resource: { fetch: async (p: string) => '{"id":"document","name":"Document","name_en":"Document","description":"","body":{"fontSize":"12pt","lineHeight":1.5},"headings":{"h1":{"fontSize":"22pt","spacingBefore":"0pt","spacingAfter":"12pt"},"h2":{"fontSize":"18pt","spacingBefore":"16pt","spacingAfter":"8pt"},"h3":{"fontSize":"16pt","spacingBefore":"14pt","spacingAfter":"7pt"},"h4":{"fontSize":"14pt","spacingBefore":"12pt","spacingAfter":"6pt"},"h5":{"fontSize":"13pt","spacingBefore":"10pt","spacingAfter":"5pt"},"h6":{"fontSize":"12pt","spacingBefore":"8pt","spacingAfter":"4pt"}},"code":{"fontSize":"10pt"},"blocks":{}}' },
    settings: { get: async () => 'theme' },
    storage: { get: async () => ({ customThemeBundle: { basePresetId: 'default' } }) }
  } as any;
  (globalThis as any).platform = platform;
  await assert.doesNotReject(() => loadThemeForDOCX('custom'));
});
```

**Step 2: Run tests to verify failure**

Run: `npx fibjs test/all.test.js`
Expected: FAIL because `loadThemeForDOCX` doesn't handle `custom`.

**Step 3: Write minimal implementation**

In `src/exporters/theme-to-docx.ts`:
- If `themeId === 'custom'`:
  - use `resolveCustomTheme` (with resource.fetch wrapper for JSON)
  - use merged theme/schemes to generate DOCX styles

**Step 4: Run tests to verify pass**

Run: `npx fibjs test/all.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/exporters/theme-to-docx.ts test/custom-theme.test.ts
 git commit -m "feat: apply custom theme bundle in DOCX"
```

---

### Task 4: Add Custom Theme editor UI (form-based) in Chrome popup

**Files:**
- Modify: `chrome/src/popup/popup.html`
- Modify: `src/ui/popup/settings-tab.ts`
- Modify: `src/ui/popup/settings-tab.css` (if needed)
- Modify: `src/_locales/*/messages.json`

**Step 1: Write failing test**

Add test `test/custom-theme.test.ts` (pure validation):

```ts
import { validateCustomThemeInputs } from '../src/utils/custom-theme.ts';

it('rejects invalid color hex', () => {
  const result = validateCustomThemeInputs({ textPrimary: 'not-a-color' });
  assert.strictEqual(result.ok, false);
});
```

**Step 2: Run tests to verify failure**

Run: `npx fibjs test/all.test.js`
Expected: FAIL with "validateCustomThemeInputs is not defined".

**Step 3: Write minimal implementation**

- Add `validateCustomThemeInputs` in `src/utils/custom-theme.ts` to validate:
  - hex colors
  - pt sizes
  - lineHeight range
- Build a “custom theme form state” in `settings-tab.ts` and map to `CustomThemeBundle`.
- Add new HTML section with inputs + Advanced toggles.
- Save to `customThemeBundle` + `customThemeDraft` in storage.
- When saved, set `selectedTheme='custom'` and notify `themeId` change.
- Add “Custom” to theme selector if bundle exists (use label + description).

**Step 4: Run tests to verify pass**

Run: `npx fibjs test/all.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add chrome/src/popup/popup.html src/ui/popup/settings-tab.ts src/utils/custom-theme.ts src/_locales/*/messages.json
 git commit -m "feat: add custom theme settings UI"
```

---

### Task 5: Final polish + manual verification

**Files:**
- Modify: `src/ui/popup/settings-tab.ts`
- Modify: `chrome/src/popup/popup.html`

**Step 1: Manual verification**

- Open popup → set base preset → tweak fields → Apply.
- Confirm preview updates and theme selector shows “Custom”.
- Switch back to preset → Custom remains in list.

**Step 2: Run full tests**

Run: `npx fibjs test/all.test.js`
Expected: PASS.

**Step 3: Commit**

```bash
git add chrome/src/popup/popup.html src/ui/popup/settings-tab.ts
 git commit -m "chore: polish custom theme flow"
```

---

## Notes
- Use `platform.storage.get(['customThemeBundle'])` for custom theme data.
- Avoid mutating base theme/schemes (deep-merge into new objects).
- Keep `tableStyleOverride` behavior intact; if override is set, apply it after custom merge.

