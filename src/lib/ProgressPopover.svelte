<script module lang="ts">
  export type ProgressAction = {
    name: string;
    planned: number;
    done: number;
    kind: 'gather' | 'craft';
    anchor: HTMLElement;
  };
</script>

<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { positionPopover } from './popover-position';

  let { action, onRecord, onComplete, onReset, onClose }: {
    action: ProgressAction | null;
    onRecord: (amount: number) => void;
    onComplete: () => void;
    onReset: () => void;
    onClose: () => void;
  } = $props();
  let popover = $state<HTMLDivElement>();
  let amountInput = $state<HTMLInputElement>();
  let amount = $state<number | undefined>();
  let error = $state('');
  const format = new Intl.NumberFormat('en-US');
  const remaining = $derived(action ? Math.max(0, action.planned - action.done) : 0);

  function position() {
    if (action && popover) positionPopover(popover, action.anchor);
  }

  $effect(() => {
    const selected = action;
    if (!selected || !popover) {
      if (popover?.matches(':popover-open')) popover.hidePopover();
      return;
    }
    amount = undefined;
    error = '';
    let cancelled = false;
    void tick().then(() => {
      if (cancelled || !popover || !selected.anchor.isConnected) return;
      if (!popover.matches(':popover-open')) popover.showPopover();
      position();
      if (remaining > 0) amountInput?.focus({ preventScroll: true });
      else popover.querySelector<HTMLButtonElement>('button[data-reset]')?.focus({ preventScroll: true });
    });
    return () => { cancelled = true; };
  });

  onMount(() => {
    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', position);
    viewport?.addEventListener('scroll', position);
    return () => {
      viewport?.removeEventListener('resize', position);
      viewport?.removeEventListener('scroll', position);
    };
  });

  async function close() {
    const anchor = action?.anchor;
    if (popover?.matches(':popover-open')) popover.hidePopover();
    onClose();
    await tick();
    if (anchor?.isConnected && !document.querySelector('dialog[open]')) anchor.focus({ preventScroll: true });
  }

  function commit(update: () => void) {
    try {
      update();
      void close();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not update progress. Your plan was kept.';
      void tick().then(position);
    }
  }

  function record(event: SubmitEvent) {
    event.preventDefault();
    const count = amount;
    if (count === undefined || !Number.isSafeInteger(count) || count <= 0) {
      error = 'Enter a positive whole amount within the safe integer range.';
      return;
    }
    commit(() => onRecord(count));
  }
</script>

<svelte:window onresize={position} onscroll={position} />

<div bind:this={popover} id="progress-popover" popover="auto" role="dialog" tabindex="-1" aria-labelledby="progress-title"
  ontoggle={event => { if (event.newState === 'closed') onClose(); }}
  onkeydown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); void close(); } }}>
  {#if action}
    <div class="progress-heading"><h3 id="progress-title">{action.name}</h3><button type="button" class="close" aria-label="Close progress" onclick={() => close()}>×</button></div>
    <p class="remaining">{format.format(remaining)} remaining</p>
    <p class="summary">{format.format(action.done)} {action.kind === 'gather' ? 'gathered' : 'made'} · {format.format(action.planned)} planned</p>
    {#if remaining > 0}
      <form onsubmit={record}>
        <label for="progress-batch">{action.kind === 'gather' ? 'Gathered this batch' : 'Items made this batch'}</label>
        <input bind:this={amountInput} bind:value={amount} id="progress-batch" type="number" inputmode="numeric" min="1" step="1" max={Number.MAX_SAFE_INTEGER} required />
        <p class="hint">{action.kind === 'craft' ? 'Count output items, not crafting clicks. ' : ''}Amounts above the remainder finish this task.</p>
        {#if error}<p class="error" role="alert">{error}</p>{/if}
        <div class="actions"><button class="primary" type="submit">Record batch</button><button type="button" onclick={() => commit(onComplete)}>Mark all complete</button></div>
      </form>
    {:else if error}<p class="error" role="alert">{error}</p>{/if}
    {#if action.done > 0}<button data-reset type="button" class="reset" onclick={() => commit(onReset)}>{remaining === 0 ? 'Reopen task' : 'Reset progress'}</button>{/if}
  {/if}
</div>

<style>
  [popover] { position: fixed; inset: auto; margin: 0; width: min(340px, calc(100vw - 24px)); overflow: auto; padding: 17px; border: 1px solid #8b7448; background: #211f1a; color: #e6deca; box-shadow: 0 8px 28px #0007; }
  .progress-heading { display: flex; gap: 12px; justify-content: space-between; align-items: start; }
  h3 { margin: 0; color: #eadfc6; font-size: 14px; overflow-wrap: anywhere; }
  .close { min-width: 24px; min-height: 24px; flex: none; border: 0; background: none; padding: 0 4px; color: var(--muted); font-size: 20px; line-height: 1; }
  p { margin: 8px 0 0; }
  .remaining { color: #eadfc6; font-size: 15px; font-weight: 600; }
  .summary, .hint { color: var(--muted); font-size: 11px; line-height: 1.6; }
  form { display: grid; gap: 9px; margin-top: 16px; }
  label { color: #d9c8a4; font-size: 12px; }
  input { width: 100%; padding: 9px; }
  .hint { margin: 0; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 3px; }
  .actions button, .reset { font-size: 12px; padding: 8px 10px; }
  .reset { margin-top: 12px; color: var(--muted); }
  .error { margin: 0; }
</style>
