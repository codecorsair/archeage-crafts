<script lang="ts">
  import ItemIcon from './ItemIcon.svelte';
  import MaterialTile from './MaterialTile.svelte';
  import type { CraftingPlanRow } from './crafting-plan';
  import { taskProgress, type CraftPlan } from './plans';
  import type { Catalog } from './types';

  let { catalog, rows, plan, activeProgressKey, onProgress }: {
    catalog: Catalog;
    rows: CraftingPlanRow[];
    plan: CraftPlan;
    activeProgressKey?: string;
    onProgress: (key: string, anchor: HTMLButtonElement) => void;
  } = $props();
  const items = $derived(new Map(catalog.items.map(item => [item.id, item])));
  const recipes = $derived(new Map(catalog.recipes.map(recipe => [recipe.id, recipe])));
  const format = new Intl.NumberFormat('en-US');
</script>

<div class="craft-actions">
  {#each rows as row (row.key)}
    {@const progress = taskProgress(plan, row)}
    {@const complete = progress.complete}
    <article class="craft-action" class:done={complete}>
      <div class="action-heading">
        <ItemIcon icon={items.get(row.itemId)?.icon} grade={items.get(row.itemId)?.grade} size="small" />
        <div>
          <h3>{complete ? 'Made' : 'Make'} {format.format(complete ? progress.done : progress.remaining)} {items.get(row.itemId)?.name ?? row.itemId}</h3>
          <p class="action-meta">{recipes.get(row.methods[0]?.recipeId)?.station ?? 'Crafting'}{#if row.surplus > 0} · {format.format(row.surplus)} extra{/if}</p>
        </div>
      </div>
      {#if progress.done > 0}<p class="work-progress">{format.format(progress.done)} made · {format.format(row.produced)} planned</p>{/if}
      <p class="input-reference">Full-task materials</p>
      <ul class="item-tiles craft-inputs" aria-label={`Full-task materials for ${row.produced} ${items.get(row.itemId)?.name ?? row.itemId}`}>
        {#each row.inputs as input (input.itemId)}
          <li><MaterialTile item={items.get(input.itemId) ?? { name: input.itemId }} count={input.count} /></li>
        {/each}
      </ul>
      <button class="complete-action" class:completed={complete} type="button" aria-label={`Update progress: ${items.get(row.itemId)?.name ?? row.itemId}`} aria-haspopup="dialog" aria-expanded={activeProgressKey === row.progressKey} aria-controls="progress-popover" onclick={event => onProgress(row.progressKey, event.currentTarget)}>{complete ? 'Completed · edit' : 'Record progress'}</button>
    </article>
  {/each}
</div>

<style>
  .work-progress { margin: 10px 0 0; color: var(--muted); font-size: 11px; }
  .input-reference { margin: 10px 0 6px; color: var(--muted); font-size: 11px; }
</style>
