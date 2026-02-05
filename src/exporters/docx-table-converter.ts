// Table conversion for DOCX export

import {
  Paragraph,
  TextRun,
  AlignmentType,
  Table,
  TableCell,
  TableRow,
  BorderStyle,
  TableLayoutType,
  VerticalAlignTable,
  VerticalMergeType,
  WidthType,
  convertInchesToTwip,
  type IBorderOptions,
  type IParagraphOptions,
  type ITableCellOptions,
  type ParagraphChild,
} from 'docx';
import type { DOCXThemeStyles, DOCXTableNode } from '../types/docx';
import type { TableAlignment } from '../types/settings';
import type { InlineResult, InlineNode } from './docx-inline-converter';
import { 
  calculateMergeInfoFromStringsWithAnalysis, 
  extractTextFromAstCell,
  type CellMergeInfo 
} from '../utils/table-merge-utils';

type ConvertInlineNodesFunction = (children: InlineNode[], options?: { bold?: boolean; size?: number; color?: string }) => Promise<InlineResult[]>;

/** Table layout mode */
export type TableLayout = 'left' | 'center';

interface TableConverterOptions {
  themeStyles: DOCXThemeStyles;
  convertInlineNodes: ConvertInlineNodesFunction;
  /** Enable auto-merge of empty table cells */
  mergeEmptyCells?: boolean;
  /** Default alignment for tables */
  defaultTableAlignment?: TableAlignment;
  /** Table layout: 'left' or 'center' */
  tableLayout?: TableLayout;
}

export interface TableConverter {
  convertTable(node: DOCXTableNode, listLevel?: number): Promise<Table>;
  /** Update merge setting at runtime */
  setMergeEmptyCells(enabled: boolean): void;
  /** Update table layout at runtime */
  setTableLayout(layout: TableLayout): void;
}

/**
 * Create a table converter
 * @param options - Configuration options
 * @returns Table converter
 */
