<script lang="ts">
  import MaterialTile from './MaterialTile.svelte';
  import type { TradeBonus } from './plans';
  import type { Catalog } from './types';
  import type { TradeCatalog, TradePlan } from './trading';

  let { catalog, tradeData, plan, completedRuns = [], bonus = null, onToggle, onBonusChange, disabled = false }: {
    catalog: Catalog;
    tradeData: TradeCatalog;
    plan: TradePlan;
    completedRuns?: number[];
    bonus?: TradeBonus | null;
    onBonusChange?: (runIndex: number, loadIndex: number, amount: number) => boolean;
    onToggle?: (index: number) => void;
    disabled?: boolean;
  } = $props();
  const items = $derived(new Map(catalog.items.map(item => [item.id, item])));
  const packs = $derived(new Map(tradeData.packs.map(pack => [pack.id, pack])));
  const posts = $derived(new Map(tradeData.posts.map(post => [post.id, post.name])));
  const format = new Intl.NumberFormat('en-US');
  const extras = $derived(new Map((bonus?.extras ?? []).map(extra => [`${extra.runIndex}:${extra.loadIndex}`, extra.count])));

  function changeExtra(runIndex: number, loadIndex: number, previous: number, event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    // Replacing a number briefly empties the field; only a valid blank clears on blur.
    if (input.value === '' && event.type === 'input') return;
    const amount = input.value === '' && !input.validity.badInput ? 0 : input.valueAsNumber;
    if (onBonusChange?.(runIndex, loadIndex, amount) === false) input.value = String(previous);
  }
</script>

<div class="trade-actions">
  {#each plan.runs as run, index (index)}
    <article class="run-action" class:done={completedRuns.includes(index)}>
      <h3 class="action-heading"><span>Run {index + 1} · {posts.get(run.originId) ?? run.originId}</span>{#if index < (bonus?.protectedRunCount ?? 0)}<small class="run-fixed" title="This run stays fixed when bonuses recalculate later runs">Fixed</small>{/if}</h3>
      <p class="action-meta">{run.channel === 'pve' ? 'PvE' : 'Conflict'} · Day {run.day} · {format.format(run.loads.reduce((sum, load) => sum + load.packs, 0))} packs</p>
      {#each run.loads as load, loadIndex}
        {@const pack = packs.get(load.packId)}
        {@const extra = extras.get(`${index}:${loadIndex}`) ?? 0}
        <div class="run-load">
          <h3>Make and load {format.format(load.packs)} {pack?.name ?? load.packId} {load.packs === 1 ? 'pack' : 'packs'}</h3>
          <div class="trade-exchange">
            <ul class="item-tiles" aria-label="Pack ingredients">
              {#each pack?.materials ?? [] as input (input.itemId)}
                <li><MaterialTile item={items.get(input.itemId) ?? { name: input.itemId }} count={input.count * load.packs} purpose="Pack ingredient" /></li>
              {/each}
            </ul>
            <span class="exchange-arrow" aria-hidden="true">→</span>
            <MaterialTile item={items.get(load.rewardItemId) ?? { name: load.rewardItemId }} count={load.received + extra} purpose="Receive" />
          </div>
          <p>Deliver to <strong>{posts.get(load.destinationId) ?? load.destinationId}</strong></p>
          {#if extra > 0}<p class="reward-breakdown">{format.format(load.received)} expected + {format.format(extra)} extra</p>{/if}
          {#if onBonusChange && !disabled}
            <label class="trade-extra">Extra received
              <input type="number" min="0" step="1" max={Number.MAX_SAFE_INTEGER} value={extra} aria-label={`Extra ${items.get(load.rewardItemId)?.name ?? load.rewardItemId} received on run ${index + 1}`} oninput={event => changeExtra(index, loadIndex, extra, event)} onblur={event => { if (event.currentTarget.value === '') changeExtra(index, loadIndex, extra, event); }} />
            </label>
          {/if}
        </div>
      {/each}
      {#if onToggle}
        <button class="complete-action" class:completed={completedRuns.includes(index)} type="button" disabled={disabled} aria-label={`${completedRuns.includes(index) ? 'Reopen' : 'Mark complete'}: run ${index + 1}`} onclick={() => onToggle?.(index)}>{completedRuns.includes(index) ? 'Reopen' : 'Mark complete'}</button>
      {:else if completedRuns.includes(index)}<p class="completion-status">Complete</p>{/if}
    </article>
  {/each}
</div>
