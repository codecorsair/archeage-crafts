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

Targeted re-review and local integration pending.
