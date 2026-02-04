import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { extractTableDomModel } from '../src/utils/table-dom-extractor';

// This is a lightweight assertion that DOM extraction is reachable.
// Full integration is validated in visual diff tests.

test('extractTableDomModel returns model for HTML table', () => {
  const { document } = parseHTML('<table><tr><td>1</td></tr></table>');
  const table = document.querySelector('table') as HTMLTableElement;
  const model = extractTableDomModel(table, { getStyle: () => ({ paddingTop: '0px' } as any) });
  assert.equal(model.rowCount, 1);
});
