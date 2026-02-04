import type { TableDomCell, TableDomNormalized } from './table-dom-model';

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

function getCellText(cell: HTMLTableCellElement): string {
  const clone = cell.cloneNode(true) as HTMLElement;
  const tables = Array.from(clone.querySelectorAll('table'));
  for (const table of tables) {
    if (typeof table.remove === 'function') {
      table.remove();
    } else {
      table.parentNode?.removeChild(table);
    }
  }
  return clone.textContent?.trim() || '';
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

export function normalizeTableElement(table: HTMLTableElement): TableDomNormalized {
  const rows = getTableRows(table);
  const grid: TableDomCell[][] = [];
  const spanTracker: number[] = [];
  const rowGroupEnds = getRowGroupEnds(rows);
  const maxColumns = computeMaxColumns(rows, rowGroupEnds);

  for (let r = 0; r < rows.length; r++) {
    const cells = getRowCells(rows[r]);
    grid[r] = grid[r] || [];

    // decrement row spans
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
      const nestedTables = Array.from(cell.querySelectorAll('table')) as HTMLTableElement[];
      const text = getCellText(cell);

      for (let i = 0; i < rowspan; i++) {
        for (let j = 0; j < colspan; j++) {
          const rr = r + i;
          const cc = col + j;
          grid[rr] = grid[rr] || [];
          grid[rr][cc] = {
            row: rr,
            col: cc,
            originRow: r,
            originCol: col,
            rowspan,
            colspan,
            text,
            nestedTables
          };
        }
      }

      for (let c = col; c < col + colspan; c++) {
        spanTracker[c] = Math.max(spanTracker[c] || 0, rowspan - 1);
      }

      col += colspan;
    }
  }

  const rowCount = grid.length;
  const colCount = Math.max(0, maxColumns, ...grid.map((row) => row.length));
  for (let r = 0; r < rowCount; r++) {
    grid[r] = grid[r] || [];
    for (let c = 0; c < colCount; c++) {
      if (!grid[r][c]) {
        grid[r][c] = {
          row: r,
          col: c,
          originRow: r,
          originCol: c,
          rowspan: 1,
          colspan: 1,
          text: '',
          nestedTables: []
        };
      }
    }
  }
  return { rowCount, colCount, cells: grid };
}
