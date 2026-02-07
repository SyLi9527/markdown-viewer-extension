import selectorParser from 'postcss-selector-parser';

export type Specificity = [number, number, number];

const PSEUDO_ELEMENTS = new Set([
  'before', 'after', 'first-line', 'first-letter', 'marker', 'placeholder'
]);

const PSEUDO_SELECTOR_LIST = new Set([
  'not', 'is', 'has', 'matches', '-webkit-any', '-moz-any', 'any'
]);

const ZERO_SPECIFICITY = new Set(['where']);

export function calculateSpecificity(selector: string): Specificity {
  let result: Specificity = [0, 0, 0];

  const processor = selectorParser((root) => {
    root.each((sel) => {
      const spec = calcSelectorSpecificity(sel);
      if (compareSpecificity(spec, result) > 0) result = spec;
    });
  });

  try {
    processor.processSync(selector);
  } catch {
    return [0, 0, 0];
  }

  return result;
}

function calcSelectorSpecificity(sel: selectorParser.Selector): Specificity {
  let spec: Specificity = [0, 0, 0];

  sel.walk((node) => {
    if (node.type === 'id') {
      spec[0] += 1;
      return;
    }

    if (node.type === 'class' || node.type === 'attribute') {
      spec[1] += 1;
      return;
    }

    if (node.type === 'tag') {
      if (node.value !== '*') spec[2] += 1;
      return;
    }

    if (node.type === 'pseudo') {
      const value = node.value.replace(/^:+/, '').toLowerCase();

      if (ZERO_SPECIFICITY.has(value)) return;

      if (PSEUDO_SELECTOR_LIST.has(value) && node.nodes?.length) {
        // :not(), :is(), :has(), :matches() => max specificity of selector list
        let max: Specificity = [0, 0, 0];
        node.nodes.forEach((n) => {
          if (n.type !== 'selector') return;
          const s = calcSelectorSpecificity(n);
          if (compareSpecificity(s, max) > 0) max = s;
        });
        spec = addSpecificity(spec, max);
        return;
      }

      if (node.value.startsWith('::') || PSEUDO_ELEMENTS.has(value)) {
        spec[2] += 1;
        return;
      }

      // pseudo-class
      spec[1] += 1;
    }
  });

  return spec;
}

function addSpecificity(a: Specificity, b: Specificity): Specificity {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function compareSpecificity(a: Specificity, b: Specificity): number {
  if (a[0] !== b[0]) return a[0] - b[0];
  if (a[1] !== b[1]) return a[1] - b[1];
  if (a[2] !== b[2]) return a[2] - b[2];
  return 0;
}
