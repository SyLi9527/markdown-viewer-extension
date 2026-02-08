import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHtmlTablesToDocxNodes } from '../src/utils/html-table-to-docx.ts';

const { DOMParser } = await import('linkedom');
globalThis.DOMParser = DOMParser;

test('tables parse when html contains style', () => {
  const html = `<style>td{border:1px solid #000}</style><table><tr><td>A</td></tr></table>`;
  const nodes = parseHtmlTablesToDocxNodes(html);
  assert.ok(nodes && nodes.length === 1);
});
