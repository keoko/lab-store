import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LANGUAGE_SHEET_PATH,
  fetchLanguages,
  getLanguage,
  getLanguageHref,
  getLocalizedLanguages,
  loadLanguages,
  parseLanguageRows,
} from '../../scripts/languages.js';
import { getNavigationPath } from '../../blocks/header/navigation.js';
import { getLocalizedFragmentPath } from '../../blocks/fragment/localized-fragment.js';
import { LANGUAGES, LANGUAGE_SHEET } from '../fixtures/languages.js';

const rows = LANGUAGE_SHEET.data.data;
const rootRow = rows[0];
const responseFor = (data) => new Response(JSON.stringify(data), {
  headers: { 'Content-Type': 'application/json' },
});

test('starter sheet has 64 localized labels and native coffee taglines', () => {
  assert.equal(rows.length, 64);
  assert.equal(LANGUAGES.length, 8);
  LANGUAGES.forEach(({ code }) => {
    const options = getLocalizedLanguages(LANGUAGES, code);
    assert.equal(options.length, 8);
    options.forEach((option) => {
      assert.ok(option.translations[code]);
      assert.equal(option.label, option.translations[code].label);
      assert.equal(option.tagline, option.translations[code].tagline);
      assert.equal(option.tagline, option.translations.en.tagline);
    });
  });
  assert.equal(getLocalizedLanguages(LANGUAGES, 'en')[2].label, 'German');
  assert.equal(getLocalizedLanguages(LANGUAGES, 'de')[0].label, 'Englisch');
  assert.equal(getLocalizedLanguages(LANGUAGES, 'ja')[2].label, 'ドイツ語');
  assert.equal(getLocalizedLanguages(LANGUAGES, 'ja')[2].tagline, 'Erst Kaffee. Dann alles andere.');
  assert.equal(getLocalizedLanguages(LANGUAGES, 'de')[5].tagline, 'まずはコーヒー、話はそれから。');
});

test('accepts the complete English, German and Japanese Tagline sample', () => {
  const codes = ['en', 'de', 'ja'];
  const sample = rows.filter((row) => codes.includes(row.Locale) && codes.includes(row.Code));
  assert.equal(sample.length, 9);
  const languages = parseLanguageRows(sample);
  assert.equal(languages.length, 3);
  const japanese = getLocalizedLanguages(languages, 'ja');
  assert.deepEqual(japanese.map(({ label }) => label), ['英語', 'ドイツ語', '日本語']);
  assert.equal(japanese[2].tagline, 'まずはコーヒー、話はそれから。');
});

test('requires Tagline instead of the old Region column', () => {
  assert.throws(() => parseLanguageRows([{
    Locale: 'en', Path: '/', Code: 'en', Label: 'English', Region: 'United Kingdom',
  }]), /Tagline is required/);
});

test('adding a language in content updates selector, navigation and footer routing', () => {
  const languages = parseLanguageRows([
    rootRow,
    {
      Locale: 'en', Path: '/pt/', Code: 'pt', Label: 'Portuguese', Tagline: 'Primeiro, café!',
    },
    {
      Locale: 'pt', Path: '/', Code: 'en', Label: 'Inglês', Tagline: 'But first, coffee.',
    },
    {
      Locale: 'pt', Path: '/pt/', Code: 'pt', Label: 'Português', Tagline: 'Primeiro, café!',
    },
  ]);
  const location = new URL('https://frescopa.coffee/pt/machines?ref=nav#details');
  assert.equal(getLanguage(location.pathname, languages).code, 'pt');
  assert.deepEqual(getLocalizedLanguages(languages, 'pt').map(({ label }) => label), ['Inglês', 'Português']);
  assert.equal(getLanguageHref(languages[0], location, languages), '/machines?ref=nav#details');
  assert.equal(getNavigationPath('', location, languages), '/pt/fragments/nav');
  assert.equal(
    getLocalizedFragmentPath('/fragments/footer', '', location, languages),
    '/pt/fragments/footer',
  );
  assert.equal(getLanguage('/de/machines', languages).code, 'en');
});

test('English row order controls options without requiring English to be first', () => {
  const reordered = parseLanguageRows([rows[2], rootRow]);
  assert.deepEqual(reordered.map(({ code }) => code), ['de', 'en']);
  assert.equal(getLanguage('/machines', reordered).code, 'en');
  assert.equal(getLanguage('/de/', reordered).code, 'de');
});

test('trims cells, canonicalizes locale codes, and ignores authored blank rows', () => {
  const languages = parseLanguageRows([
    {},
    {
      ...rootRow, Locale: ' EN ', Path: ' / ', Code: ' EN ', Label: ' English ', Tagline: ' Coffee! ',
    },
    {
      Locale: 'en', Path: '/cn/', Code: 'zh-hans', Label: 'Chinese', Tagline: '先喝咖啡，再聊人生。',
    },
    {
      Locale: 'zh-hans', Path: '/', Code: 'en', Label: '英语', Tagline: 'But first, coffee.',
    },
  ]);
  assert.equal(languages[0].translations.en.label, 'English');
  assert.equal(languages[0].translations.en.tagline, 'Coffee!');
  assert.equal(languages[1].code, 'zh-Hans');
  assert.equal(languages[0].translations['zh-Hans'].label, '英语');
});

test('missing translated entries fall back to English with an explicit warning', (t) => {
  const warning = t.mock.method(console, 'warn', () => {});
  const languages = parseLanguageRows([rootRow, rows[2]]);
  const options = getLocalizedLanguages(languages, 'de');
  assert.deepEqual(options.map(({ label }) => label), ['English', 'German']);
  assert.equal(warning.mock.callCount(), 1);
  assert.match(warning.mock.calls[0].arguments[0], /missing de translations.*en, de.*English/);
});

