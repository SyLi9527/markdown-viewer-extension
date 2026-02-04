/**
 * Tests for custom theme bundle utilities
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { mergeCustomTheme, resolveCustomTheme, validateCustomThemeBundle, validateCustomThemeInputs } from '../src/utils/custom-theme.ts';
import { loadThemeForDOCX } from '../src/exporters/theme-to-docx.ts';

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

  it('rejects invalid color hex', () => {
    const result = validateCustomThemeInputs({
      colors: { textPrimary: 'not-a-color' },
      ptValues: {},
      lineHeight: 1.5
    });
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some(e => e.includes('textPrimary')));
  });

  it('resolves custom theme via base preset id', async () => {
    const platform = {
      storage: {
        get: async () => ({ customThemeBundle: { basePresetId: 'default' } })
      },
      resource: {
        getURL: (path: string) => path,
        fetch: async (path: string) => {
          if (path === 'themes/presets/default.json') {
            return JSON.stringify({
              id: 'default',
              fontScheme: {
                body: { fontFamily: 'Times New Roman' },
                headings: {},
                code: { fontFamily: 'Monaco' }
              },
              layoutScheme: 'document',
              colorScheme: 'neutral',
              tableStyle: 'grid',
              codeTheme: 'light-clean'
            });
          }
          if (path === 'themes/layout-schemes/document.json') {
            return JSON.stringify(baseLayout);
          }
          if (path === 'themes/color-schemes/neutral.json') {
            return JSON.stringify(baseColor);
          }
          if (path === 'themes/table-styles/grid.json') {
            return JSON.stringify(baseTable);
          }
          if (path === 'themes/code-themes/light-clean.json') {
            return JSON.stringify(baseCode);
          }
          throw new Error(`Unexpected path: ${path}`);
        }
      },
      settings: { get: async () => 'theme' }
    } as any;

    (globalThis as any).platform = platform;

    const resolved = await resolveCustomTheme(platform);
    assert.strictEqual(resolved.theme.id, 'default');
    assert.strictEqual(resolved.layout.id, 'document');
    assert.strictEqual(resolved.color.id, 'neutral');
  });

  it('uses custom theme bundle for DOCX when themeId is custom', async () => {
    const platform = {
      resource: {
        getURL: (path: string) => path,
        fetch: async (path: string) => {
          if (path === 'themes/font-config.json') {
            return JSON.stringify({
              fonts: {
                'Times New Roman': {
                  webFallback: 'Times New Roman, serif',
                  docx: { ascii: 'Times New Roman', eastAsia: 'SimSun' }
                },
                Monaco: {
                  webFallback: 'Monaco, monospace',
                  docx: { ascii: 'Consolas', eastAsia: 'FangSong' }
                }
              }
            });
          }
          if (path === 'themes/registry.json') {
            return JSON.stringify({ themes: [], categories: {} });
          }
          if (path === 'themes/presets/default.json') {
            return JSON.stringify({
              id: 'default',
              fontScheme: {
                body: { fontFamily: 'Times New Roman' },
                headings: {},
                code: { fontFamily: 'Monaco' }
              },
              layoutScheme: 'document',
              colorScheme: 'neutral',
              tableStyle: 'grid',
              codeTheme: 'light-clean'
            });
          }
          if (path === 'themes/layout-schemes/document.json') {
            return JSON.stringify(baseLayout);
          }
          if (path === 'themes/color-schemes/neutral.json') {
            return JSON.stringify(baseColor);
          }
          if (path === 'themes/table-styles/grid.json') {
            return JSON.stringify(baseTable);
          }
          if (path === 'themes/code-themes/light-clean.json') {
            return JSON.stringify(baseCode);
          }
          throw new Error(`Unexpected path: ${path}`);
        }
      },
      settings: { get: async () => 'theme' },
      storage: { get: async () => ({ customThemeBundle: { basePresetId: 'default' } }) }
    } as any;

    (globalThis as any).platform = platform;

    await assert.doesNotReject(() => loadThemeForDOCX('custom'));
  });
});
