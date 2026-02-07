import type { DOCXASTNode } from '../types/docx';
import type { InlineNode } from '../exporters/docx-inline-converter';

export interface HtmlTableNode extends DOCXASTNode {
  type: 'htmlTable';
  headerRowCount: number;
  rows: HtmlTableRowNode[];
}

export interface HtmlTableRowNode {
  type: 'htmlTableRow';
  cells: HtmlTableCellNode[];
  isHeaderRow: boolean;
}

export interface HtmlTableCellNode {
  type: 'htmlTableCell';
  columnIndex: number;
  rowSpan: number;
  colSpan: number;
  isHeaderCell: boolean;
  style: HtmlCellStyle;
  children: DOCXASTNode[];
}

export interface HtmlCellStyle {
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  verticalAlign?: 'top' | 'center' | 'bottom';
  backgroundColor?: string;
  borders?: HtmlBorderSet;
  padding?: HtmlPadding;
}

export interface HtmlPadding {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

export interface HtmlBorder {
  style?: string;
  width?: number;
  color?: string;
}

export interface HtmlBorderSet {
  top?: HtmlBorder;
  right?: HtmlBorder;
  bottom?: HtmlBorder;
  left?: HtmlBorder;
}

interface ParseOptions {
  maxTableDepth?: number;
}

const BLOCK_TAGS = new Set(['p', 'div', 'table', 'ul', 'ol', 'hr']);
const INLINE_TAGS = new Set(['span', 'strong', 'em', 'u', 'code', 'a', 'br']);

export function parseHtmlToEditableAst(html: string, options: ParseOptions = {}): DOCXASTNode[] | null {
  if (!html || typeof DOMParser === 'undefined') return null;
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const body = doc.body;
  if (!body) return null;
  const maxTableDepth = options.maxTableDepth ?? 3;
  return parseBlockContainer(body, { maxTableDepth, tableDepth: 0 });
}

function parseBlockContainer(container: Element | DocumentFragment, ctx: { maxTableDepth: number; tableDepth: number }): DOCXASTNode[] {
  const blocks: DOCXASTNode[] = [];
  let inlineBuffer: InlineNode[] = [];

  const flushInline = () => {
    const cleaned = trimInlineBuffer(inlineBuffer);
    if (cleaned.length > 0) {
      blocks.push({ type: 'paragraph', children: cleaned });
    }
    inlineBuffer = [];
  };

  for (const node of Array.from(container.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      inlineBuffer.push(...parseInlineText(node.nodeValue || '', {}));
      continue;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    if (tag === 'br') {
      inlineBuffer.push({ type: 'break' } as InlineNode);
      continue;
    }

    if (BLOCK_TAGS.has(tag)) {
      flushInline();
      if (tag === 'p') {
        blocks.push(parseParagraph(el));
      } else if (tag === 'div') {
        const divBlocks = parseDiv(el, ctx);
        blocks.push(...divBlocks);
      } else if (tag === 'table') {
        const table = parseTable(el, ctx);
        if (table) blocks.push(table);
      } else if (tag === 'ul' || tag === 'ol') {
        blocks.push(parseList(el, ctx));
      } else if (tag === 'hr') {
        blocks.push({ type: 'thematicBreak' });
      }
      continue;
    }

    if (INLINE_TAGS.has(tag) || tag === 'span') {
      inlineBuffer.push(...parseInlineElement(el, {}));
      continue;
    }

    // Unknown tags: treat as container
    const nestedBlocks = parseBlockContainer(el, ctx);
    if (nestedBlocks.length > 0) {
      flushInline();
      blocks.push(...nestedBlocks);
    }
  }

  flushInline();
  return blocks;
}

function parseParagraph(el: Element): DOCXASTNode {
  const style = readInlineStyle(el);
  const children = parseInlineChildren(el, style);
  return { type: 'paragraph', children: children.length ? children : [{ type: 'text', value: '' }] };
}

function parseDiv(el: Element, ctx: { maxTableDepth: number; tableDepth: number }): DOCXASTNode[] {
  const hasBlockChild = Array.from(el.children).some((child) => BLOCK_TAGS.has(child.tagName.toLowerCase()));
  if (!hasBlockChild) {
    return [parseParagraph(el)];
  }
  return parseBlockContainer(el, ctx);
}

function parseList(el: Element, ctx: { maxTableDepth: number; tableDepth: number }): DOCXASTNode {
  const ordered = el.tagName.toLowerCase() === 'ol';
  const startAttr = ordered ? el.getAttribute('start') : null;
  const start = startAttr ? Number.parseInt(startAttr, 10) : undefined;
  const items = Array.from(el.children)
    .filter((child) => child.tagName.toLowerCase() === 'li')
    .map((li) => parseListItem(li as Element, ctx));

  return { type: 'list', ordered, start, children: items };
}

function parseListItem(el: Element, ctx: { maxTableDepth: number; tableDepth: number }): DOCXASTNode {
  const blocks = parseBlockContainer(el, ctx);
  if (blocks.length === 0) {
    return { type: 'listItem', children: [{ type: 'paragraph', children: [{ type: 'text', value: '' }] }] };
  }
  return { type: 'listItem', children: blocks } as DOCXASTNode;
}

function parseTable(tableEl: Element, ctx: { maxTableDepth: number; tableDepth: number }): HtmlTableNode | null {
  if (ctx.tableDepth >= ctx.maxTableDepth) {
    return null;
  }
  const tableDepth = ctx.tableDepth + 1;
  const rows = getTableRows(tableEl as HTMLTableElement);
  if (rows.length === 0) return null;
  const headerRowCount = getHeaderRowCount(tableEl, rows);
  const rowGroupEnds = getRowGroupEnds(rows);
  const maxColumns = computeMaxColumns(rows, rowGroupEnds);

  const tableStyle = readCellStyle(tableEl);
  const parsedRows: HtmlTableRowNode[] = [];
  const spanTracker: number[] = [];

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    for (let i = 0; i < spanTracker.length; i++) {
      if (spanTracker[i] > 0) spanTracker[i] -= 1;
    }

    const row = rows[rowIndex];
    const rowStyle = readCellStyle(row);
    const cells = getRowCells(row);
    let colIndex = 0;
    const parsedCells: HtmlTableCellNode[] = [];

    for (const cell of cells) {
      while (spanTracker[colIndex] > 0) colIndex += 1;

      const rowSpanAttr = parseSpan(cell.getAttribute('rowspan'));
      const rowGroupEnd = rowGroupEnds[rowIndex] ?? rowIndex;
      const rowSpan = rowSpanAttr === 0 ? rowGroupEnd - rowIndex + 1 : normalizeSpanValue(rowSpanAttr);

      const colSpanAttr = parseSpan(cell.getAttribute('colspan'));
      const colSpan = colSpanAttr === 0 ? Math.max(1, maxColumns - colIndex) : normalizeSpanValue(colSpanAttr);

      const cellStyle = mergeCellStyles(tableStyle, rowStyle, readCellStyle(cell));
      const isHeaderCell = cell.tagName.toLowerCase() === 'th';
      const children = parseBlockContainer(cell, { ...ctx, tableDepth });

      parsedCells.push({
        type: 'htmlTableCell',
        columnIndex: colIndex,
        rowSpan,
        colSpan,
        isHeaderCell,
        style: cellStyle,
        children: children.length ? children : [{ type: 'paragraph', children: [{ type: 'text', value: '' }] }],
      });

      for (let c = colIndex; c < colIndex + colSpan; c++) {
        spanTracker[c] = Math.max(spanTracker[c] || 0, rowSpan - 1);
      }

      colIndex += colSpan;
    }

    parsedRows.push({
      type: 'htmlTableRow',
      cells: parsedCells,
      isHeaderRow: rowIndex < headerRowCount,
    });
  }

  return { type: 'htmlTable', headerRowCount, rows: parsedRows };
}

function parseInlineChildren(element: Element, inherited: InlineNode['style'] | undefined): InlineNode[] {
  const nodes: InlineNode[] = [];
  for (const child of Array.from(element.childNodes)) {
    nodes.push(...parseInlineNode(child, inherited));
  }
  return nodes;
}

function parseInlineNode(node: ChildNode, inherited: InlineNode['style'] | undefined): InlineNode[] {
  if (node.nodeType === Node.TEXT_NODE) {
    return parseInlineText(node.nodeValue || '', inherited);
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return [];
  const el = node as Element;
  const tag = el.tagName.toLowerCase();

  if (tag === 'br') return [{ type: 'break' } as InlineNode];

  const style = mergeRunStyles(inherited, readInlineStyle(el));

  if (tag === 'strong') {
    return [{ type: 'strong', children: parseInlineChildren(el, style), style } as InlineNode];
  }
  if (tag === 'em') {
    return [{ type: 'emphasis', children: parseInlineChildren(el, style), style } as InlineNode];
  }
  if (tag === 'u') {
    const underlineStyle = { ...style, underline: { type: 'single' as const } };
    return parseInlineChildren(el, underlineStyle);
  }
  if (tag === 'code') {
    const value = el.textContent || '';
    const node: InlineNode = { type: 'inlineCode', value } as InlineNode;
    if (style && Object.keys(style).length > 0) node.style = style;
    return [node];
  }
  if (tag === 'a') {
    const url = el.getAttribute('href') || '#';
    return [{ type: 'link', url, children: parseInlineChildren(el, style) } as InlineNode];
  }

  return parseInlineChildren(el, style);
}

function parseInlineElement(el: Element, inherited: InlineNode['style'] | undefined): InlineNode[] {
  return parseInlineNode(el, inherited);
}

function parseInlineText(text: string, style: InlineNode['style'] | undefined): InlineNode[] {
  const normalized = normalizeInlineText(text);
  if (!normalized) return [];
  const node: InlineNode = { type: 'text', value: normalized } as InlineNode;
  if (style && Object.keys(style).length > 0) node.style = style;
  return [node];
}

function normalizeInlineText(text: string): string {
  const normalized = text.replace(/\u00a0/g, ' ');
  if (!normalized.trim()) return '';
  return normalized.replace(/\s+/g, ' ');
}

function trimInlineBuffer(nodes: InlineNode[]): InlineNode[] {
  if (nodes.length === 0) return nodes;
  const trimmed = [...nodes];
  if (trimmed[0]?.type === 'text') {
    trimmed[0].value = trimmed[0].value.replace(/^\s+/, '');
  }
  if (trimmed[trimmed.length - 1]?.type === 'text') {
    trimmed[trimmed.length - 1].value = trimmed[trimmed.length - 1].value.replace(/\s+$/, '');
  }
  return trimmed.filter((node) => node.type !== 'text' || node.value.trim() !== '');
}

function readInlineStyle(el: Element): InlineNode['style'] {
  const style = parseStyleAttribute(el.getAttribute('style'));
  const run: InlineNode['style'] = {};
  const color = normalizeColor(style.color);
  const background = normalizeColor(style['background-color'] || style.background);
  const bold = parseFontWeight(style['font-weight']);
  const italics = parseFontStyle(style['font-style']);

  if (color) run.color = color;
  if (background) run.shading = { fill: background };
  if (typeof bold === 'boolean') run.bold = bold;
  if (typeof italics === 'boolean') run.italics = italics;
  if (style['text-decoration']?.includes('underline')) {
    run.underline = { type: 'single' as const };
  }
  if (style['font-family']) run.font = style['font-family'];
  if (style['font-size']) {
    const size = parseFontSize(style['font-size']);
    if (size) run.size = size;
  }

  return run;
}

function mergeRunStyles(base?: InlineNode['style'], override?: InlineNode['style']): InlineNode['style'] {
  if (!base && !override) return {};
  return { ...(base || {}), ...(override || {}) };
}

function parseFontSize(value: string): number | undefined {
  const match = value.trim().match(/([\d.]+)(px|pt)?/i);
  if (!match) return undefined;
  const num = Number.parseFloat(match[1]);
  if (!Number.isFinite(num)) return undefined;
  const unit = (match[2] || 'px').toLowerCase();
  const pt = unit === 'pt' ? num : num * 0.75; // px -> pt
  return Math.round(pt * 2); // half-points
}

function parseStyleAttribute(style: string | null): Record<string, string> {
  if (!style) return {};
  const entries = style
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const index = entry.indexOf(':');
      if (index === -1) return null;
      const key = entry.slice(0, index).trim().toLowerCase();
      const value = entry.slice(index + 1).trim();
      return key && value ? [key, value] : null;
    })
    .filter(Boolean) as Array<[string, string]>;
  return Object.fromEntries(entries);
}

