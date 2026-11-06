/* eslint-env es2021 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addImportmap } from '../../tools/quick-edit/quick-edit.js';

test('quick edit adds only missing mappings and preserves existing dependency URLs', (t) => {
  const previousDocument = globalThis.document;
  t.after(() => {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  });
  const existing = { imports: { 'da-lit': 'https://example.test/custom-lit.js', other: '/other.js' } };
  const scripts = [{ textContent: JSON.stringify(existing) }];
  globalThis.document = {
    querySelectorAll: () => scripts,
    createElement: () => ({}),
    head: { appendChild: (script) => scripts.push(script) },
  };
  addImportmap();
  assert.equal(scripts.length, 2);
  assert.deepEqual(JSON.parse(scripts[0].textContent), existing);
  assert.deepEqual(JSON.parse(scripts[1].textContent), {
    imports: { 'da-y-wrapper': 'https://da.live/deps/da-y-wrapper/dist/index.js' },
  });
  addImportmap();
  assert.equal(scripts.length, 2);
});

test('quick edit installs both dependencies once when no existing map provides them', (t) => {
  const previousDocument = globalThis.document;
  t.after(() => {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  });
  const scripts = [];
  globalThis.document = {
    querySelectorAll: () => scripts,
    createElement: () => ({}),
    head: { appendChild: (script) => scripts.push(script) },
  };
  addImportmap();
  addImportmap();
  assert.equal(scripts.length, 1);
  assert.deepEqual(Object.keys(JSON.parse(scripts[0].textContent).imports), ['da-lit', 'da-y-wrapper']);
});
