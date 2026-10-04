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

**Booked to** follows the rig's awarded contracts (not options) from the data date, or from its first commitment, and treats gaps of up to 140 days as continuous (fleet status reports show mobilization and contract preparation of up to about 135 days between contracts). "Open now" means nothing is booked; "Term undisclosed" means the latest contract has no published end.

**Near-term** (amber edge in the list): open now, unconfirmed, or booked for less than 9 months.

**KPIs**

- *Contracted Share*: Working + Committed rigs ÷ rigs shown.
- *Avg Floater Rate*: mean disclosed day rate of the drillships and semisubmersibles shown, using the current contract (or the next one for rigs not yet working). Jackups are excluded; Insights shows the average for each type. When fewer than five rates are disclosed, the count is highlighted.
- *Disclosed Backlog*: for firm contracts with a disclosed rate, days remaining after the data date × day rate, including follow-on contracts and rate steps. Options, LOIs and conditional awards are excluded, as is any rig without a disclosed rate.

## Sharing a view

The URL hash keeps the view, search, filters, sort and open rig, so a link reproduces what you see. For example:

```
#view=list&region=South+America&type=Drillship&sort=-dayRate
#rig=rig-018
```

Filter values are comma-separated; `-` means none selected.

## Files

| File | Contents |
|---|---|
| `index.html` | Page markup only. No inline scripts or handlers, so it carries a Content-Security-Policy. |
| `rigs.js` | The data: `DATA_AS_OF` and `RIG_DATA`. |
| `app.js` | App logic: derived fields, map, filters, list, insights, URL state, CSV export. |
| `styles.css` | Styles. Theme colours, including status and firmness colours, are CSS variables. |
| `theme-init.js` | Applies the saved theme before first paint. |
| `basemap.js` | World outline from Natural Earth (public domain), built by `scripts/build-basemap.js`. |

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
| `region` | One of six markets: Gulf of Mexico, South America, North Sea, West Africa, Mediterranean & Black Sea, Asia Pacific. |
| `country` | Where the rig is now, or `null` if undisclosed. |
| `lat`, `lng`, `position` | `position` is `ais`, `field` or `area` (approximate). |
| `statusOverride` | `null`, or `Unconfirmed`. |
| `source`, `asOf` | The latest source checked and its date (`YYYY-MM-DD` or `YYYY-MM`); `null` if not recorded. |
| `contracts` | Current and announced contracts, see below. Ended contracts can be dropped. |
| `note` | Free-text background. |

Each contract: `{ customer, start, end, dayRate, firmness, note? }`. `customer` is a normalized name or `null` if undisclosed. `start` and `end` accept `Jul 2026`, `Q2 2027`, `Early/Mid/Late/End 2027` or `2028`; `end` is `null` if undisclosed. `dayRate` is USD per day or `null`. Write a rate step as two contracts in a row.

Use `null` for anything missing. The validator rejects placeholder strings such as `"None"`, `"-"` or `"Undisclosed"`.

## Refreshing the data

1. Edit `rigs.js`: update the contracts, `source`, `asOf` and `note` for each rig you checked, then set `DATA_AS_OF`.
2. Run the checks:
   ```
   node scripts/validate.js
   node scripts/test-dates.js
   ```
   `validate.js` fails on errors; `--strict` also fails on warnings. `test-dates.js` tests the date and contract logic with a fixed data date, so it does not change with a refresh.
3. Open the page and spot-check a few rigs.

The research toolkit that produces the refresh (`data-updates/`) is kept out of the repository.
