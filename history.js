/* The driller family tree: lays out HISTORY (history-data.js) as one lane per company,
   grouped into families by the present-day driller each company ended up in.
   Lanes join where a company merged into or was bought by another, branch where a business
   was spun out, and carry a tick where a company was renamed. No library: plain SVG. */
'use strict';

const SVG_NS = 'http://www.w3.org/2000/svg';
const THEME_KEY = 'drilltracker-theme';

/* Family colours are the map's contractor colours (styles.css), so a driller looks the same
   on both pages; the smaller drillers share the map's "Other" grey. */
const FAMILY_COLORS = {
  'Transocean': '--contractor-transocean',
  'Seadrill': '--contractor-seadrill',
  'Noble Corporation': '--contractor-noble',
  'Valaris': '--contractor-valaris',
  'Odfjell Drilling': '--contractor-odfjell',
  'Borr Drilling': '--contractor-borr',
  'Stena Drilling': '--contractor-stena',
  'Constellation': '--contractor-constellation'
};
const FAMILY_ORDER = ['Transocean', 'Valaris', 'Noble Corporation', 'Seadrill', 'Borr Drilling', 'Odfjell Drilling',
  'Stena Drilling', 'Constellation', 'Saipem', 'COSL', 'Foresea', 'Ventura Offshore', 'Sonadrill', 'Dolphin Drilling',
  'Vantage Drilling', 'Etesco'];
const GONE_FAMILY = '_gone';

const TYPES = {
  merger:        { label: 'Merger',        glyph: 'circle' },
  acquisition:   { label: 'Acquisition',   glyph: 'circle' },
  'spin-off':    { label: 'Spin-off',      glyph: 'diamond' },
  jv:            { label: 'Joint venture', glyph: 'diamond' },
  rename:        { label: 'Rename',        glyph: 'tick' },
  restructuring: { label: 'Restructuring', glyph: 'square' },
  fleet:         { label: 'Fleet deal',    glyph: 'triangle' },
  divestment:    { label: 'Divestment',    glyph: 'triangle' },
  founded:       { label: 'Founded',       glyph: 'ring' },
  listing:       { label: 'Listing',       glyph: 'ring' }
};
const SOURCE_KINDS = { primary: 'Company or official source', press: 'News or trade press', reference: 'Reference work' };
const ERAS = [
  { id: 'all', label: 'All years', from: null },
  { id: '1970', label: '1970', from: 1970 },
  { id: '1990', label: '1990', from: 1990 },
  { id: '2010', label: '2010', from: 2010 }
];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* layout constants (px) */
const ROW_H = 30;        // one lane
const BAR_H = 6;         // thin lane bar
const PAD_L = 16;
const PAD_R = 175;       // room for the present-day names beside the end dots
const AXIS_H = 26;
const JOIN = 18;         // horizontal run of a join or branch curve

/* ---------- dates ---------- */
function parseDate(s, mid) {
  if (!s) return null;
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(String(s));
  if (!m) return null;
  const y = +m[1], mo = m[2] ? +m[2] : null, d = m[3] ? +m[3] : null;
  if (mo === null) return y + (mid ? 0.5 : 0);
  if (d === null) return y + (mo - 1) / 12 + (mid ? 1 / 24 : 0);
  return y + (mo - 1) / 12 + (d - 1) / 365;
}
function formatDate(s) {
  if (!s) return 'Date unknown';
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(String(s));
  if (!m) return String(s);
  if (!m[2]) return m[1];
  if (!m[3]) return MONTHS[+m[2] - 1] + ' ' + m[1];
  return MONTHS[+m[2] - 1] + ' ' + (+m[3]) + ', ' + m[1];
}

/* ---------- model ---------- */
const DATA = window.HISTORY || { asOf: null, companies: [], events: [] };
const NOW = parseDate(DATA.asOf) || 2026.85;
const CO = Object.fromEntries(DATA.companies.map(c => [c.id, c]));
const EVENTS = DATA.events.slice().sort((a, b) => (parseDate(a.date, true) || 0) - (parseDate(b.date, true) || 0));
EVENTS.forEach((e, i) => { e._i = i; e._x = parseDate(e.date, true); });

