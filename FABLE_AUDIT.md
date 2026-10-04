# DrillTracker — Fable Audit

**Date:** October 4, 2026 · **Reviewed:** `index.html` at `c3b2780` (2,411 lines, 82 rigs) · **Reviewer:** Claude Fable 5.1

Two reviews in one file: a **philosophy review** (what the app claims versus what its data can support, and whether its structure still fits) and a **code review** (bugs and cleanups, with line references). Nothing in the app was changed; this file is suggestions only.

Method: read the whole file, profiled `RIG_DATA` with a script, and traced the logic by hand. The app was not run in a browser, so layout and visual findings are from the code.

---

## Progress — quick fixes (October 4, 2026)

Applied on branch `fable-audit-quick-fixes`, uncommitted, and checked in a local browser preview.

| Item | Status |
|---|---|
| C1 — percent KPI rounding | Fixed. Also clamped the animation's first frame, which could briefly overshoot (82 rigs showing as 92). |
| C2 — blanks first on descending sort | Fixed. Blank rates and dates now sort last in both directions. |
| C5 — search skips notes | Fixed. "Talos" now finds West Vela. |
| P1 — KPI labels | "Utilization" is now "Contracted · 6 not yet started"; "Est. Backlog" is now "Disclosed Backlog · 30 of 82 rigs". Each has a "?" button that shows its definition (works by touch, keyboard and screen reader). |
| P4 — approximate locations | "Locations approximate" added to the map legend. |
| P8 — scope statement | Footer now says "A curated set of 82 rigs across 13 contractors, not complete fleets", generated from the data. |
| C3 — four data rows | **Not changed.** Three of the four (Santorini, Deep Value Driller, Stena IceMAX) have no end date because the term is undisclosed, so the data is accurate. Borr Ran needs a source check: its extension ran to Sep 2026 and nothing in the data says what happened next. |

## Progress — cleanup and validation (October 4, 2026)

| Item | Status |
|---|---|
| P9 — Perplexity attribution | Removed: the ASCII banner, the `generator`, `author` and `og:see_also` tags, the `rel="author"` link and the footer credit. |
| C10 — dead CSS | Removed the two `:root:not([data-theme])` blocks. |
| C11 — unused rules | Removed `.filter-reset`, `.detail-customer` and `.list-row:focus-visible`. |
| C3 — validation | Added `scripts/validate.js`. Run `node scripts/validate.js` before committing a data refresh. It currently reports 0 errors and 4 warnings (the four rows named in C3). |
| C20 — tests | Added `scripts/test-dates.js` (48 checks on date parsing and contract maths, run against the real functions in `index.html`). |
| C3 — Borr Ran | Source checked. Borr's Aug 11, 2026 fleet status report still lists the rig operating for Eni to Sep 2026, and no later update was found. Dates and status are unchanged; the note now says the current status is unconfirmed. Recheck at Borr's next fleet status report. |

### Two new findings from running the app

| # | Sev | Finding |
|---|---|---|
| N1 | **High** | **The basemap is watermarked "API KEY REQUIRED".** CARTO's tile servers now return watermarked tiles for keyless requests, on both themes, locally and on the live site. The map needs a CARTO API key or a different tile provider. Not changed: this is a provider choice. |
| N2 | **High** | **The public site is seven months out of date.** GitHub Pages publishes from the branch `claude/html-git-access-1a0xH`, last built March 7, 2026. It serves an older app titled "ConnRig" with data "last updated February 2026". Nothing merged to `main` since then is live. Fix: point Pages at `main` in the repository settings. Not changed: this is a repository setting. |

---

## Verdict

The code is in good shape for a single-file app: output is escaped consistently, CDN assets carry SRI hashes, keyboard and screen-reader support is well above average, and the October audit already fixed the obvious logic bugs. I found no security problems.

The bigger problems are in what the numbers mean. The three headline KPIs describe a much narrower slice of the data than their labels say, and the data model stores one contract per rig while the facts that matter (follow-on work, stepped rates, sources) live in free text. Fixing those is worth more than any of the code findings.

---

## Part 1 — Philosophy review

### P1. The headline KPIs claim more than the data supports

