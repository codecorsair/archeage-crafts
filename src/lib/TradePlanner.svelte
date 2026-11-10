<script lang="ts">
  import FarmingPicker from './FarmingPicker.svelte';
  import { availableTradeData } from '../data/trading';
  import type { CraftPlan } from './plans';
  import type { Catalog } from './types';

  let { catalog, plan, onChange, onReview, onRemove }: {
    catalog: Catalog;
    plan: CraftPlan;
    onChange: (settings: CraftPlan['settings']) => void;
    onReview: () => void;
    onRemove: () => void;
  } = $props();
  const data = $derived(availableTradeData(plan.settings.tradeAccess));
</script>

<section class="trade-setup">
  <p class="note">Configure the runs for this plan. Changes take effect after you review and rebuild.</p>
  <fieldset>
    <legend>Company access</legend>
    <label class="toggle"><input type="checkbox" checked={plan.settings.tradeAccess.pioneer} onchange={event => onChange({ ...plan.settings, tradeAccess: { ...plan.settings.tradeAccess, pioneer: event.currentTarget.checked } })} />Pioneer Operative: blue basic trades</label>
    <label class="toggle"><input type="checkbox" checked={plan.settings.tradeAccess.senior} onchange={event => onChange({ ...plan.settings, tradeAccess: { ...plan.settings.tradeAccess, senior: event.currentTarget.checked } })} />Senior Operative: purple basic trades</label>
  </fieldset>
  <label class="toggle"><input type="checkbox" checked={plan.settings.includeConflict} onchange={event => onChange({ ...plan.settings, includeConflict: event.currentTarget.checked })} />Include conflict channels</label>
  <FarmingPicker {catalog} tradeData={data} selected={plan.settings.farmable} onChange={farmable => onChange({ ...plan.settings, farmable })} />
  <div class="button-row">
    <button class="primary" type="button" onclick={onReview}>{plan.trade ? 'Review rebuild' : 'Review trade runs'}</button>
    {#if plan.trade}<button type="button" onclick={onRemove}>Remove trade runs</button>{/if}
  </div>
  <p class="note">Up to seven packs per run. Three PvE runs per day, plus three conflict runs when enabled. Farming and travel are not included in trade days.</p>
</section>
