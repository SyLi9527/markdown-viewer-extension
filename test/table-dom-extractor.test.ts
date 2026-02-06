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

test('extractTableDomModel maps span cells to source element styles', () => {
  const { document } = parseHTML(`
    <table>
      <tr>
        <td rowspan="2" data-style="origin">A</td>
        <td data-style="b">B</td>
        <td data-style="c">C</td>
      </tr>
      <tr>
        <td colspan="2" data-style="span">D</td>
      </tr>
    </table>
  `);
  const table = document.querySelector('table') as HTMLTableElement;

  const model = extractTableDomModel(table, {
    getStyle: (node) => {
      const key = (node as HTMLElement).getAttribute('data-style') || 'table';
      const paddingLeftMap: Record<string, string> = {
        origin: '11px',
        span: '22px',
        table: '99px',
        b: '5px',
        c: '6px'
      };

      return {
        paddingTop: '0px',
        paddingRight: '0px',
        paddingBottom: '0px',
        paddingLeft: paddingLeftMap[key] || '0px',
        borderTopWidth: '0px',
        borderTopStyle: 'none',
        borderTopColor: '#000000',
        borderRightWidth: '0px',
        borderRightStyle: 'none',
        borderRightColor: '#000000',
        borderBottomWidth: '0px',
        borderBottomStyle: 'none',
        borderBottomColor: '#000000',
        borderLeftWidth: '0px',
        borderLeftStyle: 'none',
        borderLeftColor: '#000000',
        fontFamily: 'Arial',
        fontSize: '12px',
        fontWeight: '400',
        fontStyle: 'normal',
        color: '#000000',
        lineHeight: '16px',
        textAlign: 'left',
        verticalAlign: 'middle',
        backgroundColor: '#ffffff'
      } as any;
    }
  });

  assert.equal(model.cells[1][0].padding.left, 11);
  assert.equal(model.cells[1][2].padding.left, 22);
});

test('extractTableDomModel falls back to table style for sparse cells', () => {
  const { document } = parseHTML(`
    <table data-style="table">
      <tr>
        <td data-style="a">A</td>
        <td data-style="b">B</td>
      </tr>
      <tr>
        <td data-style="c">C</td>
      </tr>
    </table>
  `);
  const table = document.querySelector('table') as HTMLTableElement;

  const model = extractTableDomModel(table, {
    getStyle: (node) => {
      const key = (node as HTMLElement).getAttribute('data-style') || 'table';
      const paddingLeftMap: Record<string, string> = {
        table: '40px',
        a: '10px',
        b: '20px',
        c: '30px'
      };

      return {
        paddingTop: '0px',
        paddingRight: '0px',
        paddingBottom: '0px',
        paddingLeft: paddingLeftMap[key] || '0px',
        borderTopWidth: '0px',
        borderTopStyle: 'none',
        borderTopColor: '#000000',
        borderRightWidth: '0px',
        borderRightStyle: 'none',
        borderRightColor: '#000000',
        borderBottomWidth: '0px',
        borderBottomStyle: 'none',
        borderBottomColor: '#000000',
        borderLeftWidth: '0px',
        borderLeftStyle: 'none',
        borderLeftColor: '#000000',
        fontFamily: 'Arial',
        fontSize: '12px',
        fontWeight: '400',
        fontStyle: 'normal',
        color: '#000000',
        lineHeight: '16px',
        textAlign: 'left',
        verticalAlign: 'middle',
        backgroundColor: '#ffffff'
      } as any;
    }
  });

  assert.equal(model.cells[1][1].padding.left, 40);
});

test('extractTableDomModel falls back to table styles for missing slots', () => {
  const { document } = parseHTML(`
    <table>
      <tr><td data-style="a">A</td><td data-style="b">B</td></tr>
      <tr><td data-style="c">C</td></tr>
    </table>
  `);
  const table = document.querySelector('table') as HTMLTableElement;

  const model = extractTableDomModel(table, {
    getStyle: (node) => {
      const key = (node as HTMLElement).getAttribute('data-style') || 'table';
      const paddingLeftMap: Record<string, string> = {
        table: '99px',
        a: '11px',
        b: '22px',
        c: '33px'
      };

      return {
        paddingTop: '0px',
        paddingRight: '0px',
        paddingBottom: '0px',
        paddingLeft: paddingLeftMap[key] || '0px',
        borderTopWidth: '0px',
        borderTopStyle: 'none',
        borderTopColor: '#000000',
        borderRightWidth: '0px',
        borderRightStyle: 'none',
        borderRightColor: '#000000',
        borderBottomWidth: '0px',
        borderBottomStyle: 'none',
        borderBottomColor: '#000000',
        borderLeftWidth: '0px',
        borderLeftStyle: 'none',
        borderLeftColor: '#000000',
        fontFamily: 'Arial',
        fontSize: '12px',
        fontWeight: '400',
        fontStyle: 'normal',
        color: '#000000',
        lineHeight: '16px',
        textAlign: 'left',
        verticalAlign: 'middle',
        backgroundColor: '#ffffff'
      } as any;
    }
  });

  assert.equal(model.cells[1][1].padding.left, 99);
});
