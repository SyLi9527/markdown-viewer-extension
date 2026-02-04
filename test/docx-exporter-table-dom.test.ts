import { test } from 'node:test';
import assert from 'node:assert/strict';
import DocxExporter from '../src/exporters/docx-exporter';

// Lightweight wiring check for the DOM table export path.

test('docx-exporter uses DOM table model when HTML contains a table', async () => {
  const exporter = new DocxExporter(null);
  const htmlNode = { type: 'html', value: '<table><tr><td>1</td></tr></table>' } as any;
  const result = await (exporter as any).convertNode(htmlNode);
  assert.ok(result);
});
