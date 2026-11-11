<script lang="ts">
  import ItemIcon from './ItemIcon.svelte';
  import ScreenshotImporter from './ScreenshotImporter.svelte';
  import type { Catalog, Inventory } from './types';

  type Props = {
    catalog: Catalog;
    inventory: Inventory;
    setStock: (id: string, event: Event) => void;
    saveImport: (next: Inventory) => boolean;
    onImportStart: () => void;
  };

  let { catalog, inventory, setStock, saveImport, onImportStart }: Props = $props();
  let query = $state('');
  let editingId = $state<string | null>(null);

  const owned = $derived(catalog.items.filter((item) => (inventory[item.id] ?? 0) > 0 || item.id === editingId));
  const results = $derived(
    (query.trim()
      ? catalog.items.filter((item) => item.name.toLowerCase().includes(query.trim().toLowerCase()))
      : owned)
      .slice()
      .sort((left, right) => left.name.localeCompare(right.name)),
  );
  const visibleResults = $derived(query.trim() ? results.slice(0, 100) : results);
</script>

<section aria-label="Plan inventory" class="inventory">
  <div class="intro">
    <p>Manual edits need Save changes. Screenshot imports overwrite and save the whole plan.</p>
  </div>
  <ScreenshotImporter {catalog} {inventory} {saveImport} {onImportStart} />
  <label for="inventory-search">Search items</label>
  <input id="inventory-search" type="search" placeholder="Find any catalog item…" bind:value={query} />
  {#if query.trim() && results.length > 100}<p class="hint">Showing the first 100 matches. Refine your search.</p>{/if}
  {#if results.length}
    <div class="rows">
      {#each visibleResults as item (item.id)}
        <div class="row">
          <ItemIcon size="small" icon={item.icon} grade={item.grade} />
          <span>{item.name}</span>
          <input
            aria-label={`${item.name} on hand`}
            type="number"
            min="0"
            step="1"
            value={inventory[item.id] ?? 0}
            onfocus={() => editingId = item.id}
            onblur={() => editingId = null}
            oninput={event => event.currentTarget.setCustomValidity('')}
            onchange={event => setStock(item.id, event)}
          />
        </div>
      {/each}
    </div>
  {:else}
    <p class="empty">No matching items.</p>
  {/if}
</section>

<style>
  .inventory { display: grid; gap: 14px; min-width: 0; }
  .intro p, .hint, .empty { margin: 0; color: #b3a991; font-size: 12px; line-height: 1.6; }
  .inventory > label { color: #b3a991; font-size: 12px; }
  .inventory > input { width: 100%; }
  .rows { display: grid; }
  .row { display: grid; grid-template-columns: 34px minmax(0, 1fr) 76px; gap: 10px; align-items: center; padding: 10px 0; border-bottom: 1px solid #453e30; }
  .row > span { overflow-wrap: anywhere; font-size: 13px; }
  .row input { width: 100%; padding: 8px 5px; }
</style>
