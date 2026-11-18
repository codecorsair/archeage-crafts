import { describe, expect, test } from 'bun:test';
import catalog from '../data/catalog.json';
import { availableTradeData } from '../data/trading';
import { createPlan, setTradeBonus, toggleRunComplete, updatePlanInputs } from './plans';
import { buildFineArcheumPreset } from './trade-presets';
import { createShareUrl, readSharedPlan } from './share-plan';

function draft() {
  return updatePlanInputs(createPlan(catalog, '60211413', { name: '雷霆 Thunder Dash ⚡', quantity: 10, now: 100 }), {
    inventory: { '70403004': 100, '70400001': 150, '70405104': 60, '70303004': 2 },
    settings: { master: { Wildcraft: true, Cloth: false, Refining: true, Smelting: false }, tradeAccess: { pioneer: false, senior: true }, farmable: ['70203004', '70403004'], includeConflict: true },
  });
}
function snapshot() {
  const plan = draft();
  return { name: plan.name, recipeId: plan.recipeId, quantity: plan.quantity, inventory: plan.inventory, settings: plan.settings, activeTrade: false };
}
async function hashFor(value: unknown) {
  const compressed = await new Response(new Blob([JSON.stringify(value)]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer();
  return '#plan=1.' + btoa(String.fromCharCode(...new Uint8Array(compressed))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
async function unpack(hash: string) {
  const binary = atob(hash.slice('#plan=1.'.length).replaceAll('-', '+').replaceAll('_', '/'));
  return JSON.parse(await new Response(new Blob([Uint8Array.from(binary, (c) => c.charCodeAt(0))]).stream().pipeThrough(new DecompressionStream('deflate'))).text());
}

describe('shared plan snapshots', () => {
  test('roundtrips current inputs with fresh local identity, preserving path only', async () => {
    const source = draft();
    const before = structuredClone(source);
    const url = new URL(await createShareUrl(catalog, source, 'https://example.com/crafts/index.html?old=1#old'));
    expect(url.origin + url.pathname).toBe('https://example.com/crafts/index.html');
    expect(url.search).toBe('');
    expect(url.hash).toStartWith('#plan=1.');
    const result = (await readSharedPlan(catalog, url.hash))!;
    expect(result).toEqual({ ...source, id: result.id, createdAt: result.createdAt, updatedAt: result.updatedAt });
    expect(result.id).not.toBe(source.id);
    expect(result.createdAt).toBeGreaterThan(source.createdAt);
    expect((await readSharedPlan(catalog, url.hash))!.id).not.toBe(result.id);
    expect(source).toEqual(before);
  });

  test('rebuilds active Thunder Dash trades without sender bonuses, progress or historical catalog', async () => {
    const preset = buildFineArcheumPreset(catalog, draft(), true);
    const bonus = setTradeBonus(catalog, availableTradeData(preset.settings.tradeAccess), preset, 0, 0, 1);
    const source = toggleRunComplete(bonus, 0);
    source.progress = { '["gather","70403004"]': 2 };
    source.completedGathering = ['70403004'];
    source.completedCrafts = ['60211413'];
    source.trade!.data.sample = true;
    const url = new URL(await createShareUrl(catalog, source, 'https://example.com/'));
    expect(await unpack(url.hash)).toEqual({ name: source.name, recipeId: source.recipeId, quantity: source.quantity, inventory: source.inventory, settings: source.settings, activeTrade: true });
    const result = (await readSharedPlan(catalog, url.hash))!;
    expect(result.trade).toEqual(preset.trade);
    expect(result.trade!.bonus).toBeNull();
    expect(result.trade!.completedRuns).toEqual([]);
    expect(result.trade!.data.sample).toBe(false);
    expect(result.progress).toEqual({});
    expect(result.completedGathering).toEqual([]);
    expect(result.completedCrafts).toEqual([]);
  });

  test('does not revive stale trade history', async () => {
    const source = updatePlanInputs(buildFineArcheumPreset(catalog, draft(), false), { quantity: 11 });
    expect(source.trade!.stale).toBe(true);
    const url = new URL(await createShareUrl(catalog, source, 'https://example.com/'));
    expect((await readSharedPlan(catalog, url.hash))!.trade).toBeNull();
  });

  test('ignores absent and unrelated fragments', async () => {
    for (const hash of ['', '#', '#inventory', '#other=1']) expect(await readSharedPlan(catalog, hash)).toBeNull();
  });

  test('rejects invalid source drafts instead of sharing them', async () => {
    const source = draft();
    source.name = '  ';
    await expect(createShareUrl(catalog, source, 'https://example.com/')).rejects.toThrow('Invalid plan');
  });

  test('rejects malformed compression, encoding and unsupported versions', async () => {
    for (const hash of ['#plan=', '#plan=2.AAAA', '#plan=1.', '#plan=1.@@@@', '#plan=1.A', '#plan=1.AB', '#plan=1.AAAA', '#plan=1.eJw=']) {
      await expect(readSharedPlan(catalog, hash)).rejects.toThrow('Cannot open shared plan');
    }
    await expect(readSharedPlan(catalog, '#plan=2.AAAA')).rejects.toThrow('Unsupported');
  });

  test('validates every untrusted input and rejects execution-state injection', async () => {
    const valid = snapshot();
    const invalid = [null, [], { ...valid, name: '' }, { ...valid, recipeId: 'missing' }, { ...valid, quantity: 0 },
      { ...valid, inventory: { missing: 1 } }, { ...valid, inventory: { '70403004': -1 } }, { ...valid, activeTrade: 1 },
      { ...valid, settings: { ...valid.settings, includeConflict: 'true' } },
      { ...valid, settings: { ...valid.settings, master: { ...valid.settings.master, Cloth: 'true' } } },
      { ...valid, settings: { ...valid.settings, farmable: ['70403004', '70403004'] } },
      { ...valid, quantity: 1.5 }, { ...valid, name: 'x'.repeat(201) },
      { ...valid, settings: { ...valid.settings, farmable: ['missing'] } },
      { ...valid, settings: { ...valid.settings, unexpected: false } },
      { ...valid, progress: {} }, { ...valid, trade: null }, { ...valid, id: 'sender' },
      { ...valid, settings: { ...valid.settings, tradeAccess: { pioneer: true, senior: 'yes' } } }];
    for (const value of invalid) await expect(readSharedPlan(catalog, await hashFor(value))).rejects.toThrow('Cannot open shared plan');
  });

  test('bounds compressed payload and decompressed JSON, including highly compressible bombs', async () => {
    await expect(readSharedPlan(catalog, '#plan=1.' + 'A'.repeat(16_000))).rejects.toThrow('too large');
    await expect(readSharedPlan(catalog, await hashFor({ ...snapshot(), name: 'a'.repeat(128 * 1024) }))).rejects.toThrow('too large');
    const source = draft();
    source.inventory = Object.fromEntries(Array.from({ length: 10_000 }, (_, i) => [`inventory-${i}`, i]));
    await expect(createShareUrl(catalog, source, 'https://example.com/')).rejects.toThrow('too large');
    source.inventory = {};
    source.name = '雷'.repeat(50_000);
    await expect(createShareUrl(catalog, source, 'https://example.com/')).rejects.toThrow('too large');
  });
});
