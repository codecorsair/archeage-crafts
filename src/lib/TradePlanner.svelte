<script lang="ts">
  import FarmingPicker from './FarmingPicker.svelte';
  import { updateFarmableInputs } from './farming-selection';
  import { availableTradeData, farmableTradeMaterialIds } from '../data/trading';
  import type { CraftPlan } from './plans';
  import type { Catalog } from './types';

  let { catalog, plan, mode = 'all', onChange, onReview, onRemove }: {
    catalog: Catalog;
    plan: CraftPlan;
    mode?: 'owned' | 'dropped' | 'all';
    onChange: (settings: CraftPlan['settings']) => void;
    onReview: (farmable?: string[]) => void;
    onRemove: () => void;
  } = $props();
  const data = $derived(availableTradeData(plan.settings.tradeAccess));

  function changeAccess(key: 'pioneer' | 'senior', event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const checked = input.checked;
    input.checked = plan.settings.tradeAccess[key];
    onChange({ ...plan.settings, tradeAccess: { ...plan.settings.tradeAccess, [key]: checked } });
  }

  function changeChannels(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const checked = input.checked;
    input.checked = plan.settings.includeConflict;
    onChange({ ...plan.settings, includeConflict: checked });
  }
</script>

<section class="trade-setup">
  <p class="note">{mode === 'owned' ? 'Trade spare on-hand materials without assuming any farming.' : mode === 'dropped' ? 'Choose basic materials and boss drops to farm. Use × to remove a choice.' : 'Choose access, channels and the pack ingredients you can farm.'} Review and apply the runs before they take effect.</p>
  {#if mode === 'owned' && plan.settings.farmable.length}<p class="note">Applying owned-stock runs clears current farming selections.</p>{/if}
  <fieldset>
    <legend>Company access</legend>
    <label class="toggle"><input type="checkbox" checked={plan.settings.tradeAccess.pioneer} onchange={event => changeAccess('pioneer', event)} />Pioneer Operative: blue basic trades</label>
    <label class="toggle"><input type="checkbox" checked={plan.settings.tradeAccess.senior} onchange={event => changeAccess('senior', event)} />Senior Operative: purple basic trades</label>
  </fieldset>
  <label class="toggle"><input type="checkbox" checked={plan.settings.includeConflict} onchange={changeChannels} />Include conflict channels</label>
  {#if mode !== 'owned'}
    <FarmingPicker {catalog} tradeData={data} selected={plan.settings.farmable} allowed={mode === 'dropped' ? farmableTradeMaterialIds : undefined} onChange={farmable => onChange({ ...plan.settings, farmable: mode === 'dropped' ? updateFarmableInputs(plan.settings.farmable, farmable) : farmable })} />
  {/if}
  <div class="button-row">
    <button class="primary" type="button" onclick={() => onReview(mode === 'owned' ? [] : plan.settings.farmable)}>{plan.trade ? 'Review rebuild' : 'Review trade runs'}</button>
    {#if plan.trade}<button type="button" onclick={onRemove}>Remove trade runs</button>{/if}
  </div>
  <p class="note">Up to seven packs per run. Three PvE runs per day, plus three conflict runs when enabled. Farming and travel are not included in trade days.</p>
</section>
