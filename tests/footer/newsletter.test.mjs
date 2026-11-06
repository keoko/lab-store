import assert from 'node:assert/strict';
import { test } from 'node:test';
import getNewsletterLabels from '../../blocks/footer/newsletter.js';

const translations = [
  ['de', 'de', 'Ein wenig Wärme in Ihrem Postfach.', 'sie@beispiel.de', 'Anmelden'],
  ['jp', 'ja', 'メールボックスに、少しのぬくもりを。', 'you@example.jp', '登録する'],
  ['ko', 'ko', '메일함에 작은 따뜻함을 전해 드려요.', 'you@example.kr', '구독하기'],
  ['kr', 'ko', '메일함에 작은 따뜻함을 전해 드려요.', 'you@example.kr', '구독하기'],
];

test('localizes every newsletter field on language roots and nested pages', () => {
  translations.forEach((translation) => {
    const [prefix, lang, newsletterLabel, newsletterPlaceholder, newsletterButton] = translation;
    ['', '/', '/machines/atelier'].forEach((suffix) => {
      assert.deepEqual(getNewsletterLabels(`/${prefix}${suffix}`), {
        lang, newsletterLabel, newsletterPlaceholder, newsletterButton,
      });
    });
  });
});

test('defaults to English outside exact supported language folders', () => {
  ['/', '/machines/atelier', '/fr/', '/deutsch/', '/jpn/', '/korea/', '/constructor/', '/__proto__/'].forEach((path) => {
    assert.deepEqual(getNewsletterLabels(path), {
      lang: 'en',
      newsletterLabel: 'A little warmth in your inbox.',
      newsletterPlaceholder: 'you@example.com',
      newsletterButton: 'Sign up',
    });
  });
});

test('preserves authored overrides and localizes omitted or empty fields', () => {
  const defaults = getNewsletterLabels('/de/');
  Object.keys(defaults).filter((key) => key !== 'lang').forEach((key) => {
    assert.deepEqual(getNewsletterLabels('/de/', { [key]: 'Custom copy' }), {
      ...defaults,
      [key]: 'Custom copy',
    });
    assert.deepEqual(getNewsletterLabels('/de/', { [key]: '' }), defaults);
  });
});