function parseFontWeight(value: string | null | undefined): boolean | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (normalized === 'bold' || normalized === 'bolder') return true;
  if (normalized === 'normal' || normalized === 'lighter') return false;
  const numeric = Number(normalized);
  if (Number.isFinite(numeric)) return numeric >= 600;
  return undefined;
}

function parseFontStyle(value: string | null | undefined): boolean | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (normalized === 'italic' || normalized === 'oblique') return true;
  if (normalized === 'normal') return false;
  return undefined;
}

function normalizeColor(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim().toLowerCase();
  if (trimmed === 'transparent') return undefined;
  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1);
    if (hex.length === 3) return hex.split('').map((c) => c + c).join('').toUpperCase();
    if (hex.length >= 6) return hex.slice(0, 6).toUpperCase();
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
  const named: Record<string, string> = {
    black: '000000',
    white: 'FFFFFF',
    red: 'FF0000',
    green: '008000',
    blue: '0000FF',
    gray: '808080',
    grey: '808080',
    yellow: 'FFFF00',
  };
  return named[trimmed];
}

function readCellStyle(el: Element): HtmlCellStyle {
  const style = parseStyleAttribute(el.getAttribute('style'));
  const textAlign = parseTextAlign(style['text-align'] || el.getAttribute('align'));
  const verticalAlign = parseVerticalAlign(style['vertical-align'] || el.getAttribute('valign'));
  const backgroundColor = normalizeColor(style['background-color'] || style.background || el.getAttribute('bgcolor'));
  const borders = parseBorders(style);
  const padding = parsePadding(style);

  return { textAlign, verticalAlign, backgroundColor, borders, padding };
}

