/**
 * HTML Table to DOCX Table Nodes
 *
 * Parses HTML <table> blocks into DOCX AST table nodes
 * that can be passed to the DOCX table converter.
 */
import type { DOCXASTNode, DOCXTableNode } from '../types/docx';

type CellAlignment = 'left' | 'center' | 'right' | 'justify';
type VerticalAlignment = 'top' | 'center' | 'bottom';

interface RunStyle {
  color?: string;
  bold?: boolean;
  italics?: boolean;
  shading?: { fill: string };
}

interface BorderSpec {
  style?: string;
  width?: number; // Points
  color?: string;
}

interface BorderSet {
  top?: BorderSpec;
  right?: BorderSpec;
  bottom?: BorderSpec;
  left?: BorderSpec;
}

interface ElementStyle {
  textAlign?: CellAlignment;
  verticalAlign?: VerticalAlignment;
  backgroundColor?: string;
  textColor?: string;
  bold?: boolean;
  italics?: boolean;
  borders?: BorderSet;
}

interface ParsedCell {
  columnIndex: number;
  rowSpan: number;
  colSpan: number;
  isHeaderCell: boolean;
  children: DOCXASTNode[];
  alignment?: CellAlignment;
  verticalAlign?: VerticalAlignment;
  backgroundColor?: string;
  textStyle?: RunStyle;
  borders?: BorderSet;
}

interface ParsedRow {
  cells: ParsedCell[];
  isHeaderRow: boolean;
}

export function parseHtmlTablesToDocxNodes(html: string): DOCXTableNode[] | null {
  const tables = parseHtmlTables(html);
  if (!tables) {
    return null;
  }

  const nodes = tables
    .map((table) => buildTableNode(table))
    .filter((node): node is DOCXTableNode => Boolean(node));

  return nodes.length > 0 ? nodes : null;
}

function parseHtmlTables(html: string): HTMLTableElement[] | null {
  if (!html || typeof DOMParser === 'undefined') {
    return null;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  return extractTablesFromDocument(doc);
}

function extractTablesFromDocument(doc: Document): HTMLTableElement[] | null {
  const tables = Array.from(doc.querySelectorAll('table')) as HTMLTableElement[];
  if (tables.length === 0) {
    return null;
  }

  if (!containsOnlyTables(doc.body)) {
    return null;
  }

  // Skip nested tables for now to avoid incorrect structure
  if (tables.some((table) => table.querySelector('table'))) {
    return null;
  }

  const topLevelTables = tables.filter((table) => !table.parentElement?.closest('table'));
  if (topLevelTables.length === 0) {
    return null;
  }

  return topLevelTables;
}

export function parseHtmlTablesToDomElements(html: string): HTMLTableElement[] | null {
  return parseHtmlTables(html);
}

function buildTableNode(tableEl: HTMLTableElement): DOCXTableNode | null {
  const rows = Array.from(tableEl.querySelectorAll('tr'));
  if (rows.length === 0) {
    return null;
  }

  const theadRows = Array.from(tableEl.querySelectorAll('thead tr'));
  const headerRowCount = theadRows.length > 0 ? theadRows.length : (rowHasHeaderCells(rows[0] as Element) ? 1 : 0);
  const tableStyle = readElementStyle(tableEl);
  const spanTracker: number[] = [];
  const parsedRows: ParsedRow[] = [];

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    for (let i = 0; i < spanTracker.length; i++) {
      if (spanTracker[i] > 0) {
        spanTracker[i] -= 1;
      }
    }

    const row = rows[rowIndex] as Element;
    const rowStyle = readElementStyle(row);
    const cells = Array.from(row.querySelectorAll('th,td'));
    let colIndex = 0;
    const parsedCells: ParsedCell[] = [];

    for (const cell of cells) {
      while (spanTracker[colIndex] > 0) {
        colIndex += 1;
      }

      const colSpan = normalizeSpan(getSpanAttribute(cell, 'colspan'));
      const rowSpan = normalizeSpan(getSpanAttribute(cell, 'rowspan'));
      const isHeaderCell = cell.tagName.toLowerCase() === 'th';
      const cellStyle = readElementStyle(cell);
      const effectiveStyle = mergeElementStyles(tableStyle, rowStyle, cellStyle);

      const children = parseInlineNodes(cell);
      const textStyle = buildCellRunStyle(effectiveStyle);

      parsedCells.push({
        columnIndex: colIndex,
        rowSpan,
        colSpan,
        isHeaderCell,
        children,
        alignment: effectiveStyle.textAlign,
        verticalAlign: effectiveStyle.verticalAlign,
        backgroundColor: effectiveStyle.backgroundColor,
        textStyle,
        borders: effectiveStyle.borders,
      });

      const remaining = rowSpan - 1;
      for (let c = colIndex; c < colIndex + colSpan; c++) {
        spanTracker[c] = Math.max(spanTracker[c] || 0, remaining);
      }

      colIndex += colSpan;
    }

    parsedRows.push({
      cells: parsedCells,
      isHeaderRow: rowIndex < headerRowCount,
    });
  }

  return {
    type: 'table',
    children: parsedRows.map((row) => ({
      type: 'tableRow',
      children: row.cells.map((cell) => ({
        type: 'tableCell',
        children: cell.children.length > 0 ? cell.children : [{ type: 'text', value: '' }],
        rowspan: cell.rowSpan > 1 ? cell.rowSpan : undefined,
        colspan: cell.colSpan > 1 ? cell.colSpan : undefined,
        columnIndex: cell.columnIndex,
        isHeaderCell: cell.isHeaderCell,
        alignment: cell.alignment,
        verticalAlign: cell.verticalAlign,
        backgroundColor: cell.backgroundColor,
        textStyle: cell.textStyle,
        borders: cell.borders,
      })),
      isHeaderRow: row.isHeaderRow,
    })) as DOCXASTNode[],
    headerRowCount: headerRowCount,
    explicitSpans: true,
  } as DOCXTableNode;
}

