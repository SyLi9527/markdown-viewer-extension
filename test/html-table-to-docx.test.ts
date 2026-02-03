/**
 * Tests for HTML table -> DOCX table parsing
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseHtmlTablesToDocxNodes } from '../src/utils/html-table-to-docx.ts';

let hasDomParser = typeof DOMParser !== 'undefined';
if (!hasDomParser) {
  const { DOMParser } = await import('linkedom');
  globalThis.DOMParser = DOMParser;
  hasDomParser = true;
}

describe('html-table-to-docx', () => {
  it('should parse multiple tables', { skip: !hasDomParser }, () => {
    const html = `
      <table><tr><td>One</td></tr></table>
      <table><tr><td>Two</td></tr></table>
    `;
    const tables = parseHtmlTablesToDocxNodes(html);
    assert.ok(tables, 'Expected tables to be parsed');
    assert.strictEqual(tables?.length, 2);
  });

  it('should extract styles and inline formatting', { skip: !hasDomParser }, () => {
    const html = `
      <table style="color:#333; text-align:center;">
        <tr>
          <th style="text-align:left; background-color:#ff0000;">Header</th>
          <th>H2</th>
        </tr>
        <tr style="vertical-align: bottom;">
          <td style="font-weight:bold; color: rgb(0,128,0); border: 1px solid #000;">
            A <strong>B</strong> <em>C</em> <span style="color:#0000ff;">D</span>
          </td>
          <td style="background:#00f; font-style: italic;">E</td>
        </tr>
      </table>
    `;
    const tables = parseHtmlTablesToDocxNodes(html);
    assert.ok(tables, 'Expected table to be parsed');
    const table = tables?.[0] as any;
    assert.ok(table, 'Expected first table');

    const headerRow = table.children[0];
    const headerCell = headerRow.children[0];
    assert.strictEqual(headerCell.alignment, 'left');
    assert.strictEqual(headerCell.backgroundColor, 'FF0000');

    const dataRow = table.children[1];
    const dataCell = dataRow.children[0];
    assert.strictEqual(dataCell.verticalAlign, 'bottom');
    assert.strictEqual(dataCell.textStyle?.bold, true);
    assert.strictEqual(dataCell.textStyle?.color, '008000');
    assert.strictEqual(dataCell.borders?.top?.style, 'solid');
    assert.strictEqual(dataCell.borders?.top?.color, '000000');

    const hasStrong = hasNodeType(dataCell.children, 'strong');
    const hasEm = hasNodeType(dataCell.children, 'emphasis');
    assert.ok(hasStrong, 'Expected strong node');
    assert.ok(hasEm, 'Expected emphasis node');

    const blueText = findTextNodeWithColor(dataCell.children, '0000FF');
    assert.ok(blueText, 'Expected span text with color style');

    const secondCell = dataRow.children[1];
    assert.strictEqual(secondCell.backgroundColor, '0000FF');
    assert.strictEqual(secondCell.textStyle?.italics, true);
  });
});

function hasNodeType(nodes: any[], type: string): boolean {
  for (const node of nodes || []) {
    if (node?.type === type) {
      return true;
    }
    if (node?.children && hasNodeType(node.children, type)) {
      return true;
    }
  }
  return false;
}

function findTextNodeWithColor(nodes: any[], color: string): any | null {
  for (const node of nodes || []) {
    if (node?.type === 'text' && node?.style?.color === color) {
      return node;
    }
    if (node?.children) {
      const found = findTextNodeWithColor(node.children, color);
      if (found) {
        return found;
      }
    }
  }
  return null;
}