function buildModel() {
  // lanes: chains of companies linked by renames
  const renameNext = {}, renamePrev = {};
  // a rename, or a restructuring that came out under a new company id, continues the same lane
  // (a restructuring counts only when the old company ended there; one that folded several companies into one is a join, below)
  const endsAt = (id, e) => CO[id] && CO[id].end && Math.abs(parseDate(CO[id].end, true) - e._x) < 0.5;
  for (const e of EVENTS) {
    const cont = e.type === 'rename' || (e.type === 'restructuring' && e.to.length === 1 && e.from.length === 1 && endsAt(e.from[0], e));
    const a = e.from[0], b = e.to[0];
    if (cont && !e.pending && a && b && a !== b && CO[a] && CO[b] && !renameNext[a] && !renamePrev[b]) {
      renameNext[a] = { id: b, e }; renamePrev[b] = a;
    }
  }
  const lanes = [], laneOf = {};
  for (const c of DATA.companies) {
    if (renamePrev[c.id] || c.outside) continue;
    const lane = { i: lanes.length, segs: [], renames: [] };
    let id = c.id;
    const seen = new Set();
    while (id && CO[id] && !CO[id].outside && !seen.has(id)) {
      seen.add(id);
      lane.segs.push(CO[id]); laneOf[id] = lane;
      const nx = renameNext[id];
      if (nx) lane.renames.push(nx.e);
      id = nx ? nx.id : null;
    }
    lanes.push(lane);
  }
  for (const lane of lanes) {
    const first = lane.segs[0], last = lane.segs[lane.segs.length - 1];
    lane.start = parseDate(first.start);
    lane.startUnknown = lane.start === null;
    if (lane.startUnknown) {
      // founding date unknown: start a faded stretch a few years before the first recorded event, not at the axis edge
      const ids = new Set(lane.segs.map(c => c.id));
      const xs = EVENTS.filter(e => e._x !== null && e.from.concat(e.to).some(id => ids.has(id))).map(e => e._x);
      lane.start = xs.length ? Math.min(...xs) - 3 : null;
    }
    lane.end = last.end ? parseDate(last.end, true) : null;
    lane.current = lane.segs.some(s => s.current);
    lane.trackerName = (lane.segs.find(s => s.trackerName) || {}).trackerName || null;
    lane.name = last.name;
    lane.inbound = []; lane.outbound = []; lane.children = []; lane.outsideIn = []; lane.outsideOut = [];
  }
  // links between lanes
  for (const e of EVENTS) {
    if (e.type === 'merger' || e.type === 'acquisition' || (e.type === 'restructuring' && e.from.length > 1 && e.to.length === 1)) {
      const target = laneOf[e.to[0]];
      if (!target) continue;
      for (const f of e.from) {
        const src = laneOf[f];
        if (!src || src === target || e.to.includes(f)) continue;
        const link = { kind: 'join', from: src, to: target, e, pending: !!e.pending };
        src.outbound.push(link); target.inbound.push(link);
      }
    } else if (e.type === 'spin-off' || e.type === 'jv') {
      for (const t of e.to) {
        const child = laneOf[t];
        if (!child) continue;
        for (const f of e.from) {
          const parent = laneOf[f];
          if (!parent || parent === child) continue;
          const link = { kind: 'branch', from: parent, to: child, e, pending: !!e.pending };
          parent.outbound.push(link); child.inbound.push(link);
        }
      }
    }
  }
  // links to companies outside the tree (parents, conglomerates, outside buyers) become text references
  const isOut = id => CO[id] && CO[id].outside;
  for (const e of EVENTS) {
    if (!['merger', 'acquisition', 'spin-off', 'jv', 'fleet', 'divestment'].includes(e.type)) continue;
    const ins = e.from.filter(isOut), outs = e.to.filter(isOut);
    for (const t of e.to) { const l = laneOf[t]; if (l) for (const f of ins) if (!e.to.includes(f)) l.outsideIn.push({ name: CO[f].name, e }); }
    for (const f of e.from) { const l = laneOf[f]; if (l && !e.to.includes(f)) for (const t of outs) l.outsideOut.push({ name: CO[t].name, e }); }
  }
  // family = the present-day driller a lane flows into (pending deals don't count yet)
  function familyOf(lane, seen) {
    if (lane._family !== undefined) return lane._family;
    if (seen.has(lane)) return GONE_FAMILY;
    seen.add(lane);
    let fam = GONE_FAMILY, via = null;
    // only drillers on the rig map get a family; other present-day drillers sit with the family they came from
    if (lane.current && lane.trackerName) fam = lane.trackerName;
    else {
      const join = lane.outbound.find(l => l.kind === 'join' && !l.pending);
      const parent = lane.inbound.find(l => l.kind === 'branch' && !l.pending);
      const fleetBuyer = EVENTS.find(e => e.type === 'fleet' && !e.pending && e.from.some(f => laneOf[f] === lane) && laneOf[e.to[0]]);
      const child = lane.outbound.find(l => l.kind === 'branch' && !l.pending);
      if (join && !lane.current) { fam = familyOf(join.to, seen); via = join; }
      if (fam === GONE_FAMILY && parent) { fam = familyOf(parent.from, seen); via = parent; }
      if (fam === GONE_FAMILY && fleetBuyer) { fam = familyOf(laneOf[fleetBuyer.to[0]], seen); via = { kind: 'fleet', to: laneOf[fleetBuyer.to[0]], from: lane, e: fleetBuyer }; }
      if (fam === GONE_FAMILY && child) { fam = familyOf(child.to, seen); via = { kind: 'parent', to: child.to, from: lane, e: child.e }; }
    }
    lane._family = fam; lane._via = via;
    return fam;
  }
  lanes.forEach(l => familyOf(l, new Set()));
  // rows inside a family: the present-day lane first, then each lane under the lane it fed
  const families = {};
  for (const lane of lanes) (families[lane._family] = families[lane._family] || []).push(lane);
  const famList = Object.keys(families).sort((a, b) => famRank(a) - famRank(b));
  const result = [];
  for (const key of famList) {
    const members = families[key];
    const inFam = new Set(members);
    for (const l of members) l.children = [];
    const roots = [];
    for (const l of members) {
      const parentLane = l._via ? (l._via.kind === 'branch' ? l._via.from : l._via.to) : null; // join, fleet and parent point at .to
      if (parentLane && inFam.has(parentLane)) parentLane.children.push(l); else roots.push(l);
    }
    const linkDate = l => (l._via && l._via.e && l._via.e._x) || l.start || 0;
    const rows = [];
    (function walk(list) {
      list.sort((a, b) => (b.current - a.current) || (linkDate(b) - linkDate(a)));
      for (const l of list) { rows.push(l); walk(l.children); }
    })(roots);
    rows.forEach((l, r) => { l.row = r; });
    const events = EVENTS.filter(e => e.from.concat(e.to).some(id => laneOf[id] && inFam.has(laneOf[id])));
    const head = rows.find(l => l.current && l.trackerName);
    const first = key.split(' ')[0].toLowerCase();
    const name = key === GONE_FAMILY ? 'Gone without successor'
      : (head && !head.name.toLowerCase().includes(first) ? key + ', now ' + head.name : key);
    result.push({ key, name, lanes: rows, events,
      color: key === GONE_FAMILY ? '--contractor-other' : (FAMILY_COLORS[key] || '--contractor-other') });
  }
  return { lanes, laneOf, families: result };
}
function famRank(k) { const i = FAMILY_ORDER.indexOf(k); return k === GONE_FAMILY ? 999 : (i < 0 ? 500 : i); }

