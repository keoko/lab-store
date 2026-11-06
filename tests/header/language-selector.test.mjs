import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getLanguage, getLanguageHref } from '../../scripts/languages.js';
import { LANGUAGES } from '../fixtures/languages.js';

test('uses the confirmed prefixes and HTML language codes', () => {
  assert.deepEqual(
    LANGUAGES.map(({ prefix, code }) => [prefix, code]),
    [['', 'en'], ['fr', 'fr'], ['de', 'de'], ['es', 'es'], ['it', 'it'],
      ['jp', 'ja'], ['kr', 'ko'], ['cn', 'zh-Hans']],
  );
});

test('switches every language pair, preserving page paths, queries, and anchors', () => {
  LANGUAGES.forEach((source) => {
    LANGUAGES.forEach((target) => {
      ['', '/', '/machines/atelier', '/machines/atelier/', '/caf%C3%A9'].forEach((page) => {
        const pathname = source.prefix ? `/${source.prefix}${page}` : page || '/';
        const location = { pathname, search: '?coffee=espresso&size=2', hash: '#details' };
        assert.equal(getLanguage(pathname, LANGUAGES), source);
        const suffix = page || '/';
        const expected = target.prefix ? `/${target.prefix}${suffix}` : suffix;
        assert.equal(getLanguageHref(target, location, LANGUAGES), `${expected}${location.search}${location.hash}`);
      });
    });
  });
});

test('recognizes only complete leading language segments', () => {
  ['/jpo/machines', '/france', '/machines/jp', '/en/machines'].forEach((pathname) => {
    const location = { pathname, search: '', hash: '' };
    assert.equal(getLanguage(pathname, LANGUAGES), LANGUAGES[0]);
    assert.equal(getLanguageHref(LANGUAGES[5], location, LANGUAGES), `/jp${pathname}`);
  });
});

test('switching to the current language leaves the URL unchanged', () => {
  ['/', '/machines', '/jp/', '/cn/machines'].forEach((pathname) => {
    const location = { pathname, search: '?q=coffee', hash: '#details' };
    assert.equal(
      getLanguageHref(getLanguage(pathname, LANGUAGES), location, LANGUAGES),
      `${pathname}${location.search}${location.hash}`,
    );
  });
});

test('home destinations include a trailing slash for every language', () => {
  ['/', '/de', '/de/', '/jp', '/jp/'].forEach((pathname) => {
    const location = { pathname, search: '?ref=nav', hash: '#welcome' };
    LANGUAGES.forEach((language) => {
      const expected = language.prefix ? `/${language.prefix}/` : '/';
      assert.equal(getLanguageHref(language, location, LANGUAGES), `${expected}?ref=nav#welcome`);
    });
  });
});
