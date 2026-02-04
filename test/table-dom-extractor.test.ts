import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { extractTableDomModel } from '../src/utils/table-dom-extractor';

test('extractTableDomModel captures border and padding via resolver', () => {
  const { document } = parseHTML('<table><tr><td>Cell</td></tr></table>');
  const table = document.querySelector('table') as HTMLTableElement;

  const model = extractTableDomModel(table, {
    getStyle: () => ({
      borderTopWidth: '2px',
      borderTopStyle: 'solid',
      borderTopColor: '#ff0000',
      paddingTop: '4px',
      paddingRight: '6px',
      paddingBottom: '4px',
      paddingLeft: '6px',
      fontFamily: 'Arial',
      fontSize: '12px',
      fontWeight: '700',
      fontStyle: 'normal',
      color: '#111111',
      lineHeight: '16px',
      textAlign: 'center',
      verticalAlign: 'middle',
      backgroundColor: '#ffffff'
    } as any)
  });

  assert.equal(model.cells[0][0].padding.left, 6);
  assert.equal(model.cells[0][0].border.top.widthPx, 2);
});
