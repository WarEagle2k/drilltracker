# DrillTracker

An interactive map and contract tracker for a curated set of offshore drilling rigs: drillships, semisubmersibles and selected jackups, with their current and announced contracts.

Live site: https://wareagle2k.github.io/drilltracker/

## What it covers

- **A curated set, not complete fleets.** The rigs are chosen by hand from the major offshore contractors. Most are contracted floaters; cold-stacked rigs are not tracked. Counts such as "Contracted Share" describe this set, not the market.
- **Public sources only.** Contractor fleet status reports, company releases and results, operator and regulator announcements, trade press, and AIS position reports. Each rig records its latest source and that source's date.
- **A snapshot.** `DATA_AS_OF` in `rigs.js` is the date the data was last checked. The app computes every status, "time left", booked-to date and backlog figure as of that date, not the viewer's clock. If the data is more than 45 days old, a banner says so.
- **Positions are approximate** unless marked otherwise. Most rigs are placed in their operating area. A marker with a white centre dot is a reported position (AIS or a named field).

## Disclaimer

Compiled from public disclosures and believed accurate as of the data date, but not checked against the contractors' own records. Day rates and contract terms are often undisclosed or approximate. Not investment advice.

## Licence

No licence is granted. The code and the compiled data are © Chris Walker, all rights reserved. Ask before reusing them.

## How the numbers are worked out

**Status** (activity on the data date) is derived from each rig's contracts:

| Status | Meaning |
|---|---|
| Working | A contract (or an option continuing one) covers the data date. |
| Committed | The rig has an announced contract that has not started yet. |
| Available | No current or announced contract. |
| Unconfirmed | Set by hand (`statusOverride`) when the last known contract has ended and no source says what happened next. |

A contract dated only to a month or quarter ("Oct 2026", "Q4 2026") counts as started once that month or quarter is over, or straight away if it directly continues an earlier contract.

**Firmness** is separate from status and describes contract certainty: Firm, LOI (letter of intent or award), Conditional (awarded subject to approvals) or Option (priced or unexercised).

**Booked to** follows the rig's awarded contracts (not options) from the data date, or from its first commitment, and treats gaps of up to 140 days as continuous (fleet status reports show mobilization and contract preparation of up to about 135 days between contracts). "Open now" means nothing is booked; "Undisclosed" means the latest contract has no published end.

**Coming free**: open now, unconfirmed, or booked for less than 9 months. On the map these are the orange markers; in the list, rows with an orange edge (darker for open now), with the same counts as the map key.

**KPIs**

- *Contracted Share*: Working + Committed rigs ÷ rigs shown.
- *Coming Free*: rigs open now, or whose booked work ends within 9 months, plus unconfirmed rigs: the orange markers on the map.
- *Booked Runway*: the median time until each rig's booked work runs out (awarded work, followed across short gaps). Open rigs and rigs whose booked work has no published end are left out.
- *Avg Floater Rate* (in thousands of dollars a day): mean disclosed day rate of the drillships and semisubmersibles shown, using the current contract (or the next one for rigs not yet working). Jackups are excluded. Insights compares the median floater rate running now with the median of rates starting later. When fewer than five rates are disclosed, the count is highlighted.
- *Disclosed Backlog*: for firm contracts with a disclosed rate, days remaining after the data date × day rate, including follow-on contracts and rate steps. Options, LOIs and conditional awards are excluded, as is any rig without a disclosed rate.

## Map

Markers are coloured by **availability** by default: open now, free within 9 months, or booked for 9 months or more. The map key switches to colouring by **contractor**. Marker size shows the rig type; zoomed in (from zoom 6), markers become side-view silhouettes of a drillship, semisub or jackup, in the same colours. A dot marks a reported position: in the centre of a disc, or under a rig. Each cluster shows its count, with a ring giving the mix of what's inside. The map key explains each of these, with counts for the rigs shown, and folds away to its header. Hovering over or focusing a marker shows a summary, and selecting it opens the details.

## Rig details

