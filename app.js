/* DrillTracker app. The data comes from rigs.js (RIG_DATA, DATA_AS_OF) and the
   world outline from basemap.js; both load before this file. */

/* ============================================
   CONSTANTS
   ============================================ */
/* Contractor colours: desaturated, navy-harmonized categorical ramp
   (kept clear of the brand amber reserved for clusters) */
const CONTRACTOR_COLORS = {
  'Transocean':        '#4a9d9c',
  'Seadrill':          '#6b8cc7',
  'Sonadrill':         '#5f6fb0',
  'Noble Corporation': '#8aa872',
  'Valaris':           '#c77b8b',
  'Odfjell Drilling':  '#9b8bc4',
  'Borr Drilling':     '#7a8a9e',
  'Saipem':            '#c08552',
  'Stena Drilling':    '#6fa8b0',
  'COSL':              '#b5926a',
  'Constellation':     '#a59b80',
  'Ventura Offshore':  '#7fa38f'
};
const FALLBACK_COLOR = '#8896a8';

/* Status is about activity on DATA_AS_OF and is derived from the contracts;
   only "Unconfirmed" is ever set by hand (statusOverride). Colours are CSS
   variables so each theme defines its own. */
const STATUSES = {
  'Working':     'working',
  'Committed':   'committed',
  'Available':   'available',
  'Unconfirmed': 'unconfirmed'
};

/* Firmness is about contract certainty, separate from status */
const FIRMNESS = {
  firm:        'Firm',
  loi:         'LOI',
  conditional: 'Conditional',
  option:      'Option'
};

const REGIONS = ['Gulf of Mexico', 'South America', 'North Sea', 'West Africa', 'Mediterranean & Black Sea', 'Asia Pacific'];
const POSITIONS = { ais: 'Reported by AIS', field: 'At the named field', area: 'Approximate: placed in the operating area' };
const TYPE_SIZES = { 'Drillship': 10, 'Semisubmersible': 8, 'Jackup': 6 };
const NO_COUNTRY = 'Not disclosed';

/* Map colour modes. Availability is ordinal emphasis (one orange hue, two steps, grey
   for the rest; validated on both map surfaces); contractor is the brand set. */
const AVAILABILITY = {
  open:   'Open now',
  near:   'Free within 9 months',
  booked: 'Booked 9+ months'
};

const NEAR_TERM_MONTHS = 9;
const CHAIN_GAP_DAYS = 140;    // a gap this short between contracts counts as continuous work: fleet status reports show mobilization and preparation of up to ~135 days
const STALE_DATA_DAYS = 45;    // show a banner when the data is older than this
const STALE_SOURCE_DAYS = 120; // flag a rig whose source predates DATA_AS_OF by more than this

const DAY_MS = 86400000;
const MS_PER_MONTH = DAY_MS * 30.44;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/* ============================================
   DATES
   ============================================ */
/* "2026-10-04" or "2026-10" as a local date (the 1st for month-only values) */
function parseIsoDate(str) {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(str || '');
  return m ? new Date(+m[1], +m[2] - 1, m[3] ? +m[3] : 1) : null;
}

function fmtIsoDate(str) {
  const d = parseIsoDate(str);
  if (!d) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(str)
    ? MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear()
    : MONTHS[d.getMonth()] + ' ' + d.getFullYear();
}

const AS_OF = parseIsoDate(DATA_AS_OF);
const DATA_AS_OF_LABEL = MONTHS_LONG[AS_OF.getMonth()] + ' ' + AS_OF.getDate() + ', ' + AS_OF.getFullYear();

/* Parses "Jul 2026", "Q2 2027", "Mid-2027", "End 2027", "2028" etc.
   With asEnd, returns the end of that period (a contract ending "Jul 2026"
   runs through July, not to Jul 1). */
function parseFlexDate(str, asEnd) {
  if (!str || str === '-') return null;
  const months = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  const mMatch = str.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{4})/);
  if (mMatch) {
    const y = parseInt(mMatch[2], 10), mo = months[mMatch[1]];
    return asEnd ? new Date(y, mo + 1, 0) : new Date(y, mo, 1);
  }
  const qMatch = str.match(/Q([1-4])\s*(\d{4})/);
  if (qMatch) {
    const y = parseInt(qMatch[2], 10), q0 = (parseInt(qMatch[1], 10) - 1) * 3;
    return asEnd ? new Date(y, q0 + 3, 0) : new Date(y, q0, 1);
  }
  const yearOnly = str.match(/(\d{4})/);
  if (yearOnly) {
    const y = parseInt(yearOnly[1], 10);
    const low = str.toLowerCase();
    if (low.includes('early')) return asEnd ? new Date(y, 3, 30) : new Date(y, 0, 1);
    if (low.includes('mid')) return asEnd ? new Date(y, 6, 31) : new Date(y, 5, 1);
    if (low.includes('late') || low.includes('end')) return asEnd ? new Date(y, 11, 31) : new Date(y, 9, 1);
    return asEnd ? new Date(y, 11, 31) : new Date(y, 0, 1);
  }
  return null;
}

function fmtMonths(mo) {
  return mo < 1 ? '<1 mo' : mo < 24 ? Math.round(mo) + ' mo' : (Math.round(mo / 12 * 10) / 10) + ' yr';
}

/* Progress through one contract, as of DATA_AS_OF */
function contractInfo(start, end) {
  const s = parseFlexDate(start), e = parseFlexDate(end, true);
  if (!s || !e || e <= s) return { has: false };
  const pct = Math.max(0, Math.min(100, (AS_OF - s) / (e - s) * 100));
  let remaining;
  if (e <= AS_OF) remaining = 'Ended';
  else if (s > AS_OF) remaining = 'Starts in ' + fmtMonths((s - AS_OF) / MS_PER_MONTH);
  else remaining = fmtMonths((e - AS_OF) / MS_PER_MONTH) + ' left';
  return { has: true, pct: Math.round(pct), remaining: remaining, start: s, end: e };
}

/* ============================================
   DERIVED FIELDS — computed once per rig from its contracts
   ============================================ */
function deriveRig(rig) {
  const contracts = rig.contracts
    .map(k => ({ k: k, s: parseFlexDate(k.start), e: parseFlexDate(k.end, true), sEnd: parseFlexDate(k.start, true) }))
    .sort((a, b) => (a.s || 0) - (b.s || 0));
  // A start of "Oct 2026" or "Q4 2026" may not have happened by Oct 4: count a contract as
  // started once its start period is over, or when it directly continues an earlier contract.
  const started = x => x.s && x.s <= AS_OF &&
    (x.sEnd < AS_OF || contracts.some(y => y !== x && y.s < x.s && y.e && y.e >= x.s - DAY_MS));
  const covering = contracts.filter(x => started(x) && (!x.e || x.e >= AS_OF));
  const current = covering.find(x => x.k.firmness !== 'option') || covering[0] || null;
  const next = contracts.find(x => x.s && !started(x) && (!x.e || x.e >= AS_OF)) || null;
  const status = rig.statusOverride || (current ? 'Working' : next ? 'Committed' : 'Available');
  const shown = current || next; // the contract the list, KPIs and map describe

  // Booked to: follow awarded work (not options) from today, or from the first
  // commitment, treating gaps of up to CHAIN_GAP_DAYS as continuous.
  const awarded = contracts.filter(x => x.s && x.k.firmness !== 'option');
  let booked = current ? AS_OF : next ? next.s : AS_OF;
  let bookedBy = null, bookedOpen = false;
  for (const x of awarded) {
    if (x.e && x.e <= booked) continue;
    if (x.s - booked > CHAIN_GAP_DAYS * DAY_MS) break;
    if (!x.e) { bookedOpen = true; bookedBy = x; break; }
    booked = x.e; bookedBy = x;
  }
  const available = !bookedBy;
  const nearTerm = status === 'Available' || status === 'Unconfirmed' ||
    (!bookedOpen && (available || booked <= addMonths(AS_OF, NEAR_TERM_MONTHS)));

  let backlog = 0;
  contracts.forEach(function (x) {
    if (x.k.firmness !== 'firm' || x.k.dayRate == null || !x.s || !x.e) return;
    const from = x.s > AS_OF ? x.s : AS_OF;
    backlog += x.k.dayRate * Math.max(0, (x.e - from) / DAY_MS);
  });

  const sourceDate = parseIsoDate(rig.asOf);
  return {
    contracts: contracts,
    current: current,
    next: next,
    shown: shown,
    status: status,
    customer: shown ? (shown.k.customer || 'Undisclosed') : null,
    dayRate: shown ? shown.k.dayRate : null,
    firmness: shown ? shown.k.firmness : null,
    available: available,
    bookedTo: available || bookedOpen ? null : booked,
    bookedToLabel: available ? (status === 'Unconfirmed' ? 'Not confirmed' : 'Open now')
      : bookedOpen ? 'Undisclosed' : bookedBy.k.end,
    bookedOpen: bookedOpen,
    nearTerm: nearTerm,
    backlog: backlog,
    sourceDate: sourceDate,
    sourceStale: !sourceDate || (AS_OF - sourceDate) / DAY_MS > STALE_SOURCE_DAYS
  };
}

