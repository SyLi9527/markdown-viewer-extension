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
  it('parses when Node is undefined', { skip: !hasDomParser }, () => {
    const globalWithNode = globalThis as typeof globalThis & { Node?: any };
    const hasNode = Object.prototype.hasOwnProperty.call(globalWithNode, 'Node');
    const originalNode = globalWithNode.Node;

    try {
      if (hasNode) {
        const descriptor = Object.getOwnPropertyDescriptor(globalWithNode, 'Node');
        if (descriptor?.configurable) {
          delete globalWithNode.Node;
        } else {
          globalWithNode.Node = undefined;
        }
      } else {
        delete globalWithNode.Node;
      }

      const html = '<p>Hi</p>';
      assert.doesNotThrow(() => {
        parseHtmlToEditableAst(html, { maxTableDepth: 3 });
      });
      const blocks = parseHtmlToEditableAst(html, { maxTableDepth: 3 });
      assert.ok(blocks);
      assert.strictEqual(blocks?.[0]?.type, 'paragraph');
    } finally {
      if (hasNode) {
        globalWithNode.Node = originalNode;
      } else {
        delete globalWithNode.Node;
      }
    }
  });

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

  it('skips style tags', { skip: !hasDomParser }, () => {
    const html = `<style>p{color:red}</style><p>Hi</p>`;
    const blocks = parseHtmlToEditableAst(html, { maxTableDepth: 3 });
    assert.ok(blocks);
    assert.strictEqual(blocks?.length, 1);
    assert.strictEqual(blocks?.[0]?.type, 'paragraph');
  });

  it('inherits container color to text', { skip: !hasDomParser }, () => {
    const html = `<div style="color:#ff0000"><p>Hi</p></div>`;
    const blocks = parseHtmlToEditableAst(html, { maxTableDepth: 3 });
    const text = (blocks?.[0] as any)?.children?.[0];
    assert.strictEqual(text?.style?.color, 'FF0000');
  });

  it('captures paragraph alignment', { skip: !hasDomParser }, () => {
    const html = `<p style="text-align:center">Center</p>`;
    const blocks = parseHtmlToEditableAst(html, { maxTableDepth: 3 });
    assert.strictEqual((blocks?.[0] as any)?.alignment, 'center');
  });
});
