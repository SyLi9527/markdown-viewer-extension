import type { TableDomCell, TableDomNormalized } from './table-dom-model';

function normalizeSpan(value: string | null): number {
  const num = Number(value);
  return Number.isFinite(num) && num > 1 ? Math.floor(num) : 1;
}

export function normalizeTableElement(table: HTMLTableElement): TableDomNormalized {
  const rows = Array.from(table.querySelectorAll('tr'));
  const grid: TableDomCell[][] = [];
  const spanTracker: number[] = [];

  for (let r = 0; r < rows.length; r++) {
    const cells = Array.from(rows[r].querySelectorAll('th,td'));
    grid[r] = grid[r] || [];

    // decrement row spans
    for (let c = 0; c < spanTracker.length; c++) {
      if (spanTracker[c] > 0) spanTracker[c] -= 1;
    }

    let col = 0;
    for (const cell of cells) {
      while (spanTracker[col] > 0) col += 1;

      const rowspan = normalizeSpan(cell.getAttribute('rowspan'));
      const colspan = normalizeSpan(cell.getAttribute('colspan'));
      const nestedTables = Array.from(cell.querySelectorAll('table')) as HTMLTableElement[];

      for (let i = 0; i < rowspan; i++) {
        for (let j = 0; j < colspan; j++) {
          const rr = r + i;
          const cc = col + j;
          grid[rr] = grid[rr] || [];
          grid[rr][cc] = {
            row: rr,
            col: cc,
            rowspan,
            colspan,
            text: cell.textContent?.trim() || '',
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
  const colCount = Math.max(0, ...grid.map((row) => row.length));
  return { rowCount, colCount, cells: grid };
}
