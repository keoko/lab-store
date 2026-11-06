/* eslint-env es2021 */
/* eslint-disable no-restricted-syntax, no-await-in-loop -- Cases share browser globals. */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import {
  fetchSearchAnswer,
  fetchSearchResults,
  filterSearchAnswer,
  filterSearchResults,
} from '../../scripts/content-ai.js';

const originalWindow = globalThis.window;
const originalFetch = globalThis.fetch;
const languageRows = [
  ['/', 'en'],
  ['/de/', 'de'],
  ['/fr/', 'fr'],
  ['/jp/', 'ja'],
  ['/kr/', 'ko'],
  ['/cn/', 'zh-Hans'],
].map(([Path, Code]) => ({
  Locale: 'en', Path, Code, Label: Code, Tagline: 'Coffee.',
}));
const response = (data) => new Response(JSON.stringify(data), {
  headers: { 'Content-Type': 'application/json' },
});
const item = (id, metadata) => ({ id, data: { metadata } });
const german = item('de', {
  canonical_url: 'https://www.frescopa.coffee/de/machines',
  language: 'de',
  locale: 'de',
});
const english = item('en', {
  canonical_url: 'https://www.frescopa.coffee/machines',
  language: 'en',
  locale: 'en',
});
const hit = (result) => ({ id: result.id, metadata: result.data.metadata });
let calls;
let payload;

beforeEach(() => {
  calls = [];
  payload = {};
  globalThis.window = {
    location: { origin: 'https://www.frescopa.coffee', pathname: '/de/machines' },
  };
  globalThis.fetch = async (url, options) => {
    if (url === '/placeholders/languages.json') {
      return response({ data: languageRows, total: languageRows.length, offset: 0 });
    }
    calls.push({ url, options });
    return response(payload);
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
});

test('filters the supplied metadata shape to German on all German paths', async () => {
  for (const pathname of ['/de', '/de/', '/de/machines']) {
    window.location.pathname = pathname;
    const data = await filterSearchResults({ results: [english, german], cursor: 'next' });
    assert.deepEqual(data.results, [german]);
    assert.equal(data.cursor, 'next');
    assert.equal(data.unfilteredResultCount, 2);
  }
});

test('unprefixed paths select only English, never all language folders', async () => {
  for (const pathname of ['/', '/machines', '/deals']) {
    window.location.pathname = pathname;
    const data = await filterSearchResults({ results: [german, english] });
    assert.deepEqual(data.results, [english]);
  }
});

test('matches regional locales and rejects conflicting or invalid metadata', async () => {
  const regional = item('regional', { language: 'de-DE', locale: 'de_DE' });
  const localeOnly = item('locale', { locale: 'de-AT' });
  const conflict = item('conflict', { language: 'de', locale: 'en' });
  const invalid = item('invalid', { language: 'not a locale', canonical_url: '/de/machines' });
  const data = await filterSearchResults({
    results: [regional, localeOnly, conflict, invalid, item('number', { language: 123 })],
  });
  assert.deepEqual(data.results, [regional, localeOnly]);
});

test('uses canonical and source paths only when language metadata is absent', async () => {
  const canonical = item('canonical', { canonical_url: 'https://www.frescopa.coffee/de/machines' });
  const source = { id: 'source', data: { source: '/de/stories' } };
  const wrong = item('wrong', { canonical_url: '/machines' });
  const declaredEnglish = item('declared', { language: 'en', canonical_url: '/de/machines' });
  const data = await filterSearchResults({
    results: [canonical, source, wrong, declaredEnglish, item('missing', {}), item('unsafe', { source: 'ftp://example.com/de/' })],
  });
  assert.deepEqual(data.results, [canonical, source]);
});

test('maps URL folder names to language codes, including CJK scripts', async () => {
  const japanese = item('ja', { language: 'ja-JP' });
  const korean = item('ko', { locale: 'ko_KR' });
  const simplified = item('zh', { language: 'zh-CN' });
  const traditional = item('zh-TW', { language: 'zh-TW' });
  const results = [german, japanese, korean, simplified, traditional];
  for (const [pathname, expected] of [
    ['/jp/machines', japanese],
    ['/kr/', korean],
    ['/cn/', simplified],
  ]) {
    window.location.pathname = pathname;
    assert.deepEqual((await filterSearchResults({ results })).results, [expected]);
  }
});

test('keeps source order and does not mutate responses', async () => {
  const second = item('de-2', { language: 'de' });
  const data = { results: [german, english, second], totalResults: 3 };
  const filtered = await filterSearchResults(data);
  assert.deepEqual(filtered.results, [german, second]);
  assert.equal(filtered.totalResults, 3);
  assert.equal(data.results.length, 3);
});

test('preserves pagination when an entire page is filtered out', async () => {
  payload = { results: [english], cursor: 'next' };
  const controller = new AbortController();
  const data = await fetchSearchResults('/proxy', 'frescopa', 'ACQUISITION', 'coffee', 8, 'previous', controller.signal);
  assert.deepEqual(data.results, []);
  assert.equal(data.cursor, 'next');
  assert.equal(data.unfilteredResultCount, 1);
  assert.equal(calls[0].url, '/proxy/search');
  assert.equal(calls[0].options.signal, controller.signal);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    contentSource: { name: 'frescopa', type: 'ACQUISITION' },
    query: { type: 'vector', text: 'coffee', options: {} },
    queryOptions: { pagination: { limit: 8, cursor: 'previous' } },
  });
});

