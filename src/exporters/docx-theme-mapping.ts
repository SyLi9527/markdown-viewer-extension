import type { DOCXHeadingStyle, DOCXTableStyle, DOCXThemeStyles } from '../types/docx';

export interface DocxThemeOverrideOptions {
  headingScalePct?: number | null;
  headingSpacingBeforePt?: number | null;
  headingSpacingAfterPt?: number | null;
  headingAlignment?: 'left' | 'center' | 'right' | 'justify' | null;
  codeFontSizePt?: number | null;
  tableBorderWidthPt?: number | null;
  tableCellPaddingPt?: number | null;
}

const DEFAULT_CODE_SIZE = 20; // 10pt in half-points

function normalizeNumber(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return null;
  }
  return value;
}

function toHalfPoints(pt: number): number {
  return Math.round(pt * 2);
}

function toTwips(pt: number): number {
  return Math.round(pt * 20);
}

function toEighthsOfPoint(pt: number): number {
  return Math.round(pt * 8);
}

function applyHeadingOverrides(
  styles: Record<string, DOCXHeadingStyle>,
  scalePct: number | null,
  spacingBeforePt: number | null,
  spacingAfterPt: number | null,
  alignment: DocxThemeOverrideOptions['headingAlignment']
): Record<string, DOCXHeadingStyle> {
  const hasScale = typeof scalePct === 'number' && scalePct > 0;
  const scale = hasScale ? scalePct / 100 : null;
  const beforeTwips = spacingBeforePt !== null ? toTwips(spacingBeforePt) : null;
  const afterTwips = spacingAfterPt !== null ? toTwips(spacingAfterPt) : null;
  const hasAlignment = alignment === 'left' || alignment === 'center' || alignment === 'right' || alignment === 'justify';

  if (!hasScale && beforeTwips === null && afterTwips === null && !hasAlignment) {
    return styles;
  }

  const nextStyles: Record<string, DOCXHeadingStyle> = {};
  Object.entries(styles).forEach(([key, style]) => {
    const nextStyle: DOCXHeadingStyle = {
      ...style,
      run: { ...style.run },
      paragraph: { ...style.paragraph, spacing: { ...style.paragraph.spacing } }
    };

    if (scale) {
      nextStyle.run.size = Math.max(1, Math.round(nextStyle.run.size * scale));
    }
    if (beforeTwips !== null) {
      nextStyle.paragraph.spacing = nextStyle.paragraph.spacing || {};
      nextStyle.paragraph.spacing.before = beforeTwips;
    }
    if (afterTwips !== null) {
      nextStyle.paragraph.spacing = nextStyle.paragraph.spacing || {};
      nextStyle.paragraph.spacing.after = afterTwips;
    }
    if (hasAlignment) {
      nextStyle.paragraph.alignment = alignment || nextStyle.paragraph.alignment;
    }

    nextStyles[key] = nextStyle;
  });

  return nextStyles;
}

function applyTableOverrides(
  tableStyles: DOCXTableStyle,
  borderWidthPt: number | null,
  cellPaddingPt: number | null
): DOCXTableStyle {
  if (borderWidthPt === null && cellPaddingPt === null) {
    return tableStyles;
  }

  const nextStyles: DOCXTableStyle = {
    ...tableStyles,
    borders: { ...tableStyles.borders },
    header: { ...tableStyles.header },
    cell: { ...tableStyles.cell }
  };

  if (borderWidthPt !== null) {
    const size = toEighthsOfPoint(borderWidthPt);
    const borders = nextStyles.borders;
    if (borders.all) borders.all = { ...borders.all, size };
    if (borders.headerTop) borders.headerTop = { ...borders.headerTop, size };
    if (borders.headerBottom) borders.headerBottom = { ...borders.headerBottom, size };
    if (borders.insideHorizontal) borders.insideHorizontal = { ...borders.insideHorizontal, size };
    if (borders.lastRowBottom) borders.lastRowBottom = { ...borders.lastRowBottom, size };
  }

  if (cellPaddingPt !== null) {
    const padding = toTwips(cellPaddingPt);
    nextStyles.cell.margins = {
      top: padding,
      bottom: padding,
      left: padding,
      right: padding
    };
  }

  return nextStyles;
}

export function applyDocxThemeOverrides(
  themeStyles: DOCXThemeStyles,
  options: DocxThemeOverrideOptions = {}
): DOCXThemeStyles {
  const headingScalePct = normalizeNumber(options.headingScalePct);
  const headingSpacingBeforePt = normalizeNumber(options.headingSpacingBeforePt);
  const headingSpacingAfterPt = normalizeNumber(options.headingSpacingAfterPt);
  const headingAlignment = options.headingAlignment ?? null;
  const codeFontSizePt = normalizeNumber(options.codeFontSizePt);
  const tableBorderWidthPt = normalizeNumber(options.tableBorderWidthPt);
  const tableCellPaddingPt = normalizeNumber(options.tableCellPaddingPt);

  const codeStyle = themeStyles.characterStyles?.code || {
    font: 'Consolas',
    size: DEFAULT_CODE_SIZE,
    background: 'F6F8FA'
  };
  const nextCodeStyle = codeFontSizePt !== null
    ? { ...codeStyle, size: toHalfPoints(codeFontSizePt) }
    : codeStyle;

  return {
    ...themeStyles,
    paragraphStyles: applyHeadingOverrides(
      themeStyles.paragraphStyles,
      headingScalePct,
      headingSpacingBeforePt,
      headingSpacingAfterPt,
      headingAlignment
    ),
    characterStyles: {
      ...themeStyles.characterStyles,
      code: nextCodeStyle
    },
    tableStyles: applyTableOverrides(
      themeStyles.tableStyles,
      tableBorderWidthPt,
      tableCellPaddingPt
    )
  };
}

export { DEFAULT_CODE_SIZE };
