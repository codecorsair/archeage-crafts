<script lang="ts">
  import ItemIcon from './ItemIcon.svelte';
  import type { Catalog } from './types';
  import type { TradeCatalog } from './trading';

  type Props = {
    catalog: Catalog;
    tradeData: TradeCatalog;
    selected: string[];
    onChange: (ids: string[]) => void;
    disabled?: boolean;
  };

  let { catalog, tradeData, selected, onChange, disabled = false }: Props = $props();
  let query = $state('');
  let open = $state(false);
  let active = $state(0);

  const items = $derived(new Map(catalog.items.map((item) => [item.id, item])));
  const options = $derived(
    [...new Set(tradeData.packs.flatMap((pack) => pack.materials.map((row) => row.itemId)))]
      .filter((id) => !selected.includes(id))
      .map((id) => items.get(id))
      .filter((item) => item !== undefined)
      .filter((item) => item.name.toLowerCase().includes(query.toLowerCase()))
      .sort((left, right) => left.name.localeCompare(right.name)),
  );

  function choose(id: string): void {
    if (!selected.includes(id)) onChange([...selected, id]);
    query = '';
    open = false;
  }

  function keydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      open = false;
      return;
    }
    if (event.key === 'ArrowDown' && options.length) {
      event.preventDefault();
      open = true;
      active = (active + 1) % options.length;
    }
    if (event.key === 'ArrowUp' && options.length) {
      event.preventDefault();
      open = true;
      active = (active - 1 + options.length) % options.length;
    }
    if (event.key === 'Enter' && open && options[active]) {
      event.preventDefault();
      choose(options[active].id);
    }
  }
</script>

<div class="picker" onfocusout={(event) => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) open = false; }}>
  <label for="farm-search">Materials you can farm</label>
  <div class="chips">
    {#each selected as id (id)}
      <span class="chip">
        {items.get(id)?.name ?? id}
        <button type="button" disabled={disabled} aria-label={`Remove ${items.get(id)?.name ?? id}`} onclick={() => onChange(selected.filter((value) => value !== id))}>×</button>
      </span>
    {/each}
  </div>
  <input
    id="farm-search"
    role="combobox"
    aria-autocomplete="list"
    aria-expanded={open}
    aria-controls="farm-options"
    aria-activedescendant={open && options[active] ? `farm-option-${options[active].id}` : undefined}
    placeholder="Add a trade-pack ingredient…"
    bind:value={query}
    {disabled}
    onfocus={() => open = true}
    oninput={() => { open = true; active = 0; }}
    onkeydown={keydown}
  />
  {#if open && !disabled}
    <ul id="farm-options" role="listbox">
      {#each options as item, index (item.id)}
        <li id={`farm-option-${item.id}`} role="option" aria-selected={index === active} class:active={index === active}>
          <button type="button" tabindex="-1" onclick={() => choose(item.id)}>
            <ItemIcon size="small" icon={item.icon} grade={item.grade} />
            <span class={`grade grade-${(item.grade ?? '').toLowerCase()}`}>{item.name}</span>
          </button>
        </li>
      {:else}
        <li class="empty">No matching trade-pack ingredients</li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .picker { position: relative; display: grid; gap: 9px; }
  .picker > label { color: #b3a991; font-size: 12px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { display: inline-flex; align-items: center; gap: 7px; border: 1px solid #514936; padding: 5px 8px; font-size: 12px; }
  .chip button { border: 0; background: none; color: #d1b97c; font-size: 17px; cursor: pointer; }
  .picker input { width: 100%; }
  ul { position: absolute; z-index: 4; top: 100%; left: 0; right: 0; max-height: 260px; overflow: auto; padding: 5px; margin: 4px 0 0; list-style: none; background: #211f1a; border: 1px solid #665c44; }
  .picker li button { display: flex; align-items: center; gap: 9px; width: 100%; padding: 7px; border: 0; background: none; text-align: left; }
  .picker li.active, .picker li:hover { background: #403925; }
  .grade { font-size: 13px; }
  .grade-grand { color: #a7c993; }
  .grade-rare { color: #a4c6e6; }
  .grade-heroic, .grade-arcane { color: #d1aee0; }
  .grade-legendary, .grade-epic { color: #e7b58e; }
  .empty { padding: 12px; color: #b3a991; font-size: 12px; }
</style>