| KPI | What the label implies | What it actually is |
|---|---|---|
| **Avg Day Rate** `$429,867` | Fleet average | Mean of the 30 rigs with a disclosed rate. 22 of those 30 are Transocean, and 29 of 30 are floaters. It is close to "Transocean's average rate". |
| **Est. Backlog** `$6.7B` | Backlog of the 82 rigs shown | Sum over the same 30 rigs only; 72% of it is Transocean. 52 rigs contribute zero. It also uses one rate for the whole term and ignores follow-on contracts. |
| **Utilization** `95%` | Market utilization | 78 contracted ÷ 82 in a hand-picked set that contains no stacked rigs. Six of the 78 have not started work yet (see P2). |

The day-rate KPI at least says "30 disclosed". Backlog says nothing, and it is the one most likely to be quoted.

Suggestions:
- Label backlog the same way: "Disclosed backlog · 30 of 82 rigs".
- Show the average rate per rig type, or restrict it to floaters, so one jackup at $125k does not sit in the same mean as drillships at $500k.
- Rename utilization to "Contracted share" and split out "contracted, not yet started" from "working now".
- When a filter leaves fewer than about five disclosed rates, show the count more prominently than the average.

### P2. One contract per rig, in a market that is about contract sequences

Each rig has one `contractStart`, one `contractEnd`, and one `dayRate`. The real picture is in `backlogNote`:

- 22 notes describe a follow-on contract ("Next: …", "commencing Q1 2028").
- 9 notes describe a stepped rate ("$435k/day to Dec 2026 then $440k/day").
- Two rigs have `dayRate: null` although the note gives a rate (West Polaris: $409,200; Noble Developer: $375k for a later job).

So the Gantt chart, the backlog figure, and the "expiring within 9 months" count all ignore known future work. Transocean Barents shows as ending Mar 2027 when it has a three-year contract from Jul 2027.

Suggestion: give each rig a `contracts` array, each entry with customer, start, end, rate, firmness, and source. Derive status, backlog, Gantt bars, and near-term availability from it. This is the single change that would most improve the app.

### P3. Free text and sentinel strings carry facts the code needs

- **Sources and dates** are inside prose ("per the Aug 5, 2026 FSR"). The footer gives one "as of" date for everything, but seven notes still cite the May 2026 fleet status reports. A per-rig `asOf` and `source` field would make staleness visible.
- **Customers are not normalized.** Adura appears three ways, ExxonMobil two ways. Any "by customer" view would split them.
- **Missing values are strings:** `"None"` for no customer, `"-"` for no date, `"Undisclosed"` for unknown. Use `null` and let the UI choose the wording.
- **Status mixes two questions.** "Firm" is about contract certainty; "Operating" is about activity. A rig can be both. Four other statuses (LOI, Warm Stacked, Held for sale, Stacked) have colours and badges but no rigs.
- **Regions mix scales:** Guyana, Brazil, and "South America" are separate values; so are Norway and "North Sea", Namibia and "West Africa".
- **Contractor names carry notes:** "Northern Ocean (Odfjell managed)", "Constellation (Hanwha owned)". Better as `owner` and `manager` fields.
- **Generation mixes scales:** floater generations ("7th Gen") and jackup classes ("Modern Premium") share one field.

### P4. The map implies precision the data does not have

78 of 82 coordinates are rounded to 0.1° or coarser — they are region placements, not positions. One rig (Deepwater Asgard) is plotted where it will work from December, not where it is now. Only that one note says so.

A map pin reads as "the rig is here". Suggestions: add "Locations approximate" to the legend, and add a `positionSource` field (`ais`, `field`, `region`) so approximate pins can be drawn differently.

### P5. The clock keeps moving but the data does not

`NOW = new Date()` (`index.html:1562`) is the viewer's clock; the data is frozen at the last refresh. Open the page in January and contracts will show as "Ended", the near-term count will grow, and backlog will shrink, with no sign that the data is three months old.

Suggestions:
- Keep one `DATA_AS_OF` date in the data and compute against it, or
- keep the live clock but show a banner when the data is more than about 45 days old.

Either way, define the date once. It is currently written in two places (`index.html:1404` and `:1549`).

### P6. The single-file approach has reached its limit

One file with no build step is a sound choice for this app, and I would keep the no-build rule. Two things now strain it:

- **Data and code share a file.** A third of `index.html` is rig data. Every data refresh is a commit to the application file, and the diffs are 400-character lines.
- **CSS is patched by layering.** There are "v2", "v3", and "v4" sections that override earlier rules instead of editing them. `.kpi-strip`'s grid is defined five times, `.badge-committed` twice, `--color-text-faint` twice. To know what a rule does you have to read to the end of the stylesheet.

