import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preprocessHtmlForDocx } from '../src/utils/html-style-preprocessor.ts';

const { DOMParser } = await import('linkedom');
globalThis.DOMParser = DOMParser;

test('applies css rules and strips style tags', () => {
  const html = `
    <style>.outer td { border: 1px solid #333; padding: 6px; color: #ff0000; }</style>
    <table class="outer"><tr><td>Cell</td></tr></table>
  `;
  const out = preprocessHtmlForDocx(html);
  const doc = new DOMParser().parseFromString(out, 'text/html');
  assert.equal(doc.querySelectorAll('style').length, 0);
  const td = doc.querySelector('td')!;
  const style = td.getAttribute('style') || '';
  assert.match(style, /border:\s*1px solid #333/i);
  assert.match(style, /padding:\s*6px/i);
  assert.match(style, /color:\s*#ff0000/i);
});

test('honors !important over inline', () => {
  const html = `
    <style>td { color: #0000ff !important; }</style>
    <table><tr><td style="color:#ff0000">Cell</td></tr></table>
  `;
  const out = preprocessHtmlForDocx(html);
  const doc = new DOMParser().parseFromString(out, 'text/html');
  const td = doc.querySelector('td')!;
  const style = td.getAttribute('style') || '';
  assert.match(style, /color:\s*#0000ff/i);
});

test('later rules with same specificity override earlier', () => {
  const html = `
    <style>
      td { color: #111111; }
      td { color: #222222; }
    </style>
    <table><tr><td>Cell</td></tr></table>
  `;
  const out = preprocessHtmlForDocx(html);
  const doc = new DOMParser().parseFromString(out, 'text/html');
  const td = doc.querySelector('td')!;
  const style = td.getAttribute('style') || '';
  assert.match(style, /color:\s*#222222/i);
});
