<script lang="ts">
  import { onMount } from 'svelte';
  import data from './data/catalog.json';
  import { availableTradeData } from './data/trading';
  import CatalogItemPicker from './lib/CatalogItemPicker.svelte';
  import CraftingSteps from './lib/CraftingSteps.svelte';
  import Guide from './lib/Guide.svelte';
  import InventoryPanel from './lib/InventoryPanel.svelte';
  import ItemIcon from './lib/ItemIcon.svelte';
  import MaterialTile from './lib/MaterialTile.svelte';
  import ProgressPopover, { type ProgressAction } from './lib/ProgressPopover.svelte';
  import TradePlanner from './lib/TradePlanner.svelte';
  import TradeHelp from './lib/TradeHelp.svelte';
  import TradeRunGuide from './lib/TradeRunGuide.svelte';
  import { calculate } from './lib/calculator';
  import { craftingPlan, gatheringPlan } from './lib/crafting-plan';
  import { parseInventory } from './lib/inventory';
  import { craftingTargets, PROFESSIONS } from './lib/recipe-policy';
  import { attachTradePlan, changeTaskProgress, clearTaskProgress, createPlan, hasTaskProgress, projectPlanStock, setTradeBonus, taskProgress, toggleRunComplete, updatePlanInputs, type CraftPlan } from './lib/plans';
  import { LEGACY_STATE_KEYS, parseWorkbenchState, WORKBENCH_STATE_KEY } from './lib/workbench-state';
  import { planTrades, type TradeCatalog, type TradePlan } from './lib/trading';
  import { buildFineArcheumPreset } from './lib/trade-presets';
  import type { Catalog, Inventory } from './lib/types';

  const catalog: Catalog = data;
  const items = new Map(catalog.items.map(item => [item.id, item]));
  const recipes = new Map(catalog.recipes.map(recipe => [recipe.id, recipe]));
  const targets = craftingTargets(catalog);
  const targetRecipes = new Map(targets.map(recipe => [recipe.itemId, recipe]));
  const targetItems = targets.map(recipe => items.get(recipe.itemId)).filter(item => item !== undefined);
  const format = new Intl.NumberFormat('en-US');

  let plans = $state<CraftPlan[]>([]);
  let draft = $state<CraftPlan | null>(null);
  let loaded = $state(false);
  let storageBlocked = $state(false);
  let error = $state('');
  let newTargetId = $state<string | null>(null);
  let newQuantity = $state<number | undefined>(1);
  let drawer = $state<'target' | 'inventory' | 'master' | 'trades' | null>(null);
  let mobileSetupOpen = $state(false);
  let tradeMode = $state<'owned' | 'dropped' | 'all'>('all');
  type Navigation = { kind: 'new' } | { kind: 'switch'; id: string };
  type Modal = { kind: 'navigate'; next: Navigation } | { kind: 'delete' } | { kind: 'remove-trades' } | { kind: 'rebuild'; plan: TradePlan; data: TradeCatalog; candidate: CraftPlan } | { kind: 'preset'; candidate: CraftPlan } | { kind: 'reset-progress'; candidate: CraftPlan };
  let modal = $state<Modal | null>(null);
  let progressSelection = $state<{ taskId: string; anchor: HTMLButtonElement } | null>(null);
  let dialog = $state<HTMLDialogElement | undefined>(undefined);
  let drawerDialog = $state<HTMLDialogElement | undefined>(undefined);

  const saved = $derived(plans.find(plan => plan.id === draft?.id));
  const dirty = $derived(draft !== null && JSON.stringify(draft) !== JSON.stringify(saved));
  const target = $derived(draft ? recipes.get(draft.recipeId) : undefined);
  const currentTrade = $derived(draft?.trade && !draft.trade.stale ? draft.trade : null);
  const calculation = $derived.by(() => {
    if (!draft) return { result: null, actions: [], error: '' };
    try {
      const stock = projectPlanStock(draft);
      const result = calculate(catalog, draft.recipeId, draft.quantity, stock.craft, { master: draft.settings.master, masterInventory: stock.owned });
      return { result, actions: craftingPlan(catalog, result), error: '' };
    } catch (cause) {
      return { result: null, actions: [], error: cause instanceof Error ? cause.message : 'Could not calculate this plan.' };
    }
  });
  const intermediateActions = $derived(calculation.actions.filter(action => action.itemId !== target?.itemId));
  const finalActions = $derived(calculation.actions.filter(action => action.itemId === target?.itemId));
  const gatheringActions = $derived(calculation.result ? gatheringPlan(calculation.result, currentTrade?.plan ?? null) : []);
  const activeProgressTask = $derived([...gatheringActions, ...calculation.actions].find(task => task.progressKey === progressSelection?.taskId));
  const progressAction = $derived<ProgressAction | null>(draft && activeProgressTask && progressSelection ? {
    name: items.get(activeProgressTask.itemId)?.name ?? activeProgressTask.itemId,
    planned: 'count' in activeProgressTask ? activeProgressTask.count : activeProgressTask.produced,
    done: taskProgress(draft, activeProgressTask).done,
    kind: 'count' in activeProgressTask ? 'gather' : 'craft',
    anchor: progressSelection.anchor,
  } : null);
  const gatheringGroups = [{ kind: 'farm', title: 'Farm for trade packs' }, { kind: 'gather', title: 'Gather for crafting' }] as const;

  onMount(() => {
    try {
      const value = localStorage.getItem(WORKBENCH_STATE_KEY);
      plans = parseWorkbenchState(value, catalog).plans;
      // Existing v1 data is disposable local testing, explicitly authorized by JB.
      if (value === null) for (const key of LEGACY_STATE_KEYS) localStorage.removeItem(key);
    } catch (cause) {
      storageBlocked = true;
      error = cause instanceof Error ? cause.message : 'Could not load saved plans. Stored data was kept.';
    }
    loaded = true;
  });

  $effect(() => {
    if (drawer && draft && drawerDialog && !drawerDialog.open) drawerDialog.showModal();
    else if (!drawer && drawerDialog?.open) drawerDialog.close();
    if (modal && dialog && !dialog.open) dialog.showModal();
    else if (!modal && dialog?.open) dialog.close();
  });

  function navigate(next: Navigation) {
    progressSelection = null;
    drawer = null;
    error = '';
    if (next.kind === 'switch') {
      const plan = plans.find(entry => entry.id === next.id);
      if (plan) draft = structuredClone($state.snapshot(plan));
    } else {
      draft = null;
      newTargetId = null;
      newQuantity = 1;
    }
  }

  function requestNavigation(next: Navigation) {
    if (next.kind === 'switch' && next.id === draft?.id) return;
    if (dirty) modal = { kind: 'navigate', next };
    else navigate(next);
  }

  function changeSavedPlan(event: Event) {
    const select = event.currentTarget as HTMLSelectElement;
    const id = select.value;
    // Keep the picker on the current plan while Save/Discard/Cancel is pending.
    select.value = draft?.id ?? '';
    if (id) requestNavigation({ kind: 'switch', id });
  }

  function startPlan() {
    const recipe = newTargetId && targetRecipes.get(newTargetId);
    if (!recipe || !Number.isSafeInteger(newQuantity) || !newQuantity || newQuantity < 1) return;
    draft = updatePlanInputs(createPlan(catalog, recipe.id), { quantity: newQuantity });
    drawer = null;
    error = '';
  }

  function changeInputs(patch: Partial<Pick<CraftPlan, 'recipeId' | 'quantity' | 'inventory' | 'settings'>>) {
    if (!draft) return false;
    try {
      const candidate = updatePlanInputs(draft, patch);
      error = '';
      if (hasTaskProgress(draft) && !hasTaskProgress(candidate)) {
        progressSelection = null;
        modal = { kind: 'reset-progress', candidate: $state.snapshot(candidate) };
        return false;
      }
      draft = candidate;
      return true;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not update this plan.';
      return false;
    }
  }

  function changeQuantity(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    if (!Number.isSafeInteger(input.valueAsNumber) || input.valueAsNumber < 1) {
      input.setCustomValidity('Enter a positive whole quantity within the safe integer range.');
      return;
    }
    input.setCustomValidity('');
    const quantity = input.valueAsNumber;
    input.value = String(draft?.quantity ?? quantity);
    changeInputs({ quantity });
  }

  function setStock(id: string, event: Event) {
    if (!draft) return;
    const input = event.currentTarget as HTMLInputElement;
    const value = input.value === '' && !input.validity.badInput ? 0 : input.valueAsNumber;
    if (!Number.isSafeInteger(value) || value < 0) {
      input.setCustomValidity('Enter a whole, non-negative quantity within the safe integer range.');
      return;
    }
    input.setCustomValidity('');
    input.value = String(draft.inventory[id] ?? 0);
    changeInputs({ inventory: { ...draft.inventory, [id]: value } });
  }

  function saveImportedInventory(inventory: Inventory): boolean {
    if (!draft) return false;
    try {
      let candidate = clearTaskProgress(updatePlanInputs($state.snapshot(draft), { inventory: parseInventory(JSON.stringify(inventory), new Set(items.keys())) }));
      // An explicitly accepted replacement establishes a new baseline even when its quantities match.
      if (candidate.trade) candidate = { ...candidate, trade: { ...candidate.trade, stale: true } };
      return saveCandidate(candidate);
    } catch (cause) {
      error = `Not saved. ${cause instanceof Error ? cause.message : 'Could not save imported inventory.'}`;
      return false;
    }
  }

  function persist(next: CraftPlan[]): boolean {
    if (storageBlocked) {
      error = 'Saved data could not be loaded safely. Your draft is not saved; stored data has not been overwritten.';
      return false;
    }
    try {
      const value = JSON.stringify({ version: 2, plans: next });
      const validated = parseWorkbenchState(value, catalog);
      localStorage.setItem(WORKBENCH_STATE_KEY, value);
      plans = validated.plans;
      error = '';
      return true;
    } catch (cause) {
      error = `Not saved. ${cause instanceof Error ? cause.message : 'Browser storage is unavailable.'}`;
      return false;
    }
  }

  function saveCandidate(plan: CraftPlan): boolean {
    const candidate = { ...plan, updatedAt: Date.now() };
    const next = plans.some(plan => plan.id === candidate.id)
      ? plans.map(plan => plan.id === candidate.id ? candidate : plan)
      : [...plans, candidate];
    if (!persist(next)) return false;
    draft = structuredClone($state.snapshot(plans.find(plan => plan.id === candidate.id)!));
    return true;
  }

  function save(): boolean {
    if (!draft) return false;
    return saveCandidate($state.snapshot(draft));
  }

  function openProgress(taskId: string, anchor: HTMLButtonElement) {
    progressSelection = { taskId, anchor };
    error = '';
  }

  function updateProgress(change: { add: number } | { set: number } | 'complete') {
    if (!draft || !progressSelection) throw new Error('This task is no longer available.');
    draft = changeTaskProgress(catalog, $state.snapshot(draft), progressSelection.taskId, change);
    error = '';
  }

  function changeTradeBonus(runIndex: number, loadIndex: number, amount: number): boolean {
    if (!draft) return false;
    try {
      if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('Extra received must be a non-negative whole number within the safe integer range.');
      draft = setTradeBonus(catalog, availableTradeData(draft.settings.tradeAccess), $state.snapshot(draft), runIndex, loadIndex, amount);
      progressSelection = null;
      error = '';
      return true;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not recalculate trade bonuses.';
      return false;
    }
  }

  function applyTradePreset(includeConflict: boolean) {
    if (!draft) return;
    try {
      const candidate = buildFineArcheumPreset(catalog, $state.snapshot(draft), includeConflict);
      if (hasTaskProgress(draft) || draft.trade?.completedRuns.length || draft.trade?.bonus) {
        modal = { kind: 'preset', candidate };
      } else {
        draft = candidate;
      }
      error = '';
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not build this trade preset.';
    }
  }

  function openTradeSetup(mode: 'owned' | 'dropped' | 'all') {
    tradeMode = mode;
    drawer = 'trades';
  }

  function reviewTrades(farmable?: string[]) {
    if (!draft) return;
    try {
      const source = $state.snapshot(draft);
      const candidate = farmable === undefined ? source : updatePlanInputs(source, { settings: { farmable } });
      const tradeData = availableTradeData(candidate.settings.tradeAccess);
      const plan = planTrades(catalog, tradeData, candidate.recipeId, candidate.quantity, candidate.inventory, new Set(candidate.settings.farmable), { master: candidate.settings.master, includeConflict: candidate.settings.includeConflict });
      modal = { kind: 'rebuild', plan, data: tradeData, candidate: attachTradePlan(candidate, plan, tradeData) };
      error = '';
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not build trade runs.';
    }
  }

  function acceptModal() {
    if (!modal || !draft) return;
    if (modal.kind === 'rebuild') {
      draft = $state.snapshot(modal.candidate);
      drawer = null;
    } else if (modal.kind === 'preset' || modal.kind === 'reset-progress') {
      draft = $state.snapshot(modal.candidate);
      if (modal.kind === 'preset') drawer = null;
    } else if (modal.kind === 'remove-trades') {
      draft = clearTaskProgress({ ...draft, trade: null });
    } else if (modal.kind === 'delete') {
      if (saved && !persist(plans.filter(plan => plan.id !== draft?.id))) return;
      navigate({ kind: 'new' });
    }
    modal = null;
  }

  function leaveDraft(saveFirst: boolean) {
    if (modal?.kind !== 'navigate') return;
    const next = modal.next;
    if (saveFirst && !save()) return;
    modal = null;
    navigate(next);
  }