function mergeCellStyles(table: HtmlCellStyle, row: HtmlCellStyle, cell: HtmlCellStyle): HtmlCellStyle {
  return {
    textAlign: cell.textAlign ?? row.textAlign ?? table.textAlign,
    verticalAlign: cell.verticalAlign ?? row.verticalAlign ?? table.verticalAlign,
    backgroundColor: cell.backgroundColor ?? row.backgroundColor ?? table.backgroundColor,
    borders: mergeBorders(table.borders, row.borders, cell.borders),
    padding: mergePadding(table.padding, row.padding, cell.padding),
  };
}

function parseTextAlign(value: string | null | undefined): HtmlCellStyle['textAlign'] {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (normalized === 'center') return 'center';
  if (normalized === 'right') return 'right';
  if (normalized === 'justify') return 'justify';
  return 'left';
}

function parseVerticalAlign(value: string | null | undefined): HtmlCellStyle['verticalAlign'] {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (normalized === 'top') return 'top';
  if (normalized === 'bottom') return 'bottom';
  if (normalized === 'middle' || normalized === 'center') return 'center';
  return undefined;
}

function parsePadding(style: Record<string, string>): HtmlPadding | undefined {
  const padding = style.padding;
  if (!padding && !style['padding-top'] && !style['padding-right'] && !style['padding-bottom'] && !style['padding-left']) {
    return undefined;
  }
  const [top, right, bottom, left] = parseBox(padding);
  return {
    top: parsePx(style['padding-top']) ?? top,
    right: parsePx(style['padding-right']) ?? right,
    bottom: parsePx(style['padding-bottom']) ?? bottom,
    left: parsePx(style['padding-left']) ?? left,
  };
}

