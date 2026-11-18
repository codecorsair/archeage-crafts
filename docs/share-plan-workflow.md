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

Full verification passed: bun test (149 tests, 5,295 assertions), bun run check (zero errors/warnings), bun run build, git diff --check. Codec worker independently passed eight focused tests with 55 assertions. Dev server stopped after browser validation. Fetched origin/main remains at the original base. Independent review and local integration pending.
