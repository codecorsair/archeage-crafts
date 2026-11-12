import { farmableTradeMaterialIds } from '../data/trading';

/** Add supported basic materials or boss drops without removing existing farming choices. */
export function addFarmableInputs(selected: readonly string[], proposed: readonly string[]): string[] {
  return [...new Set([...selected, ...proposed.filter(id => farmableTradeMaterialIds.has(id))])];
}