function parseBox(value?: string): [number?, number?, number?, number?] {
  if (!value) return [undefined, undefined, undefined, undefined];
  const parts = value.split(/\s+/).map((part) => parsePx(part));
  if (parts.length === 1) return [parts[0], parts[0], parts[0], parts[0]];
  if (parts.length === 2) return [parts[0], parts[1], parts[0], parts[1]];
  if (parts.length === 3) return [parts[0], parts[1], parts[2], parts[1]];
  return [parts[0], parts[1], parts[2], parts[3]];
}

function parsePx(value?: string | null): number | undefined {
  if (!value) return undefined;
  const match = value.trim().match(/([\d.]+)(px|pt)?/i);
  if (!match) return undefined;
  const num = Number.parseFloat(match[1]);
  if (!Number.isFinite(num)) return undefined;
  const unit = (match[2] || 'px').toLowerCase();
  return unit === 'pt' ? num / 0.75 : num;
}

function parseBorders(style: Record<string, string>): HtmlBorderSet | undefined {
  const all = parseBorder(style.border);
  const top = parseBorder(style['border-top']) || all;
  const right = parseBorder(style['border-right']) || all;
  const bottom = parseBorder(style['border-bottom']) || all;
  const left = parseBorder(style['border-left']) || all;

  if (!top && !right && !bottom && !left) return undefined;
  return { top, right, bottom, left };
}