const MODEL = buildModel();

/* ---------- state ---------- */
const state = { families: new Set(MODEL.families.map(f => f.key)), type: 'all', era: 'all', q: '', view: 'chart', ev: null };

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  if (p.get('view') === 'list') state.view = 'list';
  if (p.get('type') && (TYPES[p.get('type')] || p.get('type') === 'all')) state.type = p.get('type');
  if (p.get('era') && ERAS.some(e => e.id === p.get('era'))) state.era = p.get('era');
  if (p.get('q')) state.q = p.get('q');
  if (p.get('family')) {
    const want = p.get('family').split(',');
    const keep = MODEL.families.filter(f => want.includes(f.key)).map(f => f.key);
    if (keep.length) state.families = new Set(keep);
  }
  if (p.get('ev') && EVENTS.some(e => e.id === p.get('ev'))) state.ev = p.get('ev');
}
function writeHash() {
  const p = new URLSearchParams();
  if (state.view !== 'chart') p.set('view', state.view);
  if (state.type !== 'all') p.set('type', state.type);
  if (state.era !== 'all') p.set('era', state.era);
  if (state.q) p.set('q', state.q);
  if (state.families.size !== MODEL.families.length) p.set('family', [...state.families].join(','));
  if (state.ev) p.set('ev', state.ev);
  const h = p.toString();
  history.replaceState(null, '', h ? '#' + h : location.pathname + location.search);
}

/* ---------- matching ---------- */
function companyText(id) { const c = CO[id]; return c ? [c.name].concat(c.aka || []).join(' ').toLowerCase() : ''; }
function eventMatches(e) {
  if (state.type !== 'all' && e.type !== state.type) return false;
  const era = ERAS.find(x => x.id === state.era);
  if (era.from && e._x !== null && e._x < era.from) return false;
  if (!state.q) return true;
  const q = state.q.toLowerCase();
  return (e.title + ' ' + (e.detail || '')).toLowerCase().includes(q) || e.from.concat(e.to).some(id => companyText(id).includes(q));
}
function laneMatches(lane) {
  if (!state.q) return true;
  const q = state.q.toLowerCase();
  return lane.segs.some(s => companyText(s.id).includes(q));
}

/* ---------- small DOM helpers ---------- */
function el(tag, attrs, text) {
  const n = document.createElement(tag);
  if (attrs) for (const k in attrs) if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
  if (text !== undefined && text !== null) n.textContent = text;
  return n;
}
function svg(tag, attrs, text) {
  const n = document.createElementNS(SVG_NS, tag);
  if (attrs) for (const k in attrs) if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
  if (text !== undefined && text !== null) n.textContent = text;
  return n;
}
function glyph(type, x, y, r) {
  const g = (TYPES[type] || TYPES.merger).glyph;
  if (g === 'diamond') return svg('path', { d: `M${x} ${y - r - 1}L${x + r + 1} ${y}L${x} ${y + r + 1}L${x - r - 1} ${y}Z`, class: 'hx-mark' });
  if (g === 'square') return svg('rect', { x: x - r, y: y - r, width: 2 * r, height: 2 * r, rx: 1.5, class: 'hx-mark' });
  if (g === 'triangle') return svg('path', { d: `M${x} ${y - r - 1}L${x + r + 1} ${y + r}L${x - r - 1} ${y + r}Z`, class: 'hx-mark' });
  if (g === 'tick') return svg('rect', { x: x - 1.5, y: y - r - 2, width: 3, height: 2 * r + 4, rx: 1.5, class: 'hx-mark hx-mark-tick' });
  if (g === 'ring') return svg('circle', { cx: x, cy: y, r: r - 0.5, class: 'hx-mark hx-mark-ring' });
  return svg('circle', { cx: x, cy: y, r, class: 'hx-mark' });
}
function eventLabel(e) { return formatDate(e.date) + ': ' + e.title + (e.pending ? ' (pending)' : ''); }

/* ---------- header bits: stats, families, controls, legend ---------- */
function renderStats() {
  const dl = document.getElementById('hxStats');
  dl.textContent = '';
  const drillers = DATA.companies.filter(c => !c.outside);
  const current = drillers.filter(c => c.current && c.trackerName).length;
  const deals = EVENTS.filter(e => !['founded', 'listing', 'rename'].includes(e.type)).length;
  const years = drillers.map(c => parseDate(c.start)).filter(Boolean);
  const first = years.length ? Math.floor(Math.min(...years)) : null;
  const stats = [
    [String(drillers.length), 'drilling companies'],
    [String(deals), 'deals and restructurings'],
    [String(current), 'drillers on the rig map'],
    [first ? String(first) : '—', 'earliest founding']
  ];
  for (const [v, k] of stats) {
    const d = el('div', { class: 'hx-stat' });
    d.append(el('dt', null, k), el('dd', null, v));
    dl.append(d);
  }
  const pending = EVENTS.filter(e => e.pending);
  if (pending.length) {
    const d = el('div', { class: 'hx-stat hx-stat-pending' });
    d.append(el('dt', null, 'Pending'), el('dd', null, pending.map(e => e.title).join('; ')));
    dl.append(d);
  }
}