Selecting a rig opens its details: the rig type's silhouette in its map colour, status, day rate, customer and booked-to date, location, specs, a contract timeline and every recorded contract with its source. The timeline puts the current and upcoming contracts on one strip against today, marked by year and looking back at most six months, so follow-on work and gaps show; a contract with no published end fades out. Beneath it, a line says how long the current contract has left and how far the booked work runs. A rig with nothing current or ahead shows when its last contract ended and for whom. If the rig changed since the previous refresh, a box under the day rate says how. Ended contracts stay in the contracts table, greyed; beyond the latest two they fold away. From the list, Previous and Next step through the rigs in the list's order without closing the panel.

## Filtering

Filters start empty, and an empty group doesn't filter. Ticking options narrows the rigs shown. Options within a group combine with OR (Brazil or Guyana); groups combine with AND (and Drillship). The number beside each option is how many rigs it has within your other choices. Options that would show nothing are greyed out, so only the search can produce an empty result. Active filters appear as removable chips above the list, and as a summary over the map. Each group folds away (the browser remembers which), says how many of its options are ticked, and has its own Clear; Country starts folded. The contractor colour dots show while the map is coloured by contractor. On a phone, the filters open over the map and a Show button closes them.

## Insights

Every chart follows the filters and has a table view of the same numbers. Hover, tap or focus a mark to read its values.

- **Booked a year out**: the share of rigs with awarded work (firm, LOI or conditional) twelve months after the data date.
- **How much of the fleet is booked**: rigs under contract each month for three years, layered by the firmest contract covering that month. Contracts with no published end are counted for six months.
- **When rigs come free**: rigs by the quarter their booked work ends. The next nine months are highlighted.
- **Day rates by start date**: every disclosed rate period, by rig type.
- **Contractor runway**: the share of each contractor's rigs with awarded work, quarter by quarter.
- **Who the work is for**: rig-years of awarded work after the data date, for the top ten customers. Work for undisclosed customers is listed last.
- **Fleet mix**: rigs by status, type and region. Selecting a row filters by it, and selecting it again removes the filter.
- **Contract timeline**: one row per rig, one bar per contract. The year axis stays in view as you scroll, and selecting a row opens the rig's details.

Chart colours follow the job they do. Contract firmness is an ordered scale, so it uses one blue ramp. Rig type uses three categorical colours plus a marker shape each. The heatmap uses five steps of one ramp. All were checked for colour-vision deficiency and contrast against both themes.

## Changes since the last refresh

**Changes** in the header lists what the data says now that it didn't at the previous refresh, for the rigs shown, with a count of changed rigs. Rigs are grouped by whether their booked work now runs later (more work booked), earlier (less work booked) or the same (other changes, such as a rate or customer). Each line is one change, for example "Booked to: Jul 2030 (was Mar 2027)", "New contract: bp, Jun 2028 – Jun 2030, $635k/day" or "Option exercised". Selecting a rig opens its details. Rate changes under 3% (escalations) are left out, and a date that only became more precise ("2028" to "Jun 2028") is listed under other changes.

The list is built by `scripts/build-changes.js`, which compares `rigs.js` with the data at the previous refresh in git history and writes `changes.js`. The July 15, 2026 data recorded one contract per rig, so the first list compares booked-to dates, customers and rates; from the next refresh it compares contract by contract.

## Header

The filters button shows how many filters are on, so they aren't forgotten while the sidebar is closed. **Changes** opens the change list above. **CSV** exports the rigs shown, with every contract, source and note; it is disabled when nothing matches.

## Sharing a view

The URL hash keeps the view, search, filters, sort and open rig, so a link reproduces what you see. For example:

```
#view=list&region=South+America&type=Drillship&sort=-dayRate
#rig=rig-018
```

A filter lists the values shown, comma-separated; a filter that isn't in the link isn't applied.

## Files