function addMonths(d, n) {
  return new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
}

function isNearTerm(rig) { return rig.derived.nearTerm; }

RIG_DATA.forEach(function (rig) { rig.derived = deriveRig(rig); });
const RIG_BY_ID = {};
RIG_DATA.forEach(function (rig) { RIG_BY_ID[rig.id] = rig; });

/* ============================================
   LABELS & COLOURS
   ============================================ */
function getContractorColor(contractor) {
  return CONTRACTOR_COLORS[contractor] || FALLBACK_COLOR;
}

function statusSlug(status) { return STATUSES[status] || 'available'; }
function statusColor(status) { return 'var(--status-' + statusSlug(status) + ')'; }

function classLabel(rig) {
  return [rig.generation || rig.jackupClass, rig.environment ? rig.environment + ' environment' : null]
    .filter(Boolean).join(' · ') || '—';
}

function locationLabel(rig) {
  return rig.country || rig.region;
}

function fmtRate(v) {
  return v == null ? '—' : '$' + v.toLocaleString('en-US');
}

function fmtRateShort(v) {
  return '$' + Math.round(v / 1000) + 'k';
}

function plural(n, word) {
  return n + ' ' + word + (n === 1 ? '' : 's');
}

/* ============================================
   STATE
   ============================================ */
let map = null, markerLayer = null, labelLayer = null, basemapLayer = null;
let mapLabels = [];
let filteredRigs = RIG_DATA.slice();
let currentSort = { field: 'name', asc: true };
let currentView = 'map';
let colorMode = 'availability';
let sidebarOpen = true;
let selectedRigId = null;
let detailOpener = null; // the list row or timeline row that opened the panel, if any
const markersById = {};
const kpiFrames = {};
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Each filter group: its container, URL key and how to read the value from a rig */
const FILTER_GROUPS = [
  { id: 'contractorFilters', key: 'contractor', get: r => r.contractor, color: true },
  { id: 'typeFilters',       key: 'type',       get: r => r.type },
  { id: 'regionFilters',     key: 'region',     get: r => r.region, order: REGIONS },
  { id: 'countryFilters',    key: 'country',    get: r => r.country || NO_COUNTRY },
  { id: 'statusFilters',     key: 'status',     get: r => r.derived.status, order: Object.keys(STATUSES) }
];

/* ============================================
   SMALL HELPERS
   ============================================ */
function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function debounce(fn, wait) {
  let t;
  return function () {
    const args = arguments;
    clearTimeout(t);
    t = setTimeout(function () { fn.apply(null, args); }, wait);
  };
}

function announce(msg) {
  const live = document.getElementById('liveRegion');
  if (live) live.textContent = msg;
}

/* ============================================
   INITIALIZATION
   ============================================ */
document.addEventListener('DOMContentLoaded', function () {
  initTheme();
  initMap();
  buildFilters();
  renderFooter();
  renderStaleBanner();
  wireActions();
  wireGlobalKeys();
  wireKpiHelp();
  wireListSort();
  const hashRig = readHash();
  applyFilters();
  updateSortHeaders();
  fitToRigs(false);
  openRigFromHash(hashRig);
  // On small screens the sidebar overlays the map, so start with it closed
  if (window.matchMedia('(max-width: 768px)').matches) {
    toggleSidebar();
    toggleLegend(); // the legend would cover much of a phone-sized map
  }
  document.getElementById('searchInput').addEventListener('input', debounce(applyFilters, 150));
  document.getElementById('listTableBody').addEventListener('click', onListActivate);
  window.addEventListener('hashchange', function () {
    const rig = readHash();
    applyFilters();
    updateSortHeaders();
    openRigFromHash(rig);
  });
  let rt;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () {
      if (map && currentView === 'map') map.invalidateSize();
      if (currentView === 'insights') renderInsights(); // the SVG charts are drawn to the card width
    }, 200);
  });
});

/* Buttons declare what they do with data-action, so the page needs no inline handlers */
function wireActions() {
  document.addEventListener('click', function (e) {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    switch (el.dataset.action) {
      case 'toggle-sidebar': toggleSidebar(); break;
      case 'set-view': setView(el.dataset.view); break;
      case 'export-csv': exportCSV(); break;
      case 'clear-search': clearSearch(); break;
      case 'reset-filters': resetFilters(); break;
      case 'remove-filter': removeFilter(el.dataset.group, el.dataset.value); break;
      case 'remove-search': clearSearch(); break;
      case 'toggle-legend': toggleLegend(); break;
      case 'color-mode': setColorMode(el.dataset.mode); break;
      case 'close-detail': closeDetail(true); break;
      case 'show-on-map': if (selectedRigId) focusRig(selectedRigId); break;
      case 'detail-step': stepDetail(+el.dataset.step); break;
      case 'sort': sortTable(el.dataset.field); break;
    }
  });
}

function wireGlobalKeys() {
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (closeKpiHelp(true)) return;
      if (selectedRigId) closeDetail(true);
      else if (sidebarOpen && window.matchMedia('(max-width: 768px)').matches) toggleSidebar();
    }
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const el = document.activeElement;
      const typing = el && (el.tagName === 'TEXTAREA' || el.isContentEditable ||
        (el.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|reset)$/i.test(el.type)));
      if (!typing) {
        e.preventDefault();
        if (!sidebarOpen) toggleSidebar();
        document.getElementById('searchInput').focus();
      }
    }
  });
  document.getElementById('searchInput').addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && this.value) {
      e.stopPropagation();
      clearSearch();
    }
  });
}

/* KPI definition popovers: toggled by their "?" button; Escape or a click elsewhere closes */
function closeKpiHelp(refocus) {
  const open = document.querySelector('.kpi-help[aria-expanded="true"]');
  if (!open) return false;
  open.setAttribute('aria-expanded', 'false');
  document.getElementById(open.getAttribute('aria-controls')).hidden = true;
  if (refocus) open.focus();
  return true;
}

function wireKpiHelp() {
  document.getElementById('kpiBacklogHelp').textContent =
    'Firm contracts only: days remaining after ' + DATA_AS_OF_LABEL + ' × day rate, including follow-on contracts and rate steps. ' +
    'Rigs without a disclosed rate add nothing; options, LOIs and conditional awards are left out.';
  document.addEventListener('click', function (e) {
    const btn = e.target.closest('.kpi-help');
    const wasOpen = btn && btn.getAttribute('aria-expanded') === 'true';
    if (!btn && e.target.closest('.kpi-help-text')) return;
    closeKpiHelp(false);
    if (btn && !wasOpen) {
      btn.setAttribute('aria-expanded', 'true');
      document.getElementById(btn.getAttribute('aria-controls')).hidden = false;
    }
  });
}

function clearSearch() {
  const input = document.getElementById('searchInput');
  input.value = '';
  applyFilters();
  input.focus();
}

/* Footer text and scope line come from the data, so a refresh needs no manual edits */
function renderFooter() {
  const contractors = new Set(RIG_DATA.map(r => r.contractor)).size;
  const fresh = RIG_DATA.filter(r => !r.derived.sourceStale).length;
  document.getElementById('footerAsOf').textContent = 'Data as of ' + DATA_AS_OF_LABEL +
    ' · ' + fresh + ' of ' + RIG_DATA.length + ' rigs sourced in the prior ' + Math.round(STALE_SOURCE_DAYS / 30) + ' months';
  document.getElementById('footerScope').textContent = 'A curated set of ' + RIG_DATA.length + ' rigs across ' +
    contractors + ' contractors, not complete fleets';
}

function renderStaleBanner() {
  const days = Math.floor((Date.now() - AS_OF) / DAY_MS);
  const el = document.getElementById('staleBanner');
  if (!el || days <= STALE_DATA_DAYS) return;
  el.textContent = 'This data was last checked on ' + DATA_AS_OF_LABEL + ' (' + days + ' days ago). ' +
    'Statuses, time left and backlog are shown as of that date.';
  el.hidden = false;
}

/* ============================================
   THEME
   ============================================ */
const THEME_KEY = 'drilltracker-theme';
const THEME_ICONS = {
  dark: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>',
  light: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>'
};

function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

/* Everything theme-dependent is a CSS variable, so switching needs no re-render,
   apart from the canvas basemap, which is restyled once */
function initTheme() {
  const toggle = document.querySelector('[data-theme-toggle]');
  const root = document.documentElement;
  if (!toggle) return;

  function syncTheme(theme) {
    toggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    toggle.innerHTML = THEME_ICONS[theme];
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0a1628' : '#eef0f5');
  }

  syncTheme(currentTheme());
  toggle.addEventListener('click', function () {
    const theme = currentTheme() === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
    syncTheme(theme);
    if (basemapLayer) basemapLayer.setStyle(basemapStyle());
  });
}