Suggestions: move the data to `rigs.json` (or `rigs.js` if it must open from `file://`), one field per line so diffs are readable. Fold the v2–v4 overrides back into the original rules.

### P7. The refresh process is the real product, and it is not in the repo

`.gitignore` excludes `data-updates/`, described as a "local-only data-refresh toolkit". The repo is public, has no README, no licence, and no statement of method. The value of this app is the curated data, and the way it is produced exists on one machine.

Suggestions:
- Add a README: what is covered, how often it is refreshed, what the statuses mean, how KPIs are computed.
- Add a short disclaimer (compiled from public disclosures; not investment advice; positions approximate).
- Add a licence, or state that there is none.
- Commit at least a validation script (see C3) even if the research toolkit stays private.

### P8. Say what the 82 rigs are

The set looks curated: Valaris has 7 rigs here and Borr 8, both well below their fleets as I know them, and there are no stacked rigs at all. That is a reasonable scope, but nothing on the page says so, and "Utilization" and "Rigs by Contractor" read as market statistics.

Suggestion: one line in the footer or an "About" popover — for example "82 selected rigs across 13 contractors; contracted floaters and selected jackups; cold-stacked units not tracked."

### P9. Authorship metadata

The page credits Perplexity Computer in an ASCII banner, `generator` and `author` meta tags, `og:see_also`, a `rel="author"` link, and the footer. The app has since been substantially rewritten. Whether to keep a credit is your decision; I would at least make `author` you, since that tag is a claim about who stands behind the data.

### P10. Views cannot be shared

Filters, the selected rig, and the active view live only in memory. For a tracker, "send me the link to the Brazil drillships" is a common need. Putting state in the URL hash (`#view=list&region=Brazil&rig=rig-011`) is a small change with a large payoff.

---

## Part 2 — Code review

Severity: **High** = wrong output users will see; **Medium** = real defect in a less common path; **Low** = cleanup.

### Bugs

| # | Sev | Where | Finding | Fix |
|---|---|---|---|---|
| C1 | High | `index.html:1926` | The Utilization KPI shows unrounded decimals while it animates (for example `63.2746193%`) because the percent formatter does not round. It settles on `95%` after 600 ms. | `return Math.round(val) + '%';` |
| C2 | High | `index.html:2192-2196` | Sorting Day Rate or Contract End descending puts all blank rows first — 52 "—" rows before the highest rate. Blanks are mapped to `Infinity` regardless of direction. | Sort blanks last in both directions: handle `null` before applying `asc`. |
| C3 | High | data | Nothing checks that status and dates agree. Borr Ran is "Operating" with a contract that ended Sep 2026, so its panel shows "Ended". Santorini, Deep Value Driller, and Stena IceMAX are contracted with no end date, so they silently drop out of the Gantt, backlog, and near-term count. | Add a small validation script run before each refresh is committed: contracted ⇒ has customer and end date; end date not in the past unless status says so; known status, region, and contractor values; unique ids. |
| C4 | Medium | `index.html:1593-1595` | If Leaflet fails to load (CDN blocked, offline), `initMap()` throws and nothing else runs — no filters, no list, no insights, though none of those need the map. | Guard `initMap()` with `if (window.L)` and show a "map unavailable" message; let the list and insights views work. |
| C5 | Medium | `index.html:1849-1850` | Search does not look in `backlogNote`, which is where follow-on customers are recorded. Searching "Talos" or "Trinidad" finds nothing although both are in the data. | Add `backlogNote` to the search text. |
| C6 | Medium | `index.html:1032-1033`, `:1816-1828` | The "only" filter shortcut appears on hover, so it cannot be reached on touch screens. It is also a `<button>` inside a `<label>`, which is confusing for assistive technology. | Show it always on touch (`@media (hover: none)`), and move the button out of the label. |
| C7 | Medium | `index.html:1980`, `:2048` | Opening a rig from the list or Gantt switches to the map first, which hides the element that had focus. On close, focus goes nowhere and keyboard users restart from the top. Clicking a second marker while the panel is open has the same effect. | Record the rig id, not the element; on close, focus the rig's marker. |
| C8 | Low | `index.html:1936-1954` | Each filter change starts a new 600 ms KPI animation without cancelling the last, so quick changes make several loops write to the same element. | Keep the animation frame id per element and cancel it before starting. |
| C9 | Low | `index.html:1838-1868`, `:2123` | The detail panel stays open when its rig is filtered out, and stays "open" but invisible when you switch to List or Insights; Escape then closes a panel nobody can see. | Close the panel when its rig leaves the filtered set or the view changes. |

