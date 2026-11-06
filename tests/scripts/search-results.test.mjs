import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getResultSection, labelFromPath } from '../../blocks/search/search-results.js';

const languages = [
  { prefix: '', code: 'en' },
  { prefix: 'de', code: 'de' },
  { prefix: 'jp', code: 'ja' },
];
const links = [
  { pathname: '/machines', label: 'Machines' },
  { pathname: '/blog', label: 'Journal' },
  { pathname: '/de/machines/atelier', label: 'Der Atelier' },
  { pathname: '/de/machines', label: 'Maschinen' },
  { pathname: '/de/blog/', label: ' Journal ' },
  { pathname: '/de/cafe', label: 'Café' },
  { pathname: '/jp/blog', label: 'Japanese Journal' },
];
const sectionFor = (path, navigationLinks = links) => (
  getResultSection(path, languages, navigationLinks)
);

test('uses the localized section rather than the language folder', () => {
  assert.equal(sectionFor('/de/blog/coffee-origins'), 'Journal');
  assert.equal(sectionFor('/de/machines/atelier'), 'Maschinen');
  assert.equal(sectionFor('/de/cafe'), 'Café');
  assert.equal(sectionFor('/jp/blog/coffee-origins'), 'Japanese Journal');
});

test('section landing pages show their actual section name', () => {
  assert.equal(sectionFor('/de/blog'), 'Journal');
  assert.equal(sectionFor('/de/blog/'), 'Journal');
  assert.equal(sectionFor('/de/machines'), 'Maschinen');
  assert.equal(sectionFor('/machines'), 'Machines');
});

test('home pages do not show a language or section label', () => {
  ['/', '/de', '/de/', '/jp/'].forEach((path) => {
    assert.equal(sectionFor(path), '');
  });
});

test('unprefixed English paths retain their section names', () => {
  assert.equal(sectionFor('/blog/coffee-origins'), 'Journal');
  assert.equal(sectionFor('/machines/atelier'), 'Machines');
  assert.equal(sectionFor('/deals/coffee'), 'Deals');
});

test('does not use a different locale or a deeper navigation link as the section', () => {
  assert.equal(sectionFor('/de/machines/atelier', [links[0], links[2]]), 'Machines');
  assert.equal(sectionFor('/de/blog/article', [links[1]]), 'Blog');
});

test('formats unmatched authored path segments without assuming language codes', () => {
  assert.equal(sectionFor('/de/coffee-guides/article'), 'Coffee Guides');
  assert.equal(sectionFor('/de/caf%C3%A9/article'), 'Café');
  assert.equal(sectionFor('/de/blog/article', [{ pathname: '/de/blog', label: ' ' }]), 'Blog');
  assert.equal(labelFromPath('coffee_origins'), 'Coffee Origins');
});

test('reports invalid percent encoding while retaining a readable fallback', (t) => {
  const warning = t.mock.method(console, 'warn', () => {});
  assert.equal(sectionFor('/de/coffee%zz-guides/article'), 'Coffee%Zz Guides');
  assert.equal(warning.mock.callCount(), 1);
});