/* ============================================
   BASEMAP — bundled Natural Earth outline (basemap.js), drawn as vectors.
   No tile provider and no API key; colours come from the theme's CSS variables.
   ============================================ */
const MAP_MAX_ZOOM = 8; // the 1:50m outline looks coarse beyond regional zoom

/* Seas and basins that matter for offshore drilling: n = name, p = [lng, lat], z = lowest zoom shown */
const SEA_LABELS = [
  { n: 'North Atlantic Ocean', p: [-42, 33], z: 2 },
  { n: 'South Atlantic Ocean', p: [-14, -27], z: 2 },
  { n: 'North Pacific Ocean', p: [-150, 30], z: 2 },
  { n: 'South Pacific Ocean', p: [-125, -27], z: 2 },
  { n: 'Indian Ocean', p: [78, -24], z: 2 },
  { n: 'Gulf of Mexico', p: [-90.5, 25.3], z: 3 },
  { n: 'Caribbean Sea', p: [-75, 15], z: 4 },
  { n: 'North Sea', p: [3, 56.5], z: 4 },
  { n: 'Norwegian Sea', p: [3, 67.5], z: 4 },
  { n: 'Barents Sea', p: [38, 74], z: 4 },
  { n: 'Mediterranean Sea', p: [18.5, 34.8], z: 4 },
  { n: 'Gulf of Guinea', p: [2, 1.5], z: 4 },
  { n: 'Arabian Sea', p: [64, 16], z: 4 },
  { n: 'Bay of Bengal', p: [89, 14], z: 4 },
  { n: 'South China Sea', p: [114, 13.5], z: 4 },
  { n: 'Black Sea', p: [34, 43.3], z: 5 },
  { n: 'Caspian Sea', p: [50.6, 41.5], z: 5 },
  { n: 'Red Sea', p: [38, 20.5], z: 5 },
  { n: 'Timor Sea', p: [127, -11.5], z: 5 },
  { n: 'Gulf of Thailand', p: [101.3, 9.8], z: 6 },
  { n: 'Andaman Sea', p: [96, 11], z: 6 },
  { n: 'Java Sea', p: [112, -5], z: 6 },
  { n: 'Bass Strait', p: [146, -39.8], z: 6 }
];

/* A ring is stored as [lng0, lat0, dLng, dLat, ...] in hundredths of a degree */
function decodeRing(a) {
  const ring = [];
  let x = 0, y = 0;
  for (let i = 0; i < a.length; i += 2) {
    x += a[i]; y += a[i + 1];
    ring.push([x / 100, y / 100]);
  }
  return ring;
}

/* The outline is drawn on a canvas, not as SVG: ~95,000 points as SVG paths made the
   browser repaint a huge vector layer on every zoom and pan. Canvas cannot read CSS
   classes, so the colours come from the theme's variables and are reapplied on a theme change. */
function basemapStyle() {
  const css = getComputedStyle(document.documentElement);
  return { fillColor: css.getPropertyValue('--map-land').trim(), fillOpacity: 1,
           color: css.getPropertyValue('--map-border').trim(), weight: 0.6, opacity: 1 };
}

function makeBasemapLayer() {
  const features = BASEMAP.countries.map(function (c) {
    return { type: 'Feature', properties: {},
             geometry: { type: 'MultiPolygon', coordinates: c.g.map(r => [decodeRing(r)]) } };
  });
  return L.geoJSON(features, {
    interactive: false,
    renderer: L.canvas({ padding: 0.25 }),
    smoothFactor: 2, // simplify outlines to ~2px at the current zoom while drawing
    style: basemapStyle
  });
}

/* Label markers are made once; each zoom only shows or hides them. Seas come first,
   then countries in Natural Earth's order of importance, and a label that would
   overlap one already placed is hidden. */
function buildMapLabels() {
  const countries = typeof BASEMAP !== 'undefined' ? BASEMAP.countries : [];
  mapLabels = SEA_LABELS.map(l => ({ n: l.n, p: l.p, z: l.z, sea: true }))
    .concat(countries.map(c => ({ n: c.n, p: c.p, z: c.z + 0.5, sea: false }))) // a little sparser than Natural Earth suggests
    .sort((a, b) => (a.z - b.z) || (b.sea - a.sea))
    .map(function (l) {
      const w = l.n.length * 7.5 + 10, h = 16;
      const latlng = L.latLng(l.p[1], l.p[0]);
      return { z: l.z, w: w, h: h, latlng: latlng, marker: L.marker(latlng, {
        pane: 'labels', interactive: false, keyboard: false,
        icon: L.divIcon({ className: 'map-label' + (l.sea ? ' map-label-sea' : ''), html: escapeHtml(l.n), iconSize: [w, h] })
      }) };
    });
}

function updateMapLabels() {
  const zoom = map.getZoom();
  const placed = [];
  mapLabels.forEach(function (l) {
    let show = l.z <= zoom;
    if (show) {
      const pt = map.project(l.latlng, zoom);
      const box = [pt.x - l.w / 2, pt.y - l.h / 2, pt.x + l.w / 2, pt.y + l.h / 2];
      show = !placed.some(b => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1]);
      if (show) placed.push(box);
    }
    const on = labelLayer.hasLayer(l.marker);
    if (show && !on) labelLayer.addLayer(l.marker);
    else if (!show && on) labelLayer.removeLayer(l.marker);
  });
}

/* Continuous zoom for the mouse wheel and trackpad (two-finger scroll, or pinch, which
   the browser reports as a wheel event with ctrlKey). Leaflet's own wheel handler waits
   40 ms, then animates to the next zoom step and ignores input until it lands, so a
   trackpad gesture zooms in notches. This follows the gesture every frame around the
   cursor, the way Leaflet's touch pinch-zoom does (map._moveStart, _move, _moveEnd),
   and fires zoomend once, when the gesture stops, so clusters and labels update then.
   Those are internal Leaflet methods: re-check this if Leaflet is upgraded from 1.9.4. */
const WHEEL_ZOOM_RATE = 1 / 300;  // zoom levels per pixel of scroll
const PINCH_ZOOM_RATE = 1 / 100;  // pinch reports smaller deltas
const WHEEL_EASE = 0.45;          // share of the remaining distance covered each frame
const WHEEL_END_MS = 150;         // a pause this long ends the gesture

function smoothWheelZoom(map) {
  const container = map.getContainer();
  let active = false, target = 0, anchorPoint = null, anchorLatLng = null;
  let frame = null, endTimer = null, ending = false;

  container.addEventListener('wheel', function (e) {
    e.preventDefault();
    const px = e.deltaY * (e.deltaMode === 1 ? 20 : e.deltaMode === 2 ? 400 : 1);
    if (!px) return;
    if (!active) {
      map._stop();
      map._moveStart(true, false);
      active = true;
      target = map.getZoom();
    }
    target = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(),
      target - px * (e.ctrlKey ? PINCH_ZOOM_RATE : WHEEL_ZOOM_RATE)));
    anchorPoint = map.mouseEventToContainerPoint(e);
    anchorLatLng = map.containerPointToLatLng(anchorPoint);
    ending = false;
    clearTimeout(endTimer);
    endTimer = setTimeout(function () { ending = true; if (!frame) finish(); }, WHEEL_END_MS);
    if (!frame) frame = requestAnimationFrame(step);
  }, { passive: false });

  function step() {
    frame = null;
    const zoom = map.getZoom();
    let next = zoom + (target - zoom) * WHEEL_EASE;
    if (Math.abs(target - next) < 0.002) next = target;
    // keep the point under the cursor fixed while zooming
    const offset = anchorPoint.subtract(map.getSize().divideBy(2));
    let center = map.unproject(map.project(anchorLatLng, next).subtract(offset), next);
    if (map.options.maxBounds) center = map._limitCenter(center, next, map.options.maxBounds);
    map._move(center, next, { pinch: true, round: false });
    if (next !== target) frame = requestAnimationFrame(step);
    else if (ending) finish();
  }

  function finish() {
    if (!active) return;
    active = false;
    ending = false;
    map._moveEnd(true);
  }
}

