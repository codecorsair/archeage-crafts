<script lang="ts">
  import MaterialTile from './MaterialTile.svelte';
  import type { Catalog } from './types';
  import type { TradeCatalog, TradePlan } from './trading';

  let { catalog, tradeData, plan, completedRuns = [], onToggle, disabled = false }: {
    catalog: Catalog;
    tradeData: TradeCatalog;
    plan: TradePlan;
    completedRuns?: number[];
    onToggle?: (index: number) => void;
    disabled?: boolean;
  } = $props();
  const items = $derived(new Map(catalog.items.map(item => [item.id, item])));
  const packs = $derived(new Map(tradeData.packs.map(pack => [pack.id, pack])));
  const posts = $derived(new Map(tradeData.posts.map(post => [post.id, post.name])));
  const format = new Intl.NumberFormat('en-US');
</script>

<div class="trade-actions">
  {#each plan.runs as run, index (index)}
    <article class="run-action" class:done={completedRuns.includes(index)}>
      <h3 class="action-heading">Run {index + 1} · {posts.get(run.originId) ?? run.originId}</h3>
      <p class="action-meta">{run.channel === 'pve' ? 'PvE' : 'Conflict'} · Day {run.day} · {format.format(run.loads.reduce((sum, load) => sum + load.packs, 0))} packs</p>
      {#each run.loads as load}
        {@const pack = packs.get(load.packId)}
        <div class="run-load">
          <h3>Make and load {format.format(load.packs)} {pack?.name ?? load.packId} {load.packs === 1 ? 'pack' : 'packs'}</h3>
          <div class="trade-exchange">
            <ul class="item-tiles" aria-label="Pack ingredients">
              {#each pack?.materials ?? [] as input (input.itemId)}
                <li><MaterialTile item={items.get(input.itemId) ?? { name: input.itemId }} count={input.count * load.packs} purpose="Pack ingredient" /></li>
              {/each}
            </ul>
            <span class="exchange-arrow" aria-hidden="true">→</span>
            <MaterialTile item={items.get(load.rewardItemId) ?? { name: load.rewardItemId }} count={load.received} purpose="Receive" />
          </div>
          <p>Deliver to <strong>{posts.get(load.destinationId) ?? load.destinationId}</strong></p>
        </div>
      {/each}
      {#if onToggle}
        <button class="complete-action" class:completed={completedRuns.includes(index)} type="button" disabled={disabled} aria-label={`${completedRuns.includes(index) ? 'Reopen' : 'Mark complete'}: run ${index + 1}`} onclick={() => onToggle?.(index)}>{completedRuns.includes(index) ? 'Reopen' : 'Mark complete'}</button>
      {:else if completedRuns.includes(index)}<p class="completion-status">Complete</p>{/if}
    </article>
  {/each}
</div>
