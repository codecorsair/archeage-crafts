import { expect, test } from 'bun:test';
import { questlogSearchUrl } from './questlog';

test('Questlog search matches the supplied apostrophe/space URL pattern', () => {
  expect(questlogSearchUrl("Karshid's Scale")).toBe('https://questlog.gg/archeage-chronicles/en/db/search?searchTerm=Karshid%27s+Scale');
});

test('item punctuation remains one exact search term, not query syntax', () => {
  const name = 'Scale & Bone / #1';
  const url = new URL(questlogSearchUrl(name));
  expect(url.origin).toBe('https://questlog.gg');
  expect(url.pathname).toBe('/archeage-chronicles/en/db/search');
  expect(url.searchParams.get('searchTerm')).toBe(name);
  expect([...url.searchParams.keys()]).toEqual(['searchTerm']);
  expect(url.hash).toBe('');
});
