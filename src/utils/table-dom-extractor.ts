import type { TableDomNormalized, TableDomBorder, TableDomPadding, TableDomFont } from './table-dom-model';
import { normalizeTableElement } from './table-dom-normalizer';

export type StyleResolver = (node: Element) => CSSStyleDeclaration;

export interface TableDomModelCell extends TableDomNormalized['cells'][0][0] {
  padding: TableDomPadding;
  border: { top: TableDomBorder; right: TableDomBorder; bottom: TableDomBorder; left: TableDomBorder };
  background: string;
  textAlign: string;
  verticalAlign: string;
  font: TableDomFont;
}

export interface TableDomModel {
  rowCount: number;
  colCount: number;
  cells: TableDomModelCell[][];
}

function px(value: string): number {
  const num = parseFloat(value || '0');
  return Number.isFinite(num) ? num : 0;
}

function borderFromStyle(style: CSSStyleDeclaration, side: 'Top' | 'Right' | 'Bottom' | 'Left'): TableDomBorder {
  return {
    widthPx: px((style as any)[`border${side}Width`]),
    style: String((style as any)[`border${side}Style`] || 'none'),
    color: String((style as any)[`border${side}Color`] || '#000000')
  };
}

function getTableRows(table: HTMLTableElement): HTMLTableRowElement[] {
  const rows = 'rows' in table ? Array.from(table.rows) : [];
  if (rows.length > 0) {
    return typeof rows[0]?.closest === 'function'
      ? rows.filter((row) => row.closest('table') === table)
      : rows;
  }
  const fallback = Array.from(table.querySelectorAll('tr'));
  return typeof fallback[0]?.closest === 'function'
    ? fallback.filter((row) => row.closest('table') === table)
    : fallback;
}

function getRowCells(row: HTMLTableRowElement): HTMLTableCellElement[] {
  const cells = 'cells' in row ? Array.from(row.cells) : [];
  if (cells.length > 0) return cells;
  return Array.from(row.children).filter((child) => {
    const tag = child.tagName?.toLowerCase();
    return tag === 'td' || tag === 'th';
  }) as HTMLTableCellElement[];
}

export function extractTableDomModel(table: HTMLTableElement, options?: { getStyle?: StyleResolver }): TableDomModel {
  const getStyle = options?.getStyle || ((node: Element) => getComputedStyle(node));
  const normalized = normalizeTableElement(table);
  const rows = getTableRows(table);
  const rowCells = rows.map((row) => getRowCells(row));

  const cells = normalized.cells.map((row) => row.map((cell) => {
    const el = rowCells[cell.row]?.[cell.col] as Element | undefined;
    const style = el ? getStyle(el) : getStyle(table);

    return {
      ...cell,
      padding: {
        top: px(style.paddingTop),
        right: px(style.paddingRight),
        bottom: px(style.paddingBottom),
        left: px(style.paddingLeft)
      },
      border: {
        top: borderFromStyle(style, 'Top'),
        right: borderFromStyle(style, 'Right'),
        bottom: borderFromStyle(style, 'Bottom'),
        left: borderFromStyle(style, 'Left')
      },
      background: style.backgroundColor || 'transparent',
      textAlign: style.textAlign || 'left',
      verticalAlign: style.verticalAlign || 'middle',
      font: {
        family: style.fontFamily || 'Arial',
        sizePx: px(style.fontSize),
        weight: style.fontWeight || '400',
        style: style.fontStyle || 'normal',
        color: style.color || '#000000',
        lineHeightPx: px(style.lineHeight)
      }
    };
  }));

  return { rowCount: normalized.rowCount, colCount: normalized.colCount, cells };
}