/* If Leaflet did not load (CDN blocked, offline), say so and keep the list and insights working */
function initMap() {
  if (!window.L) {
    const el = document.getElementById('map');
    el.classList.add('map-unavailable');
    el.innerHTML = '<p><strong>Map unavailable.</strong> The mapping library could not be loaded. ' +
      'The List and Insights views still work.</p>';
    document.getElementById('mapLegend').hidden = true;
    return;
  }
  map = L.map('map', {
    // a phone is narrower than the world at zoom 2, so let it zoom out far enough to show every rig
    center: [15, 0], zoom: 3, minZoom: document.getElementById('map').clientWidth < 700 ? 1 : 2, maxZoom: MAP_MAX_ZOOM,
    // continuous zoom: smoothWheelZoom (below) replaces Leaflet's stepped wheel zoom
    zoomSnap: 0, scrollWheelZoom: false,
    maxBounds: [[-62, -180], [85, 180]], maxBoundsViscosity: 1,
    zoomControl: true, attributionControl: true
  });
  if (typeof BASEMAP !== 'undefined') {
    map.attributionControl.addAttribution('Map data: <a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener">Natural Earth</a>');
    basemapLayer = makeBasemapLayer().addTo(map);
  }

  smoothWheelZoom(map);

  // labels sit above the land but below the rig markers
  map.createPane('labels').style.zIndex = 450;
  map.getPane('labels').style.pointerEvents = 'none';
  labelLayer = L.layerGroup().addTo(map);
  buildMapLabels();
  map.on('zoomend', updateMapLabels);
  updateMapLabels();

  markerLayer = L.markerClusterGroup ? L.markerClusterGroup({
    maxClusterRadius: 50,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true,
    iconCreateFunction: clusterIcon
  }) : L.layerGroup();
  map.addLayer(markerLayer);
  new FitControl().addTo(map);

  // Enter or Space on a focused rig marker opens it (Leaflet only handles clicks)
  map.getContainer().addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const icon = e.target.closest && e.target.closest('.leaflet-marker-icon');
    const node = icon && icon.querySelector('[data-rig-id]');
    if (!node) return;
    e.preventDefault();
    openDetail(RIG_BY_ID[node.dataset.rigId]);
  });
}

/* Zoom to the rigs currently shown; the default world view leaves some regions off-screen */
function fitToRigs(animate) {
  if (!map || !filteredRigs.length) return;
  const bounds = L.latLngBounds(filteredRigs.map(r => [r.lat, r.lng]));
  // keep markers clear of the zoom controls, the filter pill and the map key
  const legend = document.getElementById('mapLegend');
  const legendW = legend && !legend.hidden && !legend.classList.contains('collapsed') && map.getSize().x > 600 ? legend.offsetWidth + 24 : 0;
  const pill = !document.getElementById('filterPill').hidden;
  map.fitBounds(bounds, { paddingTopLeft: [64, pill ? 72 : 32], paddingBottomRight: [Math.max(32, legendW), 32],
                          maxZoom: 6, animate: animate && !prefersReduced });
}

const FitControl = window.L ? L.Control.extend({
  options: { position: 'topleft' },
  onAdd: function () {
    const bar = L.DomUtil.create('div', 'leaflet-bar fit-control');
    const btn = L.DomUtil.create('a', '', bar);
    btn.href = '#';
    btn.setAttribute('role', 'button');
    btn.title = 'Zoom to the rigs shown';
    btn.setAttribute('aria-label', 'Zoom to the rigs shown');
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
    L.DomEvent.disableClickPropagation(bar);
    L.DomEvent.on(btn, 'click', function (e) { L.DomEvent.preventDefault(e); fitToRigs(true); });
    return bar;
  }
}) : null;

function rigCategory(rig) {
  if (colorMode === 'contractor') return rig.contractor;
  const d = rig.derived;
  return d.available ? 'open' : d.nearTerm ? 'near' : 'booked';
}

function categoryColor(cat) {
  return colorMode === 'contractor' ? getContractorColor(cat) : 'var(--avail-' + cat + ')';
}

/* Hover and keyboard-focus card for a marker; built with textContent */
function markerTip(rig) {
  const d = rig.derived;
  const el = document.createElement('div');
  const add = (tag, cls, text) => { const n = document.createElement(tag); n.className = cls; n.textContent = text; el.appendChild(n); return n; };
  add('strong', 'rig-tip-name', rig.name);
  add('div', 'rig-tip-line', rig.contractor + ' · ' + (rig.type === 'Semisubmersible' ? 'Semisub' : rig.type));
  add('div', 'rig-tip-line', d.status + ' · ' + (d.available ? d.bookedToLabel : 'booked to ' + d.bookedToLabel));
  if (d.customer) add('div', 'rig-tip-line rig-tip-muted', d.customer + (d.dayRate != null ? ' · ' + fmtRate(d.dayRate) + '/day' : ''));
  return el;
}

function createMarkers(rigs) {
  if (!map) return;
  markerLayer.clearLayers();
  for (const k in markersById) delete markersById[k];
  const batch = [];

  rigs.forEach(function (rig) {
    const color = categoryColor(rigCategory(rig));
    const size = TYPE_SIZES[rig.type] || 8;
    const cls = 'rig-marker' + (rig.position !== 'area' ? ' rig-marker--reported' : '') +
      (rig.id === selectedRigId ? ' selected' : '');
    const icon = L.divIcon({
      className: '',
      html: '<div class="' + cls + '" data-rig-id="' + escapeHtml(rig.id) + '" style="width:' + (size * 2) + 'px;height:' + (size * 2) +
            'px;background:' + color + '"></div>',
      iconSize: [size * 2, size * 2],
      iconAnchor: [size, size]
    });
    const marker = L.marker([rig.lat, rig.lng], { icon: icon, keyboard: true, rigId: rig.id });
    marker.bindTooltip(markerTip(rig), { direction: 'top', offset: [0, -size - 2], className: 'rig-tip', opacity: 1 });
    marker.on('click', function () { openDetail(rig); });
    marker.on('add', function () {
      const el = marker.getElement();
      if (el) el.setAttribute('aria-label', rig.name + ', ' + rig.contractor + ', ' + rig.derived.status + '. Show details.');
    });
    markersById[rig.id] = marker;
    batch.push(marker);
  });
  if (markerLayer.addLayers) markerLayer.addLayers(batch);
  else batch.forEach(m => markerLayer.addLayer(m));
}

/* A cluster is a neutral disc with its count; the ring shows what is inside, in the current colours */
function clusterIcon(cluster) {
  const kids = cluster.getAllChildMarkers(), n = kids.length;
  const counts = {};
  kids.forEach(function (m) { const r = RIG_BY_ID[m.options.rigId]; if (r) { const c = rigCategory(r); counts[c] = (counts[c] || 0) + 1; } });
  const order = colorMode === 'contractor' ? Object.keys(counts).sort() : Object.keys(AVAILABILITY).filter(k => counts[k]);
  let at = 0;
  const stops = order.map(function (c) {
    const from = at; at += counts[c] / n * 100;
    return categoryColor(c) + ' ' + from.toFixed(2) + '% ' + at.toFixed(2) + '%';
  }).join(', ');
  const px = n < 10 ? 34 : n < 30 ? 40 : 46;
  const summary = order.map(c => counts[c] + ' ' + (colorMode === 'contractor' ? c : AVAILABILITY[c].toLowerCase())).join(', ');
  return L.divIcon({
    html: '<div class="rig-cluster-ring" style="background:conic-gradient(' + stops + ')" aria-label="' +
          escapeHtml(plural(n, 'rig') + ': ' + summary + '. Zoom in.') + '"><span>' + n + '</span></div>',
    className: 'rig-cluster', iconSize: L.point(px, px)
  });
}

function setColorMode(mode) {
  if (mode !== 'availability' && mode !== 'contractor') mode = 'availability';
  colorMode = mode;
  document.querySelectorAll('[data-action="color-mode"]').forEach(function (b) {
    b.setAttribute('aria-pressed', b.dataset.mode === mode ? 'true' : 'false');
  });
  createMarkers(filteredRigs);
  buildLegend();
  writeHash();
}

/* ============================================
   FILTERS — faceted: nothing ticked in a group means no filter on it; ticking
   narrows. Options in a group combine with OR, groups with AND. Each option's
   count is how many rigs it would show given the other groups and the search,
   and options that would show none are disabled, so no combination is a dead end.
   ============================================ */
const SEARCH_TEXT = new Map();
function searchText(rig) {
  if (!SEARCH_TEXT.has(rig.id)) {
    SEARCH_TEXT.set(rig.id, [rig.name, rig.contractor, rig.owner, rig.region, rig.country, rig.type, rig.derived.status, classLabel(rig), rig.note]
      .concat(rig.contracts.map(k => (k.customer || '') + ' ' + (k.note || '')))
      .join(' ').toLowerCase());
  }
  return SEARCH_TEXT.get(rig.id);
}

/* selections: { groupKey: [values] }; a missing or empty list means no filter.
   skipKey leaves one group out, which is how an option's count is worked out. */
function rigMatches(rig, selections, search, skipKey) {
  if (search && !searchText(rig).includes(search)) return false;
  return FILTER_GROUPS.every(function (g) {
    const on = selections[g.key];
    return g.key === skipKey || !on || !on.length || on.includes(g.get(rig));
  });
}

function facetCounts(rigs, selections, search) {
  const out = {};
  FILTER_GROUPS.forEach(function (g) {
    const counts = {};
    rigs.forEach(function (r) {
      if (rigMatches(r, selections, search, g.key)) { const v = g.get(r); counts[v] = (counts[v] || 0) + 1; }
    });
    out[g.key] = counts;
  });
  return out;
}

