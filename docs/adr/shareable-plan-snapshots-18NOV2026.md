# Shareable plan snapshots

## Decision

Share a compressed snapshot in the URL fragment without a backend. Include the current draft's name, target, quantity, inventory, Master unlocks, company access, farming selections, channels and whether trade planning is active.

Opening a link creates an unsaved independent copy with a new local identity. Existing saved plans are unchanged. Saving is explicit. Reset all completion progress and rebuild active trade runs using the recipient's bundled catalog, without sender bonuses or protected history. Outdated trade history is omitted.

JB approved snapshot sharing and selected rebuilding without bonuses on 18 November 2026.

## Rationale

A snapshot fits the static GitHub Pages application and avoids accounts, server storage and a sharing service. Sharing settings rather than historical trade snapshots keeps links smaller and separates planning from execution.

## Consequences

Links are not encrypted. Anyone with the link can inspect included inventory. Fragments are not part of the HTTP request, but remain visible to the recipient's browser and scripts. Show this disclosure before copying.

Links do not update, expire or support revocation. Catalog changes may alter rebuilt trade runs or invalidate old references. Bound link length and decompression output, validate all decoded inputs, and report unsupported or oversized payloads without touching saved data. Oversized plans fail sharing rather than silently excluding stock.
