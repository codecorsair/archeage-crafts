<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import ItemIcon from './ItemIcon.svelte';
  import CatalogItemPicker from './CatalogItemPicker.svelte';
  import builtInReferences from '../data/screenshot-references.json';
  import { applySessionReconciliation, isSessionReconciliationCandidate, mergeScreenshotObservations, type ScreenshotReviewState } from './screenshot-import';
  import { analyzeScreenshot, matchScreenshotReferences, type RecognizedPanel, type RecognizedSlot } from './screenshot-vision';
  import { parseVisualReferences, rememberVisualReference, serializeVisualReferences, SCREENSHOT_REFERENCES_KEY, type VisualReference } from './screenshot-references';
  import type { Catalog, Inventory } from './types';

  let { catalog, inventory, saveImport, onImportStart }: { catalog: Catalog; inventory: Inventory; saveImport: (next: Inventory) => boolean; onImportStart: () => void } = $props();
  type ReviewSlot = RecognizedSlot & ScreenshotReviewState;
  type ReviewPanel = Omit<RecognizedPanel, 'slots'> & { slots: ReviewSlot[]; captureId: string };
  const validIds = $derived(new Set(catalog.items.map(item => item.id)));
  const items = $derived(new Map(catalog.items.map(item => [item.id, item])));
  const format = new Intl.NumberFormat('en-US');
  let fileInput: HTMLInputElement;
  let panels = $state<ReviewPanel[]>([]);
  let captures = $state<{ id: string; name: string; warnings: string[] }[]>([]);
  let references = $state<VisualReference[]>([]);
  let cacheAvailable = true;
  let cacheWarning = $state('');
  let error = $state('');
  let notice = $state('');
  let busy = $state(false);
  let reconciling = $state(false);
  let saveError = $state('');
  let activeFile = $state<File | null>(null);
  let pending = $state<File[]>([]);
  let controller: AbortController | null = null;
  let reconciliationController: AbortController | null = null;
  let generation = 0;

  onMount(() => {
    try { references = parseVisualReferences(localStorage.getItem(SCREENSHOT_REFERENCES_KEY), validIds); }
    catch { cacheAvailable = false; cacheWarning = 'Saved icon corrections could not be loaded. They were preserved; new corrections apply to this session only.'; }
  });
  onDestroy(reset);

  const slots = $derived(panels.flatMap(panel => panel.slots));
  const sessionReferences = $derived.by(() => {
    const confirmed = new Map<string, VisualReference>();
    for (const slot of slots) if (!slot.dismissed && slot.corrected && slot.itemId) confirmed.set(slot.itemId, { itemId: slot.itemId, vector: slot.vector, thumbnail: slot.thumbnail });
    return [...confirmed.values()];
  });
  const captureWarnings = $derived([...new Set(captures.flatMap(capture => capture.warnings))]);
  const unassigned = $derived(panels.filter(panel => panel.container === null));
  const issues = $derived(slots.filter(slot => !slot.dismissed && (!slot.reviewed || !slot.itemId || slot.countUncertain || slot.count === null || !Number.isSafeInteger(slot.count) || slot.count < 0)));
  const merged = $derived(mergeScreenshotObservations(panels.flatMap(panel => panel.container === null ? [] : panel.slots.map(slot => ({ id: slot.id, container: panel.container!, itemId: slot.itemId, count: slot.count, dismissed: slot.dismissed }))), validIds));
  const groups = $derived.by(() => {
    const ids = new Set(slots.filter(slot => !slot.dismissed && slot.itemId).map(slot => slot.itemId!));
    return [...ids].map(id => {
      const counts = (container: 'bag' | 'storage') => [...new Set(panels.filter(panel => panel.container === container).flatMap(panel => panel.slots.filter(slot => !slot.dismissed && slot.itemId === id).map(slot => slot.count)))];
      return { id, item: items.get(id)!, bag: counts('bag'), storage: counts('storage'), sightings: slots.filter(slot => !slot.dismissed && slot.itemId === id) };
    }).sort((a, b) => a.item.name.localeCompare(b.item.name));
  });
  const cleared = $derived(Object.entries(inventory).filter(([id, count]) => count > 0 && !(id in merged.inventory)));
  const canApply = $derived(captures.length > 0 && !busy && !reconciling && !error && !unassigned.length && !issues.length && !merged.conflicts.length && !merged.unresolved.length);

  function reset() {
    generation++; controller?.abort(); reconciliationController?.abort(); controller = null; reconciliationController = null; pending = []; activeFile = null; busy = false; reconciling = false;
    panels = []; captures = []; error = ''; saveError = '';
  }

  async function addImages(files: File[]) {
    if (!files.length) return;
    onImportStart();
    notice = ''; error = ''; saveError = '';
    if (captures.length + pending.length + files.length + (activeFile ? 1 : 0) > 20) { error = 'Import at most 20 screenshots in one batch.'; return; }
    pending.push(...files);
    if (busy) return;
    busy = true;
    const run = generation;
    controller = new AbortController();
    while (pending.length && run === generation) {
      const file = pending.shift()!;
      activeFile = file;
      try {
        const currentSessionReferences = sessionReferences;
        const sessionIds = new Set(currentSessionReferences.map(reference => reference.itemId));
        const result = await analyzeScreenshot(file, catalog, [...builtInReferences, ...references, ...currentSessionReferences], controller.signal);
        if (run !== generation) return;
        const captureId = crypto.randomUUID();
        captures = [...captures, { id: captureId, name: file.name || 'Pasted image', warnings: result.warnings }];
        panels = [...panels, ...result.panels.map(panel => ({ ...panel, id: `${captureId}:${panel.id}`, captureId, slots: panel.slots.map(slot => ({ ...slot, id: `${captureId}:${slot.id}`, panelId: `${captureId}:${panel.id}`, dismissed: false, reviewed: !slot.needsReview, corrected: false, sessionMatched: slot.itemId !== null && sessionIds.has(slot.itemId) })) }))];
        activeFile = null;
        await reconcileBatch();
      } catch (cause) {
        if (run !== generation) return;
        error = cause instanceof Error ? `${file.name || 'Image'}: ${cause.message}` : 'Could not read this image.';
      }
      if (run === generation) activeFile = null;
    }
    if (run === generation) { busy = false; controller = null; }
  }

  function paste(event: ClipboardEvent) {
    const files = [...(event.clipboardData?.files ?? [])].filter(file => file.type.startsWith('image/'));
    if (files.length) { event.preventDefault(); void addImages(files); }
  }
  function drop(event: DragEvent) {
    event.preventDefault();
    void addImages([...(event.dataTransfer?.files ?? [])]);
  }
  function updateSlot(id: string, update: Partial<ReviewSlot>) {
    panels = panels.map(panel => ({ ...panel, slots: panel.slots.map(slot => slot.id === id ? { ...slot, ...update } : slot) }));
  }
  async function reconcileBatch() {
    reconciliationController?.abort();
    const current = new AbortController();
    reconciliationController = current;
    const run = generation;
    const confirmed = sessionReferences;
    if (!confirmed.length) {
      panels = panels.map(panel => ({ ...panel, slots: applySessionReconciliation(panel.slots, new Map<string, string>()) }));
      reconciling = false; reconciliationController = null; return;
    }
    reconciling = true;
    try {
      const matches = new Map<string, string>();
      for (const slot of slots.filter(isSessionReconciliationCandidate)) {
        const itemId = await matchScreenshotReferences(slot.sourceImage, confirmed, current.signal);
        if (itemId && validIds.has(itemId)) matches.set(slot.id, itemId);
      }
      if (current.signal.aborted || run !== generation) return;
      panels = panels.map(panel => ({ ...panel, slots: applySessionReconciliation(panel.slots, matches) }));
    } catch (cause) {
      if (!current.signal.aborted && run === generation) {
        panels = panels.map(panel => ({ ...panel, slots: applySessionReconciliation(panel.slots, new Map<string, string>()) }));
        error = cause instanceof Error ? `Could not reuse this correction: ${cause.message}` : 'Could not reuse this correction. Review the remaining items manually.';
      }
    } finally {
      if (reconciliationController === current) { reconciliationController = null; reconciling = false; }
    }
  }
  function assignItem(slot: ReviewSlot, itemId: string) {
    updateSlot(slot.id, { itemId: validIds.has(itemId) ? itemId : null, reviewed: validIds.has(itemId), corrected: validIds.has(itemId), sessionMatched: false });
    void reconcileBatch();
  }
  function confirmSlot(slot: ReviewSlot) {
    if (slot.itemId && slot.count !== null && Number.isSafeInteger(slot.count) && slot.count >= 0) {
      updateSlot(slot.id, { reviewed: true, countUncertain: false, corrected: true, sessionMatched: false });
      void reconcileBatch();
    }
  }
  function setCount(id: string, container: 'bag' | 'storage', event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const count = input.value === '' ? null : input.valueAsNumber;
    panels = panels.map(panel => panel.container !== container ? panel : ({ ...panel, slots: panel.slots.map(slot => slot.itemId === id && !slot.dismissed ? { ...slot, count, countUncertain: false } : slot) }));
  }
  function removeCapture(id: string) {
    captures = captures.filter(capture => capture.id !== id); panels = panels.filter(panel => panel.captureId !== id);
    void reconcileBatch();
  }
  function forgetReferences() {
    references = [];
    try { localStorage.removeItem(SCREENSHOT_REFERENCES_KEY); cacheAvailable = true; cacheWarning = ''; }
    catch { cacheAvailable = false; cacheWarning = 'Learned icons were cleared for this session, but saved corrections could not be removed.'; }
    notice = 'Learned icons cleared for future imports. Inventory is unchanged.';
  }
  function apply() {
    if (!canApply) return;
    // Validate once more at the mutation boundary; no partial result is authoritative.
    if (merged.unresolved.length || merged.conflicts.length || unassigned.length || issues.length) return;
    saveError = '';
    try {
      if (!saveImport({ ...merged.inventory })) {
        saveError = 'Inventory could not be saved. Your screenshots and review are preserved. Retry when ready.';
        return;
      }
    } catch {
      saveError = 'Inventory could not be saved. Your screenshots and review are preserved. Retry when ready.';
      return;
    }
    const count = Object.keys(merged.inventory).length;
    let nextReferences = references;
    try {
      for (const slot of slots) if (!slot.dismissed && slot.corrected && slot.itemId) nextReferences = rememberVisualReference(nextReferences, { itemId: slot.itemId, vector: slot.vector, thumbnail: slot.thumbnail });
      const serialized = serializeVisualReferences(nextReferences, validIds);
      references = nextReferences;
      if (cacheAvailable) localStorage.setItem(SCREENSHOT_REFERENCES_KEY, serialized);
    } catch {
      cacheAvailable = false; cacheWarning = 'Plan saved, but icon corrections could not be saved. They apply to this session only.';
    }
    reset(); notice = `Inventory overwritten with ${format.format(count)} catalog items. Plan saved.`;
  }
