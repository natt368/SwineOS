# SwineOS

Sow herd management for the barn office: record breeding, farrowing and weaning events, print the weekly action lists, and follow herd performance. The screens follow the layout of the classic PigWIN desktop program, so the people who already use it can find their way around.

It is a plain web app (HTML, CSS and JavaScript, no build step and no server). Open `index.html` in a browser, or use the hosted copy.

## What it does

**Sow data entry** – the main screen.
- Event tabs along the bottom: Entry, Heat, Mate, ReproChk, Abort, Farrow, PigDth, Foster, PartWean, Wean, Nurse, Location, Edit ID, Disease, Remove.
- Pick a tab (it turns red), type the sow ID in the green box, press Enter, fill in the form.
- The list at the top shows Served / Lactating / Open / Active / Removed / All animals, or *Current*: the animals that can have the selected event (for example lactating sows for Wean).
- Full history per animal with parity and intervals (gestation length, lactation length, wean-to-service), or a lifetime litter summary.
- Checks before saving: gestation outside 105–125 days, weaning a sow that is not lactating, more deaths than piglets, duplicate IDs, dates in the future.
- Data validation lists (all matings, farrowings, deaths… for a date range) and inventory lists on the right.

**Reports** (Sows / gilts, Piglets, Boars)
- Herd performance: key indicators per period or as seasonal columns (e.g. 13 × 4 weeks), with Key, Mating, Farrowing, Weaning, Reproductive cycle and Herd turnover tabs, targets (green / red), yellow shading where outcomes are still unknown, graph, cell info and CSV export.
- Litter performance: pigs born, pre-weaning mortality (by parity, cause, piglet age), pigs weaned, weaning weights.
- Mating performance: matings per service, wean-to-service interval, returns to service, effect of lactation length.
- Herd inventory, population dynamics, sow productivity, removals manager, parity, farrowing location, benchmarking against targets, cohort analysis, farrowing rate monitor, sow inventory, sow selection (culling lists), vaccinations, sow cards, blank record sheets, change log, data export.
- Application tools on litter records: breakdown, cross tabulation, histogram, scatter table, statistics, frequency distribution, time plot, X-Y plot.
- Piglet reports (deaths, fostering, piglet inventory, weaning list) and boar reports (inventory, usage per week, farrowing rate and litter size per boar).

**Action lists** – the weekly work lists: gilts to serve, open sows, repeat services, heat checks at 3 and 6 weeks, pregnancy checks, sows due to farrow, sows to wean, and due vaccinations, with writing space and a code list. Preview, print, or save as a file.

**Settings** – farm name and number, gestation length, code lists (locations, cull reasons, piglet death causes, treatments…), vaccination schedule, performance targets, action-list defaults, backup / restore, CSV import of animals, and an example herd for trying the program.

## Where the data is kept

- **Hosted on GitHub Pages or opened as a file:** records are stored in that browser on that computer (IndexedDB). Use *Settings → Backup & data → Download backup* regularly; the backup file can be restored on another computer.
- **Opened as a claude.ai Artifact:** records are stored in the Artifact's shared online database, so every computer or phone that opens the link sees the same herd.

## Hosting on GitHub Pages

The workflow in `.github/workflows/pages.yml` publishes the default branch. Turn it on once: repository **Settings → Pages → Build and deployment → Source: GitHub Actions**. After the next push the app is at `https://<owner>.github.io/<repo>/`.

`node scripts/build-single.mjs` writes `dist/swineos.html`, a single file with everything inlined that can be copied to a USB stick or emailed and opened offline.

## Code layout

| File | Purpose |
| --- | --- |
| `js/model.js` | Settings defaults, event types, per-animal analysis (status, parity, services, litters) |
| `js/store.js` | In-memory records + persistence (IndexedDB / localStorage, or the Artifact database) |
| `js/calc.js` | Herd performance calculations and indicator definitions |
| `js/entry.js` | Sow data entry window, event forms and validation |
| `js/reports.js` | Reports menu and all report windows |
| `js/actionlists.js` | Action lists dialog and printout |
| `js/settings.js` | Settings, backup / restore, import |
| `js/demo.js` | Example herd generator |
| `js/ui.js`, `js/util.js` | Window, dialog, grid and chart helpers; dates and formatting |
