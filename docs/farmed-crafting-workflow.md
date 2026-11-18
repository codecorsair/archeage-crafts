# Farmed crafting inputs

## Scope

Selected farmable ingredients are acquired directly, not crafted or exchanged for. Owned stock still offsets direct demand. Combine remaining direct demand with trade-pack farming, preserving target crafting and unselected fallback recipes. Apply the same rules to trade planning, visible instructions, and progress validation. No storage migration or new dependencies.

## Plan and ownership

Parent owns all changed files. Base: a0b7674 on main. Isolated branch: fix/farmed-crafting in .worktrees/farmed-crafting. Independent reviewer owns no files. This is a bounded calculation bug fix; existing UI structure is retained, so no visual prototype is needed.

## Verification

Add realistic Fine Archeum regression coverage, run focused tests before and after the fix, then the full tests, Svelte check and build. Verify the weapon preset in a browser. Obtain independent review before local fast-forward integration. No push or deployment authorized.

## Results

Pending.
