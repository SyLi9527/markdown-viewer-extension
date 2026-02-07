import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseHtmlToEditableAst } from '../src/utils/html-editable-parser.ts';

let hasDomParser = typeof DOMParser !== 'undefined';
if (!hasDomParser) {
  const { DOMParser } = await import('linkedom');
  globalThis.DOMParser = DOMParser;
  hasDomParser = true;
}

describe('html-editable-parser', () => {
  it('parses mixed HTML into block order', { skip: !hasDomParser }, () => {
    const html = `
      <p>Intro <strong>bold</strong></p>
      <table>
        <tr><th>H</th><th>H2</th></tr>
        <tr><td>A</td><td>B</td></tr>
      </table>
      <ul><li>One</li><li>Two</li></ul>
      <p>After</p>
    `;
    const blocks = parseHtmlToEditableAst(html, { maxTableDepth: 3 });
    assert.ok(blocks);
    assert.strictEqual(blocks?.[0]?.type, 'paragraph');
    assert.strictEqual(blocks?.[1]?.type, 'htmlTable');
    assert.strictEqual(blocks?.[2]?.type, 'list');
    assert.strictEqual(blocks?.[3]?.type, 'paragraph');
  });

  it('keeps nested tables inside table cells', { skip: !hasDomParser }, () => {
    const html = `
      <table>
        <tr>
          <td>
            Outer
            <table>
              <tr><td>Inner</td></tr>
            </table>
          </td>
        </tr>
      </table>
    `;
    const blocks = parseHtmlToEditableAst(html, { maxTableDepth: 3 });
    const table = blocks?.[0] as any;
    const cellBlocks = table?.rows?.[0]?.cells?.[0]?.children || [];
    const hasNested = cellBlocks.some((b: any) => b.type === 'htmlTable');
    assert.ok(hasNested, 'expected nested table block in cell');
  });
});
