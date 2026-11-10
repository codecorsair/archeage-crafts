<script lang="ts">
  import { tick } from 'svelte';
  import ItemIcon from './ItemIcon.svelte';
  import type { Item } from './types';

  let { id, items, selectedId, onSelect, label = 'Catalog item' }: {
    id: string;
    items: readonly Item[];
    selectedId: string | null;
    onSelect: (id: string) => void;
    label?: string;
  } = $props();
  let query = $state('');
  let open = $state(false);
  let active = $state(0);
  const selected = $derived(items.find(item => item.id === selectedId));
  const matches = $derived(items.filter(item => item.name.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => a.name.localeCompare(b.name)));
  const options = $derived(matches.slice(0, 100));

  function choose(itemId: string) {
    open = false;
    query = '';
    onSelect(itemId);
  }
  async function keydown(event: KeyboardEvent) {
    if (event.key === 'Escape') { event.preventDefault(); open = false; return; }
    if (event.key === 'Enter' && open && options[active]) { event.preventDefault(); choose(options[active].id); return; }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    if (!open) { query = ''; open = true; active = event.key === 'ArrowDown' ? 0 : Math.max(0, options.length - 1); }
    else if (options.length) active = (active + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
    await tick();
    if (options[active]) document.getElementById(`${id}-option-${options[active].id}`)?.scrollIntoView({ block: 'nearest' });
  }
</script>

<div class="catalog-picker" onfocusout={event => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) open = false; }}>
  <label class="sr-only" for={id}>{label}</label>
  <input
    {id}
    role="combobox"
    aria-autocomplete="list"
    aria-expanded={open}
    aria-controls={`${id}-options`}
    aria-activedescendant={open && options[active] ? `${id}-option-${options[active].id}` : undefined}
    placeholder="Search catalog items…"
    autocomplete="off"
    value={open ? query : selected?.name ?? ''}
    onfocus={() => { query = ''; open = true; active = 0; }}
    oninput={event => { query = event.currentTarget.value; open = true; active = 0; }}
    onkeydown={keydown}
  />
  {#if open}
    <ul id={`${id}-options`} role="listbox" aria-label={label}>
      {#each options as item, index (item.id)}
        <li id={`${id}-option-${item.id}`} role="option" aria-selected={index === active} class:active={index === active}>
          <button type="button" tabindex="-1" onpointerdown={event => event.preventDefault()} onclick={() => choose(item.id)}>
            <ItemIcon icon={item.icon} grade={item.grade} size="small" /><span>{item.name}</span>
          </button>
        </li>
      {:else}
        <li class="empty" role="option" aria-selected="false" aria-disabled="true">No matching items.</li>
      {/each}
    </ul>
    {#if matches.length > 100}<p class="hint">Refine your search to see more matches.</p>{/if}
  {/if}
</div>

<style>
  .catalog-picker { min-width: 0; display: grid; gap: 4px; }
  input { width: 100%; min-width: 0; }
  ul { list-style: none; margin: 0; padding: 4px; max-height: 210px; overflow-y: auto; border: 1px solid #665c44; background: #211f1a; }
  li button { display: flex; align-items: center; gap: 8px; width: 100%; border: 0; background: none; padding: 7px; text-align: left; color: #e0d3b5; font: inherit; font-size: 12px; }
  li.active, li:hover { background: #403925; }
  li span { overflow-wrap: anywhere; }
  .empty, .hint { color: #b3a991; font-size: 11px; line-height: 1.6; padding: 6px; margin: 0; }
</style>
