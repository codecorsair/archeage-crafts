<script lang="ts">
  import { onDestroy, tick } from 'svelte';

  let { hasPlan, onStart }: { hasPlan: boolean; onStart?: () => void } = $props();

  type Step = { selectors: string[]; title: string; copy: string };
  const plans: Step = {
    selectors: ['[data-guide="plans"]'],
    title: 'Keep plans separate',
    copy: 'Use Saved plans to return to a task, or New plan to start another. Each plan has its own inventory, trade setup and progress.',
  };
  const landingSteps: Step[] = [plans, {
    selectors: ['[data-guide="new-plan"]'],
    title: 'Choose your goal',
    copy: 'Choose an item and quantity, then start a plan. This guide only explains the screen; it does not create or change a plan.',
  }];
  const planSteps: Step[] = [plans, {
    selectors: ['[data-guide="save"]'],
    title: 'Save changes explicitly',
    copy: 'Use Save changes to keep manual edits and recorded progress. Switching plans does not combine their work.',
  }, {
    selectors: ['[data-guide="inventory"]', '[data-guide="mobile-settings"]'],
    title: 'Set up your inventory',
    copy: 'Inventory holds what this plan can use. Manual inventory edits need Save changes. Screenshot imports are separate: they overwrite and save the whole plan.',
  }, {
    selectors: ['#gathering-heading'],
    title: 'Record what you gathered',
    copy: 'Gather controls record what you just collected, not inventory. Enter the amount completed in this batch. Gathering and crafting progress are independent counts.',
  }, {
    selectors: ['#trade-heading'],
    title: 'Plan and follow trade runs',
    copy: 'In Trade setup, Owned uses stock and Dropped selects what to farm. Fine Archeum presets provide a starting setup. Follow the route arrow from origin to destination. Extras are item counts, not percentages; the total includes them.',
  }, {
    selectors: ['#materials-heading'],
    title: 'Record materials made',
    copy: 'Craft progress records output items you just made, not crafting clicks or inventory. Ingredient tiles remain a full-task reference, not a remaining-ingredients list.',
  }, {
    selectors: ['#finish-heading'],
    title: 'Finish the final craft',
    copy: 'The final craft supports progress too. Record output made in each batch, then save your changes. Progress counts stay independent of inventory and other tasks.',
  }];

  const id = $props.id();
  let dialog: HTMLDialogElement;
  let launchButton: HTMLButtonElement;
  let card = $state<HTMLElement>();
  let nextButton = $state<HTMLButtonElement>();
  let steps = $state<Step[]>([]);
  let index = $state(0);
  let open = $state(false);
  let starting = $state(false);
  let positioned = $state(false);
  let spotlight = $state({ left: 0, top: 0, width: 0, height: 0 });
  let cardPosition = $state({ left: 12, top: 12 });
  let destroyed = false;
  let revision = 0;
  let restoration: { x: number; y: number; overflow: string; priority: string } | null = null;
  const current = $derived(steps[index]);

  function targetFor(step: Step): HTMLElement | undefined {
    return step.selectors.flatMap((selector) => Array.from(document.querySelectorAll<HTMLElement>(selector)))
      .find((element) => {
        const rect = element.getBoundingClientRect();
        if (!element.isConnected || !rect.width || !rect.height) return false;
        for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
          const style = getComputedStyle(ancestor);
          if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || Number(style.opacity) === 0) return false;
        }
        return true;
      });
  }

  function place() {
    if (!open || !current || !card) return;
    const target = targetFor(current);
    if (!target) {
      // Re-check only on navigation or viewport events, never in a polling loop.
      void showStep(index);
      return;
    }
    const width = document.documentElement.clientWidth;
    const height = window.innerHeight;
    const rect = target.getBoundingClientRect();
    const left = Math.max(2, Math.min(width - 2, rect.left - 5));
    const top = Math.max(2, Math.min(height - 2, rect.top - 5));
    spotlight = {
      left, top,
      width: Math.max(0, Math.min(width - 2, rect.right + 5) - left),
      height: Math.max(0, Math.min(height - 2, rect.bottom + 5) - top),
    };
    const cardWidth = card.offsetWidth;
    const cardHeight = card.offsetHeight;
    const below = rect.bottom + 14;
    const above = rect.top - cardHeight - 14;
    const preferredTop = below + cardHeight <= height - 12 ? below : above;
    cardPosition = {
      left: Math.max(12, Math.min(rect.left, width - cardWidth - 12)),
      top: Math.max(12, Math.min(preferredTop, height - cardHeight - 12)),
    };
    positioned = true;
  }

  async function showStep(requested: number) {
    const request = ++revision;
    const wanted = steps[requested];
    steps = steps.filter((step) => targetFor(step));
    if (!steps.length) { closeGuide(); return; }
    index = wanted && steps.includes(wanted) ? steps.indexOf(wanted) : Math.min(requested, steps.length - 1);
    await tick();
    if (!open || destroyed || request !== revision || !current) return;
    targetFor(current)?.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' });
    place();
  }

  async function startGuide() {
    if (starting || open) return;
    starting = true;
    try {
      onStart?.();
      for (const popover of document.querySelectorAll<HTMLElement>(':popover-open')) popover.hidePopover();
      await tick();
      if (destroyed || document.querySelector('dialog[open]')) return;
      steps = (hasPlan ? planSteps : landingSteps).filter((step) => targetFor(step));
      if (!steps.length) return;
      restoration = {
        x: window.scrollX, y: window.scrollY,
        overflow: document.body.style.getPropertyValue('overflow'),
        priority: document.body.style.getPropertyPriority('overflow'),
      };
      document.body.style.setProperty('overflow', 'hidden');
      dialog.showModal();
      open = true;
      await showStep(0);
      if (open && !destroyed) nextButton?.focus({ preventScroll: true });
    } finally {
      starting = false;
      if (!open) restorePage();
    }
  }

  function restorePage() {
    if (!restoration) return;
    const saved = restoration;
    restoration = null;
    if (saved.overflow) document.body.style.setProperty('overflow', saved.overflow, saved.priority);
    else document.body.style.removeProperty('overflow');
    window.scrollTo({ left: saved.x, top: saved.y, behavior: 'instant' });
    if (launchButton?.isConnected) launchButton.focus({ preventScroll: true });
  }

  function closeGuide() {
    ++revision;
    open = false;
    positioned = false;
    if (dialog?.open) dialog.close();
    restorePage();
  }

  function cancelGuide(event: Event) {
    event.preventDefault();
    closeGuide();
  }

  onDestroy(() => {
    destroyed = true;
    closeGuide();
  });
