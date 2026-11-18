# Shareable plan snapshots

## Decisions and acceptance

JB approved compressed snapshot links without a backend. Include name, target, quantity, inventory and trade settings; omit completion progress. JB selected rebuilding trade runs without sender delivery bonuses. Opening a link previews an unsaved independent copy; only explicit Save persists it. Existing saved plans remain unchanged. The sender's current draft is shared, including unsaved edits, with an inventory disclosure before copying.

Use a versioned URL fragment so the payload is not sent in HTTP requests. Use native browser compression, no dependencies, strict input validation and bounded compressed/decompressed sizes. Links are not encrypted and cannot be revoked. Rebuild only currently active trade plans, not paused outdated history.

## Work and ownership

Base: 0ad0604a83374b8153015b77920735a53a52e602 on main. Branch feature/share-plan, worktree .worktrees/share-plan. Worker owns src/lib/share-plan.ts and src/lib/share-plan.test.ts. Parent owns src/App.svelte and documentation. Reviewer owns no files.

Independent codec and UI work run concurrently against an agreed API. UI consists of a Share plan button, existing-style link dialog, and an unsaved-copy notice on the existing board. No new layout or visual system; treated as minor UI additions rather than a redesign, so no separate visual candidates. Validate desktop and mobile browser flows before completion.

## Verification and integration

Test realistic weapon roundtrip including stock, settings and rebuilt trades; strip progress/bonuses; reject malformed, oversized, unsupported-version and invalid-reference payloads; preserve explicit target and new local identity. Browser-check copy/fallback, shared preview, explicit save without overwriting existing plans, errors and mobile layout. Run tests, Svelte check and production build. Independent pinned diff review before clean local fast-forward integration. Publishing this feature requires separate authorization.

## Evidence

Initial Svelte check passed with zero errors/warnings.

Browser checks against local Vite server: Thunder Dash with Fine Archeum PvE preset produced a 293-character link. The share dialog disclosed inventory inclusion and unsaved edits. Copy reported success; a simulated clipboard rejection exposed manual-copy guidance. Clipboard readback was unavailable because the browser denied read permission.

Opening that link via a hash change and a full reload displayed the unsaved-copy notice, rebuilt nine trade runs, and showed 228 Fine Archeum farming without a Fine Archeum craft. Preview left saved storage unchanged. Save a copy added a second plan with a distinct UUID, empty progress and no bonuses. Deep comparison confirmed the original saved plan's content and ID were unchanged (property ordering normalized during persistence).

Unsupported-version link displayed an error while retaining the current draft and leaving saved storage byte-for-byte unchanged. Screenshots inspected at 1920x1080 and 390x844; preview and share dialog fit without horizontal overflow. Screenshot evidence: /tmp/archeage-shared-plan-desktop.png, /tmp/archeage-shared-plan-mobile.png, /tmp/archeage-share-dialog-mobile.png.

Full verification passed: bun test (149 tests, 5,295 assertions), bun run check (zero errors/warnings), bun run build, git diff --check. Codec worker independently passed eight focused tests with 55 assertions. Dev server stopped after browser validation. Fetched origin/main remains at the original base. Initial independent review at 176ac29 matched the fingerprint and approved repository standards, but identified two P2 async races: a closed share dialog could overwrite a later plan's link, and hash changes during startup were ignored. Parent added dialog-request ownership (including clipboard status), processed hash changes during startup, and let only the newest decode finish loading.

Controlled browser regression checks used native stream gates injected by /tmp/archeage-share-race-init.js in isolated browser session share-races, with otherwise unchanged UI/modules. Startup: block A's initial decompression, change hash to B while loading, verify B also starts, release A and assert loading remains with no draft, then release B and assert Race B/quantity 2 matches the URL. Dialog: save Race A and Race B separately, block A's share compression, close and switch to B, begin B sharing, release B and decode its link to assert Race B/quantity 2, then release A and assert B's link remains identical. Both checks passed. Test-only dev server stopped. Native deflate bytes differed between Bun and Chromium, so cross-runtime assertions compare decoded snapshot content, not compressed-byte equality.

Final product 895b84eaa060c185b58cbb3edce4636944ade536 passed all 149 tests (5,295 assertions), Svelte check, production build and diff-check after the race fixes. These results remain valid at final verification: no product changes occurred during review, and the reviewed tree/fingerprint were rechecked before integration.

Independent reviewer share-plan-review (child d41415a9, session 01a1ec0b-89b8-74ba-a940-3e20349c5968) approved specification and repository standards in targeted follow-up. Both P2 findings resolved; no material findings remain. Reviewer independently passed eight codec tests/55 assertions and controlled-promise race checks covering stale success/errors, startup ownership and clipboard outcomes. Before/after state remained clean and unchanged.

Exact reviewed diff: git diff --binary --full-index --find-renames 0ad0604a83374b8153015b77920735a53a52e602...895b84eaa060c185b58cbb3edce4636944ade536 -- . SHA-256: 8a9be3314fb78cd6c0399ed74140a97388db65b32b288f2f3c7ba5659b37d3c8. Product tree: 530a1f3892fe08d73f038073c9f6ed1619bf88da.

Fetched origin/main and clean local main both remained at the original integration base. Local integration uses a fast-forward; the closure commit changes this evidence record only. No feature push or deployment. Remove only this workflow's clean worktree and branch after proving reachability.
