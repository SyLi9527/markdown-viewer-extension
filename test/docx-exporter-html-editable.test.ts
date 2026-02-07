import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHtmlToEditableAst } from '../src/utils/html-editable-parser.ts';

let hasDomParser = typeof DOMParser !== 'undefined';
if (!hasDomParser) {
  const { DOMParser } = await import('linkedom');
  globalThis.DOMParser = DOMParser;
  hasDomParser = true;
}

test('parseHtmlToEditableAst returns htmlTable for mixed html', { skip: !hasDomParser }, () => {
  const html = `<p>A</p><table><tr><td>B</td></tr></table><p>C</p>`;
  const nodes = parseHtmlToEditableAst(html, { maxTableDepth: 3 });
  assert.ok(nodes);
  assert.equal(nodes?.[1]?.type, 'htmlTable');
});