function renderFamilyChips() {
  const box = document.getElementById('hxFamilies');
  box.textContent = '';
  const all = el('button', { type: 'button', class: 'hx-chip hx-chip-all', 'aria-pressed': String(state.families.size === MODEL.families.length) }, 'All');
  all.addEventListener('click', () => {
    state.families = state.families.size === MODEL.families.length ? new Set() : new Set(MODEL.families.map(f => f.key));
    update();
  });
  box.append(all);
  for (const f of MODEL.families) {
    const b = el('button', { type: 'button', class: 'hx-chip', 'aria-pressed': String(state.families.has(f.key)) });
    const sw = el('span', { class: 'hx-swatch', 'aria-hidden': 'true' });
    sw.style.background = 'var(' + f.color + ')';
    b.append(sw, document.createTextNode(f.name));
    b.addEventListener('click', () => {
      if (state.families.has(f.key)) state.families.delete(f.key); else state.families.add(f.key);
      update();
    });
    box.append(b);
  }
}

function initControls() {
  const type = document.getElementById('hxType');
  type.append(el('option', { value: 'all' }, 'All events'));
  const used = new Set(EVENTS.map(e => e.type));
  for (const k in TYPES) if (used.has(k)) type.append(el('option', { value: k }, TYPES[k].label));
  type.value = state.type;
  type.addEventListener('change', () => { state.type = type.value; update(); });

  const era = document.getElementById('hxEra');
  for (const e of ERAS) era.append(el('option', { value: e.id }, e.label));
  era.value = state.era;
  era.addEventListener('change', () => { state.era = era.value; update(true); });

  const q = document.getElementById('hxSearch');
  q.value = state.q;
  let t;
  q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { state.q = q.value.trim(); update(); }, 150); });

  for (const b of document.querySelectorAll('.hx-view button')) {
    b.addEventListener('click', () => { state.view = b.dataset.view; update(); });
  }
}

function renderLegend() {
  const box = document.getElementById('hxLegend');
  box.textContent = '';
  const used = new Set(EVENTS.map(e => e.type));
  const groups = [
    ['merger', 'Merger or acquisition', used.has('merger') || used.has('acquisition')],
    ['spin-off', 'Spin-off or joint venture', used.has('spin-off') || used.has('jv')],
    ['rename', 'Rename', used.has('rename')],
    ['restructuring', 'Restructuring', used.has('restructuring')],
    ['fleet', 'Fleet deal or divestment', used.has('fleet') || used.has('divestment')],
    ['founded', 'Founded or listed', used.has('founded') || used.has('listing')]
  ];
  for (const [type, label, show] of groups) {
    if (!show) continue;
    const item = el('span', { class: 'hx-legend-item' });
    const s = svg('svg', { width: 16, height: 16, viewBox: '0 0 16 16', 'aria-hidden': 'true', focusable: 'false' });
    s.append(glyph(type, 8, 8, 4.5));
    item.append(s, document.createTextNode(label));
    box.append(item);
  }
  const lane = el('span', { class: 'hx-legend-item' });
  const ls = svg('svg', { width: 28, height: 16, viewBox: '0 0 28 16', 'aria-hidden': 'true', focusable: 'false' });
  ls.append(svg('rect', { x: 1, y: 5, width: 26, height: BAR_H, rx: 3, class: 'hx-legend-lane' }));
  lane.append(ls, document.createTextNode('Company lifetime'));
  box.append(lane);
  box.append(el('span', { class: 'hx-legend-item hx-legend-note' }, 'Busier years are drawn wider'));
  if (EVENTS.some(e => e.pending)) {
    const p = el('span', { class: 'hx-legend-item' });
    const ps = svg('svg', { width: 28, height: 16, viewBox: '0 0 28 16', 'aria-hidden': 'true', focusable: 'false' });
    ps.append(svg('path', { d: 'M1 8H27', class: 'hx-legend-pending' }));
    p.append(ps, document.createTextNode('Pending'));
    box.append(p);
  }
}

/* ---------- the timeline ---------- */
let scale = null;
/* Time is weighted by activity: busy years get more room than quiet ones, so the deal-heavy
   decades are readable without hiding the early history. The axis shows where the decades fall. */
function makeScale() {
  const era = ERAS.find(x => x.id === state.era);
  const vis = MODEL.lanes.filter(l => state.families.has(l._family));
  const starts = vis.filter(l => l.start !== null && !l.startUnknown).map(l => l.start);
  const minY = era.from || (starts.length ? Math.floor(Math.min(...starts) / 10) * 10 : 1950);
  const maxY = Math.ceil(NOW + 0.6);
  const n = maxY - minY;
  const counts = new Array(n + 1).fill(0);
  const visSet = new Set(vis);
  for (const e of EVENTS) {
    if (e._x === null || e._x < minY || e.type === 'founded') continue;
    if (!e.from.concat(e.to).some(id => visSet.has(MODEL.laneOf[id]))) continue;
    counts[Math.floor(e._x - minY)]++;
  }
  const w = counts.map((c, i) => {
    let sm = 0;
    for (let k = -2; k <= 2; k++) sm += (counts[i + k] || 0) * (k === 0 ? 1 : (Math.abs(k) === 1 ? 0.6 : 0.3));
    return 0.35 + 1.65 * Math.min(1, sm / 3);
  });
  const cum = [0];
  for (let i = 0; i < n; i++) cum.push(cum[i] + w[i]);
  const avail = Math.max(320, document.getElementById('hxScroll').clientWidth);
  const minUnit = window.matchMedia('(max-width: 700px)').matches ? 9 : 5;
  const unit = Math.max(minUnit, (avail - PAD_L - PAD_R) / cum[n]);
  const width = Math.round(PAD_L + PAD_R + unit * cum[n]);
  const x = y => {
    const t = Math.max(minY, Math.min(maxY, y)) - minY;
    const i = Math.min(n - 1, Math.floor(t));
    return PAD_L + unit * (cum[i] + (t - i) * w[i]);
  };
  return { minY, maxY, unit, width, x };
}

