import { droppedTradeMaterialIds } from '../data/trading';

/** Dropped-material setup only adds supported inputs; existing farming choices are protected. */
export function addDroppedFarming(selected: readonly string[], proposed: readonly string[]): string[] {
  return [...new Set([...selected, ...proposed.filter(id => droppedTradeMaterialIds.has(id))])];
}