function buildFilters() {
  FILTER_GROUPS.forEach(function (g) {
    const values = [...new Set(RIG_DATA.map(g.get))].sort(function (a, b) {
      if (g.order) return g.order.indexOf(a) - g.order.indexOf(b);
      if (a === NO_COUNTRY || b === NO_COUNTRY) return a === NO_COUNTRY ? 1 : -1;
      return a.localeCompare(b);
    });
    buildCheckboxGroup(g, values);
  });
}

function buildCheckboxGroup(group, items) {
  const container = document.getElementById(group.id);
  container.innerHTML = '';
  items.forEach(function (item) {
    const label = document.createElement('label');
    label.className = 'filter-checkbox';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = item;
    cb.addEventListener('change', applyFilters);
    label.appendChild(cb);

    if (group.color) {
      const dot = document.createElement('span');
      dot.className = 'filter-color-dot';
      dot.style.background = getContractorColor(item);
      dot.setAttribute('aria-hidden', 'true');
      label.appendChild(dot);
    }

    const textSpan = document.createElement('span');
    textSpan.className = 'filter-checkbox-text';
    textSpan.textContent = item;
    textSpan.title = item;
    label.appendChild(textSpan);

    const cnt = document.createElement('span');
    cnt.className = 'filter-opt-count';
    label.appendChild(cnt);
    container.appendChild(label);
  });
}

function getCheckedValues(containerId) {
  return [...document.getElementById(containerId).querySelectorAll('input:checked')].map(cb => cb.value);
}

function getSelections() {
  const sel = {};
  FILTER_GROUPS.forEach(function (g) { sel[g.key] = getCheckedValues(g.id); });
  return sel;
}

function getSearch() {
  return document.getElementById('searchInput').value.toLowerCase().trim();
}

/* Counts and disabled state follow the other groups and the search. A ticked option
   stays enabled even at zero, so it can always be unticked. */
function updateFacets(selections, search) {
  const counts = facetCounts(RIG_DATA, selections, search);
  FILTER_GROUPS.forEach(function (g) {
    document.getElementById(g.id).querySelectorAll('.filter-checkbox').forEach(function (label) {
      const cb = label.querySelector('input');
      const n = counts[g.key][cb.value] || 0;
      cb.disabled = n === 0 && !cb.checked;
      label.classList.toggle('is-empty', n === 0);
      label.querySelector('.filter-opt-count').innerHTML = n + '<span class="sr-only"> ' + (n === 1 ? 'rig' : 'rigs') + '</span>';
    });
  });
}

function applyFilters() {
  const search = getSearch();
  document.getElementById('searchClear').hidden = !search;
  const selections = getSelections();
  filteredRigs = RIG_DATA.filter(r => rigMatches(r, selections, search));

  // a detail panel for a rig that is no longer shown would describe something off the map
  if (selectedRigId && !filteredRigs.some(r => r.id === selectedRigId)) closeDetail(false);

  applySort();
  createMarkers(filteredRigs);
  // if the filter leaves nothing in view, bring the matching rigs into view
  if (map && currentView === 'map' && filteredRigs.length &&
      !filteredRigs.some(r => map.getBounds().contains([r.lat, r.lng]))) fitToRigs(true);
  updateFacets(selections, search);
  updateKPIs(filteredRigs);
  updateFilterCount(filteredRigs.length);
  renderActiveFilters(selections);
  updateCountrySummary(selections);
  buildLegend();
  renderEmptyState(filteredRigs.length === 0, search);
  if (currentView === 'list') renderListView();
  if (currentView === 'insights') renderInsights();
  writeHash();
}

/* Chips for each active filter and the search, each removable, plus "Clear all";
   the same summary shows as a pill over the map, where the sidebar may be closed. */
function renderActiveFilters(selections) {
  const q = document.getElementById('searchInput').value.trim();
  const chips = [];
  if (q) chips.push('<button type="button" class="filter-chip" data-action="remove-search" aria-label="Remove search ' + escapeHtml(q) + '">“' + escapeHtml(q) + '” <span aria-hidden="true">×</span></button>');
  FILTER_GROUPS.forEach(function (g) {
    selections[g.key].forEach(function (v) {
      chips.push('<button type="button" class="filter-chip" data-action="remove-filter" data-group="' + escapeHtml(g.id) + '" data-value="' + escapeHtml(v) +
        '" aria-label="Remove filter ' + escapeHtml(v) + '">' + escapeHtml(v) + ' <span aria-hidden="true">×</span></button>');
    });
  });
  const active = chips.length > 0;
  const box = document.getElementById('activeFilters');
  box.hidden = !active;
  box.querySelector('.filter-chips').innerHTML = chips.join('');
  document.getElementById('clearAllFilters').hidden = !active;

  const pill = document.getElementById('filterPill');
  pill.hidden = !active || !filteredRigs.length;
  document.getElementById('filterPillText').textContent = 'Showing ' + filteredRigs.length + ' of ' + RIG_DATA.length + ' rigs';
}

function removeFilter(groupId, value) {
  const cb = [...document.getElementById(groupId).querySelectorAll('input')].find(c => c.value === value);
  if (cb) cb.checked = false;
  applyFilters();
}

function resetFilters() {
  document.getElementById('searchInput').value = '';
  document.querySelectorAll('.filter-body input[type="checkbox"]').forEach(cb => { cb.checked = false; });
  applyFilters();
}

function updateCountrySummary(selections) {
  const n = selections.country.length;
  document.getElementById('countrySummary').textContent = n ? n + ' selected' : '';
  if (n) document.getElementById('countrySection').open = true;
}

function updateFilterCount(count) {
  document.getElementById('filterCount').textContent = count + ' of ' + RIG_DATA.length + ' rigs';
}

/* With facets the only way to reach zero is the search, so say so */
function renderEmptyState(isEmpty, search) {
  document.getElementById('emptyState').hidden = !isEmpty;
  if (isEmpty) document.getElementById('emptyTitle').textContent = search
    ? 'No rigs match “' + document.getElementById('searchInput').value.trim() + '”' + (FILTER_GROUPS.some(g => getCheckedValues(g.id).length) ? ' with these filters' : '')
    : 'No rigs match your filters';
}

/* ============================================
   URL STATE — view, search, filters, sort and the open rig live in the hash,
   so a view can be shared: #view=list&region=South+America&type=Drillship
   A filter lists the values shown; no entry means no filter.
   ============================================ */
function stateToHash() {
  const p = new URLSearchParams();
  if (currentView !== 'map') p.set('view', currentView);
  const q = document.getElementById('searchInput').value.trim();
  if (q) p.set('q', q);
  FILTER_GROUPS.forEach(function (g) {
    const on = getCheckedValues(g.id);
    if (on.length) p.set(g.key, on.join(','));
  });
  if (colorMode !== 'availability') p.set('color', colorMode);
  if (currentSort.field !== 'name' || !currentSort.asc) p.set('sort', (currentSort.asc ? '' : '-') + currentSort.field);
  if (selectedRigId) p.set('rig', selectedRigId);
  return p.toString().replace(/%2C/g, ',');
}

function writeHash() {
  const hash = stateToHash();
  const url = location.pathname + location.search + (hash ? '#' + hash : '');
  if (url !== location.pathname + location.search + location.hash) history.replaceState(null, '', url);
}

function readHash() {
  const p = new URLSearchParams(location.hash.replace(/^#/, ''));
  document.getElementById('searchInput').value = p.get('q') || '';
  FILTER_GROUPS.forEach(function (g) {
    const raw = p.get(g.key);
    const wanted = raw && raw !== '-' ? raw.split(',') : []; // "-" came from older links and meant none
    document.getElementById(g.id).querySelectorAll('input').forEach(function (cb) {
      cb.checked = wanted.includes(cb.value);
    });
  });
  const mode = p.get('color') === 'contractor' ? 'contractor' : 'availability';
  if (mode !== colorMode) {
    colorMode = mode;
    document.querySelectorAll('[data-action="color-mode"]').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === mode ? 'true' : 'false'));
  }
  const sort = p.get('sort');
  if (sort) currentSort = { field: sort.replace(/^-/, ''), asc: sort[0] !== '-' };
  else currentSort = { field: 'name', asc: true };
  const view = p.get('view');
  setView(view === 'list' || view === 'insights' ? view : 'map', true);
  return p.get('rig'); // opened after the filters are applied (applying them rewrites the hash)
}

function openRigFromHash(id) {
  if (id && id !== selectedRigId && filteredRigs.some(r => r.id === id)) {
    if (currentView === 'map') focusRig(id); else openDetail(RIG_BY_ID[id]);
  }
  else if (!id && selectedRigId) closeDetail(false);
}

/* ============================================
   KPIs
   ============================================ */
