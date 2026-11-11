<script lang="ts">
  import ItemIcon from './ItemIcon.svelte';
  import MaterialTile from './MaterialTile.svelte';
  import type { CraftingPlanRow } from './crafting-plan';
  import type { Catalog } from './types';

  let { catalog, rows, completed, onToggle }: {
    catalog: Catalog;
    rows: CraftingPlanRow[];
    completed: string[];
    onToggle: (key: string) => void;
  } = $props();
  const items = $derived(new Map(catalog.items.map(item => [item.id, item])));
  const recipes = $derived(new Map(catalog.recipes.map(recipe => [recipe.id, recipe])));
  const format = new Intl.NumberFormat('en-US');
</script>

<div class="craft-actions">
  {#each rows as row (row.key)}
    {@const complete = completed.includes(row.key)}
    <article class="craft-action" class:done={complete}>
      <div class="action-heading">
        <ItemIcon icon={items.get(row.itemId)?.icon} grade={items.get(row.itemId)?.grade} size="small" />
        <div>
          <h3>Make {format.format(row.produced)} {items.get(row.itemId)?.name ?? row.itemId}</h3>
          <p class="action-meta">{recipes.get(row.methods[0]?.recipeId)?.station ?? 'Crafting'}{#if row.surplus > 0} · {format.format(row.surplus)} extra{/if}</p>
        </div>
      </div>
      <ul class="item-tiles craft-inputs" aria-label={`Materials for ${row.produced} ${items.get(row.itemId)?.name ?? row.itemId}`}>
        {#each row.inputs as input (input.itemId)}
          <li><MaterialTile item={items.get(input.itemId) ?? { name: input.itemId }} count={input.count} /></li>
        {/each}
      </ul>
      <button class="complete-action" class:completed={complete} type="button" aria-label={`${complete ? 'Reopen' : 'Mark complete'}: make ${row.produced} ${items.get(row.itemId)?.name ?? row.itemId}`} onclick={() => onToggle(row.key)}>{complete ? 'Reopen' : 'Mark complete'}</button>
    </article>
  {/each}
</div>
