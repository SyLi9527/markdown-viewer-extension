export type TableDomBorder = { widthPx: number; style: string; color: string };
export type TableDomPadding = { top: number; right: number; bottom: number; left: number };
export type TableDomFont = { family: string; sizePx: number; weight: string; style: string; color: string; lineHeightPx: number };

export interface TableDomCell {
  row: number;
  col: number;
  rowspan: number;
  colspan: number;
  text: string;
  nestedTables: HTMLTableElement[];
}

export interface TableDomNormalized {
  rowCount: number;
  colCount: number;
  cells: TableDomCell[][];
}