function updateKPIs(rigs) {
  const floaters = rigs.filter(r => r.type !== 'Jackup');
  const rated = floaters.filter(r => r.derived.dayRate != null);
  const avgRate = rated.length ? Math.round(rated.reduce((s, r) => s + r.derived.dayRate, 0) / rated.length) : null;

  const working = rigs.filter(r => r.derived.status === 'Working').length;
  const committed = rigs.filter(r => r.derived.status === 'Committed').length;
  const share = rigs.length ? Math.round((working + committed) / rigs.length * 100) : null;

  const backlogRigs = rigs.filter(r => r.derived.backlog > 0);
  const backlog = backlogRigs.reduce((s, r) => s + r.derived.backlog, 0);

  animateValue('kpiRigs', rigs.length, 'int');
  animateValue('kpiUtil', share, 'percent');
  animateValue('kpiRate', avgRate, 'currency');
  animateValue('kpiBacklog', backlog > 0 ? backlog : null, 'compact');
  animateValue('kpiContractors', new Set(rigs.map(r => r.contractor)).size, 'int');
  animateValue('kpiRegions', new Set(rigs.map(r => r.region)).size, 'int');

  document.getElementById('kpiUtilNote').textContent = rigs.length ? working + ' working · ' + committed + ' not started' : '';
  const rateNote = document.getElementById('kpiRateNote');
  rateNote.textContent = floaters.length ? rated.length + ' of ' + floaters.length + ' disclosed' : 'no floaters shown';
  // with only a handful of rates the average says little; make the count the thing you read
  rateNote.classList.toggle('kpi-note--warn', rated.length > 0 && rated.length < 5);
  document.getElementById('kpiBacklogNote').textContent = backlogRigs.length + ' of ' + rigs.length + ' rigs';
}

function fmtValue(val, fmt) {
  if (val == null) return '—';
  if (fmt === 'currency') return '$' + Math.round(val).toLocaleString('en-US');
  if (fmt === 'percent') return Math.round(val) + '%';
  if (fmt === 'compact') {
    if (val >= 1e9) return '$' + (val / 1e9).toFixed(1) + 'B';
    if (val >= 1e6) return '$' + Math.round(val / 1e6) + 'M';
    if (val >= 1e3) return '$' + Math.round(val / 1e3) + 'K';
    return '$' + Math.round(val);
  }
  return Math.round(val).toLocaleString('en-US');
}

/* One animation per element: a new value cancels the one still running */
function animateValue(id, target, fmt) {
  const el = document.getElementById(id);
  if (!el) return;
  cancelAnimationFrame(kpiFrames[id]);
  if (target == null) { el.dataset.current = '0'; el.textContent = '—'; return; }
  if (prefersReduced) { el.dataset.current = target; el.textContent = fmtValue(target, fmt); return; }

  let current = parseFloat(el.dataset.current || '0');
  if (isNaN(current)) current = 0;
  el.dataset.current = target;
  const duration = 600, start = performance.now(), startVal = current;

  function step(ts) {
    // the frame timestamp can precede start; clamp so the first frame cannot overshoot
    const progress = Math.max(0, Math.min((ts - start) / duration, 1));
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = fmtValue(startVal + (target - startVal) * eased, fmt);
    if (progress < 1) kpiFrames[id] = requestAnimationFrame(step);
  }
  kpiFrames[id] = requestAnimationFrame(step);
}

/* ============================================
   MAP LEGEND
   ============================================ */
function buildLegend() {
  const counts = {};
  filteredRigs.forEach(r => { const c = rigCategory(r); counts[c] = (counts[c] || 0) + 1; });
  const keys = colorMode === 'contractor' ? Object.keys(counts).sort() : Object.keys(AVAILABILITY);
  const rows = keys.map(c =>
    '<div class="legend-row' + (counts[c] ? '' : ' legend-row--zero') + '"><span class="legend-dot" style="background:' + categoryColor(c) + '"></span>' +
    '<span class="legend-label">' + escapeHtml(colorMode === 'contractor' ? c : AVAILABILITY[c]) + '</span>' +
    '<span class="legend-count">' + (counts[c] || 0) + '</span></div>').join('');
  document.querySelector('#mapLegend .legend-body').innerHTML = filteredRigs.length ? rows :
    '<div class="legend-row legend-empty">No rigs shown</div>';
}

function toggleLegend() {
  const collapsed = document.getElementById('mapLegend').classList.toggle('collapsed');
  const btn = document.querySelector('.legend-toggle');
  btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  btn.setAttribute('aria-label', collapsed ? 'Expand the map key' : 'Collapse the map key');
}

/* ============================================
   DETAIL PANEL
   ============================================ */
function firmTag(firmness) {
  return '<span class="firm-tag firm-tag--' + escapeHtml(firmness) + '">' + escapeHtml(FIRMNESS[firmness] || firmness) + '</span>';
}

function contractsTable(rig) {
  const d = rig.derived;
  if (!d.contracts.length) return '<div class="contract-none">No current or announced contracts</div>';
  const rows = d.contracts.map(function (x) {
    const past = x.e && x.e < AS_OF;
    const cls = x === d.current ? ' class="is-current"' : past ? ' class="is-past"' : '';
    return '<tr' + cls + '>' +
      '<td class="mono-cell period-cell"><span>' + escapeHtml(x.k.start || '?') + ' –</span> <span>' + escapeHtml(x.k.end || 'undisclosed') + '</span></td>' +
      '<td>' + escapeHtml(x.k.customer || 'Undisclosed') +
        (x.k.note ? '<div class="contract-note">' + escapeHtml(x.k.note) + '</div>' : '') + '</td>' +
      '<td class="mono-cell">' + (x.k.dayRate != null ? fmtRateShort(x.k.dayRate) : '—') + '</td>' +
      '<td>' + firmTag(x.k.firmness) + '</td></tr>';
  }).join('');
  return '<table class="contracts-table"><caption class="sr-only">Contracts for ' + escapeHtml(rig.name) + '</caption>' +
    '<thead><tr><th scope="col">Period</th><th scope="col">Customer</th><th scope="col">Rate</th><th scope="col">Terms</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table>';
}

/* The rig's current and upcoming contracts on one strip, so follow-on work and gaps show.
   A contract with no published end is drawn fading out over six months. */
function runwayBlock(rig) {
  const d = rig.derived;
  const ahead = d.contracts.filter(x => x.s && (!x.e || x.e >= AS_OF));
  if (!ahead.length) return '';
  const endOf = x => x.e || addMonths(x.s, 6);
  const t0 = Math.min(AS_OF.getTime(), ...ahead.map(x => x.s.getTime()));
  const t1 = Math.max(addMonths(AS_OF, 3).getTime(), ...ahead.map(x => endOf(x).getTime()));
  const pos = t => Math.round((t - t0) / (t1 - t0) * 1000) / 10;
  const last = ahead.reduce((a, b) => (endOf(b) >= endOf(a) ? b : a));
  // options first, so awarded work draws on top where they overlap
  const segs = ahead.slice().sort((a, b) => (b.k.firmness === 'option') - (a.k.firmness === 'option')).map(function (x) {
    const l = pos(x.s.getTime()), w = Math.max(1, pos(endOf(x).getTime()) - l);
    const label = (x.k.customer || 'Undisclosed') + ' · ' + (x.k.start || '?') + ' – ' + (x.k.end || 'end undisclosed') +
      (x.k.dayRate != null ? ' · ' + fmtRateShort(x.k.dayRate) + '/day' : '') + ' · ' + FIRMNESS[x.k.firmness];
    return '<span class="gantt-bar gantt-bar--' + escapeHtml(x.k.firmness) + (x.e ? '' : ' gantt-bar--open') +
'" style="left:' + l + '%;width:' + w + '%" title="' + escapeHtml(label) + '"></span>';
  }).join('');
  const nowAt = pos(AS_OF.getTime());

  let status = '';
  if (d.shown) {
    const ci = contractInfo(d.shown.k.start, d.shown.k.end);
    if (!ci.has) status = d.current ? 'Current contract has no published end' : 'Next contract from ' + d.shown.k.start;
    else if (!d.current) status = ci.start <= AS_OF ? 'Next contract due to start' : 'Next contract s' + ci.remaining.slice(1);
    else status = ci.remaining + ' on the current contract';
  }
  const kinds = Object.keys(FIRMNESS).filter(f => ahead.some(x => x.k.firmness === f));
  return '<h3 class="detail-section-title">Contract timeline</h3>' +
    '<div class="runway">' +
      '<div class="runway-track" aria-hidden="true">' + segs +
        (nowAt > 0 ? '<span class="runway-now" style="left:' + nowAt + '%"></span>' : '') + '</div>' +
      '<div class="runway-labels"><span>' + escapeHtml(ahead[0].k.start || '') + '</span>' +
        '<span>' + escapeHtml(last.k.end || 'open') + '</span></div>' +
      '<div class="runway-status">' + escapeHtml(status) + '</div>' +
      '<div class="runway-key" aria-hidden="true">' + kinds.map(f => '<span><i class="gantt-bar gantt-bar--' + f + '"></i>' + escapeHtml(FIRMNESS[f]) + '</span>').join('') +
        '<span><i class="runway-now-key"></i>Today</span></div>' +
    '</div>';
}

