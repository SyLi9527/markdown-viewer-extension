import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInlineConverter } from '../src/exporters/docx-inline-converter.ts';

const themeStyles: any = {
  default: { run: { font: 'Arial', size: 24 }, paragraph: { spacing: { before: 0, after: 0, line: 276 } } },
  characterStyles: { code: { font: 'Consolas', size: 20, background: 'F6F8FA' } },
  linkColor: '0000FF',
  tableStyles: { cell: { margins: { top: 80, right: 80, bottom: 80, left: 80 } } },
  paragraphStyles: {}
};

test('inline converter applies node.style', async () => {
  const converter = createInlineConverter({
    themeStyles,
    fetchImageAsBuffer: async () => ({ buffer: new ArrayBuffer(0), width: 0, height: 0 }),
    reportResourceProgress: () => {}
  });

  const runs = await converter.convertInlineNodes([
    { type: 'text', value: 'Hi', style: { color: 'FF0000', bold: true, size: 28 } } as any
  ]);
  const run: any = runs[0];
  const color = run.properties.root.find((entry: any) => entry.rootKey === 'w:color');
  const size = run.properties.root.find((entry: any) => entry.rootKey === 'w:sz');
  const bold = run.properties.root.some((entry: any) => entry.rootKey === 'w:b');
  assert.equal(color?.root?.[0]?.root?.val, 'FF0000');
  assert.equal(size?.root?.[0]?.root?.val, 28);
  assert.ok(bold);
});