| File | Contents |
|---|---|
| `index.html` | Page markup only. No inline scripts or handlers, so it carries a Content-Security-Policy. |
| `rigs.js` | The data: `DATA_AS_OF` and `RIG_DATA`. |
| `changes.js` | What changed since the previous refresh. Generated by `scripts/build-changes.js`; don't edit it. |
| `app.js` | App logic: derived fields, map, filters, list, URL state, CSV export. |
| `insights.js` | The Insights view: calculations and charts. |
| `styles.css` | Styles. Theme colours, including status and firmness colours, are CSS variables. |
| `theme-init.js` | Applies the saved theme before first paint. |
| `basemap.js` | World outline from Natural Earth (public domain), built by `scripts/build-basemap.js`. |
| `icons/` | Rig-type silhouettes for the zoomed-in map: alpha masks built by `scripts/build-icons.py` from `icons/src/` (generated with GPT Image via Higgsfield). |
| `vendor/` | Leaflet 1.9.4 and Leaflet.markercluster 1.5.3, served from the site rather than a CDN, with their licences. The version is in the path, so a new version is a new folder. |
| `og-image.png` | The 1200×630 card shown when the link is shared. It includes a screenshot, so its figures are a snapshot. |

There is no build step. Serve the folder with any static server, or open `index.html` directly.

## Data format

Each rig in `rigs.js`:

| Field | Notes |
|---|---|
| `id`, `name` | `rig-NNN`; both unique. |
| `contractor` | The company that runs the rig. Must have a colour in `CONTRACTOR_COLORS` in `app.js`. |
| `owner` | Set only when someone else owns the rig (for example Northern Ocean for a rig Odfjell manages); otherwise `null`. |
| `type` | `Drillship`, `Semisubmersible` or `Jackup`. |
| `generation` | Floaters only (`6th Gen`, `7th Gen`, `8th Gen`); `null` for jackups. |
| `jackupClass` | Jackups only (`Modern`, `Modern Premium`); otherwise `null`. |
| `environment` | `Harsh`, `Ultra-Harsh` or `null` (benign). |
| `waterDepth_ft`, `hookload_tons`, `buildYear` | Numbers. |
| `region` | One of six markets: Gulf of America, South America, North Sea, West Africa, Mediterranean & Black Sea, Asia Pacific. |
| `country` | Where the rig is now, or `null` if undisclosed. |
| `lat`, `lng`, `position` | `position` is `ais`, `field` or `area` (approximate). |
| `statusOverride` | `null`, or `Unconfirmed`. |
| `source`, `asOf` | The latest source checked and its date (`YYYY-MM-DD` or `YYYY-MM`); `null` if not recorded. |
| `contracts` | Ended, current and announced contracts, see below. Keep ended contracts: they are the rig's history and the day-rate record, and the change list warns if one is deleted. |
| `note` | Free-text background. |

Each contract: `{ customer, start, end, dayRate, firmness, note? }`. `customer` is a normalized name or `null` if undisclosed. `start` and `end` accept `Jul 2026`, `Q2 2027`, `Early/Mid/Late/End 2027` or `2028`; `end` is `null` if undisclosed. `dayRate` is USD per day or `null`. Write a rate step as two contracts in a row.

Use `null` for anything missing. The validator rejects placeholder strings such as `"None"`, `"-"` or `"Undisclosed"`.

## Refreshing the data

1. Edit `rigs.js`: update the contracts, `source`, `asOf` and `note` for each rig you checked, then set `DATA_AS_OF`. Don't delete contracts that have ended; correct or extend them in place, so the change list can match them.
2. Run the checks:
   ```
   node scripts/validate.js
   node scripts/test-dates.js
   node scripts/test-filters.js
   node scripts/test-insights.js
   ```
   `validate.js` fails on errors; `--strict` also fails on warnings. `test-dates.js` tests the date and contract logic with a fixed data date, so it does not change with a refresh. The same checks run on every pull request and push to `main` (`.github/workflows/test.yml`), along with a check that `changes.js` matches the data.
3. Build the change list, then stamp the asset versions so browsers fetch the new files instead of cached ones (CI fails if you forget either):
   ```
   node scripts/build-changes.js
   node scripts/stamp-assets.js
   ```
   Commit the refresh before the next one starts: the change list finds the previous refresh as the last commit with a different `DATA_AS_OF`.
4. Open the page and spot-check a few rigs.

The research toolkit that produces the refresh (`data-updates/`) is kept out of the repository.