/* Step through the rigs in the list's order without closing the panel */
function stepDetail(step) {
  const i = filteredRigs.findIndex(r => r.id === selectedRigId);
  const rig = filteredRigs[i + step];
  if (!rig) return;
  const row = document.querySelector('.list-row[data-rig-id="' + rig.id + '"] .row-link');
  openDetail(rig, row, { keepFocus: true });
  // at either end of the list the pressed button disables itself; keep focus in the footer
  const btn = document.getElementById(step < 0 ? 'detailPrev' : 'detailNext');
  if (btn.disabled) document.getElementById(step < 0 ? 'detailNext' : 'detailPrev').focus();
}

function updateDetailStepper() {
  const foot = document.getElementById('detailFooter');
  const i = filteredRigs.findIndex(r => r.id === selectedRigId);
  foot.hidden = currentView !== 'list' || i < 0 || filteredRigs.length < 2;
  if (foot.hidden) return;
  const prev = filteredRigs[i - 1], next = filteredRigs[i + 1];
  const pb = document.getElementById('detailPrev'), nb = document.getElementById('detailNext');
  pb.disabled = !prev; nb.disabled = !next;
  pb.setAttribute('aria-label', prev ? 'Previous rig: ' + prev.name : 'No previous rig');
  nb.setAttribute('aria-label', next ? 'Next rig: ' + next.name : 'No next rig');
  document.getElementById('detailPos').textContent = (i + 1) + ' of ' + filteredRigs.length;
}

function openDetail(rig, opener, opts) {
  selectedRigId = rig.id;
  detailOpener = opener || null;
  highlightSelectedMarker();
  highlightSelectedRow();
  document.getElementById('detailMapBtn').hidden = currentView === 'map';
  const d = rig.derived;

  document.getElementById('detailName').textContent = rig.name;
  document.getElementById('detailContractor').textContent = rig.contractor + (rig.owner ? ' · owned by ' + rig.owner : '');

  const rateLabel = d.current ? 'Current day rate' : d.next ? 'Next contract day rate' : null;
  const dayRateBlock = d.dayRate != null
    ? '<div class="dayrate-label">' + rateLabel + '</div><div class="dayrate-highlight">$' + d.dayRate.toLocaleString('en-US') + '<span class="dayrate-unit">/day</span></div>'
    : '<div class="dayrate-undisclosed">' + (d.shown ? 'Day rate undisclosed' : 'No current or upcoming contract') + '</div>';

  // the source line often names its own date already
  const asOfLabel = rig.asOf ? fmtIsoDate(rig.asOf) : null;
  const source = rig.source
    ? escapeHtml(rig.source) + (asOfLabel && !rig.source.includes(asOfLabel) ? ' · ' + escapeHtml(asOfLabel) : '')
    : 'Not recorded';
  const staleNote = d.sourceStale
    ? '<div class="source-stale">' + (d.sourceDate
        ? 'The latest source is more than ' + Math.round(STALE_SOURCE_DAYS / 30) + ' months older than the data date; this rig may be out of date.'
        : 'No dated source is recorded for this rig, so how current it is cannot be shown.') + '</div>'
    : '';

  document.getElementById('detailBody').innerHTML =
    '<div class="detail-badges">' +
      '<span class="badge badge-type">' + escapeHtml(rig.type) + '</span>' +
      '<span class="badge badge-status badge-' + statusSlug(d.status) + '">' + escapeHtml(d.status) + '</span>' +
      (d.firmness ? '<span class="badge badge-neutral">' + escapeHtml(FIRMNESS[d.firmness]) + ' contract</span>' : '') +
    '</div>' +
    dayRateBlock +
    '<dl class="detail-grid">' +
      field(d.current || !d.next ? 'Customer' : 'Next customer', d.customer || 'None', true) +
      field('Location', (rig.country ? rig.country + ' · ' : '') + rig.region, true) +
      field('Water Depth', rig.waterDepth_ft.toLocaleString('en-US') + ' ft') +
      field('Hookload', rig.hookload_tons.toLocaleString('en-US') + ' t') +
      field('Build Year', rig.buildYear) +
      field('Booked To', d.bookedToLabel) +
      field('Class', classLabel(rig), true) +
    '</dl>' +
    runwayBlock(rig) +
    '<h3 class="detail-section-title">All contracts</h3>' + contractsTable(rig) +
    (rig.note ? '<h3 class="detail-section-title">Notes</h3><div class="backlog-note">' + escapeHtml(rig.note) + '</div>' : '') +
    '<dl class="detail-meta">' +
      '<dt>Source</dt><dd>' + source + '</dd>' +
      '<dt>Position</dt><dd>' + escapeHtml(POSITIONS[rig.position] || rig.position) + '</dd>' +
    '</dl>' + staleNote;

  document.getElementById('detailPanel').classList.add('open');
  document.querySelector('.main-content').classList.add('panel-open');
  const row = document.querySelector('.list-row[data-rig-id="' + rig.id + '"]');
  if (row && currentView === 'list') row.scrollIntoView({ block: 'nearest' });
  revealBesidePanel(rig);
  updateDetailStepper();
  document.getElementById('detailBody').scrollTop = 0;
  if (!(opts && opts.keepFocus)) document.getElementById('detailClose').focus();
  writeHash();
}

/* On the map, pan if the panel would cover the selected rig */
function revealBesidePanel(rig) {
  if (!map || currentView !== 'map') return;
  const panelW = document.getElementById('detailPanel').offsetWidth, size = map.getSize();
  if (panelW >= size.x - 80) return; // full-width panel on phones
  const pt = map.latLngToContainerPoint([rig.lat, rig.lng]);
  if (pt.x <= size.x - panelW - 40 && pt.x >= 40) return;
  // centre the rig in the uncovered part; zoomed right out, the world edge may block the pan, so zoom in a step
  const z = Math.max(map.getZoom(), 4);
  const centre = map.unproject(map.project([rig.lat, rig.lng], z).add([panelW / 2, 0]), z);
  map.setView(centre, z, { animate: !prefersReduced });
}

function field(label, value, wide) {
  return '<div class="detail-field' + (wide ? ' detail-field-wide' : '') + '">' +
    '<dt class="detail-field-label">' + escapeHtml(label) + '</dt>' +
    '<dd class="detail-field-value' + (wide ? ' detail-field-value--text' : '') + '">' + escapeHtml(value) + '</dd></div>';
}

/* Closing returns focus to whatever opened the panel if it is still on screen (a list
   or timeline row); otherwise, on the map, to the rig's marker (or the map itself if
   the marker is inside a cluster). */
function closeDetail(restoreFocus) {
  const id = selectedRigId;
  if (!id) return;
  document.getElementById('detailPanel').classList.remove('open');
  document.querySelector('.main-content').classList.remove('panel-open');
  selectedRigId = null;
  highlightSelectedMarker();
  highlightSelectedRow();
  writeHash();
  const opener = detailOpener;
  detailOpener = null;
  if (!restoreFocus) return;
  if (opener && document.body.contains(opener) && opener.offsetParent) { opener.focus(); return; }
  if (currentView === 'list') {
    const btn = document.querySelector('.list-row[data-rig-id="' + id + '"] .row-link');
    if (btn) { btn.focus(); return; }
  }
  if (!map || currentView !== 'map') return;
  const marker = markersById[id];
  const el = marker && marker.getElement();
  (el || map.getContainer()).focus();
}

function highlightSelectedRow() {
  document.querySelectorAll('.list-row').forEach(function (tr) {
    const on = tr.dataset.rigId === selectedRigId;
    tr.classList.toggle('is-selected', on);
    if (on) tr.setAttribute('aria-current', 'true'); else tr.removeAttribute('aria-current');
  });
}

function highlightSelectedMarker() {
  Object.keys(markersById).forEach(function (id) {
    const el = markersById[id].getElement();
    const node = el && el.querySelector('.rig-marker');
    if (node) node.classList.toggle('selected', id === selectedRigId);
  });
}

/* ============================================
   VIEW TOGGLE
   ============================================ */
function setView(view, fromHash) {
  currentView = view;
  document.getElementById('detailMapBtn').hidden = view === 'map';
  if (selectedRigId) updateDetailStepper();
  document.getElementById('mapContainer').classList.toggle('hidden', view !== 'map');
  document.getElementById('listView').classList.toggle('active', view === 'list');
  document.getElementById('insightsView').classList.toggle('active', view === 'insights');

  document.querySelectorAll('[data-action="set-view"]').forEach(function (btn) {
    const on = btn.dataset.view === view;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });

  if (view === 'map' && map) setTimeout(function () { map.invalidateSize(); }, 80);
  if (fromHash) return;
  if (view === 'list') renderListView();
  if (view === 'insights') renderInsights();
  writeHash();
}

/* ============================================
   LIST VIEW
   ============================================ */
