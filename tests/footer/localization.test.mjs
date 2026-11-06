import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LANGUAGES } from '../fixtures/languages.js';
import {
  getLocalizedFragmentPath, loadLocalizedFragment,
} from '../../blocks/fragment/localized-fragment.js';

const DEFAULT_PATH = '/fragments/footer';
const locationFor = (pathname) => new URL(pathname, 'https://frescopa.coffee');
const loadFooter = (metadata, location, loader) => loadLocalizedFragment(DEFAULT_PATH, metadata, location, loader, 'Footer', LANGUAGES);

test('resolves footer fragments for every language on home and deep pages', () => {
  LANGUAGES.forEach(({ prefix }) => {
    const expected = prefix ? `/${prefix}${DEFAULT_PATH}` : DEFAULT_PATH;
    ['', '/', '/machines/atelier'].forEach((page) => {
      const location = locationFor(prefix ? `/${prefix}${page}` : page || '/');
      assert.equal(getLocalizedFragmentPath(DEFAULT_PATH, '', location, LANGUAGES), expected);
      const path = getLocalizedFragmentPath(DEFAULT_PATH, DEFAULT_PATH, location, LANGUAGES);
      assert.equal(path, expected);
    });
  });
});

test('preserves explicit Footer overrides and ignores partial language prefixes', () => {
  const location = locationFor('/de/');
  assert.equal(
    getLocalizedFragmentPath(DEFAULT_PATH, '/de/fragments/campaign-footer', location, LANGUAGES),
    '/de/fragments/campaign-footer',
  );
  assert.equal(
    getLocalizedFragmentPath(DEFAULT_PATH, '/fragments/shared-footer', location, LANGUAGES),
    '/fragments/shared-footer',
  );
  assert.equal(getLocalizedFragmentPath(DEFAULT_PATH, '', locationFor('/deutsch'), LANGUAGES), DEFAULT_PATH);
});

test('loads a translated footer without fetching English', async () => {
  const requests = [];
  const fragment = {};
  const result = await loadFooter('', locationFor('/de/'), async (path) => {
    requests.push(path);
    return fragment;
  });
  assert.deepEqual(requests, ['/de/fragments/footer']);
  assert.deepEqual(result, { fragment, path: '/de/fragments/footer' });
});

test('warns and falls back to English when an automatic footer is missing', async (t) => {
  const warning = t.mock.method(console, 'warn', () => {});
  const requests = [];
  const fragment = {};
  const result = await loadFooter(DEFAULT_PATH, locationFor('/jp/'), async (path) => {
    requests.push(path);
    return path === DEFAULT_PATH ? fragment : null;
  });
  assert.deepEqual(requests, ['/jp/fragments/footer', DEFAULT_PATH]);
  assert.deepEqual(result, { fragment, path: DEFAULT_PATH });
  assert.equal(warning.mock.callCount(), 1);
  assert.equal(
    warning.mock.calls[0].arguments[0],
    'Footer fragment not found at /jp/fragments/footer; using /fragments/footer.',
  );
});

test('missing custom footers report errors without falling back', async () => {
  const requests = [];
  await assert.rejects(
    loadFooter('/de/fragments/custom-footer', locationFor('/de/'), async (path) => {
      requests.push(path);
      return null;
    }),
    /Footer fragment could not be loaded from \/de\/fragments\/custom-footer/,
  );
  assert.deepEqual(requests, ['/de/fragments/custom-footer']);
});

test('missing English footers and network failures are reported', async () => {
  await assert.rejects(
    loadFooter('', locationFor('/'), async () => null),
    /Footer fragment could not be loaded from \/fragments\/footer/,
  );
  await assert.rejects(
    loadFooter('', locationFor('/de/'), async () => { throw new Error('Network failed'); }),
    /Network failed/,
  );
});
