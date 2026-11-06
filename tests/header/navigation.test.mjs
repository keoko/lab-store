import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LANGUAGES } from '../fixtures/languages.js';
import {
  getNavigationPath, getNavigationTool, loadNavigation,
} from '../../blocks/header/navigation.js';

const locationFor = (pathname) => new URL(pathname, 'https://frescopa.coffee');
const loadNav = (meta, location, loader) => loadNavigation(meta, location, loader, LANGUAGES);

test('uses the language navigation for home and deep pages', () => {
  LANGUAGES.forEach(({ prefix }) => {
    const expected = prefix ? `/${prefix}/fragments/nav` : '/fragments/nav';
    ['', '/', '/machines/atelier'].forEach((page) => {
      const location = locationFor(prefix ? `/${prefix}${page}` : page || '/');
      assert.equal(getNavigationPath('', location, LANGUAGES), expected);
      assert.equal(getNavigationPath('/fragments/nav', location, LANGUAGES), expected);
    });
  });
});

test('preserves custom Nav metadata and ignores partial language prefixes', () => {
  const location = locationFor('/de/machines');
  assert.equal(getNavigationPath('/de/fragments/special-nav', location, LANGUAGES), '/de/fragments/special-nav');
  assert.equal(getNavigationPath('/fragments/shared-nav', location, LANGUAGES), '/fragments/shared-nav');
  assert.equal(getNavigationPath('', locationFor('/deutsch'), LANGUAGES), '/fragments/nav');
});

test('loads the localized fragment without requesting English', async () => {
  const requests = [];
  const fragment = {};
  const result = await loadNav('', locationFor('/de/'), async (path) => {
    requests.push(path);
    return fragment;
  });
  assert.deepEqual(requests, ['/de/fragments/nav']);
  assert.deepEqual(result, { fragment, path: '/de/fragments/nav' });
});

test('warns and uses shared navigation if a localized fragment is missing', async (t) => {
  const warning = t.mock.method(console, 'warn', () => {});
  const requests = [];
  const fragment = {};
  const result = await loadNav('', locationFor('/jp/'), async (path) => {
    requests.push(path);
    return path === '/fragments/nav' ? fragment : null;
  });
  assert.deepEqual(requests, ['/jp/fragments/nav', '/fragments/nav']);
  assert.deepEqual(result, { fragment, path: '/fragments/nav' });
  assert.equal(warning.mock.callCount(), 1);
  assert.match(warning.mock.calls[0].arguments[0], /\/jp\/fragments\/nav/);
});

test('reports missing custom fragments without silently replacing them', async () => {
  const requests = [];
  await assert.rejects(
    loadNav('/de/fragments/custom', locationFor('/de/'), async (path) => {
      requests.push(path);
      return null;
    }),
    /Navigation fragment could not be loaded from \/de\/fragments\/custom/,
  );
  assert.deepEqual(requests, ['/de/fragments/custom']);
});

test('reports missing English navigation and propagates network errors', async () => {
  await assert.rejects(
    loadNav('', locationFor('/'), async () => null),
    /Navigation fragment could not be loaded from \/fragments\/nav/,
  );
  await assert.rejects(
    loadNav('', locationFor('/de/'), async () => { throw new Error('Network failed'); }),
    /Network failed/,
  );
});

test('recognizes translated tool labels using stable href markers', () => {
  const location = locationFor('/de/');
  assert.equal(getNavigationTool('#search', 'Suche', location), 'search');
  assert.equal(getNavigationTool('/de/search#search', 'Suche', location), 'search');
  assert.equal(getNavigationTool('#account', 'Konto', location), 'account');
  assert.equal(getNavigationTool('#cart', 'Warenkorb', location), 'cart');
  assert.equal(getNavigationTool('/', 'Search', location), 'search');
  assert.equal(getNavigationTool('/', 'Account', location), 'account');
  assert.equal(getNavigationTool('/', 'Cart', location), 'cart');
  assert.equal(getNavigationTool('/de/cafe', 'Café', location), null);
});