test('rejects malformed rows, unsafe paths and invalid language codes', () => {
  assert.throws(() => parseLanguageRows(null), /data array/);
  [null, [], 'not a row'].forEach((row) => {
    assert.throws(() => parseLanguageRows([row]), /must be an object/);
  });
  ['Locale', 'Path', 'Code', 'Label', 'Tagline'].forEach((field) => {
    assert.throws(() => parseLanguageRows([{ ...rootRow, [field]: '' }]), new RegExp(`${field} is required`));
  });
  ['//evil.test', '/de/machines', '/..', '/DE/', '/de?x', 'de', 'https://example.com'].forEach((Path) => {
    assert.throws(() => parseLanguageRows([{ ...rootRow, Path }]), /single lowercase language folder/);
  });
  assert.throws(() => parseLanguageRows([{ ...rootRow, Code: 'not_a_code' }]), /invalid Code/);
  assert.throws(() => parseLanguageRows([{ ...rootRow, Locale: 'not_a_locale' }]), /invalid Locale/);
});

test('rejects missing English defaults, duplicates and inconsistent translations', () => {
  assert.throws(() => parseLanguageRows([]), /requires an English row/);
  assert.throws(() => parseLanguageRows([rows[2]]), /requires an English row/);
  assert.throws(() => parseLanguageRows([{ ...rootRow, Code: 'fr' }]), /requires an English row/);
  assert.throws(() => parseLanguageRows([rootRow, rootRow]), /unique Paths and Codes/);
  assert.throws(
    () => parseLanguageRows([rootRow, { ...rows[2], Code: 'en' }]),
    /unique Paths and Codes/,
  );
  assert.throws(
    () => parseLanguageRows([rootRow, { ...rootRow, Locale: 'fr' }]),
    /Locale fr is not a supported Code/,
  );
  assert.throws(
    () => parseLanguageRows([rootRow, rows[2], { ...rootRow, Locale: 'de', Path: '/it/' }]),
    /Path and Code must match/,
  );
  assert.throws(
    () => parseLanguageRows([rootRow, rows[2], { ...rootRow, Locale: 'de', Code: 'de' }]),
    /Path and Code must match/,
  );
  assert.throws(
    () => parseLanguageRows([rootRow, rows[2], rows[16], rows[16]]),
    /duplicate de translations/,
  );
});

test('loads single-sheet and DA multi-sheet payloads', async () => {
  await Promise.all([LANGUAGE_SHEET, LANGUAGE_SHEET.data].map(async (payload) => {
    const requests = [];
    const languages = await fetchLanguages(async (url, options) => {
      requests.push(url);
      assert.ok(options.signal instanceof AbortSignal);
      return responseFor(payload);
    });
    assert.deepEqual(requests, [LANGUAGE_SHEET_PATH]);
    assert.deepEqual(languages, LANGUAGES);
  }));
});

test('loads every page of sheet data before parsing translations', async () => {
  const requests = [];
  const languages = await fetchLanguages(async (url) => {
    requests.push(url);
    const offset = new URL(url, 'https://frescopa.coffee').searchParams.get('offset') || '0';
    const start = Number(offset);
    return responseFor({
      data: {
        total: rows.length, offset: start, limit: 16, data: rows.slice(start, start + 16),
      },
    });
  });
  assert.deepEqual(languages, LANGUAGES);
  assert.deepEqual(requests, [
    LANGUAGE_SHEET_PATH,
    `${LANGUAGE_SHEET_PATH}?offset=16`,
    `${LANGUAGE_SHEET_PATH}?offset=32`,
    `${LANGUAGE_SHEET_PATH}?offset=48`,
  ]);
});

test('reports HTTP, network and JSON failures without a hardcoded fallback', async () => {
  await assert.rejects(
    fetchLanguages(async () => new Response('', { status: 404 })),
    /languages.json.*HTTP 404/,
  );
  await assert.rejects(
    fetchLanguages(async () => { throw new Error('Network failed'); }),
    /Network failed/,
  );
  await assert.rejects(
    fetchLanguages(async () => new Response('invalid json')),
    SyntaxError,
  );
  await assert.rejects(
    fetchLanguages(async () => { throw new DOMException('Timed out', 'TimeoutError'); }),
    { name: 'TimeoutError' },
  );
});

test('rejects malformed or non-progressing pagination instead of truncating the list', async () => {
  const badPayloads = [
    {},
    { other: LANGUAGE_SHEET.data },
    { data: { total: 1, offset: 0, data: [] } },
    { data: { total: 1, offset: 2, data: [rootRow] } },
    { data: { total: 0, offset: 0, data: [rootRow] } },
    { data: { total: -1, offset: 0, data: [] } },
  ];
  await Promise.all(badPayloads.map((payload) => assert.rejects(fetchLanguages(async () => responseFor(payload)), /invalid data or pagination/)));
  let calls = 0;
  await assert.rejects(fetchLanguages(async () => {
    calls += 1;
    return responseFor({
      total: calls === 1 ? 2 : 3, offset: calls - 1, data: [rootRow],
    });
  }), /invalid data or pagination/);
  assert.equal(calls, 2);
});

test('shares one request across header/footer and retries after a failure', async (t) => {
  let calls = 0;
  t.mock.method(global, 'fetch', async () => {
    calls += 1;
    return calls === 1 ? new Response('', { status: 503 }) : responseFor(LANGUAGE_SHEET);
  });
  await assert.rejects(loadLanguages(), /HTTP 503/);
  const first = loadLanguages();
  const second = loadLanguages();
  assert.equal(first, second);
  assert.deepEqual(await first, LANGUAGES);
  assert.equal(await loadLanguages(), await second);
  assert.equal(calls, 2);
});
