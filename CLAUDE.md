# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DrillTracker is a single-page static web application that displays an interactive world map of offshore drilling rigs. There is no build system, no package manager, and no server-side code — the entire application lives in `index.html`.

## Development

Open `index.html` directly in a browser. No build step, no dev server, no dependencies to install.

## Architecture

Everything is in one file (`index.html`, ~1774 lines) with three inline sections:

1. **CSS** (~1160 lines) — Design system with CSS custom properties under `:root`. Supports dark/light themes via `[data-theme]` attribute. Uses `clamp()` for responsive typography. Art direction: maritime operations center / command-center dashboard aesthetic.

2. **HTML** (~160 lines between `</style>` and `<script>`) — Layout has three main areas:
   - **KPI bar** at top (rig count, avg day rate, contractor count, region count)
   - **Filter sidebar** (contractor, type, region, status checkboxes + search)
   - **Main content area** with map view (Leaflet) and sortable list/table view, toggled via `setView()`

3. **JavaScript** (~610 lines) — Vanilla JS, no framework. Key sections:
   - `RIG_DATA` — hardcoded array of ~83 rig objects with properties: id, name, contractor, type, generation, waterDepth_ft, hookload_tons, buildYear, region, lat, lng, customer, status, contractStart, contractEnd, dayRate, backlogNote
   - `CONTRACTOR_COLORS` / `STATUS_COLORS` — color mappings for visual coding
   - State variables: `map`, `markerClusterGroup`, `allMarkers`, `filteredRigs`, `currentSort`, `currentView`, `sidebarOpen`
   - `initMap()` — Leaflet map with CARTO dark tiles and MarkerCluster plugin
   - `buildFilters()` / `applyFilters()` — checkbox-based filtering across 4 dimensions
   - `openDetail(rig)` — slide-in detail panel with specs, contract progress bar, backlog notes
   - `renderListView()` / `sortTable(field)` — tabular view with client-side sorting
   - `parseFlexDate()` — parses varied date formats ("Apr 2023", "Q3 2026", "Early 2026", "2024")

## External Dependencies (loaded via CDN)

- **Leaflet 1.9.4** — map rendering
- **Leaflet.markercluster 1.5.3** — marker clustering
- **Inter** + **JetBrains Mono** fonts from Google Fonts
- **CARTO** basemap tiles (dark and light variants)

## Key Conventions

- Contract dates use flexible text formats, not ISO dates — any date parsing must handle "Apr 2023", "Q3 2026", "Early/Mid/Late 2026", and bare "2024" formats.
- `dayRate` can be `null` (many Seadrill/Borr rigs have undisclosed rates) — always null-check before using.
- Contract progress is calculated against a hardcoded reference date (`2026-03-05`) in `calcContractProgress()`.
- Contractor names must exactly match `CONTRACTOR_COLORS` keys (e.g., `"Seadrill (Sonadrill JV)"` is distinct from `"Seadrill"`).