</script>

<svelte:window onbeforeunload={event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } }} />

<header class="site-header">
  <span class="brand">ArcheAge Craft<small>Crafting plans</small></span>
  <Guide hasPlan={draft !== null} onStart={() => progressSelection = null} />
</header>

<main class="workspace">
  <aside class="plan-rail">
    <section class="rail-section" data-guide="plans">
      <h2>Plans</h2>
      <label for="saved-plan">Saved plans</label>
      <select id="saved-plan" value={draft?.id ?? ''} onchange={changeSavedPlan}>
        <option value="">Choose a plan</option>
        {#if draft && !saved}<option value={draft.id}>Unsaved: {draft.name}</option>{/if}
        {#each plans as plan (plan.id)}<option value={plan.id}>{plan.name}</option>{/each}
      </select>
      <button type="button" onclick={() => requestNavigation({ kind: 'new' })}>New plan</button>
    </section>
    {#if draft}
      <section class="rail-section plan-summary">
        <div class="rail-plan-title"><div class="eyebrow">Current plan</div><h2>{draft.name}</h2><p class="note">{format.format(draft.quantity)} {target?.name ?? 'items'}</p></div>
        <span class="save-status" role="status">{dirty ? 'Unsaved changes' : 'Saved'}</span>
        <button class="primary" data-guide="save" type="button" onclick={() => save()} disabled={!dirty || !loaded}>Save changes</button>
        <button class="mobile-setup-toggle" data-guide="mobile-settings" type="button" aria-expanded={mobileSetupOpen} onclick={() => mobileSetupOpen = !mobileSetupOpen}>Plan settings</button>
        <nav class="setup-links" class:mobile-collapsed={!mobileSetupOpen} aria-label="Plan configuration">
          <button type="button" onclick={() => drawer = 'target'}>Target & name</button>
          <button type="button" data-guide="inventory" onclick={() => drawer = 'inventory'}>Inventory</button>
          <button type="button" onclick={() => drawer = 'master'}>Master professions</button>
          <button type="button" onclick={() => openTradeSetup('all')}>Trade setup</button>
        </nav>
        <button class="quiet danger" class:mobile-collapsed={!mobileSetupOpen} type="button" onclick={() => modal = { kind: 'delete' }}>{saved ? 'Delete plan' : 'Discard plan'}</button>
      </section>
    {/if}
    <p class="rail-note">Inventory, settings and progress belong to each plan. Completion does not change stock.</p>
  </aside>

  <div class="workspace-content">
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    {#if !loaded}<p class="note">Loading plans…</p>
    {:else if !draft}
      <section class="panel new-plan" data-guide="new-plan">
        <div class="eyebrow">New crafting plan</div>
        <h1>What are you making?</h1>
        <CatalogItemPicker id="new-target" items={targetItems} selectedId={newTargetId} onSelect={id => newTargetId = id} label="Target item" />
        <label for="new-quantity">Quantity<input id="new-quantity" type="number" min="1" step="1" bind:value={newQuantity} /></label>
        <button class="primary" type="button" onclick={startPlan} disabled={!newTargetId || !newQuantity || !Number.isSafeInteger(newQuantity) || newQuantity < 1}>Start plan</button>
        <p class="note">Starts with empty inventory and all unlocks off.</p>
      </section>
    {:else}
      <header class="plan-header">
        <ItemIcon icon={items.get(target?.itemId ?? '')?.icon} grade={items.get(target?.itemId ?? '')?.grade} />
        <div><h1>{target?.name ?? draft.name}</h1><p>{format.format(draft.quantity)} to make · {draft.name}</p></div>
      </header>
      {#if calculation.error}<p class="error" role="alert">{calculation.error}</p>{/if}
      <section class="panel phase preparation" aria-labelledby="gathering-heading">
        <div class="phase-title"><span>1</span><h2 id="gathering-heading">Gather materials</h2></div>
        {#each gatheringGroups as group}
          {#if gatheringActions.some(action => action.kind === group.kind)}
            <div class="gathering-group">
              <h3>{group.title}</h3>
              <ul class="item-tiles" aria-label={group.title}>
                {#each gatheringActions.filter(action => action.kind === group.kind) as action (action.key)}
                  {@const progress = taskProgress(draft, action)}
                  <li><MaterialTile item={items.get(action.itemId) ?? { name: action.itemId }} count={progress.remaining} complete={progress.complete} purpose={group.kind === 'farm' ? 'Pack farming remaining' : 'Gathering remaining'} expanded={progressSelection?.taskId === action.progressKey} onProgress={anchor => openProgress(action.progressKey, anchor)} /></li>
                {/each}
              </ul>
            </div>
          {/if}
        {/each}
        {#if !gatheringActions.length && !calculation.error}<p class="note">No gathering needed.</p>{/if}
      </section>
      <div class="phase-board">
        <section class="panel phase" aria-labelledby="trade-heading">
          <div class="phase-title"><span>2</span><h2 id="trade-heading">Trade runs</h2><TradeHelp /></div>
          <div class="trade-actions-bar">
            <button type="button" onclick={() => openTradeSetup('owned')}>Trade owned materials</button>
            <button type="button" onclick={() => openTradeSetup('dropped')}>Add dropped materials</button>
            {#if draft.trade}<button type="button" onclick={() => modal = { kind: 'remove-trades' }}>Remove trade runs</button>{/if}
          </div>
          <section class="trade-presets" aria-label="Trade presets">
            <h3>Fine Archeum presets</h3>
            <p class="note">Replace farming choices with Fine Archeum and enable Pioneer.</p>
            <div class="trade-actions-bar">
              <button type="button" onclick={() => applyTradePreset(false)}>PvE only</button>
              <button type="button" onclick={() => applyTradePreset(true)}>PvE + PvP</button>
            </div>
          </section>
          {#if draft.trade?.stale}
            <p class="notice">These runs are outdated. Their rewards are paused until rebuilt.</p>
            <button type="button" class="primary" onclick={() => reviewTrades()}>Review rebuild</button>
            <details class="previous-runs"><summary>Previous runs and progress</summary><TradeRunGuide {catalog} tradeData={draft.trade.data} plan={draft.trade.plan} completedRuns={draft.trade.completedRuns} bonus={draft.trade.bonus} disabled /></details>
          {:else if draft.trade}
            {#if draft.trade.plan.runs.length}
              <p class="phase-note" aria-live="polite">{draft.trade.completedRuns.length} of {draft.trade.plan.runs.length} runs complete · {draft.trade.plan.days} {draft.trade.plan.days === 1 ? 'day' : 'days'}</p>
              <p class="phase-note">Enter only bonus items. Recording extras keeps that run and earlier runs fixed.</p>
              <TradeRunGuide {catalog} tradeData={draft.trade.data} plan={draft.trade.plan} completedRuns={draft.trade.completedRuns} bonus={draft.trade.bonus} onBonusChange={changeTradeBonus} onToggle={index => { if (draft) draft = toggleRunComplete(draft, index); }} />
            {:else}<p class="note">No eligible trade runs with this setup.</p>{/if}
          {:else}
            <p class="note">No trade runs configured.</p>
          {/if}
        </section>
        <section class="panel phase" aria-labelledby="materials-heading">
          <div class="phase-title"><span>3</span><h2 id="materials-heading">Make materials</h2></div>
          {#if intermediateActions.length}<CraftingSteps {catalog} rows={intermediateActions} plan={draft} activeProgressKey={progressSelection?.taskId} onProgress={openProgress} />
          {:else if !calculation.error}<p class="note">No intermediate crafting needed.</p>{/if}
        </section>
        <section class="panel phase" aria-labelledby="finish-heading">
          <div class="phase-title"><span>4</span><h2 id="finish-heading">Finish the plan</h2></div>
          {#if finalActions.length}<CraftingSteps {catalog} rows={finalActions} plan={draft} activeProgressKey={progressSelection?.taskId} onProgress={openProgress} />
          {:else if !calculation.error}<p class="note">The target is already supplied by plan inventory.</p>{/if}
        </section>
      </div>
    {/if}
  </div>
</main>

<ProgressPopover action={progressAction} onRecord={amount => updateProgress({ add: amount })} onComplete={() => updateProgress('complete')} onReset={() => updateProgress({ set: 0 })} onClose={() => progressSelection = null} />

<dialog class="setup-drawer" bind:this={drawerDialog} aria-label="Plan configuration" oncancel={event => { event.preventDefault(); drawer = null; }}>
  {#if draft && drawer}
      <div class="drawer-heading"><h2>{({ target: 'Target & name', inventory: 'Plan inventory', master: 'Master professions', trades: 'Trade setup' })[drawer]}</h2><button type="button" onclick={() => drawer = null}>Done</button></div>
      <p class="note drawer-note">For this plan only.{#if drawer !== 'inventory'} Edits are kept when you Save changes.{/if}</p>
      {#if drawer === 'target'}
        <label for="plan-name">Plan name<input id="plan-name" value={draft.name} oninput={event => { if (draft) draft = { ...draft, name: event.currentTarget.value }; }} /></label>
        <CatalogItemPicker id="plan-target" items={targetItems} selectedId={target?.itemId ?? null} onSelect={id => { const recipe = targetRecipes.get(id); if (recipe) changeInputs({ recipeId: recipe.id }); }} label="Target item" />
        <label for="plan-quantity">Quantity<input id="plan-quantity" type="number" min="1" step="1" value={draft.quantity} oninput={event => event.currentTarget.setCustomValidity('')} onchange={changeQuantity} /></label>
      {:else if drawer === 'inventory'}
        {#key draft.id}<InventoryPanel {catalog} inventory={draft.inventory} {setStock} saveImport={saveImportedInventory} onImportStart={() => drawer = 'inventory'} />{/key}
      {:else if drawer === 'master'}
        <p class="note">Use owned rare ingredients before basic materials in the professions you enable. Direct rare-ingredient needs are reserved first. Master is not currently attainable in game, so every profession starts off.</p>
        <fieldset><legend>Master unlocks</legend>{#each PROFESSIONS as profession}<label class="toggle"><input type="checkbox" checked={draft.settings.master[profession]} onchange={event => { if (!draft) return; const checked = event.currentTarget.checked; event.currentTarget.checked = draft.settings.master[profession]; changeInputs({ settings: { ...draft.settings, master: { ...draft.settings.master, [profession]: checked } } }); }} />{profession}</label>{/each}</fieldset>
      {:else}
        <TradePlanner {catalog} plan={draft} mode={tradeMode} onChange={settings => changeInputs({ settings })} onReview={reviewTrades} onRemove={() => modal = { kind: 'remove-trades' }} />
      {/if}
  {/if}
</dialog>

<dialog bind:this={dialog} aria-labelledby="confirmation-title" oncancel={event => { event.preventDefault(); modal = null; }}>
  {#if modal?.kind === 'navigate'}
    <h2 id="confirmation-title">Save your changes?</h2><p>This plan has unsaved changes.</p>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <div class="button-row"><button class="primary" onclick={() => leaveDraft(true)}>Save & continue</button><button onclick={() => leaveDraft(false)}>Discard changes</button><button onclick={() => modal = null}>Cancel</button></div>
  {:else if modal?.kind === 'rebuild'}
    <h2 id="confirmation-title">Review trade runs</h2><p>{modal.plan.runs.length} {modal.plan.runs.length === 1 ? 'run' : 'runs'} · {modal.plan.days} {modal.plan.days === 1 ? 'day' : 'days'}</p>
    {#if draft && (draft.trade || hasTaskProgress(draft))}<p class="notice">Replacing runs clears work progress, run completion, recorded extras and protected history. Your inventory is unchanged.</p>{/if}
    <TradeRunGuide {catalog} tradeData={modal.data} plan={modal.plan} disabled />
    {#if !modal.plan.runs.length}<p class="note">No runs can improve this plan with the current stock, access and farming selections.</p>{/if}
    <div class="button-row"><button class="primary" onclick={acceptModal}>Use these runs</button><button onclick={() => modal = null}>Cancel</button></div>
  {:else if modal?.kind === 'reset-progress'}
    <h2 id="confirmation-title">Reset work progress?</h2>
    <p>Changing planning inputs clears gathered and crafted counts so owned stock is not counted twice.</p>
    {#if draft?.trade}<p>Previous trade runs and extras stay recorded, but their rewards pause until rebuilt.</p>{/if}
    <p class="note">Save changes is still required.</p>
    <div class="button-row"><button class="primary" onclick={acceptModal}>Change inputs & reset</button><button onclick={() => modal = null}>Cancel</button></div>
  {:else if modal?.kind === 'preset'}
    <h2 id="confirmation-title">Apply Fine Archeum preset?</h2>
    <p>Farm Fine Archeum with {modal.candidate.settings.includeConflict ? 'PvE + PvP' : 'PvE only'}. Pioneer access will be enabled.</p>
    <p class="notice">Existing work progress, run completion, recorded extras and protected history will be cleared. Your inventory is unchanged.</p>
    <div class="button-row"><button class="primary" onclick={acceptModal}>Apply preset</button><button onclick={() => modal = null}>Cancel</button></div>
  {:else if modal?.kind === 'remove-trades'}
    <h2 id="confirmation-title">Remove trade runs?</h2><p>Crafting will use this plan's inventory only. Work progress, run completion, recorded extras and protected history will be cleared.</p><div class="button-row"><button class="primary" onclick={acceptModal}>Remove runs</button><button onclick={() => modal = null}>Cancel</button></div>
  {:else if modal?.kind === 'delete'}
    <h2 id="confirmation-title">{saved ? 'Delete this plan?' : 'Discard this plan?'}</h2><p>{draft?.name}. Other plans are not affected.</p>{#if error}<p class="error" role="alert">{error}</p>{/if}<div class="button-row"><button class="danger" onclick={acceptModal}>{saved ? 'Delete plan' : 'Discard plan'}</button><button onclick={() => modal = null}>Cancel</button></div>
  {/if}
</dialog>