function rowHasHeaderCells(row?: Element): boolean {
  if (!row) {
    return false;
  }
  return Array.from(row.querySelectorAll('th')).length > 0;
}

function getSpanAttribute(cell: Element, name: 'colspan' | 'rowspan'): number | string | null {
  const attr = cell.getAttribute(name);
  if (attr) {
    return attr;
  }
  const anyCell = cell as { colSpan?: number; rowSpan?: number };
  if (name === 'colspan' && typeof anyCell.colSpan === 'number') {
    return anyCell.colSpan;
  }
  if (name === 'rowspan' && typeof anyCell.rowSpan === 'number') {
    return anyCell.rowSpan;
  }
  return null;
}

function normalizeSpan(value: number | string | null | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }
  return Math.floor(parsed);
}

function parseInlineNodes(cell: Element): DOCXASTNode[] {
  const nodes: DOCXASTNode[] = [];
  for (const child of Array.from(cell.childNodes)) {
    nodes.push(...parseInlineNode(child, {}));
  }
  return nodes;
}

function parseInlineNode(node: ChildNode, inheritedStyle: RunStyle): DOCXASTNode[] {
  const textNodeType = typeof Node !== 'undefined' ? Node.TEXT_NODE : 3;
  const elementNodeType = typeof Node !== 'undefined' ? Node.ELEMENT_NODE : 1;

  if (node.nodeType === textNodeType) {
    const text = normalizeInlineText(node.textContent || '');
    if (!text) {
      return [];
    }
    const style = hasRunStyle(inheritedStyle) ? { ...inheritedStyle } : undefined;
    return style ? [{ type: 'text', value: text, style }] : [{ type: 'text', value: text }];
  }

  if (node.nodeType !== elementNodeType) {
    return [];
  }

  const element = node as Element;
  const tag = element.tagName.toLowerCase();
  const elementStyle = readInlineRunStyle(element);

  if (tag === 'br') {
    return [{ type: 'break' }];
  }

  if (tag === 'strong' || tag === 'b') {
    return [{
      type: 'strong',
      children: parseInlineChildren(element, inheritedStyle),
      style: hasRunStyle(elementStyle) ? elementStyle : undefined,
    }];
  }

  if (tag === 'em' || tag === 'i') {
    return [{
      type: 'emphasis',
      children: parseInlineChildren(element, inheritedStyle),
      style: hasRunStyle(elementStyle) ? elementStyle : undefined,
    }];
  }

  if (tag === 'del' || tag === 's') {
    return [{
      type: 'delete',
      children: parseInlineChildren(element, inheritedStyle),
      style: hasRunStyle(elementStyle) ? elementStyle : undefined,
    }];
  }

  if (tag === 'sup') {
    return [{
      type: 'superscript',
      children: parseInlineChildren(element, inheritedStyle),
      style: hasRunStyle(elementStyle) ? elementStyle : undefined,
    }];
  }

  if (tag === 'sub') {
    return [{
      type: 'subscript',
      children: parseInlineChildren(element, inheritedStyle),
      style: hasRunStyle(elementStyle) ? elementStyle : undefined,
    }];
  }

  if (tag === 'code' || tag === 'kbd') {
    return [{ type: 'inlineCode', value: element.textContent || '' }];
  }

  if (tag === 'a') {
    const href = element.getAttribute('href') || '';
    const title = element.getAttribute('title') || undefined;
    return [{
      type: 'link',
      url: href,
      title,
      children: parseInlineChildren(element, inheritedStyle),
    }];
  }

  const mergedStyle = mergeRunStyles(inheritedStyle, elementStyle);
  return parseInlineChildren(element, mergedStyle);
}