export function createTableConverter({
  themeStyles,
  convertInlineNodes,
  mergeEmptyCells = false,
  defaultTableAlignment,
  tableLayout = 'center'
}: TableConverterOptions): TableConverter {
  // Default table styles
  const defaultMargins = { top: 80, bottom: 80, left: 100, right: 100 };
  
  // Get table styles with defaults
  const tableStyles = themeStyles.tableStyles || {};
  const headerStyles = tableStyles.header || {};
  const cellStyles = tableStyles.cell || {};
  const borderStyles = tableStyles.borders || {};
  const zebraStyles = tableStyles.zebra;
  
  // Mutable settings
  let enableMerge = mergeEmptyCells;
  let currentLayout: TableLayout = tableLayout;
  
  /**
   * Extract cell text content matrix from data rows (excluding header)
   */
  function extractCellMatrix(tableRows: DOCXTableNode['children'], headerRowCount: number): string[][] {
    const dataRows = tableRows.slice(Math.max(0, headerRowCount));
    return dataRows.map(row => {
      const cells = (row.children || []).filter(c => c.type === 'tableCell');
      return cells.map(cell => extractTextFromAstCell(cell));
    });
  }
  
  /**
   * Convert table node to DOCX Table
   * @param node - Table AST node
   * @param listLevel - List nesting level for indentation (default: 0)
   * @returns DOCX Table
   */
  async function convertTable(node: DOCXTableNode, listLevel = 0): Promise<Table> {
    const rows: TableRow[] = [];
    const alignments = (node as unknown as { align?: Array<'left' | 'center' | 'right' | null> }).align || [];
    const tableRows = (node.children || []).filter((row) => row.type === 'tableRow');
    const rowCount = tableRows.length;
    const headerRowCount = typeof (node as { headerRowCount?: number }).headerRowCount === 'number'
      ? (node as { headerRowCount?: number }).headerRowCount!
      : 1;
    const explicitSpans = (node as { explicitSpans?: boolean }).explicitSpans === true;

    // Calculate merge info for data rows if merge is enabled
    let mergeInfo: CellMergeInfo[][] | null = null;
    let groupHeaderRows = new Set<number>();
    if (!explicitSpans && enableMerge && rowCount > headerRowCount) {
      const cellMatrix = extractCellMatrix(tableRows, headerRowCount);
      if (cellMatrix.length > 0 && cellMatrix[0].length > 0) {
        const result = calculateMergeInfoFromStringsWithAnalysis(cellMatrix);
        mergeInfo = result.mergeInfo;
        // Get group header rows for potential styling
        if (result.analysis) {
          groupHeaderRows = new Set(result.analysis.groupHeaders.rows);
        }
      }
    }

    for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
      const row = tableRows[rowIndex];
      const rowMeta = row as { isHeaderRow?: boolean };
      const isHeaderRow = typeof rowMeta.isHeaderRow === 'boolean' ? rowMeta.isHeaderRow : rowIndex < headerRowCount;
      const isLastRow = rowIndex === rowCount - 1;
      const dataRowIndex = rowIndex - headerRowCount; // Index in data rows (excluding header rows)

      if (row.type === 'tableRow') {
        const cells: TableCell[] = [];

        const rowChildren = row.children || [];
        for (let colIndex = 0; colIndex < rowChildren.length; colIndex++) {
          const cell = rowChildren[colIndex];

          if (cell.type === 'tableCell') {
            const cellMeta = cell as {
              columnIndex?: number;
              colspan?: number;
              rowspan?: number;
              colSpan?: number;
              rowSpan?: number;
              shouldRender?: boolean;
              isHeaderCell?: boolean;
              alignment?: 'left' | 'center' | 'right' | 'justify';
              verticalAlign?: 'top' | 'center' | 'bottom';
              backgroundColor?: string;
              textStyle?: { color?: string; bold?: boolean; italics?: boolean };
              borders?: HtmlBorderSet;
            };
            if (cellMeta.shouldRender === false) {
              continue;
            }

            const columnIndex = typeof cellMeta.columnIndex === 'number' ? cellMeta.columnIndex : colIndex;
            const isHeaderCell = isHeaderRow || cellMeta.isHeaderCell === true;

            // Check if this cell should be skipped (merged into cell above)
            if (!explicitSpans && !isHeaderRow && mergeInfo && dataRowIndex >= 0 && dataRowIndex < mergeInfo.length) {
              const cellInfo = mergeInfo[dataRowIndex]?.[columnIndex];
              if (cellInfo && !cellInfo.shouldRender) {
                // Skip this cell - it's merged into the cell above
                continue;
              }
            }
            
            const headerBold = isHeaderCell ? (headerStyles.bold ?? true) : undefined;
            const headerColor = isHeaderCell && headerStyles.color ? headerStyles.color : undefined;
            const cellTextStyle = cellMeta.textStyle || {};
            const inlineStyle: { bold?: boolean; italics?: boolean; color?: string; size: number } = { size: 20 };
            if (typeof headerBold === 'boolean') {
              inlineStyle.bold = headerBold;
            }
            if (headerColor) {
              inlineStyle.color = headerColor;
            }
            if (typeof cellTextStyle.bold === 'boolean') {
              inlineStyle.bold = cellTextStyle.bold;
            }
            if (typeof cellTextStyle.italics === 'boolean') {
              inlineStyle.italics = cellTextStyle.italics;
            }
            if (cellTextStyle.color) {
              inlineStyle.color = cellTextStyle.color;
            }

            const children = await convertInlineNodes((cell.children || []) as InlineNode[], inlineStyle);

            const cellAlignment = cellMeta.alignment || alignments[columnIndex];
            let paragraphAlignment: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.LEFT;
            if (cellMeta.alignment) {
              if (cellMeta.alignment === 'justify') {
                paragraphAlignment = AlignmentType.JUSTIFIED;
              } else if (cellMeta.alignment === 'center') {
                paragraphAlignment = AlignmentType.CENTER;
              } else if (cellMeta.alignment === 'right') {
                paragraphAlignment = AlignmentType.RIGHT;
              } else {
                paragraphAlignment = AlignmentType.LEFT;
              }
            } else if (isHeaderRow) {
              paragraphAlignment = AlignmentType.CENTER;
            } else if (cellAlignment === 'center') {
              paragraphAlignment = AlignmentType.CENTER;
            } else if (cellAlignment === 'right') {
              paragraphAlignment = AlignmentType.RIGHT;
            }

            const paragraphOptions: IParagraphOptions = {
              children: children as ParagraphChild[],
              alignment: paragraphAlignment,
              spacing: { before: 60, after: 60, line: 240 },
            };

            const whiteBorder: IBorderOptions = { style: BorderStyle.SINGLE, size: 0, color: 'FFFFFF' };
            const noneBorder: IBorderOptions = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
            const isFirstColumn = columnIndex === 0;

            let borders: ITableCellOptions['borders'];

            if (borderStyles.all) {
              borders = {
                top: borderStyles.all,
                bottom: borderStyles.all,
                left: borderStyles.all,
                right: borderStyles.all
              };
            } else {
              borders = {
                top: whiteBorder,
                bottom: whiteBorder,
                left: isFirstColumn ? whiteBorder : noneBorder,
                right: noneBorder
              };
            }

            if (isHeaderRow && borderStyles.headerTop && borderStyles.headerTop.style !== BorderStyle.NONE) {
              borders = { ...(borders || {}), top: borderStyles.headerTop };
            }
            if (isHeaderRow && borderStyles.headerBottom && borderStyles.headerBottom.style !== BorderStyle.NONE) {
              borders = { ...(borders || {}), bottom: borderStyles.headerBottom };
            }
            if (!isHeaderRow && borderStyles.insideHorizontal && borderStyles.insideHorizontal.style !== BorderStyle.NONE) {
              // Apply inside horizontal border (will be overridden by lastRowBottom if needed)
              borders = { ...(borders || {}), bottom: borderStyles.insideHorizontal };
            }

            let shading: ITableCellOptions['shading'];
            if (cellMeta.backgroundColor) {
              shading = { fill: cellMeta.backgroundColor };
            } else if (isHeaderRow && headerStyles.shading) {
              shading = headerStyles.shading;
            } else if (rowIndex > 0 && typeof zebraStyles === 'object') {
              const isOddDataRow = ((rowIndex - 1) % 2) === 0;
              const background = isOddDataRow ? zebraStyles.odd : zebraStyles.even;
              if (background !== 'ffffff' && background !== 'FFFFFF') {
                shading = { fill: background };
              }
            }

            // Calculate vertical merge for this cell
            let rowSpan: number | undefined;
            if (explicitSpans) {
              const explicitRowSpan = Number(cellMeta.rowspan ?? cellMeta.rowSpan);
              if (Number.isFinite(explicitRowSpan) && explicitRowSpan > 1) {
                rowSpan = Math.floor(explicitRowSpan);
              }
            } else if (!isHeaderRow && mergeInfo && dataRowIndex >= 0 && dataRowIndex < mergeInfo.length) {
              const cellInfo = mergeInfo[dataRowIndex]?.[columnIndex];
              if (cellInfo && cellInfo.rowspan > 1) {
                rowSpan = cellInfo.rowspan;
              }
            }
            
            // Calculate horizontal merge (colspan) for this cell
            let colSpan: number | undefined;
            if (explicitSpans) {
              const explicitColSpan = Number(cellMeta.colspan ?? cellMeta.colSpan);
              if (Number.isFinite(explicitColSpan) && explicitColSpan > 1) {
                colSpan = Math.floor(explicitColSpan);
              }
            } else if (!isHeaderRow && mergeInfo && dataRowIndex >= 0 && dataRowIndex < mergeInfo.length) {
              const cellInfo = mergeInfo[dataRowIndex]?.[columnIndex];
              if (cellInfo && cellInfo.colspan > 1) {
                colSpan = cellInfo.colspan;
              }
            }

            const cellSpansToLastRow = rowSpan ? (rowIndex + rowSpan >= rowCount) : false;
            
            // Apply last row bottom border if this cell is in last row OR spans to last row
            if (!isHeaderRow && (isLastRow || cellSpansToLastRow)) {
              if (borderStyles.lastRowBottom && borderStyles.lastRowBottom.style !== BorderStyle.NONE) {
                borders = { ...(borders || {}), bottom: borderStyles.lastRowBottom };
              }
            }

            if (cellMeta.borders) {
              const overrideBorders = normalizeHtmlBorders(cellMeta.borders);
              if (overrideBorders) {
                borders = { ...(borders || {}), ...overrideBorders };
              }
            }

            const cellConfig: ITableCellOptions = {
              children: [new Paragraph(paragraphOptions)],
              verticalAlign: mapVerticalAlign(cellMeta.verticalAlign) || VerticalAlignTable.CENTER,
              margins: cellStyles.margins || defaultMargins,
              borders,
              shading,
              rowSpan,      // Add vertical merge span
              columnSpan: colSpan,  // Add horizontal merge span
            };

            cells.push(new TableCell(cellConfig));
          }
        }

        rows.push(new TableRow({
          children: cells,
          tableHeader: isHeaderRow,
        }));
      }
    }

    // For nested tables, add half the indent to the left margin and keep center alignment
    // This creates the visual effect of centering within the indented area
    const indentSize = listLevel > 0 ? convertInchesToTwip(0.5 * listLevel / 2) : undefined;

    return new Table({
      rows: rows,
      layout: TableLayoutType.AUTOFIT,
      alignment: defaultTableAlignment === 'right'
        ? AlignmentType.RIGHT
        : defaultTableAlignment === 'justify'
          ? AlignmentType.JUSTIFIED
          : currentLayout === 'center'
            ? AlignmentType.CENTER
            : AlignmentType.LEFT,
      indent: indentSize ? { size: indentSize, type: WidthType.DXA } : undefined,
    });
  }
  
  function setMergeEmptyCells(enabled: boolean): void {
    enableMerge = enabled;
  }

  function setTableLayout(layout: TableLayout): void {
    currentLayout = layout;
  }

  return { convertTable, setMergeEmptyCells, setTableLayout };
}

