<script lang="ts">
  import ItemIcon from './ItemIcon.svelte';
  import { questlogSearchUrl } from './questlog';
  import type { Item } from './types';

  let { item, count, complete = false, purpose, onToggle }: {
    item: Pick<Item, 'name' | 'icon' | 'grade'>;
    count: number;
    complete?: boolean;
    purpose?: string;
    onToggle?: () => void;
  } = $props();
  const format = new Intl.NumberFormat('en-US');
  const quantity = $derived(format.format(count));
  const label = $derived(`${purpose ? `${purpose}: ` : ''}${quantity} ${item.name}`);
  const lookupUrl = $derived(questlogSearchUrl(item.name));
</script>

{#snippet artwork()}
  <ItemIcon icon={item.icon} grade={item.grade} />
  {#if complete}<span class="check" aria-hidden="true">✓</span>{/if}
  <span class="stack-count" class:long={quantity.length > 6} aria-hidden="true">{quantity}</span>
  <span class="tooltip" aria-hidden="true">{quantity} {item.name}</span>
{/snippet}

<div class="material-tile">
  <div class="tile-image">
    {#if onToggle}
      <button class="slot" type="button" aria-label={label} aria-pressed={complete} onclick={onToggle}>
        {@render artwork()}
      </button>
    {:else}
      <span class="slot" aria-hidden="true">
        {@render artwork()}
      </span>
    {/if}
    <a class="lookup-link" href={lookupUrl} target="_blank" rel="noopener noreferrer" aria-label={`${label}. Search Questlog (opens in a new tab).`} title={`Search ${item.name} on Questlog`}><span aria-hidden="true">?</span></a>
  </div>
  <span class="caption" aria-hidden="true">{item.name}</span>
</div>

<style>
  .material-tile { width: 58px; display: grid; justify-items: center; gap: 5px; }
  .tile-image { position: relative; width: 58px; height: 58px; }
  .lookup-link { position: absolute; z-index: 3; top: 0; right: 0; width: 24px; height: 24px; display: grid; place-items: center; text-decoration: none; }
  .lookup-link > span { width: 18px; height: 18px; display: grid; place-items: center; border: 1px solid #8a774e; border-radius: 50%; background: #15140fe6; color: var(--gold); font: 700 12px/1 system-ui; }
  .slot { position: relative; display: inline-flex; width: 58px; height: 58px; padding: 0; border: 0; background: none; }
  .slot :global(.item-icon) { width: 58px; height: 58px; }
  .stack-count { position: absolute; right: 3px; bottom: 3px; z-index: 2; color: #fff; font: 700 14px/1 ui-sans-serif, system-ui, sans-serif; letter-spacing: -.04em; text-shadow: 1px 1px 1px #000, -1px -1px 1px #000, 0 0 3px #000, 0 0 5px #000; pointer-events: none; }
  .stack-count.long { font-size: 10px; letter-spacing: -.06em; }
  .check { position: absolute; inset: 1px; display: grid; place-items: center; background: #10170da6; color: #e3f4c9; font: 700 32px/1 system-ui; text-shadow: 0 2px 4px #000; pointer-events: none; }
  .tooltip { position: absolute; z-index: 5; bottom: calc(100% + 8px); right: 0; width: max-content; max-width: min(240px, 70vw); padding: 6px 9px; border: 1px solid #806d4d; background: #14130f; color: #eee6d8; font: 12px/1.4 system-ui; text-align: center; overflow-wrap: anywhere; visibility: hidden; pointer-events: none; }
  .tile-image:hover .tooltip, .tile-image:focus-within .tooltip { visibility: visible; }
  .caption { display: none; color: var(--muted); font-size: 11px; line-height: 1.3; text-align: center; overflow-wrap: anywhere; }
  @media (max-width: 720px), (pointer: coarse) {
    .material-tile { width: 74px; }
    .caption { display: block; }
    .tooltip { display: none; }
  }
</style>