function axisSvg(top) {
  const s = svg('svg', { width: scale.width, height: AXIS_H, class: 'hx-axis', 'aria-hidden': 'true', focusable: 'false' });
  let lastLabel = -1e9;
  for (let y = Math.ceil(scale.minY / 5) * 5; y <= scale.maxY; y += 5) {
    const x = scale.x(y), major = y % 10 === 0;
    if (!major && scale.x(y + 5) - x < 46) continue;
    s.append(svg('line', { x1: x, x2: x, y1: top ? AXIS_H - (major ? 6 : 4) : 0, y2: top ? AXIS_H : (major ? 6 : 4), class: 'hx-tick' }));
    if (x - lastLabel >= 40 && scale.x(NOW) - x > 30) {
      s.append(svg('text', { x, y: top ? AXIS_H - 10 : 18, 'text-anchor': 'middle', class: 'hx-tick-label' + (major ? '' : ' is-minor') }, String(y)));
      lastLabel = x;
    }
  }
  const nx = scale.x(NOW);
  s.append(svg('text', { x: nx + 4, y: top ? AXIS_H - 10 : 18, class: 'hx-now-label' }, 'Today'));
  return s;
}

function renderChart(keepScroll) {
  const canvas = document.getElementById('hxCanvas');
  const scroller = document.getElementById('hxScroll');
  const prevRight = scroller.scrollWidth - scroller.scrollLeft;
  canvas.textContent = '';
  scale = makeScale();
  canvas.style.width = scale.width + 'px';
  canvas.append(axisSvg(true));
  let shown = 0;
  for (const fam of MODEL.families) {
    if (!state.families.has(fam.key)) continue;
    const famHasMatch = fam.events.some(eventMatches) || (state.q && fam.lanes.some(laneMatches));
    if (!famHasMatch && (state.q || state.type !== 'all')) continue;
    shown++;
    canvas.append(familyBlock(fam));
  }
  canvas.append(axisSvg(false));
  document.getElementById('hxEmpty').hidden = shown > 0;
  // keep today in view: open scrolled to the right, and hold the right edge across re-renders
  if (!keepScroll) scroller.scrollLeft = scroller.scrollWidth;
  else scroller.scrollLeft = Math.max(0, scroller.scrollWidth - prevRight);
}

