import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import rehypeTableId from '../src/plugins/rehype-table-id';

test('rehype-table-id adds data-table-id', async () => {
  const file = await unified()
    .use(remarkParse)
    .use(remarkRehype)
    .use(rehypeTableId)
    .use(rehypeStringify)
    .process('| a |\n| - |\n| b |');
  const html = String(file);
  assert.match(html, /data-table-id="/);
});
