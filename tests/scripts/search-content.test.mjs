/* eslint-env es2021 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  SEARCH_LABEL_KEYS,
  SEARCH_SHEET_PATH,
  fetchSearchContent,
  formatSearchText,
  getSearchContent,
  loadSearchContent,
  parseSearchRows,
} from '../../blocks/search/search-content.js';

const starter = JSON.parse(await readFile(new URL('../../content/placeholders/search.json', import.meta.url), 'utf8'));
const rows = starter.data.data;
const languages = [
  { prefix: '', code: 'en' },
  { prefix: 'de', code: 'de' },
  { prefix: 'jp', code: 'ja' },
];
const englishRows = rows.filter(({ Locale }) => Locale === 'en');
const response = (data) => new Response(JSON.stringify(data), {
  headers: { 'Content-Type': 'application/json' },
});
const label = (Locale, Key, Text) => ({
  Locale, Type: 'label', Key, Text,
});
const trending = (overrides = {}) => ({
  Locale: 'de',
  Type: 'trending',
  Key: 'test',
  Text: 'Product',
  URL: '/machines/atelier',
  Image: '/test.jpg',
  Price: '10 $',
  ...overrides,
});

test('starter sheet contains complete English and German modal labels and content', () => {
  assert.equal(starter.data.total, rows.length);
  const parsed = parseSearchRows(rows);
  assert.equal(parsed.size, 2);
  ['en', 'de'].forEach((locale) => {
    const content = parsed.get(locale);
    SEARCH_LABEL_KEYS.forEach((key) => assert.ok(content.labels[key], `${locale}: ${key}`));
    assert.equal(content.recent.length, 3);
    assert.equal(content.popular.length, 4);
    assert.equal(content.trending.length, 2);
  });
  assert.equal(parsed.get('de').labels['close-label'], 'Suche schließen');
  assert.equal(parsed.get('de').labels['summary-disclaimer'], '');
});

test('selects content by the page language and localizes product destinations', () => {
  const parsed = parseSearchRows(rows);
  const german = getSearchContent(parsed, '/de/machines', languages);
  assert.equal(german.locale, 'de');
  assert.equal(german.labels['popular-title'], 'Beliebte Suchanfragen');
  assert.equal(german.recent[2], 'Café in der Nähe');
  assert.equal(german.trending[0].name, 'Der Atelier');
  assert.equal(german.trending[0].href, '/de/machines/atelier');
  assert.equal(german.trending[0].price, '2.199 $');
  assert.equal(getSearchContent(parsed, '/machines', languages).trending[0].href, '/machines/atelier');
  assert.equal(parsed.get('de').trending[0].href, '/machines/atelier');
});

test('retains authored link query strings, anchors, prices and row order', (t) => {
  const parsed = parseSearchRows([
    ...englishRows,
    trending({ URL: '/de/machines/atelier?size=mini#buy', Price: 'ab 10 $' }),
    trending({
      Key: 'second', Text: 'Second', Image: '', Price: '',
    }),
  ]);
  const warning = t.mock.method(console, 'warn', () => {});
  const content = getSearchContent(parsed, '/de/', languages);
  assert.equal(content.trending[0].href, '/de/machines/atelier?size=mini#buy');
  assert.equal(content.trending[0].price, 'ab 10 $');
  assert.equal(content.trending[1].name, 'Second');
  assert.equal(content.trending[1].img, '');
  assert.equal(warning.mock.callCount(), 1);
});

test('missing locales use English with a warning but links use the real language folder', (t) => {
  const warning = t.mock.method(console, 'warn', () => {});
  const parsed = parseSearchRows(rows);
  const content = getSearchContent(parsed, '/jp/machines', languages);
  assert.equal(content.locale, 'ja');
  assert.equal(content.labels['dialog-label'], 'Site search');
  assert.deepEqual(content.recent, parsed.get('en').recent);
  assert.equal(content.trending[0].href, '/jp/machines/atelier');
  assert.equal(warning.mock.callCount(), 1);
  assert.match(warning.mock.calls[0].arguments[0], /missing ja translations/);
});

test('partial labels fall back individually and empty editorial groups remain hidden', (t) => {
  const warning = t.mock.method(console, 'warn', () => {});
  const parsed = parseSearchRows([
    ...englishRows,
    label('de', 'dialog-label', 'Meine Suche'),
    label('de', 'summary-disclaimer', ''),
  ]);
  const german = getSearchContent(parsed, '/de/', languages);
  assert.equal(german.labels['dialog-label'], 'Meine Suche');
  assert.equal(german.labels['close-label'], 'Close search');
  assert.equal(german.labels['summary-disclaimer'], '');
  assert.deepEqual(german.recent, []);
  assert.deepEqual(german.popular, []);
  assert.deepEqual(german.trending, []);
  assert.equal(warning.mock.callCount(), 1);
});

test('legal copy is not inherited from the English locale', (t) => {
  t.mock.method(console, 'warn', () => {});
  const parsed = parseSearchRows([
    ...englishRows.filter(({ Key }) => Key !== 'summary-disclaimer'),
    label('en', 'summary-disclaimer', 'English legal copy'),
    label('de', 'dialog-label', 'Suche'),
  ]);
  assert.equal(getSearchContent(parsed, '/', languages).labels['summary-disclaimer'], 'English legal copy');
  assert.equal(getSearchContent(parsed, '/de/', languages).labels['summary-disclaimer'], undefined);
  assert.equal(getSearchContent(parsed, '/jp/', languages).labels['summary-disclaimer'], undefined);
});

test('preserves arbitrary authored text and substitutes tokens literally', () => {
  const parsed = parseSearchRows([
    ...englishRows,
    {
      Locale: 'de', Type: 'popular', Key: 'literal', Text: '<b>Kaffee & Tee</b>',
    },
  ]);
  assert.equal(parsed.get('de').popular[0], '<b>Kaffee & Tee</b>');
  assert.equal(formatSearchText('Keine Ergebnisse für „{query}“', { query: '$& <coffee>' }), 'Keine Ergebnisse für „$& <coffee>“');
  assert.equal(formatSearchText('{section} / {section}', { section: 'Blog' }), 'Blog / Blog');
  assert.equal(formatSearchText('{missing}', {}), '{missing}');
});

test('ignores blank rows, trims cells, and canonicalizes locale codes', () => {
  const parsed = parseSearchRows([
    {},
    ...englishRows,
    {
      Locale: ' DE ', Type: ' label ', Key: ' dialog-label ', Text: ' Suche ',
    },
  ]);
  assert.equal(parsed.get('de').labels['dialog-label'], 'Suche');
});

test('rejects invalid rows, unknown keys, duplicate identities and missing English labels', () => {
  assert.throws(() => parseSearchRows(null), /data array/);
  assert.throws(() => parseSearchRows([null]), /must be an object/);
  assert.throws(() => parseSearchRows([{ Text: 'x' }]), /Locale is required/);
  assert.throws(() => parseSearchRows([label('invalid locale', 'dialog-label', 'Search')]), /invalid Locale/);
  assert.throws(() => parseSearchRows([{ ...label('en', 'dialog-label', 'Search'), Type: 'html' }]), /invalid Type/);
  assert.throws(() => parseSearchRows([label('en', 'typo', 'Search')]), /unknown label/);
  assert.throws(() => parseSearchRows([label('en', 'dialog-label', '')]), /Text is required/);
  assert.throws(() => parseSearchRows([...englishRows, englishRows[0]]), /duplicate/);
  assert.throws(() => parseSearchRows(englishRows.filter(({ Key }) => Key !== 'dialog-label')), /requires English labels/);
});

test('requires interpolation tokens in label templates', () => {
  assert.throws(() => parseSearchRows([label('en', 'no-results', 'No results')]), /must contain \{query\}/);
  assert.throws(() => parseSearchRows([label('en', 'result-location', 'in')]), /must contain \{section\}/);
});

test('rejects unsafe trending links and images', () => {
  ['', '//example.com/product', '/\\example.com/product', 'https://example.com/product', 'data:text/html,test'].forEach((URL) => {
    assert.throws(() => parseSearchRows([...englishRows, trending({ URL })]), /site-relative path/);
  });
  assert.throws(() => parseSearchRows([
    ...englishRows, trending({ Image: 'data:text/html,test' }),
  ]), /Image must use/);
});

test('loads both DA single-sheet and multi-sheet payloads', async () => {
  const single = await fetchSearchContent(async (url) => {
    assert.equal(url, SEARCH_SHEET_PATH);
    return response(starter.data);
  });
  assert.equal(single.get('de').recent.length, 3);
  const multi = await fetchSearchContent(async () => response(starter));
  assert.deepEqual(multi, single);
});

test('loads all sheet pages before validating English labels', async () => {
  const requests = [];
  const parsed = await fetchSearchContent(async (url) => {
    requests.push(url);
    const offset = Number(new URL(url, 'https://example.com').searchParams.get('offset')) || 0;
    return response({ data: rows.slice(offset, offset + 10), offset, total: rows.length });
  });
  assert.equal(requests.length, 7);
  assert.equal(requests[1], `${SEARCH_SHEET_PATH}?offset=10`);
  assert.equal(parsed.get('de').trending.length, 2);
});

test('reports HTTP, network, JSON, schema and pagination failures', async () => {
  await assert.rejects(fetchSearchContent(async () => new Response('', { status: 404 })), /Search sheet.*HTTP 404/);
  await assert.rejects(fetchSearchContent(async () => { throw new Error('offline'); }), /offline/);
  await assert.rejects(fetchSearchContent(async () => new Response('invalid json')), SyntaxError);
  await assert.rejects(fetchSearchContent(async () => response({ data: [], total: 3, offset: 0 })), /pagination/);
  await assert.rejects(fetchSearchContent(async () => response({ data: [], total: 0, offset: 0 })), /requires English/);
});

test('shares the sheet request and retries failed loads', async (t) => {
  const fetcher = t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 503 }));
  await assert.rejects(loadSearchContent(), /HTTP 503/);
  fetcher.mock.mockImplementation(async () => response(starter));
  const first = loadSearchContent();
  const second = loadSearchContent();
  assert.equal(first, second);
  await first;
  assert.equal(fetcher.mock.callCount(), 2);
  assert.equal(await loadSearchContent(), await second);
});