function parseInlineChildren(element: Element, inheritedStyle: RunStyle): DOCXASTNode[] {
  const nodes: DOCXASTNode[] = [];
  for (const child of Array.from(element.childNodes)) {
    nodes.push(...parseInlineNode(child, inheritedStyle));
  }
  return nodes;
}

function normalizeInlineText(text: string): string {
  const normalized = text.replace(/\u00a0/g, ' ');
  if (!normalized.trim()) {
    return '';
  }
  return normalized.replace(/\s+/g, ' ');
}

function readInlineRunStyle(element: Element): RunStyle {
  const style = parseStyleAttribute(element.getAttribute('style'));
  const color = normalizeColor(style.color);
  const backgroundColor = normalizeColor(style['background-color'] || style.background);
  const bold = parseFontWeight(style['font-weight']);
  const italics = parseFontStyle(style['font-style']);

  const runStyle: RunStyle = {};
  if (color) runStyle.color = color;
  if (backgroundColor) runStyle.shading = { fill: backgroundColor };
  if (typeof bold === 'boolean') runStyle.bold = bold;
  if (typeof italics === 'boolean') runStyle.italics = italics;
  return runStyle;
}

function hasRunStyle(style: RunStyle): boolean {
  return Boolean(
    style.color ||
    style.bold !== undefined ||
    style.italics !== undefined ||
    style.shading
  );
}

function mergeRunStyles(base: RunStyle, override: RunStyle): RunStyle {
  return { ...base, ...override };
}

function readElementStyle(element: Element): ElementStyle {
  const style = parseStyleAttribute(element.getAttribute('style'));
  const textAlign = parseTextAlign(style['text-align'] || element.getAttribute('align'));
  const verticalAlign = parseVerticalAlign(style['vertical-align'] || element.getAttribute('valign'));
  const backgroundColor = normalizeColor(style['background-color'] || style.background || element.getAttribute('bgcolor'));
  const textColor = normalizeColor(style.color);
  const bold = parseFontWeight(style['font-weight']);
  const italics = parseFontStyle(style['font-style']);
  const borders = parseBorders(style);

  return {
    textAlign,
    verticalAlign,
    backgroundColor,
    textColor,
    bold,
    italics,
    borders,
  };
}

function mergeElementStyles(tableStyle: ElementStyle, rowStyle: ElementStyle, cellStyle: ElementStyle): ElementStyle {
  return {
    textAlign: cellStyle.textAlign ?? rowStyle.textAlign ?? tableStyle.textAlign,
    verticalAlign: cellStyle.verticalAlign ?? rowStyle.verticalAlign ?? tableStyle.verticalAlign,
    backgroundColor: cellStyle.backgroundColor ?? rowStyle.backgroundColor ?? tableStyle.backgroundColor,
    textColor: cellStyle.textColor ?? rowStyle.textColor ?? tableStyle.textColor,
    bold: pickDefined(cellStyle.bold, rowStyle.bold, tableStyle.bold),
    italics: pickDefined(cellStyle.italics, rowStyle.italics, tableStyle.italics),
    borders: mergeBorders(tableStyle.borders, rowStyle.borders, cellStyle.borders),
  };
}

function buildCellRunStyle(style: ElementStyle): RunStyle | undefined {
  const runStyle: RunStyle = {};
  if (style.textColor) runStyle.color = style.textColor;
  if (typeof style.bold === 'boolean') runStyle.bold = style.bold;
  if (typeof style.italics === 'boolean') runStyle.italics = style.italics;
  return hasRunStyle(runStyle) ? runStyle : undefined;
}

function pickDefined<T>(...values: Array<T | undefined>): T | undefined {
  for (const value of values) {
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function parseStyleAttribute(style: string | null): Record<string, string> {
  if (!style) {
    return {};
  }
  const entries = style
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const index = entry.indexOf(':');
      if (index === -1) {
        return null;
      }
      const key = entry.slice(0, index).trim().toLowerCase();
      const value = entry.slice(index + 1).trim();
      return key && value ? [key, value] : null;
    })
    .filter(Boolean) as Array<[string, string]>;

  return Object.fromEntries(entries);
}

function parseTextAlign(value: string | null | undefined): CellAlignment | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (normalized === 'center') return 'center';
  if (normalized === 'right') return 'right';
  if (normalized === 'justify') return 'justify';
  return 'left';
}

