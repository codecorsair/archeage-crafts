# Farmed crafting inputs

## Scope

Selected farmable ingredients are acquired directly, not crafted or exchanged for. Owned stock still offsets direct demand. Combine remaining direct demand with trade-pack farming, preserving target crafting and unselected fallback recipes. Apply the same rules to trade planning, visible instructions, and progress validation. No storage migration or new dependencies.

## Plan and ownership

Parent owns all changed files. Base: a0b7674 on main. Isolated branch: fix/farmed-crafting in .worktrees/farmed-crafting. Independent reviewer owns no files. This is a bounded calculation bug fix; existing UI structure is retained, so no visual prototype is needed.

## Verification

Add realistic Fine Archeum regression coverage, run focused tests before and after the fix, then the full tests, Svelte check and build. Verify the weapon preset in a browser. Obtain independent review before local fast-forward integration. No push or deployment authorized.

## Results

Regression failed before the fix: Fine Archeum was present in weapon crafting steps. After the fix, all 141 tests passed, Svelte check reported zero errors/warnings, production build passed, and git diff --check passed at product HEAD 0a458dfa6b93ec3c9526cc355a265231b1e63e7e.

Browser validation: Thunder Dash with the Fine Archeum PvE preset showed one farming tile totaling 228 Fine Archeum and no Fine Archeum crafting step. Temporary dev server stopped after validation.

Independent reviewer farming-fix-review approved specification and repository standards. Exact reviewed diff: git diff --binary a0b7674ddd9c53194bd59343f6b767569605d9e9 0a458dfa6b93ec3c9526cc355a265231b1e63e7e. SHA-256: 864fb0eb3310aa59e32aa390b3ec8a89ff0110fd0b32594a6fe22f063113f042. Reviewed tree: 91fd7613b3aeab62a8f8494fe54ac99108b902aa. Reviewer independently passed 74 focused tests and 24 targeted combinations; no actionable findings.

Latest origin/main remained at the original base after fetch. Local integration uses a fast-forward from that unchanged, clean main. No push or deployment. This closure update changes evidence only.
