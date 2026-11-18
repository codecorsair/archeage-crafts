import { availableTradeData } from '../data/trading';
import { attachTradePlan, parsePlans, type CraftPlan } from './plans';
import { planTrades } from './trading';
import type { Catalog } from './types';

const MAX_PAYLOAD_CHARS = 16_000;
const MAX_JSON_BYTES = 128 * 1024;
const TOO_LARGE = 'This plan is too large to share. Reduce its inventory or use a smaller plan.';

async function transform(bytes: Uint8Array, stream: CompressionStream | DecompressionStream, limit: number): Promise<Uint8Array> {
  const reader = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(stream).getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new Error(TOO_LARGE);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

function encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

/** Only shared inputs are accepted; local identity and execution state are always fresh. */
function parseSnapshot(catalog: Catalog, value: unknown): { plan: CraftPlan; activeTrade: boolean } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a plan snapshot object.');
  const row = value as Record<string, unknown>;
  const keys = ['name', 'recipeId', 'quantity', 'inventory', 'settings', 'activeTrade'];
  if (Object.keys(row).length !== keys.length || Object.keys(row).some((key) => !keys.includes(key))) throw new Error('Unexpected or missing snapshot fields.');
  if (typeof row.activeTrade !== 'boolean') throw new Error('Trade intent must be a boolean.');
  const now = Date.now();
  const [plan] = parsePlans(JSON.stringify([{
    name: row.name, recipeId: row.recipeId, quantity: row.quantity, inventory: row.inventory, settings: row.settings,
    id: crypto.randomUUID(), createdAt: now, updatedAt: now, trade: null, progress: {}, completedGathering: [], completedCrafts: [],
  }]), catalog);
  return { plan, activeTrade: row.activeTrade };
}

export async function createShareUrl(catalog: Catalog, plan: CraftPlan, baseUrl: string): Promise<string> {
  const snapshot = { name: plan.name, recipeId: plan.recipeId, quantity: plan.quantity, inventory: plan.inventory, settings: plan.settings, activeTrade: !!plan.trade && !plan.trade.stale };
  const json = JSON.stringify(snapshot);
  // Check before parsing or compression so oversized drafts cannot produce oversized working buffers.
  if (json.length > MAX_JSON_BYTES) throw new Error(TOO_LARGE);
  const bytes = new TextEncoder().encode(json);
  if (bytes.length > MAX_JSON_BYTES) throw new Error(TOO_LARGE);
  parseSnapshot(catalog, snapshot);
  const payload = encode(await transform(bytes, new CompressionStream('deflate'), MAX_PAYLOAD_CHARS));
  if (payload.length + 2 > MAX_PAYLOAD_CHARS) throw new Error(TOO_LARGE);
  const url = new URL(baseUrl);
  url.search = '';
  url.hash = `plan=1.${payload}`;
  return url.href;
}

export async function readSharedPlan(catalog: Catalog, hash: string): Promise<CraftPlan | null> {
  if (!hash || hash === '#' || !hash.startsWith('#plan=')) return null;
  try {
    const payload = hash.slice('#plan='.length);
    if (payload.length > MAX_PAYLOAD_CHARS) throw new Error(TOO_LARGE);
    const dot = payload.indexOf('.');
    if (dot < 0) throw new Error('Malformed plan link.');
    if (payload.slice(0, dot) !== '1') throw new Error('Unsupported plan link version. Update the app or ask for a new link.');
    const encoded = payload.slice(dot + 1);
    if (!encoded || !/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length % 4 === 1) throw new Error('Invalid plan link encoding.');
    const bytes = Uint8Array.from(atob(encoded.replaceAll('-', '+').replaceAll('_', '/')), (char) => char.charCodeAt(0));
    if (encode(bytes) !== encoded) throw new Error('Invalid plan link encoding.');
    const json = new TextDecoder('utf-8', { fatal: true }).decode(await transform(bytes, new DecompressionStream('deflate'), MAX_JSON_BYTES));
    const { plan, activeTrade } = parseSnapshot(catalog, JSON.parse(json));
    if (!activeTrade) return plan;
    const data = availableTradeData(plan.settings.tradeAccess);
    return attachTradePlan(plan, planTrades(catalog, data, plan.recipeId, plan.quantity, plan.inventory,
      new Set(plan.settings.farmable), { master: plan.settings.master, includeConflict: plan.settings.includeConflict }), data);
  } catch (error) {
    throw new Error(`Cannot open shared plan: ${error instanceof Error ? error.message : 'Invalid snapshot.'} Ask the sender for a new link.`);
  }
}
