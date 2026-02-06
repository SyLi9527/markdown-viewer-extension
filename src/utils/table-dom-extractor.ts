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

function parseSpan(value: string | null): number | null {
  if (value === null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? Math.floor(num) : null;
}

function normalizeSpanValue(value: number | null): number {
  return value && value > 1 ? value : 1;
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

function getRowGroupEnds(rows: HTMLTableRowElement[]): number[] {
  const ends = new Array(rows.length);
  if (rows.length === 0) return ends;
  let groupStart = 0;
  let currentParent = rows[0].parentElement;
  for (let i = 1; i <= rows.length; i++) {
    const row = rows[i];
    if (i === rows.length || row.parentElement !== currentParent) {
      const groupEnd = i - 1;
      for (let j = groupStart; j <= groupEnd; j++) {
        ends[j] = groupEnd;
      }
      groupStart = i;
      currentParent = row?.parentElement ?? null;
    }
  }
  return ends;
}

function computeMaxColumns(rows: HTMLTableRowElement[], rowGroupEnds: number[]): number {
  const spanTracker: number[] = [];
  let maxColumns = 0;

  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < spanTracker.length; c++) {
      if (spanTracker[c] > 0) spanTracker[c] -= 1;
    }

    let col = 0;
    const cells = getRowCells(rows[r]);
    for (const cell of cells) {
      while (spanTracker[col] > 0) col += 1;

      const rowspanValue = parseSpan(cell.getAttribute('rowspan'));
      const rowGroupEnd = rowGroupEnds[r] ?? r;
      const rowspan =
        rowspanValue === 0 ? rowGroupEnd - r + 1 : normalizeSpanValue(rowspanValue);
      const colspan = normalizeSpanValue(parseSpan(cell.getAttribute('colspan')));

      maxColumns = Math.max(maxColumns, col + colspan);
      for (let c = col; c < col + colspan; c++) {
        spanTracker[c] = Math.max(spanTracker[c] || 0, rowspan - 1);
      }

      col += colspan;
    }
    maxColumns = Math.max(maxColumns, col);
  }

  return maxColumns;
}

function buildCellElementMatrix(
  table: HTMLTableElement,
  normalized: TableDomNormalized
): (HTMLTableCellElement | null)[][] {
  const rows = getTableRows(table);
  const rowGroupEnds = getRowGroupEnds(rows);
  const maxColumns = computeMaxColumns(rows, rowGroupEnds);
  const grid: (HTMLTableCellElement | null)[][] = [];
  const spanTracker: number[] = [];

  for (let r = 0; r < rows.length; r++) {
    const cells = getRowCells(rows[r]);
    grid[r] = grid[r] || [];

    for (let c = 0; c < spanTracker.length; c++) {
      if (spanTracker[c] > 0) spanTracker[c] -= 1;
    }

    let col = 0;
    for (const cell of cells) {
      while (spanTracker[col] > 0) col += 1;

      const rowspanValue = parseSpan(cell.getAttribute('rowspan'));
      const rowspan =
        rowspanValue === 0 ? rowGroupEnds[r] - r + 1 : normalizeSpanValue(rowspanValue);
      const colspanValue = parseSpan(cell.getAttribute('colspan'));
      const colspan =
        colspanValue === 0 ? Math.max(1, maxColumns - col) : normalizeSpanValue(colspanValue);

      for (let i = 0; i < rowspan; i++) {
        for (let j = 0; j < colspan; j++) {
          const rr = r + i;
          const cc = col + j;
          grid[rr] = grid[rr] || [];
          grid[rr][cc] = cell;
        }
      }

      for (let c = col; c < col + colspan; c++) {
        spanTracker[c] = Math.max(spanTracker[c] || 0, rowspan - 1);
      }

      col += colspan;
    }
  }

  const rowCount = normalized.rowCount;
  const colCount = normalized.colCount;
  for (let r = 0; r < rowCount; r++) {
    grid[r] = grid[r] || [];
    for (let c = 0; c < colCount; c++) {
      if (grid[r][c] === undefined) {
        grid[r][c] = null;
      }
    }
  }
  grid.length = rowCount;

  return grid;
}

export function extractTableDomModel(table: HTMLTableElement, options?: { getStyle?: StyleResolver }): TableDomModel {
  const getStyle = options?.getStyle || ((node: Element) => getComputedStyle(node));
  const normalized = normalizeTableElement(table);
  const cellMatrix = buildCellElementMatrix(table, normalized);

  const cells = normalized.cells.map((row) => row.map((cell) => {
    const el = cellMatrix[cell.row]?.[cell.col] as Element | null | undefined;
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