</script>

<svelte:window onresize={place} onscroll={place} />

<button type="button" class="quiet" bind:this={launchButton} onclick={startGuide} disabled={starting} aria-haspopup="dialog">Guide</button>

<dialog bind:this={dialog} class="guide" aria-labelledby={`${id}-title`} aria-describedby={`${id}-copy`} oncancel={cancelGuide} onclose={() => { if (!dialog.open) closeGuide(); }}>
  {#if open && current}
    <div
      class="spotlight"
      aria-hidden="true"
      style:visibility={positioned ? 'visible' : 'hidden'}
      style:left={`${spotlight.left}px`}
      style:top={`${spotlight.top}px`}
      style:width={`${spotlight.width}px`}
      style:height={`${spotlight.height}px`}
    ></div>
    <section
      class="guide-card"
      bind:this={card}
      style:visibility={positioned ? 'visible' : 'hidden'}
      style:left={`${cardPosition.left}px`}
      style:top={`${cardPosition.top}px`}
    >
      <div class="step-copy" aria-live="polite" aria-atomic="true">
        <p class="step-count">Guide · {index + 1} of {steps.length}</p>
        <h2 id={`${id}-title`}>{current.title}</h2>
        <p id={`${id}-copy`} class="description">{current.copy}</p>
      </div>
      <nav class="guide-navigation" aria-label="Guide steps">
        <button type="button" class="quiet" onclick={closeGuide}>Close</button>
        <div class="step-actions">
          <button type="button" disabled={index === 0} onclick={() => showStep(index - 1)}>Back</button>
          <button type="button" class="primary" bind:this={nextButton} onclick={() => index === steps.length - 1 ? closeGuide() : showStep(index + 1)}>{index === steps.length - 1 ? 'Done' : 'Next'}</button>
        </div>
      </nav>
    </section>
  {/if}
</dialog>

<style>
  .guide {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100dvh;
    max-width: none;
    max-height: none;
    margin: 0;
    padding: 0;
    overflow: hidden;
    border: 0;
    background: transparent;
    color: #e6deca;
    overscroll-behavior: none;
  }
  .guide::backdrop { background: transparent; }
  .spotlight {
    position: absolute;
    border: 2px solid var(--gold, #d1b97c);
    border-radius: 3px;
    box-shadow: 0 0 0 100vmax #000b;
    pointer-events: none;
  }
  .guide-card {
    position: absolute;
    display: flex;
    flex-direction: column;
    width: min(360px, calc(100% - 24px));
    max-height: calc(100dvh - 24px);
    padding: 18px;
    border: 1px solid #8a7143;
    background: var(--panel, #211f1a);
    box-shadow: 0 8px 28px #0006;
  }
  .step-copy { min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
  .step-count { margin: 0 0 8px; color: var(--muted, #b3a991); font-size: 11px; }
  h2 { margin: 0; font: 21px/1.3 Georgia, serif; color: #dec68f; }
  .description { margin: 10px 0 0; font-size: 13px; line-height: 1.65; }
  .guide-navigation { display: flex; flex: none; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; padding-top: 18px; }
  .step-actions { display: flex; gap: 8px; }
  button { min-height: 40px; }
  .guide-navigation button { font-size: 12px; }
  @media (max-height: 350px) {
    .guide-card { padding: 12px; }
    .guide-navigation { padding-top: 10px; }
  }
</style>