</script>

<svelte:window onpaste={paste} />

<section class="screenshot-import" aria-label="Import inventory screenshots">
  <div class="import-head"><h3>Import screenshots</h3><span>On-device only</span></div>
  <div class="paste-area" role="group" aria-label="Paste or drop inventory screenshots" ondragover={event => event.preventDefault()} ondrop={drop}>
    <p>Paste screenshots with <kbd>Ctrl / ⌘ V</kbd>, or drop images here.</p>
    <button type="button" onclick={() => fileInput.click()}>Choose images</button>
    <input bind:this={fileInput} class="file-input" type="file" accept="image/png,image/jpeg,image/webp" multiple aria-label="Choose inventory screenshots" onchange={event => { void addImages([...(event.currentTarget.files ?? [])]); event.currentTarget.value = ''; }} />
  </div>
  <p class="hint">Choose <strong>Crafting Material</strong>. Capture Bag and Storage; add scrolled views without moving items. Crops are supported; clipped rows are skipped.</p>
  {#if busy || reconciling}
    <div class="processing" role="status" aria-live="polite"><span class="processing-spinner" aria-hidden="true"></span><span>{reconciling ? 'Checking matching items in this batch…' : `Reading ${activeFile?.name || 'pasted image'}…`}</span><span class="queue-count">{pending.length} queued</span></div>
  {/if}
  <details class="screenshot-example"><summary>Screenshot example</summary><a href={`${import.meta.env.BASE_URL}examples/inventory-crafting-materials.webp`} target="_blank" rel="noreferrer"><img src={`${import.meta.env.BASE_URL}examples/inventory-crafting-materials.webp`} alt="Bag and Storage with the Crafting Material filter selected" loading="lazy" /></a></details>
  {#if error}<div class="import-error"><p class="warning" role="alert">{error}</p><button type="button" onclick={() => { error = ''; }}>Dismiss error</button></div>{/if}
  {#if cacheWarning}<p class="warning" role="status">{cacheWarning}</p>{/if}
  {#if references.length || cacheWarning}<button type="button" class="text-button forget-icons" onclick={forgetReferences}>Forget learned icons</button>{/if}
  {#if notice}<p role="status">{notice}</p>{/if}
  {#if captures.length}
    <div class="captures" aria-label="Imported screenshots">
      {#each captures as capture (capture.id)}
        <div><span>{capture.name}</span><button type="button" aria-label={`Remove ${capture.name}`} disabled={busy} onclick={() => removeCapture(capture.id)}>Remove</button></div>
      {/each}
      {#each captureWarnings as warning}<p class="hint">{warning}</p>{/each}
    </div>
    <details class="panel-assignments" open={unassigned.length > 0}>
      <summary>Bag / Storage assignments{unassigned.length ? ` (${unassigned.length} need selection)` : ''}</summary>
      {#each panels as panel (panel.id)}
        <label class="panel-choice">
          {#if panel.slots[0]}<img src={panel.slots[0].thumbnail} alt="First item in this detected panel" />{/if}
          <span>{panel.slots[0]?.imageName ?? 'Cropped panel'}
            <select aria-label={`Inventory side for ${panel.id}`} value={panel.container ?? ''} onchange={event => { panels = panels.map(entry => entry.id === panel.id ? { ...entry, container: event.currentTarget.value === 'bag' ? 'bag' : event.currentTarget.value === 'storage' ? 'storage' : null } : entry); }}>
              <option value="">Choose Bag or Storage</option><option value="bag">Bag</option><option value="storage">Storage</option>
            </select>
          </span>
        </label>
      {/each}
    </details>
    {#if issues.length}
      <h4>Needs review</h4>
      <p class="hint">Search for the correct item or dismiss items outside the catalog. Corrections help matching sightings in this batch immediately and are saved on this device when applied.</p>
      <div class="review-issues">
        {#each issues as slot (slot.id)}
          <div class="issue">
            <img src={slot.thumbnail} alt={`Screenshot item from ${slot.imageName}`} />
            <div class="issue-fields"><small>{panels.find(panel => panel.id === slot.panelId)?.container === 'bag' ? 'Bag' : panels.find(panel => panel.id === slot.panelId)?.container === 'storage' ? 'Storage' : 'Unassigned side'} · {slot.imageName}</small>
              <CatalogItemPicker id={`identify-${slot.id}`} items={catalog.items} selectedId={slot.itemId} label="Identify screenshot item" onSelect={itemId => assignItem(slot, itemId)} />
              <label>Quantity <input aria-label={`Quantity for screenshot item ${slot.id}`} type="number" min="0" step="1" value={slot.count ?? ''} oninput={event => updateSlot(slot.id, { count: event.currentTarget.value === '' ? null : event.currentTarget.valueAsNumber, countUncertain: false })} /></label>
            </div>
            <div class="issue-actions"><button type="button" disabled={!slot.itemId || slot.count === null || !Number.isSafeInteger(slot.count) || slot.count < 0} onclick={() => confirmSlot(slot)}>Confirm</button><button type="button" onclick={() => { updateSlot(slot.id, { dismissed: true }); void reconcileBatch(); }}>Dismiss</button></div>
          </div>
        {/each}
      </div>
    {/if}
    {#if slots.some(slot => slot.dismissed)}<p class="hint">Dismissed {slots.filter(slot => slot.dismissed).length} sightings. <button type="button" class="text-button" onclick={() => { panels = panels.map(panel => ({ ...panel, slots: panel.slots.map(slot => ({ ...slot, dismissed: false })) })); void reconcileBatch(); }}>Restore dismissed</button></p>{/if}
    {#if merged.conflicts.length}<p class="warning" role="alert">Conflicting counts found. Edit the affected Bag or Storage count below, or remove screenshots from a different inventory session.</p>{/if}
    {#if merged.unresolved.some(issue => issue.reason === 'total-overflow')}<p class="warning" role="alert">A combined quantity is too large. Correct the counts before replacing inventory.</p>{/if}
    {#if groups.length}
      <h4>Combined inventory</h4><p class="hint">Repeated sightings count once per side. Edit a count to correct every sighting of that stack.</p>
      <div class="combined-scroll"><table><thead><tr><th>Item</th><th>Bag</th><th>Storage</th><th>New on hand</th></tr></thead><tbody>
        {#each groups as group (group.id)}
          <tr class:conflict={merged.conflicts.some(conflict => conflict.itemId === group.id)}>
            <th scope="row"><span class="item-name"><ItemIcon icon={group.item.icon} grade={group.item.grade} size="small" /><span>{group.item.name}{#if (inventory[group.id] ?? 0) !== (merged.inventory[group.id] ?? 0)}<small>Previously {format.format(inventory[group.id] ?? 0)}</small>{/if}</span></span><details class="slot-evidence"><summary>Screenshot evidence</summary><div>{#each group.sightings as sighting}<figure><img src={sighting.thumbnail} alt={`${group.item.name} observed in ${sighting.imageName}`} /><button type="button" onclick={() => updateSlot(sighting.id, { reviewed: false })}>Edit match</button><figcaption>{panels.find(panel => panel.id === sighting.panelId)?.container === 'bag' ? 'Bag' : 'Storage'}</figcaption></figure>{/each}</div></details></th>
            {#each ['bag', 'storage'] as side}
              {@const values = side === 'bag' ? group.bag : group.storage}
              <td><input aria-label={`${group.item.name} ${side === 'bag' ? 'Bag' : 'Storage'} import count`} type="number" min="0" step="1" disabled={!values.length} value={values.length === 1 ? values[0] ?? '' : values.length ? '' : 0} placeholder={values.length > 1 ? 'Conflict' : ''} oninput={event => setCount(group.id, side as 'bag' | 'storage', event)} />{#if values.length > 1}<small class="warning">{values.map(value => value ?? '?').join(' / ')}</small>{/if}</td>
            {/each}
            <td class="total">{group.id in merged.inventory ? format.format(merged.inventory[group.id]) : merged.conflicts.some(conflict => conflict.itemId === group.id) ? 'Resolve' : '0'}</td>
          </tr>
        {/each}
      </tbody></table></div>
    {/if}
    {#if cleared.length}<details><summary>{cleared.length} current items will be cleared by this replacement</summary><ul>{#each cleared as [id, count]}<li>{items.get(id)?.name ?? id}: {format.format(count)} → 0</li>{/each}</ul></details>{/if}
    <div class="apply-area">
      <p class="warning">This replaces the entire inventory. Items absent from these screenshots will be cleared.</p>
      {#if !Object.keys(merged.inventory).length && !issues.length && !unassigned.length && !merged.conflicts.length}<p class="warning">No catalog stock remains in this import. Applying it clears all recorded inventory.</p>{/if}
      {#if saveError}<p class="warning" role="alert">{saveError}</p>{/if}
      <div class="apply-actions"><button type="button" class="replace" disabled={!canApply} onclick={apply}>{saveError ? 'Retry save' : 'Overwrite and save'}</button><button type="button" onclick={reset}>Cancel import</button></div>
      {#if issues.length || unassigned.length}<p class="hint">Resolve or dismiss the remaining items and choose each panel’s side before applying.</p>{/if}
    </div>
  {:else if busy}<button type="button" onclick={reset}>Cancel import</button>{/if}
</section>

<style>
  .screenshot-import { border: 1px solid #554a34; padding: 16px; display: grid; gap: 12px; min-width: 0; }
  .import-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  h3 { font: 19px Georgia, serif; color: #dec68f; margin: 0; } h4 { margin: 8px 0 0; font: 16px Georgia, serif; color: #dec68f; }
  .import-head > span, .hint, small { color: #b3a991; font-size: 11px; line-height: 1.6; }
  p { margin: 0; font-size: 12px; line-height: 1.6; } .warning { color: #ebbd7b; }
  .paste-area { display: flex; justify-content: space-between; align-items: center; gap: 14px; border: 1px dashed #75613e; padding: 16px; background: #1b1a16; }
  kbd { font: inherit; color: #e1cfaa; }
  button { font: inherit; font-size: 12px; padding: 8px 10px; background: #302b20; border: 1px solid #75613e; color: #e3d2ad; } button:hover:not(:disabled) { background: #423824; } .file-input { display: none; }
  .import-error { display: grid; gap: 6px; justify-items: start; }
  .processing { display: flex; align-items: center; gap: 9px; min-width: 0; padding: 10px 12px; border-left: 2px solid #d1b97c; background: #2a251b; font-size: 12px; color: #dec68f; }
  .processing > span:nth-child(2) { overflow-wrap: anywhere; min-width: 0; }
  .queue-count { margin-left: auto; white-space: nowrap; color: #b3a991; }
  .processing-spinner { width: 16px; height: 16px; flex: none; border: 2px solid #554a34; border-top-color: #dec68f; border-radius: 50%; animation: processing-spin 1.4s steps(8, end) infinite; }
  @keyframes processing-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .processing-spinner { animation: none; } }
  .screenshot-example img { display: block; max-width: 100%; height: auto; margin-top: 10px; }
  .captures { display: grid; gap: 7px; } .captures > div { display: flex; gap: 12px; align-items: center; justify-content: space-between; min-width: 0; } .captures span { overflow-wrap: anywhere; font-size: 12px; } .captures button { padding: 4px 8px; }
  .panel-choice { display: grid; grid-template-columns: 48px minmax(0, 1fr); gap: 8px; align-items: center; font-size: 11px; color: #cfc4ab; padding-top: 10px; } .panel-choice img { width: 48px; height: 48px; } .panel-choice > span { overflow-wrap: anywhere; } .panel-choice select { margin-top: 5px; } select { min-width: 0; max-width: 100%; width: 100%; }
  .review-issues { display: grid; gap: 8px; max-height: 430px; overflow-y: auto; }
  .issue { display: grid; grid-template-columns: 64px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 10px; background: #191a16; border: 1px solid #51452e; }
  .issue > img { width: 64px; height: 64px; object-fit: contain; } .issue-fields { display: grid; gap: 5px; min-width: 0; } .issue-fields > small { overflow-wrap: anywhere; } .issue-fields label { display: flex; align-items: center; gap: 8px; font-size: 11px; } .issue-fields input { width: 85px; } .issue-actions { display: grid; gap: 6px; }
  .combined-scroll { overflow: auto; max-height: 480px; } table { border-collapse: collapse; width: 100%; font-size: 12px; } th, td { padding: 9px 6px; border-bottom: 1px solid #453e30; text-align: left; } thead { color: #b3a991; } thead th { position: sticky; top: 0; background: #23221b; z-index: 1; font-weight: normal; } tbody th { font-weight: normal; min-width: 145px; } td { width: 82px; } td input { width: 78px; padding: 7px 4px; } td > small { display: block; } .item-name { display: flex; gap: 8px; align-items: center; } .item-name small { display: block; font-size: 10px; } .total { color: #efdab0; font-variant-numeric: tabular-nums; } .conflict { background: #56351c35; }
  .slot-evidence { font-size: 10px; color: #b3a991; margin-top: 5px; } .slot-evidence > div { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 7px; } .slot-evidence figure { margin: 0; } .slot-evidence img { display: block; width: 64px; height: 64px; } .slot-evidence figcaption { font-size: 10px; text-align: center; } .slot-evidence button { font-size: 10px; padding: 3px 5px; margin-top: 3px; } .forget-icons { justify-self: start; }
  details { font-size: 12px; color: #ebbd7b; } summary { cursor: pointer; } li { margin-top: 5px; }
  .apply-area { display: grid; gap: 12px; border-top: 1px solid #554a34; padding-top: 14px; } .apply-actions { display: flex; gap: 10px; flex-wrap: wrap; } .replace { border-color: #b39658; background: #3b301d; color: #edd4a0; } button:disabled { opacity: .45; cursor: not-allowed; } .text-button { background: none; border: 0; padding: 0; text-decoration: underline; color: #dfc48c; }
  @media (max-width: 600px) { .screenshot-import { padding: 12px; } .paste-area { flex-direction: column; align-items: stretch; padding: 12px; } .issue { grid-template-columns: 52px minmax(0, 1fr); padding: 8px; } .issue > img { width: 52px; height: 52px; } .issue-actions { grid-column: 2; display: flex; } table { font-size: 11px; } th, td { padding: 8px 4px; } table, tbody { display: block; } thead { position: absolute; clip-path: inset(50%); width: 1px; height: 1px; overflow: hidden; } tbody tr { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; border-bottom: 1px solid #453e30; padding: 10px 0; } tbody th { grid-column: 1 / -1; min-width: 0; border: 0; padding: 0; } td { width: auto; border: 0; padding: 0; } td::before { display: block; color: #b3a991; font-size: 10px; margin-bottom: 4px; } td:first-of-type::before { content: 'Bag'; } td:nth-of-type(2)::before { content: 'Storage'; } td.total::before { content: 'On hand'; } td input { width: 100%; } .item-name { gap: 5px; } }
</style>