function familyBlock(fam) {
  const sec = el('section', { class: 'hx-family', 'aria-labelledby': 'hxf-' + cssId(fam.key) });
  sec.style.setProperty('--fam', 'var(' + fam.color + ')');
  const head = el('h2', { class: 'hx-family-head', id: 'hxf-' + cssId(fam.key) });
  const sw = el('span', { class: 'hx-swatch', 'aria-hidden': 'true' });
  head.append(sw, el('span', { class: 'hx-family-name' }, fam.name));
  const deals = fam.events.filter(e => !['founded', 'listing'].includes(e.type)).length;
  head.append(el('span', { class: 'hx-family-meta' }, fam.lanes.length + (fam.lanes.length === 1 ? ' company' : ' companies') + ' · ' + deals + (deals === 1 ? ' event' : ' events')));
  sec.append(head);

  const h = fam.lanes.length * ROW_H + 14;
  const s = svg('svg', { width: scale.width, height: h, class: 'hx-family-svg', role: 'group', 'aria-label': fam.name + ' family timeline' });
  const yOf = lane => 8 + lane.row * ROW_H + ROW_H - 9;
  const inFam = new Set(fam.lanes);

  // decade grid and today line
  const grid = svg('g', { class: 'hx-grid', 'aria-hidden': 'true' });
  for (let y = Math.ceil(scale.minY / 10) * 10; y <= scale.maxY; y += 10) grid.append(svg('line', { x1: scale.x(y), x2: scale.x(y), y1: 0, y2: h }));
  grid.append(svg('line', { x1: scale.x(NOW), x2: scale.x(NOW), y1: 0, y2: h, class: 'hx-now' }));
  s.append(grid);

  const links = svg('g', { class: 'hx-links', 'aria-hidden': 'true' });
  const lanesG = svg('g', { class: 'hx-lanes' });
  const marks = svg('g', { class: 'hx-events' });

  for (const lane of fam.lanes) {
    const y = yOf(lane);
    const x0 = lane.start === null ? scale.x(scale.minY) : scale.x(lane.start);
    const x1 = scale.x(lane.end === null ? NOW : lane.end);
    const g = svg('g', { class: 'hx-lane' + (lane.current ? ' is-current' : '') + (laneMatches(lane) ? '' : ' is-dim'), 'data-lane': lane.i });
    // bar, leaving room for the curve into the lane it joined
    const joinOut = lane.outbound.find(l => l.kind === 'join' && inFam.has(l.to) && !l.pending);
    const branchIn = lane.inbound.find(l => l.kind === 'branch' && inFam.has(l.from));
    const bx0 = branchIn ? Math.min(x1, x0 + JOIN) : x0;
    const bx1 = joinOut ? Math.max(bx0, x1 - JOIN) : x1;
    const bar = svg('rect', { x: bx0, y: y - BAR_H / 2, width: Math.max(2, bx1 - bx0), height: BAR_H, rx: BAR_H / 2, class: 'hx-bar' + (lane.startUnknown ? ' is-fade' : '') });
    g.append(bar);
    if (lane.current && lane.end === null) g.append(svg('circle', { cx: x1, cy: y, r: 5, class: 'hx-end' }));
    // names: the present-day name sits beside its end dot; earlier names label their own stretch where they fit
    const segX = lane.segs.map((c, k) => k === 0 ? bx0 : scale.x(parseDate(lane.renames[k - 1].date, true)));
    let labelEnd = -1e9;
    lane.segs.forEach((c, k) => {
      const lastSeg = k === lane.segs.length - 1;
      if (lastSeg && lane.current && lane.end === null) {
        g.append(svg('text', { x: x1 + 10, y: y + 4, class: 'hx-lane-label is-end' + (lane.trackerName ? ' is-current' : '') }, c.name));
        return;
      }
      const sx = Math.max(segX[k], labelEnd + 8);
      const nx = lastSeg ? (lane.current ? x1 - 6 : x1 + PAD_R - 8) : segX[k + 1];
      const est = c.name.length * 6.1;
      if (k === 0 || sx + est <= Math.max(nx, sx + 1) + (lastSeg ? 60 : 0)) {
        const t = svg('text', { x: sx + 2, y: y - 8, class: 'hx-lane-label' }, c.name);
        if (k === 0 && lane.startUnknown) t.append(svg('tspan', { class: 'hx-unknown' }, ' · founding date unknown'));
        g.append(t);
        labelEnd = sx + 2 + est + (k === 0 && lane.startUnknown ? 150 : 0);
      }
    });
    // links to other families
    for (const l of lane.inbound) {
      if (inFam.has(l.from)) continue;
      const lx = scale.x(l.e._x);
      g.append(svg('text', { x: Math.max(4, lx - 6), y: y + 16, 'text-anchor': lx > 120 ? 'end' : 'start', class: 'hx-xref' }, (l.kind === 'branch' ? 'from ' : '') + l.from.name + (l.pending ? ' (pending)' : '') + (l.kind === 'join' ? ' →' : '')));
    }
    for (const l of lane.outbound) {
      if (inFam.has(l.to) && !l.pending) continue;
      const lx = scale.x(l.e._x);
      const t = (l.kind === 'join' ? '→ into ' : '→ spun off ') + l.to.name + (l.pending ? ' (pending)' : '');
      g.append(svg('text', { x: lx + 8, y: y + 16, class: 'hx-xref' + (l.pending ? ' is-pending' : '') }, t));
      if (l.pending) g.append(svg('path', { d: `M${x1} ${y}H${lx + 4}`, class: 'hx-pending' }));
    }
    for (const o of lane.outsideIn) {
      const lx = scale.x(o.e._x);
      g.append(svg('text', { x: Math.max(4, lx - 6), y: y + 16, 'text-anchor': lx > 120 ? 'end' : 'start', class: 'hx-xref' }, 'from ' + o.name));
    }
    for (const o of lane.outsideOut) {
      const lx = scale.x(o.e._x);
      g.append(svg('text', { x: lx + 8, y: y + 16, class: 'hx-xref' }, '→ ' + o.name));
    }
    g.addEventListener('pointerenter', () => highlightLineage(lane));
    g.addEventListener('pointerleave', clearHighlight);
    lanesG.append(g);

    // curves within the family
    if (joinOut) {
      const ty = yOf(joinOut.to), ex = scale.x(joinOut.e._x);
      links.append(svg('path', { d: `M${ex - JOIN} ${y}C${ex - 6} ${y} ${ex - 10} ${ty} ${ex} ${ty}`, class: 'hx-link', 'data-lane': lane.i }));
    }
    for (const b of lane.inbound.filter(l => l.kind === 'branch' && inFam.has(l.from))) {
      const py = yOf(b.from), sx = scale.x(b.e._x);
      links.append(svg('path', { d: `M${sx} ${py}C${sx + 10} ${py} ${sx + 6} ${y} ${sx + JOIN} ${y}`, class: 'hx-link' + (b.pending ? ' is-pending' : ''), 'data-lane': lane.i }));
    }
  }

  // event markers: on the lane the event happened to
  const placed = {};
  for (const e of fam.events) {
    const lane = markerLane(e, inFam);
    if (!lane || e._x === null) continue;
    let x = scale.x(e._x);
    const y = yOf(lane);
    // nudge markers that would sit on top of one another
    const key = lane.i + ':' + Math.round(x / 9);
    placed[key] = (placed[key] || 0) + 1;
    if (placed[key] > 1) x += (placed[key] - 1) * 9;
    const g = svg('g', { class: 'hx-ev hx-ev-' + e.type + (e.pending ? ' is-pending' : '') + (eventMatches(e) ? '' : ' is-dim'),
      tabindex: '0', role: 'button', 'aria-label': eventLabel(e), 'data-ev': e.id });
    g.append(svg('circle', { cx: x, cy: y, r: 12, class: 'hx-hit' }));
    g.append(glyph(e.type, x, y, 4.5));
    g.addEventListener('click', () => openPanel(e, g));
    g.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openPanel(e, g); } });
    g.addEventListener('pointerenter', ev => showTip(e, ev));
    g.addEventListener('pointerleave', hideTip);
    g.addEventListener('focus', () => showTipAt(e, g));
    g.addEventListener('blur', hideTip);
    marks.append(g);
  }
  s.append(links, lanesG, marks);
  sec.append(s);
  return sec;
}

function markerLane(e, inFam) {
  const ids = (e.type === 'divestment') ? e.from : (e.type === 'restructuring' || e.type === 'founded' || e.type === 'listing') ? e.to.concat(e.from)
    : (e.type === 'spin-off' || e.type === 'jv') ? e.to.concat(e.from) : e.to.concat(e.from);
  for (const id of ids) { const l = MODEL.laneOf[id]; if (l && inFam.has(l)) return l; }
  return null;
}
function cssId(s) { return String(s).replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase(); }

