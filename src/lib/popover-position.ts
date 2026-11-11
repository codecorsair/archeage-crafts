/** Position a small non-modal popover beside its invoker without leaving the visible viewport. */
export function positionPopover(popover: HTMLElement, anchor: HTMLElement): void {
  if (!anchor.isConnected || !popover.matches(':popover-open')) return;
  const viewport = window.visualViewport;
  const left = viewport?.offsetLeft ?? 0;
  const top = viewport?.offsetTop ?? 0;
  const width = viewport?.width ?? window.innerWidth;
  const height = viewport?.height ?? window.innerHeight;
  popover.style.maxHeight = `${Math.max(0, height - 24)}px`;
  popover.style.maxWidth = `${Math.max(0, width - 24)}px`;
  const origin = anchor.getBoundingClientRect();
  const bounds = popover.getBoundingClientRect();
  const below = origin.bottom + 8;
  const y = below + bounds.height <= top + height - 12 ? below : origin.top - bounds.height - 8;
  popover.style.left = `${Math.max(left + 12, Math.min(origin.left, left + width - bounds.width - 12))}px`;
  popover.style.top = `${Math.max(top + 12, Math.min(y, top + height - bounds.height - 12))}px`;
}
