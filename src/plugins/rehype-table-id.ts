import { visit } from 'unist-util-visit';
import type { Root, Element } from 'hast';

export default function rehypeTableId() {
  return (tree: Root) => {
    let id = 0;
    visit(tree, 'element', (node: Element) => {
      if (node.tagName === 'table') {
        node.properties = node.properties || {};
        (node.properties as any)['data-table-id'] = `table-${++id}`;
      }
    });
  };
}