function renderListView() {
  const tbody = document.getElementById('listTableBody');
  if (selectedRigId) updateDetailStepper(); // the list order or contents may have changed
  document.getElementById('listCount').textContent = filteredRigs.length + ' of ' + RIG_DATA.length + ' rigs';
  document.getElementById('listNearCount').textContent = filteredRigs.filter(r => r.derived.nearTerm).length;
  if (!filteredRigs.length) {
    tbody.innerHTML = '<tr role="row"><td role="cell" colspan="8" class="list-empty">No rigs match your search and filters. <button type="button" class="link-btn" data-action="reset-filters">Clear search and filters</button></td></tr>';
    return;
  }
  const muted = t => '<span class="cell-muted">' + escapeHtml(t) + '</span>';
  const notDisclosed = '<abbr class="cell-muted" title="Not disclosed">n/d</abbr>';
  tbody.innerHTML = filteredRigs.map(function (rig) {
    const d = rig.derived;
    const rate = d.dayRate != null ? fmtRate(d.dayRate) : d.shown ? notDisclosed : muted('—');
    let booked;
    if (d.available) booked = '<span class="cell-chip">' + escapeHtml(d.bookedToLabel) + '</span>';
    else if (d.bookedOpen) booked = muted('Undisclosed');
    else booked = '<span class="cell-date">' + escapeHtml(d.bookedToLabel) + '</span>' +
      '<span class="cell-rel"> · ' + fmtMonths((d.bookedTo - AS_OF) / MS_PER_MONTH) + '</span>';
    const loc = locationLabel(rig);
    return '<tr role="row" class="list-row' + (d.nearTerm ? ' near-term' : '') + (rig.id === selectedRigId ? ' is-selected' : '') +
        '" data-rig-id="' + escapeHtml(rig.id) + '">' +
      '<td role="cell" class="cell-name"><button type="button" class="row-link" title="' + escapeHtml(rig.name) + ' — show details">' + escapeHtml(rig.name) + '</button></td>' +
      '<td role="cell" class="cell-contractor" title="' + escapeHtml(rig.contractor) + '"><span class="contractor-dot" style="background:' + getContractorColor(rig.contractor) + '" aria-hidden="true"></span>' + escapeHtml(rig.contractor) + '</td>' +
      '<td role="cell" class="cell-type">' + escapeHtml(rig.type === 'Semisubmersible' ? 'Semisub' : rig.type) + '</td>' +
      '<td role="cell" class="cell-location" title="' + escapeHtml(loc) + '">' + escapeHtml(loc) + '</td>' +
      '<td role="cell" class="cell-customer' + (d.customer ? '' : ' cell-none') + '" title="' + escapeHtml(d.customer || '') + '">' + (d.customer && d.customer !== 'Undisclosed' ? escapeHtml(d.customer) : muted(d.customer || '—')) + '</td>' +
      '<td role="cell" class="cell-rate' + (d.shown ? '' : ' cell-none') + '">' + rate + '</td>' +
      '<td role="cell" class="cell-booked">' + booked + '</td>' +
      '<td role="cell" class="cell-status"><span class="status-dot" style="background:' + statusColor(d.status) + '" aria-hidden="true"></span>' + escapeHtml(d.status) + '</td>' +
    '</tr>';
  }).join('');
}

/* A row opens the detail panel over the list, so the reader keeps their place */
function onListActivate(e) {
  const row = e.target.closest('.list-row');
  if (!row || !RIG_BY_ID[row.dataset.rigId]) return;
  e.preventDefault();
  openDetail(RIG_BY_ID[row.dataset.rigId], row.querySelector('.row-link'));
}

const SORT_KEYS = {
  name:       r => r.name,
  contractor: r => r.contractor,
  type:       r => r.type,
  location:   r => locationLabel(r),
  customer:   r => r.derived.customer,
  dayRate:    r => r.derived.dayRate,
  // open now sorts first; an undisclosed end has no date and sorts last
  bookedTo:   r => r.derived.available ? AS_OF.getTime() : r.derived.bookedTo ? r.derived.bookedTo.getTime() : null,
  status:     r => r.derived.status
};

function applySort() {
  const key = SORT_KEYS[currentSort.field] || SORT_KEYS.name;
  filteredRigs.sort(function (a, b) {
    let va = key(a), vb = key(b);
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    // blanks (no date / undisclosed rate) sort last in both directions
    if (va == null || vb == null) return va == null ? (vb == null ? 0 : 1) : -1;
    if (va < vb) return currentSort.asc ? -1 : 1;
    if (va > vb) return currentSort.asc ? 1 : -1;
    return 0;
  });
}

function sortTable(field) {
  if (currentSort.field === field) currentSort.asc = !currentSort.asc;
  else { currentSort.field = field; currentSort.asc = true; }
  applySort();
  updateSortHeaders();
  renderListView();
  writeHash();
}

function wireListSort() {
  document.getElementById('listSort').addEventListener('change', function () {
    currentSort = { field: this.value, asc: true };
    applySort(); updateSortHeaders(); renderListView(); writeHash();
  });
  document.getElementById('listSortDir').addEventListener('click', function () {
    currentSort.asc = !currentSort.asc;
    applySort(); updateSortHeaders(); renderListView(); writeHash();
  });
}

function updateSortHeaders() {
  const sel = document.getElementById('listSort');
  if (sel) sel.value = currentSort.field;
  const dir = document.getElementById('listSortDir');
  if (dir) {
    dir.textContent = currentSort.asc ? '↑' : '↓';
    dir.setAttribute('aria-label', 'Sorted ' + (currentSort.asc ? 'ascending' : 'descending') + '; reverse the order');
  }
  document.querySelectorAll('.list-table th').forEach(function (th) {
    const on = th.dataset.field === currentSort.field;
    th.classList.toggle('sorted', on);
    th.setAttribute('aria-sort', on ? (currentSort.asc ? 'ascending' : 'descending') : 'none');
    const arrow = th.querySelector('.sort-arrow');
    if (arrow) arrow.textContent = on ? (currentSort.asc ? '↑' : '↓') : '↕';
  });
}

/* ============================================
   CSV EXPORT
   ============================================ */
function exportCSV() {
  const cols = [
    ['ID', r => r.id], ['Rig Name', r => r.name], ['Contractor', r => r.contractor], ['Owner', r => r.owner],
    ['Type', r => r.type], ['Class', r => classLabel(r)],
    ['Water Depth (ft)', r => r.waterDepth_ft], ['Hookload (t)', r => r.hookload_tons], ['Build Year', r => r.buildYear],
    ['Region', r => r.region], ['Country', r => r.country], ['Latitude', r => r.lat], ['Longitude', r => r.lng],
    ['Position', r => r.position], ['Status', r => r.derived.status],
    ['Customer', r => r.derived.customer], ['Contract Start', r => r.derived.shown && r.derived.shown.k.start],
    ['Contract End', r => r.derived.shown && r.derived.shown.k.end], ['Day Rate (USD)', r => r.derived.dayRate],
    ['Firmness', r => r.derived.firmness], ['Booked To', r => r.derived.bookedToLabel],
    ['All Contracts', r => r.contracts.map(k => (k.customer || 'Undisclosed') + ' ' + (k.start || '?') + '–' + (k.end || '?') +
      (k.dayRate != null ? ' @ $' + k.dayRate : '') + ' (' + k.firmness + ')').join('; ')],
    ['Source', r => r.source], ['Source Date', r => r.asOf], ['Note', r => r.note], ['Data As Of', () => DATA_AS_OF]
  ];
  const esc = function (v) {
    v = v == null ? '' : String(v);
    return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  };
  const lines = [cols.map(c => c[0]).join(',')].concat(
    filteredRigs.map(r => cols.map(c => esc(c[1](r))).join(','))
  );
  // BOM so Excel opens the UTF-8 file with the right encoding
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'drilltracker-rigs-' + DATA_AS_OF + '.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  announce('Exported ' + filteredRigs.length + ' rigs to CSV');
}

function focusRig(rigId) {
  const rig = RIG_BY_ID[rigId];
  if (!rig) return;
  setView('map');
  if (!map) { openDetail(rig); return; }
  map.invalidateSize();
  map.setView([rig.lat, rig.lng], 7, { animate: !prefersReduced });
  setTimeout(function () {
    const marker = markersById[rig.id];
    // Nearby rigs can still be clustered at this zoom: zoom/spiderfy until the marker is visible
    if (marker && !marker.getElement() && markerLayer.zoomToShowLayer) markerLayer.zoomToShowLayer(marker, function () { openDetail(rig); });
    else openDetail(rig);
  }, prefersReduced ? 0 : 350);
}

/* ============================================
   SIDEBAR
   ============================================ */
function toggleSidebar() {
  const sidebar = document.getElementById('filterSidebar');
  sidebarOpen = !sidebarOpen;
  sidebar.classList.toggle('collapsed', !sidebarOpen);
  sidebar.toggleAttribute('inert', !sidebarOpen);
  document.querySelector('.sidebar-toggle-btn').setAttribute('aria-expanded', sidebarOpen ? 'true' : 'false');
  document.getElementById('sidebarBackdrop').hidden = !sidebarOpen;
  setTimeout(function () { if (map) map.invalidateSize(); }, 300);
}
