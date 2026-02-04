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

function pxToEighths(px: number): number {
  const pt = px * 0.75;
  return Math.max(1, Math.round(pt * 8));
}

function cssBorderStyle(style: string): BorderStyle {
  if (style === 'dashed') return BorderStyle.DASHED;
  if (style === 'dotted') return BorderStyle.DOTTED;
  if (style === 'double') return BorderStyle.DOUBLE;
  if (style === 'none') return BorderStyle.NONE;
  return BorderStyle.SINGLE;
}

export function convertTableDomToDocx(model: TableDomModel): Table {
  const rows: TableRow[] = [];

  for (let r = 0; r < model.rowCount; r++) {
    const cells = model.cells[r] || [];
    const rowCells: TableCell[] = [];

    for (let c = 0; c < model.colCount; c++) {
      const cell = cells[c];
      if (!cell || (cell.row !== r || cell.col !== c)) continue;

      const border = {
        top: {
          style: cssBorderStyle(cell.border.top.style),
          size: pxToEighths(cell.border.top.widthPx),
          color: cell.border.top.color.replace('#', '')
        },
        right: {
          style: cssBorderStyle(cell.border.right.style),
          size: pxToEighths(cell.border.right.widthPx),
          color: cell.border.right.color.replace('#', '')
        },
        bottom: {
          style: cssBorderStyle(cell.border.bottom.style),
          size: pxToEighths(cell.border.bottom.widthPx),
          color: cell.border.bottom.color.replace('#', '')
        },
        left: {
          style: cssBorderStyle(cell.border.left.style),
          size: pxToEighths(cell.border.left.widthPx),
          color: cell.border.left.color.replace('#', '')
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

      rowCells.push(new TableCell({
        children: [paragraph],
        margins: {
          top: Math.round(cell.padding.top * 20),
          right: Math.round(cell.padding.right * 20),
          bottom: Math.round(cell.padding.bottom * 20),
          left: Math.round(cell.padding.left * 20)
        },
        borders: border,
        shading: { fill: cell.background.replace('#', '') || 'FFFFFF' },
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
