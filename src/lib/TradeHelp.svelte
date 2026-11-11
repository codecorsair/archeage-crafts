<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { positionPopover } from './popover-position';

  let button = $state<HTMLButtonElement>();
  let popover = $state<HTMLDivElement>();
  let open = $state(false);
  function position() { if (popover && button) positionPopover(popover, button); }
  onMount(() => {
    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', position);
    viewport?.addEventListener('scroll', position);
    return () => {
      viewport?.removeEventListener('resize', position);
      viewport?.removeEventListener('scroll', position);
    };
  });
</script>

<svelte:window onresize={position} onscroll={position} />
<button bind:this={button} class="trade-help" type="button" popovertarget="trade-help-popover" aria-haspopup="dialog" aria-expanded={open} aria-label="How trade runs work" title="How trade runs work">?</button>
<div bind:this={popover} id="trade-help-popover" popover="auto" role="dialog" aria-labelledby="trade-help-title" ontoggle={event => { open = event.newState === 'open'; if (open) void tick().then(position); }}>
  <div class="heading"><h3 id="trade-help-title">How trade runs work</h3><button type="button" popovertarget="trade-help-popover" popovertargetaction="hide" aria-label="Close trade help">×</button></div>
  <ul>
    <li>Trade spare owned materials, or choose pack inputs you can farm. Only supported, compatible trades are used.</li>
    <li>One run loads up to seven packs at one origin. Follow each load's delivery address.</li>
    <li>Three PvE runs per day, plus three PvP runs if enabled. Trade days exclude farming and travel.</li>
    <li>Presets replace farming choices with Fine Archeum and enable Pioneer access.</li>
    <li>Enter only bonus items in Extra received. They reduce later trades, not work already recorded.</li>
    <li>Trading and progress never update inventory. Save changes keeps the plan.</li>
  </ul>
</div>

<style>
  .trade-help { flex: none; margin-left: auto; display: grid; place-items: center; width: 24px; height: 24px; padding: 0; border: 1px solid #8a774e; border-radius: 50%; background: #15140f; color: var(--gold); font-size: 12px; font-weight: 700; }
  [popover] { position: fixed; inset: auto; margin: 0; width: min(350px, calc(100vw - 24px)); overflow: auto; padding: 17px; border: 1px solid #8b7448; background: #211f1a; color: #e6deca; box-shadow: 0 8px 28px #0007; }
  .heading { display: flex; align-items: start; justify-content: space-between; gap: 12px; }
  h3 { color: #eadfc6; font-size: 14px; margin: 0; }
  .heading button { min-width: 24px; min-height: 24px; border: 0; background: none; padding: 0 4px; color: var(--muted); font-size: 20px; line-height: 1; }
  ul { margin: 12px 0 0; padding-left: 17px; font-size: 12px; line-height: 1.65; }
  li + li { margin-top: 9px; }
</style>