function parseBorder(value?: string): HtmlBorder | undefined {
  if (!value) return undefined;
  const parts = value.split(/\s+/).filter(Boolean);
  let width: number | undefined;
  let style: string | undefined;
  let color: string | undefined;
  for (const part of parts) {
    if (!width && /\d/.test(part)) {
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
  return { width, style, color };
}

function parseBorderWidth(value: string): number | undefined {
  const match = value.match(/([\d.]+)(px|pt)?/);
  if (!match) return undefined;
  const num = Number.parseFloat(match[1]);
  if (!Number.isFinite(num)) return undefined;
  const unit = match[2] || 'px';
  return unit === 'pt' ? num / 0.75 : num;
}

function isNamedColor(value: string): boolean {
  return ['black', 'white', 'red', 'green', 'blue', 'gray', 'grey', 'yellow'].includes(value.toLowerCase());
}

function mergeBorders(...bordersList: Array<HtmlBorderSet | undefined>): HtmlBorderSet | undefined {
  const merged: HtmlBorderSet = {};
  for (const borders of bordersList) {
    if (!borders) continue;
    if (borders.top) merged.top = borders.top;
    if (borders.right) merged.right = borders.right;
    if (borders.bottom) merged.bottom = borders.bottom;
    if (borders.left) merged.left = borders.left;
  }
  return Object.keys(merged).length ? merged : undefined;
}

function mergePadding(...paddingList: Array<HtmlPadding | undefined>): HtmlPadding | undefined {
  const merged: HtmlPadding = {};
  for (const padding of paddingList) {
    if (!padding) continue;
    if (padding.top !== undefined) merged.top = padding.top;
    if (padding.right !== undefined) merged.right = padding.right;
    if (padding.bottom !== undefined) merged.bottom = padding.bottom;
    if (padding.left !== undefined) merged.left = padding.left;
  }
  return Object.keys(merged).length ? merged : undefined;
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

function getHeaderRowCount(table: Element, rows: HTMLTableRowElement[]): number {
  const theadRows = Array.from(table.querySelectorAll('thead tr'));
  if (theadRows.length > 0) return theadRows.length;
  if (!rows[0]) return 0;
  const firstRow = rows[0];
  const headerCells = Array.from(firstRow.querySelectorAll('th'));
  return headerCells.length > 0 ? 1 : 0;
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
      const rowspan = rowspanValue === 0 ? rowGroupEnd - r + 1 : normalizeSpanValue(rowspanValue);
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

function parseSpan(value: string | null): number | null {
  if (value === null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? Math.floor(num) : null;
}

function normalizeSpanValue(value: number | null): number {
  return value && value > 1 ? value : 1;
}
