import test from 'node:test';
import assert from 'node:assert/strict';
import { getPdfExportCss } from '../src/exporters/pdf-export-styles';

test('pdf export css includes @page and export root selector', () => {
  const css = getPdfExportCss({ pageSize: 'A4', margin: '18mm' });
  assert.match(css, /@page\s*\{/);
  assert.match(css, /\[data-export=\"pdf\"\]/);
});
