<script lang="ts">
  import ItemIcon from './ItemIcon.svelte';
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
</script>

{#snippet artwork()}
  <ItemIcon icon={item.icon} grade={item.grade} />
  {#if complete}<span class="check" aria-hidden="true">✓</span>{/if}
  <span class="stack-count" class:long={quantity.length > 6} aria-hidden="true">{quantity}</span>
  <span class="tooltip" aria-hidden="true">{quantity} {item.name}</span>
{/snippet}

<div class="material-tile">
  {#if onToggle}
    <button class="slot" type="button" aria-label={label} aria-pressed={complete} onclick={onToggle}>
      {@render artwork()}
    </button>
  {:else}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex (Focus reveals the name of this informational item, just like hover.) -->
    <span class="slot" role="img" tabindex="0" aria-label={label}>
      {@render artwork()}
    </span>
  {/if}
  <span class="caption" aria-hidden="true">{item.name}</span>
</div>

<style>
  .material-tile { width: 58px; display: grid; justify-items: center; gap: 5px; }
  .slot { position: relative; display: inline-flex; width: 58px; height: 58px; padding: 0; border: 0; background: none; }
  .slot :global(.item-icon) { width: 58px; height: 58px; }
  .stack-count { position: absolute; right: 3px; bottom: 3px; z-index: 2; color: #fff; font: 700 14px/1 ui-sans-serif, system-ui, sans-serif; letter-spacing: -.04em; text-shadow: 1px 1px 1px #000, -1px -1px 1px #000, 0 0 3px #000, 0 0 5px #000; pointer-events: none; }
  .stack-count.long { font-size: 10px; letter-spacing: -.06em; }
  .check { position: absolute; inset: 1px; display: grid; place-items: center; background: #10170da6; color: #e3f4c9; font: 700 32px/1 system-ui; text-shadow: 0 2px 4px #000; pointer-events: none; }
  .tooltip { position: absolute; z-index: 5; bottom: calc(100% + 8px); right: 0; width: max-content; max-width: min(240px, 70vw); padding: 6px 9px; border: 1px solid #806d4d; background: #14130f; color: #eee6d8; font: 12px/1.4 system-ui; text-align: center; overflow-wrap: anywhere; visibility: hidden; pointer-events: none; }
  .slot:hover .tooltip, .slot:focus-visible .tooltip { visibility: visible; }
  .caption { display: none; color: var(--muted); font-size: 11px; line-height: 1.3; text-align: center; overflow-wrap: anywhere; }
  @media (max-width: 720px), (pointer: coarse) {
    .material-tile { width: 74px; }
    .caption { display: block; }
    .tooltip { display: none; }
  }
</style>
