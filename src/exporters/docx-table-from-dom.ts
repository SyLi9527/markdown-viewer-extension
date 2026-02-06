import {
  Table,
  TableRow,
  TableCell,
  Paragraph,
  TextRun,
  BorderStyle,
  TableLayoutType,
  AlignmentType,
  VerticalAlign
} from 'docx';
import type { TableDomModel } from '../utils/table-dom-extractor';

function pxToTwips(px: number): number {
  return Math.round(px * 15);
}

function pxToEighths(px: number): number {
  const pt = px * 0.75;
  return Math.max(1, Math.round(pt * 8));
}

function cssBorderStyle(style: string): (typeof BorderStyle)[keyof typeof BorderStyle] {
  if (style === 'dashed') return BorderStyle.DASHED;
  if (style === 'dotted') return BorderStyle.DOTTED;
  if (style === 'double') return BorderStyle.DOUBLE;
  if (style === 'none') return BorderStyle.NONE;
  return BorderStyle.SINGLE;
}

function normalizeCssColor(value: string): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (trimmed === 'transparent') return null;
  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1);
    if (hex.length === 3) {
      return hex.split('').map((c) => c + c).join('').toUpperCase();
    }
    if (hex.length >= 6) {
      return hex.slice(0, 6).toUpperCase();
    }
  }
  const rgbMatch = trimmed.match(/^rgba?\(([^)]+)\)$/);
  if (rgbMatch) {
    const parts = rgbMatch[1].split(',').map((p) => p.trim());
    if (parts.length >= 3) {
      const [rRaw, gRaw, bRaw] = parts.slice(0, 3);
      const r = Math.max(0, Math.min(255, Number.parseInt(rRaw, 10)));
      const g = Math.max(0, Math.min(255, Number.parseInt(gRaw, 10)));
      const b = Math.max(0, Math.min(255, Number.parseInt(bRaw, 10)));
      if (parts.length >= 4) {
        const alpha = Number.parseFloat(parts[3]);
        if (Number.isFinite(alpha) && alpha <= 0) {
          return null;
        }
      }
      if ([r, g, b].every((n) => Number.isFinite(n))) {
        return [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase();
      }
    }
  }
  return null;
}

export function convertTableDomToDocx(model: TableDomModel): Table {
  const rows: TableRow[] = [];

  for (let r = 0; r < model.rowCount; r++) {
    const cells = model.cells[r] || [];
    const rowCells: TableCell[] = [];

    for (let c = 0; c < model.colCount; c++) {
      const cell = cells[c];
      if (!cell || cell.originRow !== r || cell.originCol !== c) continue;

      const border = {
        top: {
          style: cssBorderStyle(cell.border.top.style),
          size: pxToEighths(cell.border.top.widthPx),
          color: normalizeCssColor(cell.border.top.color) || '000000'
        },
        right: {
          style: cssBorderStyle(cell.border.right.style),
          size: pxToEighths(cell.border.right.widthPx),
          color: normalizeCssColor(cell.border.right.color) || '000000'
        },
        bottom: {
          style: cssBorderStyle(cell.border.bottom.style),
          size: pxToEighths(cell.border.bottom.widthPx),
          color: normalizeCssColor(cell.border.bottom.color) || '000000'
        },
        left: {
          style: cssBorderStyle(cell.border.left.style),
          size: pxToEighths(cell.border.left.widthPx),
          color: normalizeCssColor(cell.border.left.color) || '000000'
        }
      };

      const paragraph = new Paragraph({
        alignment: cell.textAlign === 'center'
          ? AlignmentType.CENTER
          : cell.textAlign === 'right'
            ? AlignmentType.RIGHT
            : AlignmentType.LEFT,
        children: [new TextRun({ text: cell.text || '' })]
      });

      const shadingFill = normalizeCssColor(cell.background);
      rowCells.push(new TableCell({
        children: [paragraph],
        margins: {
          top: pxToTwips(cell.padding.top),
          right: pxToTwips(cell.padding.right),
          bottom: pxToTwips(cell.padding.bottom),
          left: pxToTwips(cell.padding.left)
        },
        borders: border,
        shading: shadingFill ? { fill: shadingFill } : undefined,
        rowSpan: cell.rowspan > 1 ? cell.rowspan : undefined,
        columnSpan: cell.colspan > 1 ? cell.colspan : undefined,
        verticalAlign: cell.verticalAlign === 'top'
          ? VerticalAlign.TOP
          : cell.verticalAlign === 'bottom'
            ? VerticalAlign.BOTTOM
            : VerticalAlign.CENTER
      }));
    }

    rows.push(new TableRow({ children: rowCells }));
  }

  return new Table({ rows, layout: TableLayoutType.AUTOFIT });
}