test('retains a generative answer only when every source matches', async () => {
  const data = { result: 'German answer', hits: [hit(german), german] };
  assert.deepEqual(await filterSearchAnswer(data), data);
  await assert.rejects(
    filterSearchAnswer({ result: 'Mixed answer', hits: [hit(german), hit(english)] }),
    /not grounded exclusively in de/,
  );
  await assert.rejects(
    filterSearchAnswer({ result: 'English answer', hits: [hit(english)] }),
    /not grounded exclusively in de/,
  );
});

test('rejects nonempty answers without verifiable language sources', async () => {
  for (const hits of [undefined, [], [{ id: 'unknown' }]]) {
    await assert.rejects(
      filterSearchAnswer({ result: 'Unverified answer', hits }),
      /not grounded exclusively in de/,
    );
  }
});

test('allows empty answers but filters their source links', async () => {
  const data = await filterSearchAnswer({ result: '', hits: [hit(english), hit(german)] });
  assert.deepEqual(data.hits, [hit(german)]);
  assert.equal(data.result, '');
});

test('generative queries request the page language and preserve abort signals', async () => {
  payload = { result: 'German answer', hits: [hit(german)] };
  const controller = new AbortController();
  const data = await fetchSearchAnswer('/proxy', 'frescopa', 'ACQUISITION', 'coffee', controller.signal);
  assert.equal(data.result, 'German answer');
  assert.equal(calls[0].url, '/proxy/gensearch');
  assert.equal(calls[0].options.signal, controller.signal);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    contentSource: { name: 'frescopa', type: 'ACQUISITION' },
    query: 'coffee\n\nRespond in de. Use only de content from pages under /de/.',
  });
});

test('English generation excludes language folders and rejects German sources', async () => {
  window.location.pathname = '/machines';
  payload = { result: 'English answer', hits: [hit(english)] };
  await fetchSearchAnswer('/proxy', 'frescopa', 'ACQUISITION', 'coffee');
  assert.match(JSON.parse(calls[0].options.body).query, /Respond in en/);
  assert.match(JSON.parse(calls[0].options.body).query, /without a language folder prefix/);
  payload = { result: 'German answer', hits: [hit(german)] };
  await assert.rejects(
    fetchSearchAnswer('/proxy', 'frescopa', 'ACQUISITION', 'coffee'),
    /not grounded exclusively in en/,
  );
});

test('rejects invalid response shapes', async () => {
  await assert.rejects(filterSearchResults({ results: [null] }), /invalid results/);
  await assert.rejects(filterSearchResults({}), /invalid results/);
  await assert.rejects(filterSearchAnswer({ result: 3 }), /invalid answer/);
  await assert.rejects(filterSearchAnswer({ result: '', hits: {} }), /invalid answer/);
});

test('preserves explicit upstream failures', async () => {
  globalThis.fetch = async () => new Response('', { status: 503 });
  await assert.rejects(
    fetchSearchResults('/proxy', 'frescopa', 'ACQUISITION', 'coffee', 8),
    /search failed: 503/,
  );
  await assert.rejects(
    fetchSearchAnswer('/proxy', 'frescopa', 'ACQUISITION', 'coffee'),
    /request failed: 503/,
  );
});
