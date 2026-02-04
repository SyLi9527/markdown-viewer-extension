/**
 * Tests for DOCX theme mapping options
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { applyDocxThemeOverrides } from '../src/exporters/docx-theme-mapping.ts';
import type { DOCXThemeStyles } from '../src/types/docx.ts';

function createThemeStyles(): DOCXThemeStyles {
  return {
    default: {
      run: { font: 'Times New Roman', size: 24 },
      paragraph: { spacing: { line: 276, before: 0, after: 200 } }
    },
    paragraphStyles: {
      heading1: {
        id: 'Heading1',
        name: 'Heading 1',
        basedOn: 'Normal',
        next: 'Normal',
        run: { font: 'Times New Roman', size: 40, bold: true, color: '111111' },
        paragraph: { spacing: { before: 240, after: 120, line: 360 }, alignment: 'center' }
      }
    },
    characterStyles: {
      code: { font: 'Consolas', size: 26, background: 'F6F8FA' }
    },
    tableStyles: {
      borders: { all: { style: 1 as any, size: 8, color: 'A3A3A3' } },
      header: { shading: { fill: 'E5E5E5' }, color: '171717', bold: true },
      cell: { margins: { top: 80, bottom: 80, left: 80, right: 80 } },
      zebra: { even: 'FAFAFA', odd: 'FFFFFF' }
    },
    codeColors: { background: 'F5F5F5', foreground: '24292E', colors: {} },
    linkColor: '0369A1',
    blockquoteColor: 'A3A3A3'
  };
}

describe('docx-theme-mapping', () => {
  it('applies heading overrides', () => {
    const theme = createThemeStyles();
    const mapped = applyDocxThemeOverrides(theme, {
      headingScalePct: 150,
      headingSpacingBeforePt: 12,
      headingSpacingAfterPt: 6,
      headingAlignment: 'right'
    });
    const heading = mapped.paragraphStyles.heading1;
    assert.strictEqual(heading.run.size, 60);
    assert.strictEqual(heading.paragraph.spacing.before, 240);
    assert.strictEqual(heading.paragraph.spacing.after, 120);
    assert.strictEqual(heading.paragraph.alignment, 'right');
  });

  it('applies code font size override in points', () => {
    const theme = createThemeStyles();
    const mapped = applyDocxThemeOverrides(theme, { codeFontSizePt: 11 });
    assert.strictEqual(mapped.characterStyles.code.size, 22);
    assert.strictEqual(mapped.characterStyles.code.font, 'Consolas');
    assert.strictEqual(mapped.characterStyles.code.background, 'F6F8FA');
    // Ensure original theme not mutated
    assert.strictEqual(theme.characterStyles.code.size, 26);
  });

  it('applies table border width and padding overrides', () => {
    const theme = createThemeStyles();
    theme.tableStyles.borders = {
      all: { style: 1 as any, size: 8, color: 'A3A3A3' },
      headerTop: { style: 1 as any, size: 8, color: 'A3A3A3' },
      insideHorizontal: { style: 1 as any, size: 8, color: 'A3A3A3' },
      lastRowBottom: { style: 1 as any, size: 8, color: 'A3A3A3' },
    };
    const mapped = applyDocxThemeOverrides(theme, {
      tableBorderWidthPt: 0.5,
      tableCellPaddingPt: 6
    });
    assert.strictEqual(mapped.tableStyles.borders.all.size, 4);
    assert.strictEqual(mapped.tableStyles.borders.headerTop.size, 4);
    assert.strictEqual(mapped.tableStyles.borders.insideHorizontal.size, 4);
    assert.strictEqual(mapped.tableStyles.borders.lastRowBottom.size, 4);
    assert.deepStrictEqual(mapped.tableStyles.cell.margins, {
      top: 120,
      bottom: 120,
      left: 120,
      right: 120
    });
  });
});