### Cleanups

| # | Where | Finding |
|---|---|---|
| C10 | `index.html:159-184`, `:982` | Dead CSS. `:root:not([data-theme])` can never match: `<html>` has `data-theme` in the markup and the inline script always sets it. About 25 lines can go. |
| C11 | `index.html:505-512`, `:725-730`, `:1022` | Unused rules: `.filter-reset`, `.detail-customer`, and `.list-row:focus-visible` (rows stopped being focusable in the last audit). |
| C12 | `index.html:1528-1537` vs `:652-657`, `:996-998`, `:1159-1166` | Status colours are defined in JavaScript and again in CSS badge classes. The JavaScript copy is the dark-theme palette, so list dots and Gantt bars use it on the light theme too. Define them once as CSS variables per theme and read them from JavaScript. |
| C13 | `index.html:1290`, `:1404`, `:1407`, `:24` | Hard-coded copies of derived values: "82 of 82 rigs", the as-of date, and the contractor list in the footer and meta description. Each needs a manual edit on refresh. Generate them from the data. |
| C14 | `index.html:2054`, `:2268` | Uses Leaflet's private `_icon` property. Use `marker.getElement()`. |
| C15 | `index.html:1751` | Marker keyboard support listens for `keypress`, which is deprecated. It works today; `keydown` is the safer choice. |
| C16 | `index.html:1612`, `:1679-1680` | Insights is rebuilt on every window resize and theme change, and the legend on theme change. The charts are percentage-based and their colours do not depend on theme, so none of this is needed. |
| C17 | `index.html:1804` | Filter labels are truncated in JavaScript at 26 characters and again by CSS ellipsis. Keep the CSS one. |
| C18 | throughout | Twenty-two inline `onclick` attributes rely on global functions. Fine at this size, but it rules out a Content-Security-Policy. Moving to `addEventListener` would allow one. |
| C19 | `index.html:2235-2251` | The CSV export omits the rig `id` and the as-of date, and the filename is not dated. Exports from different refreshes cannot be told apart. |
| C20 | — | No tests. `parseFlexDate` and `contractInfo` are the most fragile logic in the app (five date formats, period-end rules). A 30-line Node script with a table of inputs and expected outputs would cover them. |

### Accessibility notes

- There is no `<h1>`; the wordmark is a `<div>` (`index.html:1199`). Headings start at `<h2>`.
- `aria-label` on the filter count `<span>` (`index.html:1812`) is ignored by most screen readers because the span has no role. Use visually hidden text instead.
- The detail panel has `role="dialog"` but is not modal and does not trap focus. `role="region"` describes it more accurately.
- `text-size-adjust: none` (`index.html:58-60`) stops iOS from enlarging text for users who ask for it. `100%` is the safer value.

### What I checked and found sound

- **Escaping:** every data value written with `innerHTML` goes through `escapeHtml`. No injection path found.
- **Dependencies:** Leaflet and MarkerCluster are version-pinned with SRI hashes. External links use `rel="noopener"`.
- **Date maths:** period-end handling, the `max(start, today)` backlog rule, and clamping are correct for all 164 date values in the current data.
- **Data integrity:** no duplicate ids or names, no missing fields, all coordinates valid. `rig-082` is absent from the id sequence, which is harmless.
- **Enter on a marker** does not double-fire: Leaflet 1.9.4 does not convert Enter to a click, so the app's own handler is the only one.

---

## Suggested order of work

**An hour or less**
1. C1 and C2 — two one-line fixes to visible bugs.
2. P1 — relabel the backlog and utilization KPIs.
3. C5 — include notes in search.
4. P4 and P8 — add "locations approximate" and a one-line scope statement.
5. Fix the four data rows named in C3.

**Half a day**

6. C3 and C20 — validation script and date tests, committed to the repo.
7. P5 — single as-of date and a staleness banner.
8. C4, C6, C7 — resilience and interaction fixes.
9. P7 — README, disclaimer, licence.

**A larger piece of work**

10. P2 and P3 — the `contracts` array and normalized fields. Do this before adding any new feature; most future features depend on it.
11. P6 — split the data out and fold the CSS layers.
12. P10 — URL state.
