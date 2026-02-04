import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPdfExportHtml } from '../src/exporters/pdf-exporter';

const html = '<div id="markdown-content"><h1>Title</h1></div>';

test('buildPdfExportHtml wraps content in export root', async () => {
  const result = await buildPdfExportHtml(html, { pageSize: 'A4', margin: '18mm' });
  assert.match(result, /data-export=\"pdf\"/);
});
