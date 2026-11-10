<script lang="ts">
  let { icon, grade = 'Normal', size = 'medium' }: {
    icon?: string;
    grade?: string;
    size?: 'nav' | 'small' | 'medium' | 'large';
  } = $props();

  const source = $derived(icon ? `${import.meta.env.BASE_URL}icons/${icon}` : undefined);
  let failedSource = $state<string>();
</script>

<span class={`item-icon grade-${grade.toLowerCase()} size-${size}`} aria-hidden="true">
  {#if source && failedSource !== source}
    <img src={source} alt="" width="96" height="96" loading="lazy" decoding="async" onerror={() => { failedSource = source; }} />
  {:else}
    <span class="icon-fallback">◇</span>
  {/if}
</span>

<style>
  .item-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: 44px;
    height: 44px;
    border: 1px solid #665c44;
    background: radial-gradient(ellipse at center, #49413144, #11120f);
    box-shadow: inset 0 0 9px #0007;
  }
  img { width: 88%; height: 88%; object-fit: contain; filter: drop-shadow(1px 2px 2px #0008); }
  .icon-fallback { color: var(--muted, #b2a890); font: 24px Georgia, serif; }
  .grade-grand { border-color: #6d895c; background: radial-gradient(ellipse at bottom, #47633966, #161c14); }
  .grade-rare { border-color: #6c8cab; background: radial-gradient(ellipse at bottom, #42608266, #151b20); }
  .grade-arcane, .grade-heroic { border-color: #a182ae; }
  .grade-unique, .grade-celestial, .grade-divine { border-color: #b19b5e; }
  .grade-epic, .grade-legendary, .grade-mythic { border-color: #bd8a60; }
  .size-large { width: 94px; height: 94px; }
  .size-small { width: 34px; height: 34px; }
  .size-nav { width: 24px; height: 24px; border: 0; background: none; box-shadow: none; }
  .size-nav img { width: 100%; height: 100%; filter: none; }
</style>
