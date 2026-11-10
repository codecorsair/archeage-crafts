import { expect, test } from 'bun:test';
import { ICON_VECTOR_LENGTH } from './screenshot-references';
import { matchScreenshotReferences, rankScreenshotArtwork } from './screenshot-vision';

// Unit-normalized descriptors with controlled cosine similarity. These isolate ranking,
// not image decoding or screenshot recognition, which require browser validation.
function vector(similarity: number) {
  const values = Array<number>(ICON_VECTOR_LENGTH).fill(0);
  values[0] = similarity;
  values[3] = Math.sqrt(1 - similarity * similarity);
  return values;
}

test('a learned near-match cannot steal a different bundled identity or affect its margin', () => {
  const { candidates, ambiguous } = rankScreenshotArtwork([vector(1)], [
    { itemIds: ['void-heart'], vector: vector(.66), kind: 'bundled' },
    { itemIds: ['corrupted-heart'], vector: vector(.51), kind: 'bundled' },
    { itemIds: ['immortal-heart'], vector: vector(.89), kind: 'learned' },
  ]);
  expect(candidates.map(candidate => candidate.itemId)).toEqual(['void-heart', 'corrupted-heart']);
  expect(candidates[0].score - candidates[1].score).toBeCloseTo(.15);
  expect(ambiguous).toBe(false);
});

test('near-exact learned artwork remains reusable and deduplicates alternate crops by item', () => {
  const { candidates } = rankScreenshotArtwork([vector(1), vector(.999)], [
    { itemIds: ['immortal-heart'], vector: vector(.62), kind: 'bundled' },
    { itemIds: ['immortal-heart'], vector: vector(1), kind: 'learned' },
    { itemIds: ['void-heart'], vector: vector(.65), kind: 'bundled' },
  ]);
  expect(candidates).toHaveLength(2);
  expect(candidates[0]).toEqual({ itemId: 'immortal-heart', score: 1 });
  expect(candidates[0].score - candidates[1].score).toBeGreaterThan(.30);
});

test('learned acceptance includes .90 but excludes weaker artwork', () => {
  expect(rankScreenshotArtwork([vector(1)], [
    { itemIds: ['accepted'], vector: vector(.90), kind: 'learned' },
    { itemIds: ['rejected'], vector: vector(.8999), kind: 'learned' },
  ]).candidates).toEqual([{ itemId: 'accepted', score: .90 }]);
});

test('near-exact differently colored learned artwork cannot relabel bundled items', () => {
  const wrongColor = vector(.94);
  wrongColor[1] = wrongColor[3];
  wrongColor[3] = 0;
  expect(rankScreenshotArtwork([vector(1)], [
    { itemIds: ['red-heart'], vector: vector(.66), kind: 'bundled' },
    { itemIds: ['yellow-heart'], vector: wrongColor, kind: 'learned' },
  ]).candidates).toEqual([{ itemId: 'red-heart', score: .66 }]);
});

test('alignment alternatives apply only to learned artwork', () => {
  const { candidates } = rankScreenshotArtwork([vector(1)], [
    { itemIds: ['bundled'], vector: vector(.7), kind: 'bundled' },
    { itemIds: ['learned'], vector: vector(0), kind: 'learned' },
  ], [vector(0)]);
  expect(candidates).toEqual([{ itemId: 'learned', score: 1 }, { itemId: 'bundled', score: .7 }]);
});

test('different item IDs with identical learned references have no acceptance margin', () => {
  const { candidates } = rankScreenshotArtwork([vector(1)], [
    { itemIds: ['a'], vector: vector(1), kind: 'learned' },
    { itemIds: ['b'], vector: vector(1), kind: 'learned' },
  ]);
  expect(candidates).toHaveLength(2);
  expect(candidates[0].score - candidates[1].score).toBe(0);
});

test('session matching rejects external URLs and oversized PNG dimensions before browser decoding', async () => {
  await expect(matchScreenshotReferences('https://example.com/icon.png', [])).rejects.toThrow('locally generated');
  const header = new Uint8Array(33);
  header.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  const dimensions = new DataView(header.buffer);
  dimensions.setUint32(16, 100000);
  dimensions.setUint32(20, 100000);
  const png = `data:image/png;base64,${btoa(String.fromCharCode(...header))}`;
  await expect(matchScreenshotReferences(png, [])).rejects.toThrow('normalized');
});

test('session matching honors cancellation before decoding', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(matchScreenshotReferences('data:image/png;base64,', [], controller.signal)).rejects.toThrow();
});

test('shared bundled artwork remains ambiguous and rejected learned-only artwork stays unknown', () => {
  expect(rankScreenshotArtwork([vector(1)], [
    { itemIds: ['shared-a', 'shared-b'], vector: vector(.8), kind: 'bundled' },
    { itemIds: ['wrong-reference'], vector: vector(.89), kind: 'learned' },
  ])).toEqual({ candidates: [{ itemId: 'shared-a', score: .8 }, { itemId: 'shared-b', score: .8 }], ambiguous: true });
  expect(rankScreenshotArtwork([vector(1)], [
    { itemIds: ['wrong-reference'], vector: vector(.89), kind: 'learned' },
  ])).toEqual({ candidates: [], ambiguous: false });
});
