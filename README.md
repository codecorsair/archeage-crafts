# ArcheAge Craft

A local-first ArcheAge Chronicles crafting calculator using the recipes listed on [ArcheAge World](https://archeageworld.com/en/crafting.html).

## Hosted app

[Open ArcheAge Craft](https://codecorsair.github.io/archeage-crafts/). Plans and inventory stay in your browser; they are not uploaded or synchronized between devices. Localhost saves do not automatically transfer to the hosted site.

GitHub Actions tests, checks and builds each push to `main`, then deploys `dist` to GitHub Pages. The deployment build uses `--base=/archeage-crafts/`; ordinary local development/builds keep the root URL.

## Run

Requires Bun and Node.js 20.19+ or 22.12+ for Vite.

```sh
bun install
bun run dev
```

Open the local URL printed by Vite. No backend, account, or database is required.

```sh
bun test
bun run check
bun run build
bun run preview
```

## Crafting plans

Choose **New plan**, search for one target item, enter its quantity, and **Start plan**. The plan lists what to do: **1. Gather materials**, **2. Trade runs**, **3. Make materials** in dependency order, then **4. Finish the plan**. Gathering is always visible above the board, including selected farming for trade packs. Actions show total output quantities rather than batch/click counts. Gathering, craft ingredients and trade exchanges use compact game-style item tiles with rarity frames and bottom-right quantities. Names appear on hover or keyboard focus, and beneath tiles on mobile/touchscreens. Craft output icons and titles stay visible. The corner **?** on each material tile searches that item's exact name on Questlog in a new tab. Clicking the rest of a gathering tile still toggles completion.

Every plan has its own inventory, Master profession unlocks, company access, farming selections, channels, trade runs and progress. New plans start empty with every unlock off. Nothing is inherited from another plan. Use the plan rail to edit **Target & name**, **Inventory**, **Master professions**, or **Trade setup**. Inventory can contain raw resources, crafted ingredients, trade materials and target items. Viewing a plan never consumes stock. Importing inventory from another plan is not implemented.

Use **Save changes** to persist a draft, including checklist progress, in this browser. Switching away from an edited draft offers Save, Discard or Cancel. A failed storage write leaves the draft unsaved; the app does not claim success or overwrite unreadable stored data.

Ordinary single/bulk recipes with proportional per-item inputs are equivalent and do not require manual selection. The four **Master professions** toggles are off by default because those unlocks are not currently attainable in game. When enabled for a plan, use spare owned rare ingredients for that profession before basic materials, reserving rare ingredients directly needed by buildings first. Make the remaining quantity normally. For example, needing 35 Standard Additive with one Fragrant Wild Petal makes 30 through Master and 5 normally. A rare recipe still produces whole outputs: needing 5 may make 30, leaving 25 extra. The planner never assumes farming or acquiring rare Master ingredients.

## Import inventory screenshots

In **Inventory**, paste screenshots with **Ctrl/⌘ V**, drop them onto the import area, or choose image files. Add multiple views from one unchanged inventory session, including scrolled Storage views. Crops are supported when enough complete item frames remain to identify the grid. Bag and Storage rows are located independently; clipped rows are skipped. For a single-panel crop, choose whether it shows Bag or Storage.

Recognition runs entirely in your browser against bundled item artwork and remembered corrections. No screenshots are uploaded, and no recognition service or API key is required. Review uncertain items, search the catalog picker to correct their matches, edit quantities, and explicitly dismiss items absent from the catalog. The picker supports arrow keys, Enter to select, and Escape to cancel searching. A corrected in-game Crude Gnoll Fur reference is included because its bundled source artwork differs from the supplied screenshot. Confirmed item corrections are reused immediately across confidently matching unresolved sightings already loaded in the current batch and in later screenshots, without copying quantities or overwriting manual choices or dismissals. If conflicting corrections make a visual match ambiguous, affected automatic assignments return to review. Personal corrections are saved on this device only when you apply the import; cancel discards the batch's unsaved corrections. Full screenshots are not saved. Expand an item's **Screenshot evidence** and choose **Edit match** to correct an otherwise confident match. **Forget learned icons** clears personal corrections for future scans without changing stock.

Repeated sightings of a stack count once **within each side**; Bag and Storage counts are then added. Different counts for the same item on one side are conflicts, not extra stock. Correct the count or remove screenshots taken before stock changed. The combined preview is editable, with expandable original slot crops for checking matches and counts. Bag/Storage assignments can also be reviewed and changed. Choose the game's **Crafting Material** filter, capture Bag and Storage, and add scrolled views until all materials are covered without moving items. An expandable screenshot example shows the filter and grids. Processing displays the active screenshot and queued count, with a processing-only indicator that respects reduced motion.

**Overwrite and save** replaces all on-hand stock, clearing items absent from the import, and immediately saves the whole plan, including other pending draft edits. There is no final coverage checkbox; uncertain items, side assignments and count conflicts still require review. A failed save keeps the import available for retry without claiming success or replacing saved inventory. Cancel leaves stock unchanged. Changed stock marks existing trade runs outdated and pauses their contribution until you review a rebuild. Manual inventory edits still require Save changes.

Use clear PNG, JPEG, or WebP screenshots, up to 20 per batch and 32 MB per image. Detection is heuristic, not guaranteed OCR: low-resolution text, obscured frames, different UI artwork, and small crops can require manual correction or a clearer screenshot. A successful scan does not prove every item is visible. Include additional views to cover clipped or scrolled-out rows, and check the replacement preview before applying. Clearing site data also removes remembered icon corrections.

## Trade runs

The Trade runs phase offers **Fine Archeum · PvE** and **Fine Archeum · PvE + PvP** presets beside **Configure trade runs**. A preset enables Pioneer access, replaces farmable selections with Fine Archeum, and immediately builds runs into the draft. Senior access, Master professions, inventory and target are unchanged. Existing execution progress requires confirmation before reset; Save changes keeps the preset. PvE-only uses three daily runs; the combined preset also uses three conflict/PvP runs.

For custom settings, open **Trade setup**, choose eligible access, channels and farmable pack inputs, then **Review trade runs**. Apply the reviewed runs and Save changes. The planner uses owned output and eligible owned Master ingredients, then direct exchanges for the remaining need, recursively crafting uncovered quantities from lower-tier ingredients. For example, spare Superior Archeum can supply some Superior Lumber while farmed Fine Archeum supplies the Fine Lumber and Fine Additive needed to craft the rest. Farming Standard materials can likewise fund the green ingredients used to craft blue and then purple materials. Only quantities actually supplied by stock or delivery replace crafting requirements; shared ingredients and whole-batch recipes are accounted for together.

Enable **Pioneer Operative: blue basic trades** or **Senior Operative: purple basic trades** when those ranks are unlocked. Both start off and are saved only with this plan. These independent toggles restrict only Fine/blue and Superior/purple basic exchanges; green basics and boss-material trades remain available. Locked tiers can still be crafted from lower-tier ingredients. Saved runs stay unchanged until an explicit rebuild using this plan's settings.

All phases describe the same crafting plan. Current runs reduce remaining craft quantities; outdated runs do not. Inventory, target or capability/configuration edits retain old instructions and progress, mark the runs outdated, and pause their contribution until an explicit reviewed rebuild.

Enter tradeable stock in **Inventory**, including materials outside the current recipe. In Trade setup, search **Materials you can farm** to choose pack inputs you are willing to acquire. The picker supports search, item icons, and grade colors. The planner reserves stock needed by the craft and uses only the surplus for pack ingredients. Additional farming is allowed only for selected trade-pack inputs; other needs remain explicit shortages. These choices are part of the plan draft and persist with Save changes.

Each run loads at most seven mixed packs made at one post. That cart may deliver to several posts as part of the same run. Estimates use full daily budgets: three PvE runs, or three PvE plus three conflict runs when enabled. Trade days exclude farming and travel time, and unresolved shortages mean the craft is not fully supplied. Recommendations favor grouped pickups but are not guaranteed globally minimal; delivery order is not travel-optimized. No chained exchanges or crafting of pack inputs is planned.

`src/data/trading.ts` uses player-provided post assignments and rates for 36 materials: 21 basic items across Standard/Fine/Superior and 15 named drops. Basic materials exchange only within their tier; dropped materials exchange within blue (Rare) or purple (Heroic), separately from basic materials. Green/Grand packs consume and return 9 materials; blue/Rare packs 3; purple/Heroic packs 1. PvE/conflict payouts are modeled separately, currently equal. These values were supplied by the player, not independently checked against an official source.

The six posts are Seaglass Harbor, Watcher's, Waterdrift, Jubilant Village, Stargazer, and Shadowpath Temple. Delivery must leave the origin, so Archeum and Stone cannot directly exchange at their shared Shadowpath post. Bone materials have no trading post. Gold and non-crafting reward types are placeholders and do not participate in recommendations.

## Saved plans and execution progress

Click a gathering tile to toggle its completion checkmark, or use **Mark complete** on a trade run or crafting action, then Save changes. Completion is progress only: it never adds deliveries to inventory, consumes craft inputs or changes later quantities. Click a completed gathering tile again, or use **Reopen** on a run or craft, to undo completion. Gathering progress belongs to the material's purpose and required quantity, so changed requirements do not silently reuse an old completion. Inventory edits/imports are separate deliberate actions.

A reviewed trade snapshot uses the plan inventory at build time, minus owned pack costs plus all scheduled rewards. Farmed pack inputs are additional supply consumed by packs. The board already assumes every current trade run will be completed, so checking one off never credits its output twice. When settings or stock change, the old runs remain available for reference but their rewards pause. Review a rebuild before replacing runs and resetting execution checkmarks.

Saved runs and pack definitions remain stable until rebuild. Day labels describe a full-budget schedule, not a calendar or combined allowance across plans. The clean v2 browser record stores independent crafting plans. JB explicitly authorized dropping the old shared-inventory/saved-trade records because they were disposable local testing; no migration compatibility is provided. Only those known legacy app keys are cleared, not learned screenshot references or unrelated browser data. Storage failure keeps your draft unsaved. Clearing site data removes plans and stock. No account or cloud sync is provided.

## Data and limitations

The complete bundled snapshot is in `src/data/catalog.json`; its source URL, retrieval time, counts, and source SHA-256 are in `src/data/source.json`. Data refresh tools, development scripts and design notes are maintained locally and are not included in this repository. The app and deployment use the checked-in snapshot without fetching recipe data from the source site. Recipes retain source order, IDs, English subtype labels, and per-craft currency costs. Optional item details include source description, stats, level, type, and weight. Cooking outputs with source item ID 0 receive distinct recipe-based IDs.

Item and category artwork is bundled under `public/icons/`, not hotlinked at runtime. Existing source placeholder art is kept as provided. Missing or failed images render a fixed-size framed fallback without hiding item names. The theme follows ArcheAge World's restrained charcoal, ivory, and antique-gold crafting interface. No animated backgrounds or external fonts are used.

- “Raw” means no recipe is available for that ingredient in this dataset. It may be a gathered, dropped, or otherwise acquired item.
- The source contains cooking ingredient categories rather than specific interchangeable items. They remain separate from similarly named workbench materials.
- Eighteen cooking entries have no ingredient data. They remain searchable but cannot produce a reliable calculation.
- Cyclic ingredient routes and unsafe quantities are rejected explicitly.
- Only the explicit per-plan Master and company-access rules are modeled. Other proficiency/tool restrictions, currency and market costs are not included in material totals.
- Plans are browser-local. Clearing site data removes them; blocked writes or corrupt storage are reported without presenting an unsaved draft as saved.

Recipe data, names, and item artwork belong to their respective owners. Source: ArcheAge World / KompY; this is an unofficial fan tool, not affiliated with the game or source site. No data redistribution license has been assumed. Review source permissions before public redistribution or deployment.

Domain terms are in `CONTEXT.md`. Local documentation, development scripts, worktrees, environment files and generated output are excluded by `.gitignore`.