type HtmlBorderSpec = { style?: string; width?: number; color?: string };
type HtmlBorderSet = { top?: HtmlBorderSpec; right?: HtmlBorderSpec; bottom?: HtmlBorderSpec; left?: HtmlBorderSpec };

function mapVerticalAlign(
  value?: 'top' | 'center' | 'bottom'
): (typeof VerticalAlignTable)[keyof typeof VerticalAlignTable] | undefined {
  if (value === 'top') return VerticalAlignTable.TOP;
  if (value === 'bottom') return VerticalAlignTable.BOTTOM;
  if (value === 'center') return VerticalAlignTable.CENTER;
  return undefined;
}

function normalizeHtmlBorders(borders: HtmlBorderSet): ITableCellOptions['borders'] | undefined {
  const top = toDocxBorder(borders.top);
  const right = toDocxBorder(borders.right);
  const bottom = toDocxBorder(borders.bottom);
  const left = toDocxBorder(borders.left);
  if (!top && !right && !bottom && !left) {
    return undefined;
  }
  return {
    ...(top ? { top } : null),
    ...(right ? { right } : null),
    ...(bottom ? { bottom } : null),
    ...(left ? { left } : null),
  };
}

function toDocxBorder(border?: HtmlBorderSpec): IBorderOptions | undefined {
  if (!border) {
    return undefined;
  }

  const style = border.style?.toLowerCase();
  let docxStyle: (typeof BorderStyle)[keyof typeof BorderStyle] = BorderStyle.SINGLE;
  if (style === 'none' || style === 'hidden') {
    docxStyle = BorderStyle.NONE;
  } else if (style === 'dashed') {
    docxStyle = BorderStyle.DASHED;
  } else if (style === 'dotted') {
    docxStyle = BorderStyle.DOTTED;
  } else if (style === 'double') {
    docxStyle = BorderStyle.DOUBLE;
  }

  const size = border.width ? Math.max(2, Math.round(border.width * 8)) : undefined;
  const color = border.color || '000000';

  return {
    style: docxStyle,
    size: docxStyle === BorderStyle.NONE ? 0 : (size ?? 4),
    color,
  };
}
