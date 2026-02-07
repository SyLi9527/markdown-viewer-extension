import {
  Table,
  TableRow,
  TableCell,
  Paragraph,
  AlignmentType,
  VerticalAlign,
  BorderStyle,
  TableLayoutType,
  WidthType
} from 'docx';
import type { FileChild } from 'docx';
import type { DOCXThemeStyles, DOCXASTNode } from '../types/docx';
import type { InlineConverter } from './docx-inline-converter';
import type { HtmlTableNode, HtmlTableCellNode, HtmlBorderSet } from '../utils/html-editable-parser';

export interface HtmlTableConverter {
  convertTable(node: HtmlTableNode, listLevel: number): Promise<Table>;
}

interface HtmlTableConverterOptions {
  themeStyles: DOCXThemeStyles;
  inlineConverter: InlineConverter;
  convertBlock: (node: DOCXASTNode, listLevel: number) => Promise<FileChild | FileChild[] | null>;
}

export function createHtmlTableConverter({ themeStyles, inlineConverter, convertBlock }: HtmlTableConverterOptions): HtmlTableConverter {
  const defaultMargins = themeStyles.tableStyles.cell?.margins || { top: 80, right: 80, bottom: 80, left: 80 };
  const defaultSpacing = themeStyles.default.paragraph?.spacing || { line: 276 };

  async function convertCellBlocks(cell: HtmlTableCellNode, listLevel: number): Promise<FileChild[]> {
    const children: FileChild[] = [];
    const align = mapAlignment(cell.style.textAlign);
    const parentStyle = cell.isHeaderCell ? { bold: true } : {};

    for (const block of cell.children || []) {
      if (block.type === 'paragraph') {
        const runs = await inlineConverter.convertInlineNodes((block.children || []) as any, parentStyle);
        children.push(new Paragraph({
          children: runs as any,
          alignment: align,
          spacing: { before: 0, after: 0, line: defaultSpacing.line ?? 276 },
        }));
        continue;
      }

      const converted = await convertBlock(block as DOCXASTNode, listLevel);
      if (converted) {
        if (Array.isArray(converted)) children.push(...converted);
        else children.push(converted);
      }
    }

    if (children.length === 0) {
      children.push(new Paragraph({ text: '', spacing: { before: 0, after: 0, line: defaultSpacing.line ?? 276 } }));
    }

    return children;
  }

  async function convertTable(node: HtmlTableNode, listLevel = 0): Promise<Table> {
    const rows: TableRow[] = [];
    for (const row of node.rows || []) {
      const cells: TableCell[] = [];
      for (const cell of row.cells || []) {
        const children = await convertCellBlocks(cell, listLevel);
        const borders = normalizeHtmlBorders(cell.style.borders);
        const shading = cell.style.backgroundColor ? { fill: cell.style.backgroundColor } : undefined;
        const padding = cell.style.padding || {};
        const marginTop = typeof padding.top === 'number' ? pxToTwips(padding.top) : defaultMargins.top;
        const marginRight = typeof padding.right === 'number' ? pxToTwips(padding.right) : defaultMargins.right;
        const marginBottom = typeof padding.bottom === 'number' ? pxToTwips(padding.bottom) : defaultMargins.bottom;
        const marginLeft = typeof padding.left === 'number' ? pxToTwips(padding.left) : defaultMargins.left;

        cells.push(new TableCell({
          children,
          verticalAlign: mapVerticalAlign(cell.style.verticalAlign),
          margins: {
            top: marginTop,
            right: marginRight,
            bottom: marginBottom,
            left: marginLeft,
          },
          borders: borders || undefined,
          shading,
          rowSpan: cell.rowSpan > 1 ? cell.rowSpan : undefined,
          columnSpan: cell.colSpan > 1 ? cell.colSpan : undefined,
        }));
      }
      rows.push(new TableRow({ children: cells, tableHeader: row.isHeaderRow }));
    }

    const indentSize = listLevel > 0 ? Math.round((listLevel * 0.5 * 1440) / 2) : undefined;
    return new Table({
      rows,
      layout: TableLayoutType.AUTOFIT,
      alignment: AlignmentType.LEFT,
      indent: indentSize ? { size: indentSize, type: WidthType.DXA } : undefined,
    });
  }

  return { convertTable };
}

function mapAlignment(value?: string): typeof AlignmentType.LEFT | typeof AlignmentType.CENTER | typeof AlignmentType.RIGHT | typeof AlignmentType.JUSTIFIED {
  if (value === 'center') return AlignmentType.CENTER;
  if (value === 'right') return AlignmentType.RIGHT;
  if (value === 'justify') return AlignmentType.JUSTIFIED;
  return AlignmentType.LEFT;
}

function mapVerticalAlign(value?: string): VerticalAlign {
  if (value === 'top') return VerticalAlign.TOP;
  if (value === 'bottom') return VerticalAlign.BOTTOM;
  return VerticalAlign.CENTER;
}

function pxToTwips(px: number): number {
  return Math.round(px * 15);
}

function normalizeCssColor(value?: string): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]+$/.test(trimmed)) {
    return trimmed.replace('#', '').slice(0, 6).toUpperCase();
  }
  if (/^[0-9A-F]{6}$/i.test(trimmed)) return trimmed.toUpperCase();
  return undefined;
}

function cssBorderStyle(style?: string): (typeof BorderStyle)[keyof typeof BorderStyle] {
  if (style === 'dashed') return BorderStyle.DASHED;
  if (style === 'dotted') return BorderStyle.DOTTED;
  if (style === 'double') return BorderStyle.DOUBLE;
  if (style === 'none') return BorderStyle.NONE;
  return BorderStyle.SINGLE;
}

function normalizeHtmlBorders(borders?: HtmlBorderSet) {
  if (!borders) return undefined;
  const top = toDocxBorder(borders.top);
  const right = toDocxBorder(borders.right);
  const bottom = toDocxBorder(borders.bottom);
  const left = toDocxBorder(borders.left);
  if (!top && !right && !bottom && !left) {
    return undefined;
  }
  const normalized: { top?: typeof top; right?: typeof right; bottom?: typeof bottom; left?: typeof left } = {};
  if (top) normalized.top = top;
  if (right) normalized.right = right;
  if (bottom) normalized.bottom = bottom;
  if (left) normalized.left = left;
  return normalized;
}

function toDocxBorder(border?: { style?: string; width?: number; color?: string }) {
  if (!border) return undefined;
  const width = typeof border.width === 'number' ? border.width : undefined;
  if (!width || width <= 0) return undefined;
  if (border.style?.toLowerCase() === 'none') return undefined;
  return {
    style: cssBorderStyle(border.style),
    size: pxToEighths(width),
    color: normalizeCssColor(border.color) || '000000',
  };
}

function pxToEighths(px: number): number {
  const pt = px * 0.75;
  return Math.max(1, Math.round(pt * 8));
}
