import { farmableTradeMaterialIds } from '../data/trading';

/** Apply explicit additions/removals while rejecting unsupported new farming inputs. */
export function updateFarmableInputs(selected: readonly string[], proposed: readonly string[]): string[] {
  return [...new Set(proposed.filter(id => selected.includes(id) || farmableTradeMaterialIds.has(id)))];
}