function parseVerticalAlign(value: string | null | undefined): VerticalAlignment | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (normalized === 'top') return 'top';
  if (normalized === 'bottom') return 'bottom';
  if (normalized === 'middle') return 'center';
  if (normalized === 'center') return 'center';
  return undefined;
}

function parseFontWeight(value: string | null | undefined): boolean | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (normalized === 'bold' || normalized === 'bolder') {
    return true;
  }
  if (normalized === 'normal' || normalized === 'lighter') {
    return false;
  }
  const numeric = Number(normalized);
  if (Number.isFinite(numeric)) {
    return numeric >= 600;
  }
  return undefined;
}

function parseFontStyle(value: string | null | undefined): boolean | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (normalized === 'italic' || normalized === 'oblique') {
    return true;
  }
  if (normalized === 'normal') {
    return false;
  }
  return undefined;
}

function normalizeColor(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim().toLowerCase();
  if (trimmed === 'transparent') {
    return undefined;
  }
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
      const [r, g, b] = parts.map((p) => Math.max(0, Math.min(255, Number.parseInt(p, 10))));
      if ([r, g, b].every((n) => Number.isFinite(n))) {
        return [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase();
      }
    }
  }
  const named = {
    black: '000000',
    white: 'FFFFFF',
    red: 'FF0000',
    green: '008000',
    blue: '0000FF',
    gray: '808080',
    grey: '808080',
    yellow: 'FFFF00',
  } as Record<string, string>;
  return named[trimmed];
}

function parseBorders(style: Record<string, string>): BorderSet | undefined {
  const base = parseBorderValue(style.border);
  const borders: BorderSet = {};
  if (base) {
    borders.top = base;
    borders.right = base;
    borders.bottom = base;
    borders.left = base;
  }

  const top = parseBorderValue(style['border-top']);
  const right = parseBorderValue(style['border-right']);
  const bottom = parseBorderValue(style['border-bottom']);
  const left = parseBorderValue(style['border-left']);
  if (top) borders.top = top;
  if (right) borders.right = right;
  if (bottom) borders.bottom = bottom;
  if (left) borders.left = left;

  return hasBorders(borders) ? borders : undefined;
}

function parseBorderValue(value: string | null | undefined): BorderSpec | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === 'none' || normalized === 'hidden') {
    return { style: 'none' };
  }

  const parts = normalized.split(/\s+/);
  let width: number | undefined;
  let style: string | undefined;
  let color: string | undefined;

  for (const part of parts) {
    if (!width && /px|pt$/.test(part)) {
      width = parseBorderWidth(part);
      continue;
    }
    if (!style && ['solid', 'dashed', 'dotted', 'double', 'none'].includes(part)) {
      style = part;
      continue;
    }
    if (!color && (part.startsWith('#') || part.startsWith('rgb') || isNamedColor(part))) {
      color = normalizeColor(part);
    }
  }

  return {
    width,
    style,
    color,
  };
}

function parseBorderWidth(value: string): number | undefined {
  const match = value.match(/([\d.]+)(px|pt)?/);
  if (!match) return undefined;
  const num = Number.parseFloat(match[1]);
  if (!Number.isFinite(num)) return undefined;
  const unit = match[2] || 'px';
  if (unit === 'pt') {
    return num;
  }
  return num * 0.75;
}

function isNamedColor(value: string): boolean {
  return ['black', 'white', 'red', 'green', 'blue', 'gray', 'grey', 'yellow'].includes(value);
}

function hasBorders(borders: BorderSet): boolean {
  return Boolean(borders.top || borders.right || borders.bottom || borders.left);
}

function mergeBorders(...bordersList: Array<BorderSet | undefined>): BorderSet | undefined {
  const merged: BorderSet = {};
  for (const borders of bordersList) {
    if (!borders) continue;
    if (borders.top) merged.top = borders.top;
    if (borders.right) merged.right = borders.right;
    if (borders.bottom) merged.bottom = borders.bottom;
    if (borders.left) merged.left = borders.left;
  }
  return hasBorders(merged) ? merged : undefined;
}

function containsOnlyTables(body: HTMLElement | null): boolean {
  if (!body) {
    return false;
  }

  const clone = body.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('table').forEach((table) => table.remove());

  const remainingText = (clone.textContent || '').replace(/\s+/g, '');
  if (remainingText.length > 0) {
    return false;
  }

  const remainingMedia = clone.querySelectorAll('img,svg,canvas,video,iframe,math');
  if (remainingMedia.length > 0) {
    return false;
  }

  return true;
}
