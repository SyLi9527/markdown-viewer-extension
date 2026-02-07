import postcss from 'postcss';
import { calculateSpecificity, compareSpecificity, type Specificity } from './css-specificity';

const SUPPORTED_PROPERTIES = new Set([
  'color',
  'background',
  'background-color',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-decoration',
  'text-align',
  'vertical-align',
  'border',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'line-height'
]);

type DeclMeta = {
  value: string;
  important: boolean;
  specificity: Specificity;
  order: number;
};

export function preprocessHtmlForDocx(html: string): string {
  if (!html) return '';
  if (typeof DOMParser === 'undefined') {
    return html.replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '');
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(
    `<!doctype html><html><head></head><body>${html}</body></html>`,
    'text/html'
  );
  const styleNodes = Array.from(doc.querySelectorAll('style'));

  const cssText = styleNodes.map((n) => n.textContent || '').join('\n');
  styleNodes.forEach((n) => n.remove());

  if (cssText.trim()) {
    applyCss(doc, cssText);
  }

  return doc.body?.innerHTML ?? '';
}

function applyCss(doc: Document, cssText: string): void {
  let order = 0;
  const root = postcss.parse(cssText);
  const state = new Map<Element, Map<string, DeclMeta>>();

  const getState = (el: Element) => {
    const existing = state.get(el);
    if (existing) return existing;
    const fresh = readInlineStyles(el);
    state.set(el, fresh);
    return fresh;
  };

  root.walkRules((rule) => {
    if (rule.parent && rule.parent.type === 'atrule') return;

    const selectors = rule.selectors || [];
    const elementSpecificity = new Map<Element, Specificity>();

    for (const selector of selectors) {
      const specificity = calculateSpecificity(selector);
      let elements: Element[] = [];
      try {
        elements = Array.from(doc.querySelectorAll(selector));
      } catch {
        continue;
      }

      for (const el of elements) {
        const existing = elementSpecificity.get(el);
        if (!existing || compareSpecificity(specificity, existing) > 0) {
          elementSpecificity.set(el, specificity);
        }
      }
    }

    if (elementSpecificity.size === 0) return;

    const decls: Array<{ prop: string; value: string; important: boolean; order: number }> = [];
    rule.walkDecls((decl) => {
      const prop = decl.prop.toLowerCase();
      if (!SUPPORTED_PROPERTIES.has(prop)) return;
      decls.push({ prop, value: decl.value, important: decl.important, order: order++ });
    });

    if (decls.length === 0) return;

    for (const [el, specificity] of elementSpecificity) {
      const current = getState(el);
      for (const decl of decls) {
        const next: DeclMeta = {
          value: decl.value,
          important: decl.important,
          specificity,
          order: decl.order
        };
        const prev = current.get(decl.prop);
        if (!prev || compareDecl(next, prev) > 0) {
          current.set(decl.prop, next);
        }
      }
    }
  });

  for (const [el, current] of state) {
    writeInlineStyles(el, current);
  }
}

function readInlineStyles(el: Element): Map<string, DeclMeta> {
  const map = new Map<string, DeclMeta>();
  const attr = el.getAttribute('style') || '';
  const parts = attr.split(';').map((p) => p.trim()).filter(Boolean);

  let order = 0;
  for (const part of parts) {
    const idx = part.indexOf(':');
    if (idx === -1) continue;
    const prop = part.slice(0, idx).trim().toLowerCase();
    let value = part.slice(idx + 1).trim();
    let important = false;
    if (value.toLowerCase().endsWith('!important')) {
      important = true;
      value = value.replace(/\s*!important\s*$/i, '');
    }
    if (!prop || !value) continue;

    map.set(prop, {
      value,
      important,
      specificity: [1000, 0, 0],
      order: order++
    });
  }

  return map;
}

function writeInlineStyles(el: Element, map: Map<string, DeclMeta>): void {
  const entries = Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([prop, meta]) => `${prop}: ${meta.value}${meta.important ? ' !important' : ''}`);
  if (entries.length === 0) return;
  el.setAttribute('style', entries.join('; '));
}

function compareDecl(a: DeclMeta, b: DeclMeta): number {
  if (a.important !== b.important) return a.important ? 1 : -1;
  const spec = compareSpecificity(a.specificity, b.specificity);
  if (spec !== 0) return spec;
  return a.order - b.order;
}