/* lineage highlight: a lane's ancestors and descendants */
function highlightLineage(lane) {
  const keep = new Set([lane]);
  const up = [lane], down = [lane];
  while (up.length) { const l = up.pop(); for (const k of l.inbound) if (!keep.has(k.from)) { keep.add(k.from); up.push(k.from); } }
  while (down.length) { const l = down.pop(); for (const k of l.outbound) if (!keep.has(k.to)) { keep.add(k.to); down.push(k.to); } }
  const canvas = document.getElementById('hxCanvas');
  canvas.classList.add('is-tracing');
  for (const g of canvas.querySelectorAll('[data-lane]')) g.classList.toggle('is-traced', keep.has(MODEL.lanes[+g.dataset.lane]));
}
function clearHighlight() {
  const canvas = document.getElementById('hxCanvas');
  canvas.classList.remove('is-tracing');
  for (const g of canvas.querySelectorAll('.is-traced')) g.classList.remove('is-traced');
}

/* ---------- tooltip ---------- */
const tip = document.getElementById('hxTip');
function fillTip(e) {
  tip.textContent = '';
  tip.append(el('strong', null, e.title), el('span', null, (TYPES[e.type] || {}).label + ' · ' + formatDate(e.date) + (e.pending ? ' · pending' : '')));
}
function showTip(e, ev) { fillTip(e); tip.hidden = false; placeTip(ev.clientX, ev.clientY); }
function showTipAt(e, g) { fillTip(e); tip.hidden = false; const r = g.getBoundingClientRect(); placeTip(r.left + r.width / 2, r.top); }
function placeTip(cx, cy) {
  const w = tip.offsetWidth, hgt = tip.offsetHeight;
  let x = cx + 12, y = cy - hgt - 10;
  if (x + w > window.innerWidth - 8) x = cx - w - 12;
  if (y < 8) y = cy + 16;
  tip.style.left = x + 'px'; tip.style.top = y + 'px';
}
function hideTip() { tip.hidden = true; }

/* ---------- details panel ---------- */
let panelReturn = null;
function openPanel(e, from) {
  state.ev = e.id; writeHash();
  hideTip();
  panelReturn = from || document.activeElement;
  const panel = document.getElementById('hxPanel');
  document.getElementById('hxPanelKicker').textContent = (TYPES[e.type] || {}).label + ' · ' + formatDate(e.date) + (e.pending ? ' · pending' : '');
  document.getElementById('hxPanelTitle').textContent = e.title;
  const body = document.getElementById('hxPanelBody');
  body.textContent = '';
  if (e.detail) body.append(el('p', null, e.detail));
  const facts = el('dl', { class: 'hx-facts' });
  const fact = (k, v) => { if (v) { facts.append(el('dt', null, k), el('dd', null, v)); } };
  fact(e.pending ? (e._x !== null && e._x <= NOW ? 'Agreed' : 'Expected') : 'Completed', formatDate(e.date));
  if (e.announced && e.announced !== e.date) fact('Announced', formatDate(e.announced));
  fact('Value', e.value);
  body.append(facts);
  const who = el('div', { class: 'hx-who' });
  const addCos = (label, ids) => {
    const list = ids.filter(id => CO[id]);
    if (!list.length) return;
    who.append(el('h3', null, label));
    const ul = el('ul', { class: 'hx-cos' });
    for (const id of list) {
      const c = CO[id];
      const li = el('li');
      const b = el('button', { type: 'button', class: 'hx-co' });
      const lane = MODEL.laneOf[id];
      const fam = MODEL.families.find(f => f.key === (lane && lane._family));
      const sw = el('span', { class: 'hx-swatch', 'aria-hidden': 'true' });
      sw.style.background = 'var(' + (fam ? fam.color : '--contractor-other') + ')';
      b.append(sw, el('span', null, c.name), el('span', { class: 'hx-co-years' }, lifeSpan(c)));
      b.addEventListener('click', () => { const s = document.getElementById('hxSearch'); s.value = c.name; state.q = c.name; update(); });
      li.append(b); ul.append(li);
    }
    who.append(ul);
  };
  if (e.type === 'rename') { addCos('Old name', e.from); addCos('New name', e.to); }
  else if (e.type === 'founded' || e.type === 'listing' || e.type === 'restructuring') addCos('Company', e.to.length ? e.to : e.from);
  else if (e.type === 'fleet' || e.type === 'divestment') { addCos('Seller', e.from); addCos('Buyer', e.to); }
  else if (e.type === 'spin-off' || e.type === 'jv') { addCos(e.type === 'jv' ? 'Partners' : 'Parent', e.from); addCos(e.type === 'jv' ? 'Joint venture' : 'Spun off', e.to); }
  else { addCos('Going in', e.from); addCos('Coming out', e.to); }
  body.append(who);
  if (e.conflict) body.append(el('p', { class: 'hx-note' }, 'Sources disagree on part of this; the details above give both.'));
  if (e.sources && e.sources.length) {
    body.append(el('h3', null, e.sources.length === 1 ? 'Source' : 'Sources'));
    const ul = el('ul', { class: 'hx-sources' });
    for (const s of e.sources) {
      const li = el('li');
      const kind = el('span', { class: 'hx-kind hx-kind-' + (s.kind || 'reference') }, (s.kind || 'reference') === 'primary' ? 'Primary' : (s.kind === 'press' ? 'Press' : 'Reference'));
      kind.title = SOURCE_KINDS[s.kind] || SOURCE_KINDS.reference;
      const label = [s.publisher, s.title].filter(Boolean).join(': ') + (s.date ? ' (' + formatDate(s.date) + ')' : '');
      if (s.url && /^https?:\/\//.test(s.url)) {
        const a = el('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer' }, label || s.url);
        li.append(kind, a);
      } else li.append(kind, el('span', null, label));
      ul.append(li);
    }
    body.append(ul);
  }
  panel.hidden = false;
  document.body.classList.add('hx-panel-open');
  panel.focus();
  for (const g of document.querySelectorAll('.hx-ev.is-open')) g.classList.remove('is-open');
  for (const g of document.querySelectorAll('[data-ev="' + CSS.escape(e.id) + '"]')) g.classList.add('is-open');
}
function closePanel() {
  const panel = document.getElementById('hxPanel');
  if (panel.hidden) return;
  panel.hidden = true;
  document.body.classList.remove('hx-panel-open');
  state.ev = null; writeHash();
  for (const g of document.querySelectorAll('.hx-ev.is-open')) g.classList.remove('is-open');
  if (panelReturn && document.contains(panelReturn)) panelReturn.focus();
}
function lifeSpan(c) {
  const a = c.start ? String(c.start).slice(0, 4) : '?';
  const b = c.end ? String(c.end).slice(0, 4) : (c.current ? 'today' : '?');
  return a + '–' + b;
}

/* ---------- list view (the table twin of the timeline) ---------- */
function renderList() {
  const box = document.getElementById('hxList');
  box.textContent = '';
  const famOk = e => e.from.concat(e.to).some(id => { const l = MODEL.laneOf[id]; return l && state.families.has(l._family); });
  const items = EVENTS.filter(e => famOk(e) && eventMatches(e)).reverse();
  document.getElementById('hxEmpty').hidden = items.length > 0;
  let decade = null, ol = null;
  for (const e of items) {
    const d = e._x === null ? 'Undated' : Math.floor(e._x / 10) * 10 + 's';
    if (d !== decade) {
      decade = d;
      box.append(el('h2', { class: 'hx-decade' }, d));
      ol = el('ol', { class: 'hx-events-list' });
      box.append(ol);
    }
    const li = el('li');
    const b = el('button', { type: 'button', class: 'hx-row' + (e.pending ? ' is-pending' : ''), 'data-ev': e.id });
    const lane = MODEL.laneOf[e.to[0]] || MODEL.laneOf[e.from[0]];
    const fam = MODEL.families.find(f => f.key === (lane && lane._family));
    const sw = el('span', { class: 'hx-swatch', 'aria-hidden': 'true' });
    sw.style.background = 'var(' + (fam ? fam.color : '--contractor-other') + ')';
    const s = svg('svg', { width: 14, height: 14, viewBox: '0 0 16 16', class: 'hx-row-glyph', 'aria-hidden': 'true', focusable: 'false' });
    s.append(glyph(e.type, 8, 8, 4.5));
    b.append(el('span', { class: 'hx-row-date' }, formatDate(e.date)), s,
      el('span', { class: 'hx-row-type' }, (TYPES[e.type] || {}).label + (e.pending ? ' (pending)' : '')),
      el('span', { class: 'hx-row-title' }, e.title), sw,
      el('span', { class: 'hx-row-fam' }, fam ? fam.name : ''));
    b.addEventListener('click', () => openPanel(e, b));
    li.append(b); ol.append(li);
  }
}

/* ---------- update ---------- */
function update(rescale) {
  writeHash();
  renderFamilyChips();
  const chart = document.getElementById('hxChart'), list = document.getElementById('hxList');
  for (const b of document.querySelectorAll('.hx-view button')) {
    const on = b.dataset.view === state.view;
    b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on));
  }
  chart.hidden = state.view !== 'chart';
  list.hidden = state.view !== 'list';
  if (state.view === 'chart') renderChart(!rescale); else renderList();
  const n = EVENTS.filter(e => eventMatches(e) && e.from.concat(e.to).some(id => { const l = MODEL.laneOf[id]; return l && state.families.has(l._family); })).length;
  document.getElementById('hxLive').textContent = n + (n === 1 ? ' event' : ' events') + ' shown';
}

/* ---------- theme (same toggle and storage as the rig map) ---------- */
const THEME_ICONS = {
  dark: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>',
  light: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>'
};
function initTheme() {
  const toggle = document.querySelector('[data-theme-toggle]');
  const root = document.documentElement;
  const cur = () => root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  const sync = t => {
    toggle.setAttribute('aria-label', t === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    toggle.innerHTML = THEME_ICONS[t];
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'dark' ? '#141313' : '#403F3F');
  };
  sync(cur());
  toggle.addEventListener('click', () => {
    const t = cur() === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', t);
    try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
    sync(t);
  });
}

/* ---------- start ---------- */
function init() {
  readHash();
  if (!location.hash && window.matchMedia('(max-width: 700px)').matches) state.view = 'list';
  initTheme();
  renderStats();
  initControls();
  renderLegend();
  document.getElementById('hxAsOf').textContent = DATA.asOf ? 'History as of ' + formatDate(DATA.asOf) : '';
  document.getElementById('hxPanelClose').addEventListener('click', closePanel);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePanel(); });
  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (state.view === 'chart') renderChart(true); }, 150); });
  const canvas = document.getElementById('hxCanvas');
  canvas.classList.add('is-intro');
  setTimeout(() => canvas.classList.remove('is-intro'), 1200);
  update(true);
  if (state.ev) { const e = EVENTS.find(x => x.id === state.ev); if (e) openPanel(e, null); }
}
init();
