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
const ROW_H = 34;        // one lane
const BAR_H = 6;         // thin lane bar
const PAD_L = 16;
let PAD_R = 175;         // room for the present-day names beside the end dots (widened below to fit the longest)
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
  // A company bought in stages joins its buyer once, at the takeover that ended it; earlier stake
  // purchases stay as event marks on the buyer's lane, not as joins.
  for (const lane of lanes) {
    const joins = lane.outbound.filter(l => l.kind === 'join' && !l.pending);
    if (!joins.length) continue;
    const endX = lane.end === null ? Infinity : lane.end;
    lane.terminal = joins.reduce((best, l) => Math.abs(l.e._x - endX) < Math.abs(best.e._x - endX) || (endX === Infinity && l.e._x > best.e._x) ? l : best);
    for (const l of joins) if (l !== lane.terminal) l.stake = true;
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
      const join = lane.terminal;
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
    const rows = orderRows(roots, members);
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
/* Row order inside a family. Each lane sits under the lane it fed; siblings are ordered so the curves cross
   as few other lanes as possible: first by when each one ends (the earliest nearest its parent, so a later
   join's curve passes only lanes that are already over), then a short search that moves a sibling wherever
   that removes a crossing. Today's company stays on top. */
function orderRows(roots, members) {
  const endOf = l => l.end === null ? NOW : l.end;
  const linkX = l => (l._via && l._via.e && l._via.e._x) || l.start || 0;
  const cmp = (a, b) => ((b.current && b.trackerName) ? 1 : 0) - ((a.current && a.trackerName) ? 1 : 0) || (endOf(a) - endOf(b)) || (linkX(a) - linkX(b));
  const kids = new Map(members.map(l => [l, l.children.slice().sort(cmp)]));
  const top = roots.slice().sort(cmp);
  const flatten = () => { const rows = []; (function walk(list) { for (const l of list) { rows.push(l); walk(kids.get(l)); } })(top); return rows; };
  const crossings = rows => {
    const at = new Map(rows.map((l, i) => [l, i]));
    let n = 0;
    for (const l of rows) {
      const links = [];
      if (l.terminal && at.has(l.terminal.to)) links.push([at.get(l), at.get(l.terminal.to), l.terminal.e._x]);
      for (const b of l.inbound) if (b.kind === 'branch' && at.has(b.from)) links.push([at.get(b.from), at.get(l), b.e._x]);
      for (const [a, b, x] of links) for (let r = Math.min(a, b) + 1; r < Math.max(a, b); r++) { const m = rows[r]; if (m.start < x - 0.05 && endOf(m) > x + 0.05) n++; }
    }
    return n;
  };
  let best = crossings(flatten());
  for (let pass = 0, better = true; better && best > 0 && pass < 12; pass++) {
    better = false;
    for (const p of members) {
      const n = kids.get(p).length;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const was = kids.get(p), next = was.slice();
        next.splice(j, 0, next.splice(i, 1)[0]);
        kids.set(p, next);
        const c = crossings(flatten());
        if (c < best) { best = c; better = true; } else kids.set(p, was);
      }
    }
  }
  return flatten();
}
function famRank(k) { const i = FAMILY_ORDER.indexOf(k); return k === GONE_FAMILY ? 999 : (i < 0 ? 500 : i); }

const MODEL = buildModel();
PAD_R = Math.min(240, Math.max(PAD_R, ...MODEL.lanes.filter(l => l.current && l.end === null).map(l => Math.ceil(l.name.length * 7.2) + 24)));

/* ---------- landmarks and stories ----------
   Each family's headline deals: the biggest by stated US-dollar value, or, where no value is given,
   by how much of the family's history a deal brought in. These get large labelled marks, lead the
   at-a-glance cards and name the steps in each family's one-line story. */
const SUFFIX = /[,]?\s+(Inc\.?|Corporation|Corp\.?|Company|Co\.|Ltd\.?|Limited|plc|PLC|ASA|AS|A\/S|S\.A\.|SE|LLC|N\.V\.|Holding|Holdings|S\.p\.A\.)$/;
function shortName(name) {
  let n = String(name || '').replace(/\s*\(.*?\)\s*/g, ' ').trim();
  for (let i = 0; i < 3; i++) n = n.replace(SUFFIX, '').trim();
  return n;
}
function usd(v) {
  const m = /US\$\s?([\d.,]+)\s*(billion|million|bn|m)\b/i.exec(v || '');
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ''));
  return /^b/i.test(m[2]) ? n * 1e9 : n * 1e6;
}
function subtreeSize(lane) { return 1 + lane.children.reduce((a, c) => a + subtreeSize(c), 0); }
function familyStory(fam) {
  const inFam = new Set(fam.lanes);
  const head = fam.lanes.find(l => l.current && l.trackerName) || fam.lanes[0];
  // the trunk: the present-day lane and, going back, the biggest company that fed each step of it
  const trunk = new Map(); // lane -> steps back from today's company
  for (let l = head, d = 0; l && !trunk.has(l); d++) {
    trunk.set(l, d);
    const feeders = l.inbound.filter(k => k.kind === 'join' && !k.stake && !k.pending && inFam.has(k.from)).map(k => k.from);
    l = feeders.sort((a, b) => subtreeSize(b) - subtreeSize(a))[0];
  }
  const cands = [];
  for (const e of fam.events) {
    if (e.pending) continue;
    let lanes = [], target = null, score = 0, label = '';
    if (e.type === 'merger' || e.type === 'acquisition') {
      lanes = fam.lanes.filter(l => l.outbound.some(k => k.e === e && k.kind === 'join' && !k.stake));
      target = MODEL.laneOf[e.to[0]];
      if (!lanes.length) continue;
      score = Math.max(usd(e.value) || 0, lanes.reduce((a, l) => a + subtreeSize(l), 0) * 4e8) * (e.type === 'merger' ? 1.5 : 1);
      lanes.sort((a, b) => subtreeSize(b) - subtreeSize(a));
      const formed = e.type === 'merger' && target && target.start !== null && Math.abs(target.start - e._x) < 0.6;
      const names = lanes.map(l => shortName(l.segs[l.segs.length - 1].name));
      label = formed ? shortName(target.segs[0].name) + ' formed' : (names.length > 1 && names.slice(0, 2).join('–').length <= 30 ? names.slice(0, 2).join('–') : names[0]);
    } else if (e.type === 'spin-off' || e.type === 'jv') {
      lanes = fam.lanes.filter(l => l.inbound.some(k => k.e === e && k.kind === 'branch'));
      if (!lanes.length || lanes.includes(head)) continue;
      target = MODEL.laneOf[e.from.find(id => MODEL.laneOf[id] && inFam.has(MODEL.laneOf[id]))] || lanes[0]; // judged by its parent
      score = subtreeSize(lanes[0]) * 2e8;
      label = shortName(lanes[0].segs[lanes[0].segs.length - 1].name) + (e.type === 'jv' ? ' joint venture' : ' spin-off');
    } else if (e.type === 'fleet') {
      target = MODEL.laneOf[e.to[0]];
      const v = usd(e.value);
      if (!target || !inFam.has(target) || !v || v < 2e8) continue;
      const seller = e.from.map(id => CO[id]).find(Boolean);
      if (!seller) continue; // new rigs from a shipyard
      lanes = e.from.map(id => MODEL.laneOf[id]).filter(l => l && inFam.has(l));
      score = v; label = 'rigs from ' + shortName(seller.name);
    } else continue;
    const depth = target && trunk.has(target) ? trunk.get(target) : 99;
    score *= [3, 2][depth] || 1;
    cands.push({ e, score, label, lane: target, lanes, depth, main: depth <= 1 });
  }
  // steps that built today's company directly come first; the next tier back fills a short list.
  // Spin-offs and joint ventures send business out rather than build the company, so they are steps only
  // when a family has nothing else to show (the story names them separately).
  const byScore = (a, b) => (b.score - a.score) || (b.e._x - a.e._x);
  const core = cands.filter(c => c.e.type !== 'jv' && c.e.type !== 'spin-off');
  const main = core.filter(c => c.main).sort(byScore);
  let picks = main.length >= 2 ? main.slice(0, 3) : cands.slice().sort(byScore).slice(0, 3);
  if (main.length >= 2 && picks.length < 3) picks = picks.concat(core.filter(c => c.depth === 2).sort(byScore).slice(0, 3 - picks.length));
  const landmarks = picks.sort((a, b) => a.e._x - b.e._x);
  const starts = fam.lanes.filter(l => !l.startUnknown && l.start !== null).map(l => l.start);
  const since = starts.length ? Math.floor(Math.min(...starts)) : null;
  // companies the driller spun off or set up (and their own offshoots) are offshoots, not companies it brought together
  const offshoots = new Set();
  for (const l of fam.lanes) {
    for (let cur = l, guard = 0; cur && cur !== head && guard++ < 40; ) {
      const v = cur._via;
      if (!v) break;
      if (v.kind === 'branch' && trunk.has(v.from)) { offshoots.add(l); break; } // set up by today's company or a company on its main line
      cur = v.kind === 'branch' ? v.from : v.to;
    }
  }
  const others = fam.lanes.length - 1 - offshoots.size;
  const who = shortName(head.name);
  const offNames = [...offshoots].filter(l => l._via && l._via.from === head).map(l => shortName(l.segs[0].name));
  const offText = offNames.length ? ' It also spun off or set up ' + (offNames.length <= 2 ? offNames.join(' and ') : offNames.length + ' companies') + '.' : '';
  let text;
  if (!others) text = who + (since ? ' dates from ' + since : '') + (offNames.length ? '.' + offText : ' and has no recorded mergers or spin-offs.');
  else {
    text = who + ' brings together ' + others + ' other ' + (others === 1 ? 'company' : 'companies') + (since ? ', going back to ' + since : '') + '.';
    if (landmarks.length) {
      const parts = landmarks.map(c => c.label + ' (' + String(c.e.date).slice(0, 4) + ')');
      text += ' The biggest steps: ' + (parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1] : parts[0]) + '.';
    }
  }
  // don't repeat an offshoot the steps above already name
  const named = new Set(landmarks.map(c => c.label.replace(/ (spin-off|joint venture)$/, '')));
  const offRest = offNames.filter(n => !named.has(n));
  const offText2 = offRest.length ? ' It also spun off or set up ' + (offRest.length <= 2 ? offRest.join(' and ') : offRest.length + ' companies') + '.' : '';
  if (others) text += offText2;
  const pending = EVENTS.filter(e => e.pending && e.from.concat(e.to).some(id => { const l = MODEL.laneOf[id]; return l && inFam.has(l); }));
  if (pending.length) text += ' Pending: ' + pending.map(e => e.title.replace(/ \(pending\)$/, '')).join('; ') + '.';
  return { text, landmarks, since, head, trunk, pending };
}
for (const fam of MODEL.families) Object.assign(fam, familyStory(fam));
const LANDMARK_IDS = new Set(MODEL.families.flatMap(f => f.landmarks.map(c => c.e.id)));

/* ---------- state ---------- */
const state = { families: new Set(MODEL.families.map(f => f.key)), type: 'all', era: 'all', q: '', view: 'chart', ev: null, expanded: new Set() };

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

/* a card's miniature family tree: every company in the family as a hairline on one shared time scale
   (recent decades drawn wider, as on the main chart), today's company bold, joins curving into the lane they
   joined, and the card's headline deals as dots. Decorative: the card's text says the same in words. */
const MINI = { w: 240, pad: 4, y0: 1910 };
function miniX(y) {
  const t = Math.max(0, Math.min(1, (y - MINI.y0) / (NOW - MINI.y0)));
  return MINI.pad + (MINI.w - 2 * MINI.pad) * Math.pow(t, 1.8);
}
function miniTree(fam) {
  const lanes = fam.lanes, n = lanes.length;
  const gap = n > 1 ? Math.max(2.4, Math.min(7, 44 / (n - 1))) : 0;
  const h = Math.round(10 + gap * (n - 1) + 14);
  const rowY = new Map(lanes.map((l, i) => [l, 6 + i * gap]));
  const box = el('span', { class: 'hx-mini', 'aria-hidden': 'true' });
  const s = svg('svg', { viewBox: '0 0 ' + MINI.w + ' ' + h, preserveAspectRatio: 'none', width: '100%', height: h, focusable: 'false' });
  const grid = svg('g', { class: 'hx-mini-grid' });
  for (const y of [1950, 2000]) grid.append(svg('path', { d: `M${miniX(y)} 0V${h - 12}` }));
  grid.append(svg('path', { d: `M${miniX(NOW)} 0V${h - 12}`, class: 'is-now' }));
  s.append(grid);
  const g = svg('g', { class: 'hx-mini-lanes' });
  // side lanes first, so today's company draws on top
  for (const lane of lanes.slice().reverse()) {
    const y = rowY.get(lane);
    const x0 = miniX(lane.start === null ? MINI.y0 : lane.start);
    const join = lane.terminal && rowY.has(lane.terminal.to) ? lane.terminal : null;
    const x1 = miniX(join ? join.e._x : (lane.end === null ? NOW : lane.end));
    let d = `M${x0} ${y}H${Math.max(x0, x1 - 3)}`;
    if (join) { const ty = rowY.get(join.to); d += `C${x1} ${y} ${x1 - 1} ${ty} ${x1 + 1.5} ${ty}`; }
    const branch = lane.inbound.find(l => l.kind === 'branch' && rowY.has(l.from));
    if (branch) { const py = rowY.get(branch.from), bx = miniX(branch.e._x); d = `M${bx} ${py}C${bx + 2} ${py} ${x0 - 1} ${y} ${x0 + 2} ${y}` + d.replace(/^M[^H]+/, ''); }
    g.append(svg('path', { d, class: lane === fam.head ? 'is-head' : (lane.startUnknown ? 'is-faint' : null) }));
  }
  s.append(g);
  const hy = rowY.get(fam.head);
  const dots = svg('g', { class: 'hx-mini-dots' });
  const dot = (x, cls) => { const d = `M${x} ${hy}h0`; dots.append(svg('path', { d, class: 'is-ring' }), svg('path', { d, class: cls || null })); };
  for (const c of fam.landmarks) dot(miniX(c.e._x));
  if (fam.head.current) dot(miniX(NOW), 'is-end');
  s.append(dots);
  box.append(s);
  const axis = el('span', { class: 'hx-mini-axis' });
  for (const [y, label] of [[1950, '1950'], [2000, '2000'], [NOW, 'today']]) {
    const t = el('span', null, label);
    t.style.left = (miniX(y) / MINI.w * 100) + '%';
    axis.append(t);
  }
  box.append(axis);
  return box;
}

/* at a glance: one card per driller, its size and headline deals; each opens its family on the timeline */
function renderGlance() {
  const box = document.getElementById('hxGlance');
  box.textContent = '';
  for (const fam of MODEL.families) {
    if (fam.key === GONE_FAMILY) continue;
    const a = el('a', { href: '#fam-' + cssId(fam.key), class: 'hx-card' });
    a.style.setProperty('--fam', 'var(' + fam.color + ')');
    const top = el('span', { class: 'hx-card-head' });
    const count = el('span', { class: 'hx-card-count' });
    count.append(el('span', { class: 'hx-card-num' }, String(fam.lanes.length)), el('span', { class: 'hx-card-unit' }, fam.lanes.length === 1 ? 'company' : 'companies'));
    top.append(el('span', { class: 'hx-swatch', 'aria-hidden': 'true' }), el('span', { class: 'hx-card-name' }, fam.name), count);
    a.append(top);
    a.append(el('span', { class: 'hx-card-meta' }, fam.since ? 'Roots in ' + fam.since : 'Founding date unknown'));
    a.append(miniTree(fam));
    const ul = el('span', { class: 'hx-card-deals' });
    if (fam.landmarks.length) {
      for (const c of fam.landmarks) {
        const li = el('span', { class: 'hx-card-deal' });
        li.append(el('span', { class: 'hx-card-year' }, String(c.e.date).slice(0, 4)), el('span', null, c.label));
        ul.append(li);
      }
    } else ul.append(el('span', { class: 'hx-card-deal is-none' }, fam.lanes.length > 1 ? 'No major deals recorded' : 'No recorded mergers or spin-offs'));
    // a pending deal is a plain row naming the other side, not a badge
    for (const e of fam.pending) {
      const other = e.from.concat(e.to).map(id => CO[id]).find(c => c && !fam.lanes.some(l => l.segs.some(s => s.id === c.id)));
      const li = el('span', { class: 'hx-card-deal is-pending' });
      li.append(el('span', { class: 'hx-card-year' }, String(e.date).slice(0, 4)), el('span', null, (other ? shortName(other.name) + ' ' : '') + e.type + ', pending'));
      ul.append(li);
    }
    a.append(ul);
    a.addEventListener('click', ev => {
      ev.preventDefault();
      state.families.add(fam.key);
      state.view = 'chart';
      // a search or event filter that would hide this family is cleared, so the card always lands on it
      const shown = fam.events.some(eventMatches) || (state.q && fam.lanes.some(laneMatches));
      if ((state.q || state.type !== 'all') && !shown) {
        state.q = ''; state.type = 'all';
        document.getElementById('hxSearch').value = '';
        document.getElementById('hxType').value = 'all';
      }
      update();
      const sec = document.getElementById('fam-' + cssId(fam.key));
      if (sec) {
        sec.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
        const h = sec.querySelector('.hx-family-head');
        if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
      }
    });
    box.append(a);
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
    // quiet years shrink; busy years widen, and the busiest (a deal every month or so) widen further
    return 0.35 + 1.65 * Math.min(1, sm / 3) + 1.4 * Math.min(1, Math.max(0, sm - 4) / 12);
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

const COMPACT_MAX = 6;   // families with more lanes than this open compact

/* the lanes a compact family shows: today's company, its main line, and every company behind a headline deal,
   with the lanes that connect them */
function keyLanes(fam) {
  const keep = new Set([fam.head]);
  for (const [l, d] of fam.trunk) if (d <= 1) keep.add(l);
  for (const c of fam.landmarks) for (const l of [c.lane].concat(c.lanes || [])) if (l) keep.add(l);
  const famSet = new Set(fam.lanes);
  for (const l of [...keep]) {
    for (let cur = l, guard = 0; cur && guard++ < 40; ) {
      keep.add(cur);
      const v = cur._via;
      const next = v ? (v.kind === 'branch' ? v.from : v.to) : null;
      cur = next && famSet.has(next) ? next : null;
    }
  }
  return keep;
}

function familyBlock(fam) {
  const sec = el('section', { class: 'hx-family', 'aria-labelledby': 'hxf-' + cssId(fam.key), id: 'fam-' + cssId(fam.key) });
  sec.style.setProperty('--fam', 'var(' + fam.color + ')');
  const headWrap = el('div', { class: 'hx-family-top' });
  const head = el('h2', { class: 'hx-family-head', id: 'hxf-' + cssId(fam.key) });
  head.append(el('span', { class: 'hx-swatch', 'aria-hidden': 'true' }), el('span', { class: 'hx-family-name' }, fam.name));
  const deals = fam.events.filter(e => !['founded', 'listing'].includes(e.type)).length;
  head.append(el('span', { class: 'hx-family-meta' }, fam.lanes.length + (fam.lanes.length === 1 ? ' company' : ' companies') + ' · ' + deals + (deals === 1 ? ' event' : ' events')));
  headWrap.append(head, el('p', { class: 'hx-family-story' }, fam.text));

  // compact by default: big families show their key lanes until opened
  const filtering = !!state.q || state.type !== 'all';
  const canCompact = !filtering && fam.lanes.length > COMPACT_MAX;
  const full = !canCompact || state.expanded.has(fam.key);
  const keep = full ? null : keyLanes(fam);
  const vis = full ? fam.lanes : fam.lanes.filter(l => keep.has(l));
  if (canCompact) {
    const btn = el('button', { type: 'button', class: 'hx-more', 'aria-expanded': String(full), 'aria-controls': 'hxs-' + cssId(fam.key) },
      full ? 'Show fewer companies' : 'Show all ' + fam.lanes.length + ' companies (' + (fam.lanes.length - vis.length) + ' more)');
    btn.addEventListener('click', () => {
      if (full) state.expanded.delete(fam.key); else state.expanded.add(fam.key);
      update();
      const again = document.getElementById('fam-' + cssId(fam.key));
      if (again) { again.querySelector('.hx-more').focus(); if (full) again.scrollIntoView({ block: 'nearest' }); }
    });
    headWrap.append(btn);
  }
  sec.append(headWrap);

  const famSet = new Set(fam.lanes), visSet = new Set(vis);
  const rowOf = new Map(vis.map((l, i) => [l, i]));
  const bandPlan = planBand(fam);
  const band = fam.landmarks.length ? 8 + bandPlan.rows * BAND_ROW + 4 : 6;
  const h = band + vis.length * ROW_H + 14;
  const s = svg('svg', { width: scale.width, height: h, class: 'hx-family-svg', role: 'group', id: 'hxs-' + cssId(fam.key), 'aria-label': fam.name + ' family timeline' });
  const yOf = lane => band + 8 + rowOf.get(lane) * ROW_H + ROW_H - 9;

  // decade grid and today line, below the headline band
  const grid = svg('g', { class: 'hx-grid', 'aria-hidden': 'true' });
  for (let y = Math.ceil(scale.minY / 10) * 10; y <= scale.maxY; y += 10) grid.append(svg('line', { x1: scale.x(y), x2: scale.x(y), y1: band - 4, y2: h }));
  grid.append(svg('line', { x1: scale.x(NOW), x2: scale.x(NOW), y1: band - 4, y2: h, class: 'hx-now' }));
  s.append(grid);

  const links = svg('g', { class: 'hx-links', 'aria-hidden': 'true' });
  const lanesG = svg('g', { class: 'hx-lanes' });
  const marks = svg('g', { class: 'hx-events' });
  const bandG = svg('g', { class: 'hx-band', 'aria-hidden': 'true' });

  const boxes = [];   // every label drawn so far: notes may not cross any of them
  const deferred = []; // notes, placed once all the lane names are down
  for (const lane of vis) {
    const y = yOf(lane);
    const x0 = lane.start === null ? scale.x(scale.minY) : scale.x(lane.start);
    const x1 = scale.x(lane.end === null ? NOW : lane.end);
    const g = svg('g', { class: 'hx-lane' + (lane.current ? ' is-current' : '') + (laneMatches(lane) ? '' : ' is-dim'), 'data-lane': lane.i });
    // bar, leaving room for the curve into the lane it joined
    const joinOut = lane.terminal && visSet.has(lane.terminal.to) ? lane.terminal : null;
    const branchIn = lane.inbound.find(l => l.kind === 'branch' && visSet.has(l.from));
    const bx0 = branchIn ? Math.min(x1, x0 + JOIN) : x0;
    const bx1 = joinOut ? Math.max(bx0, x1 - JOIN) : x1;
    g.append(svg('rect', { x: bx0, y: y - BAR_H / 2, width: Math.max(2, bx1 - bx0), height: BAR_H, rx: BAR_H / 2, class: 'hx-bar' + (lane.startUnknown ? ' is-fade' : '') }));
    if (lane.current && lane.end === null) g.append(svg('circle', { cx: x1, cy: y, r: 5, class: 'hx-end' }));
    // names: the present-day name sits beside its end dot; earlier names label their own stretch where they fit
    const segX = lane.segs.map((c, k) => k === 0 ? bx0 : scale.x(parseDate(lane.renames[k - 1].date, true)));
    let labelEnd = -1e9;
    lane.segs.forEach((c, k) => {
      const lastSeg = k === lane.segs.length - 1;
      if (lastSeg && lane.current && lane.end === null) {
        // a name too long for the right margin drops its legal suffix (the full name is in the tooltip and panel)
        const room = (PAD_R - 18) / 7.2;
        const shown = c.name.length <= room ? c.name : shortName(c.name);
        const t = svg('text', { x: x1 + 10, y: y + 4, class: 'hx-lane-label is-end' + (lane.trackerName ? ' is-current' : '') }, shown);
        if (shown !== c.name) t.append(svg('title', null, c.name));
        g.append(t);
        boxes.push({ a: x1 + 10, b: x1 + 10 + shown.length * 7.2, top: y - 7, bot: y + 7 });
        return;
      }
      const sx = Math.max(segX[k], labelEnd + 8);
      const nx = lastSeg ? (lane.current ? x1 - 6 : x1 + PAD_R - 8) : segX[k + 1];
      const est = c.name.length * 6.7;
      if (k === 0 || sx + est <= Math.max(nx, sx + 1) + (lastSeg ? 60 : 0)) {
        const t = svg('text', { x: sx + 2, y: y - 8, class: 'hx-lane-label' }, c.name);
        if (k === 0 && lane.startUnknown) t.append(svg('tspan', { class: 'hx-unknown' }, ' · founding date unknown'));
        g.append(t);
        labelEnd = sx + 2 + est + (k === 0 && lane.startUnknown ? 160 : 0);
        boxes.push({ a: sx + 2, b: labelEnd, top: y - 19, bot: y - 5 });
      }
    });
    // notes for links to other families and outside companies: drawn under the lane, skipped where they would overlap
    // (every one of these events still has its mark and its panel)
    const notes = [];
    for (const l of lane.inbound) {
      if (famSet.has(l.from) || l.stake) continue;
      notes.push({ x: scale.x(l.e._x), side: 'before', text: (l.kind === 'branch' ? 'from ' : '') + l.from.name + (l.pending ? ' (pending)' : '') + (l.kind === 'join' ? ' →' : '') });
    }
    for (const l of lane.outbound) {
      if ((famSet.has(l.to) && !l.pending) || l.stake) continue;
      const lx = scale.x(l.e._x);
      notes.push({ x: lx, side: 'after', pending: l.pending, text: (l.kind === 'join' ? '→ into ' : '→ spun off ') + l.to.name + (l.pending ? ' (pending)' : '') });
      if (l.pending) g.append(svg('path', { d: `M${x1} ${y}H${lx + 4}`, class: 'hx-pending' }));
    }
    for (const o of lane.outsideIn) notes.push({ x: scale.x(o.e._x), side: 'before', text: 'from ' + o.name });
    for (const o of lane.outsideOut) notes.push({ x: scale.x(o.e._x), side: 'after', text: '→ ' + o.name });
    for (const n of notes) {
      const w = n.text.length * 5.9;
      if (n.side === 'after') { n.a = n.x + 8; n.b = n.a + w; n.anchor = 'start'; }
      else if (n.x > w + 12) { n.b = n.x - 6; n.a = n.b - w; n.anchor = 'end'; }
      else { n.a = 4; n.b = 4 + w; n.anchor = 'start'; }
    }
    for (const n of notes) deferred.push(Object.assign(n, { g, y, w: n.text.length * 5.9 }));
    g.addEventListener('pointerenter', () => highlightLineage(lane));
    g.addEventListener('pointerleave', clearHighlight);
    lanesG.append(g);

    // curves within the family
    if (joinOut) {
      const ty = yOf(joinOut.to), ex = scale.x(joinOut.e._x);
      links.append(svg('path', { d: `M${ex - JOIN} ${y}C${ex - 6} ${y} ${ex - 10} ${ty} ${ex} ${ty}`, class: 'hx-link', 'data-lane': lane.i }));
    }
    for (const b of lane.inbound.filter(l => l.kind === 'branch' && visSet.has(l.from))) {
      const py = yOf(b.from), sx = scale.x(b.e._x);
      links.append(svg('path', { d: `M${sx} ${py}C${sx + 10} ${py} ${sx + 6} ${y} ${sx + JOIN} ${y}`, class: 'hx-link' + (b.pending ? ' is-pending' : ''), 'data-lane': lane.i }));
    }
  }

  // notes: under their lane, on the side they belong to or else the other side; dropped if neither is clear
  // of every label (the event keeps its mark and its panel either way)
  const clear = (a, b, top, bot) => !boxes.some(t => a < t.b + 6 && t.a < b + 6 && top < t.bot && t.top < bot);
  deferred.sort((p, q) => (q.pending ? 1 : 0) - (p.pending ? 1 : 0) || p.a - q.a);
  for (const n of deferred) {
    const top = n.y + 6, bot = n.y + 18;
    const after = { a: n.x + 8, b: n.x + 8 + n.w, anchor: 'start' };
    const before = n.x > n.w + 12 ? { a: n.x - 6 - n.w, b: n.x - 6, anchor: 'end' } : { a: 4, b: 4 + n.w, anchor: 'start' };
    const spot = (n.side === 'after' ? [after, before] : [before, after]).find(o => clear(o.a, o.b, top, bot));
    if (!spot) continue;
    boxes.push({ a: spot.a, b: spot.b, top, bot });
    n.g.append(svg('text', { x: spot.anchor === 'end' ? spot.b : spot.a, y: n.y + 15, 'text-anchor': spot.anchor, class: 'hx-xref' + (n.pending ? ' is-pending' : '') }, n.text));
  }

  // event markers: on the lane the event happened to; headline deals are larger
  const placed = {}, pos = {};
  for (const e of fam.events) {
    const lane = markerLane(e, visSet);
    if (!lane || e._x === null) continue;
    let x = scale.x(e._x);
    const y = yOf(lane);
    const big = LANDMARK_IDS.has(e.id) && fam.landmarks.some(c => c.e === e);
    const key = lane.i + ':' + Math.round(x / 9);
    placed[key] = (placed[key] || 0) + 1;
    if (placed[key] > 1 && !big) x += (placed[key] - 1) * 9; // nudge markers that would sit on one another
    pos[e.id] = { x, y };
    const g = svg('g', { class: 'hx-ev hx-ev-' + e.type + (big ? ' is-landmark' : '') + (e.pending ? ' is-pending' : '') + (eventMatches(e) ? '' : ' is-dim'),
      tabindex: '0', role: 'button', 'aria-label': eventLabel(e), 'data-ev': e.id });
    g.append(svg('circle', { cx: x, cy: y, r: big ? 14 : 12, class: 'hx-hit' }));
    g.append(glyph(e.type, x, y, big ? 7 : 4.5));
    g.addEventListener('click', () => openPanel(e, g));
    g.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openPanel(e, g); } });
    g.addEventListener('pointerenter', ev => showTip(e, ev));
    g.addEventListener('pointerleave', hideTip);
    g.addEventListener('focus', () => showTipAt(e, g));
    g.addEventListener('blur', hideTip);
    if (big) marks.append(g); else marks.insertBefore(g, marks.firstChild);
  }

  // headline band: each big deal named above the lanes, with a hairline down to its mark
  for (const b of bandPlan.items) {
    const p = pos[b.c.e.id];
    if (!p) continue;
    const ty = 8 + (b.row + 1) * BAND_ROW - 5;
    bandG.append(svg('path', { d: `M${p.x} ${ty + 4}V${p.y - 9}`, class: 'hx-leader' }));
    bandG.append(svg('text', { x: b.tx, y: ty, 'text-anchor': b.anchor, class: 'hx-band-label' }, b.text));
  }
  s.append(bandG, links, lanesG, marks);
  sec.append(s);
  return sec;
}

/* headline band layout: each deal's name goes centred over its mark, or ending or starting at it, in the
   first row where it fits; deals bunched in a few years stack into as many rows as they need */
const BAND_ROW = 18;
function planBand(fam) {
  const rows = [], items = [];
  for (const c of fam.landmarks) {
    const x = scale.x(c.e._x);
    const text = c.label + ', ' + String(c.e.date).slice(0, 4);
    const w = text.length * 6.6;
    const fit = a => Math.min(scale.width - w - 6, Math.max(PAD_L, a));
    const opts = [fit(x - w / 2), fit(x - w + 12), fit(x - 12)];
    let row = -1, a = opts[0];
    for (let r = 0; r <= rows.length && row < 0; r++) {
      const taken = rows[r] || [];
      const o = opts.find(o => !taken.some(t => o < t.b + 12 && t.a < o + w + 12));
      if (o !== undefined) { row = r; a = o; }
    }
    (rows[row] = rows[row] || []).push({ a, b: a + w });
    items.push({ c, row, text, tx: a, anchor: 'start' });
  }
  return { rows: Math.max(1, rows.length), items };
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
      if (s.opened === false) li.append(el('span', { class: 'hx-unopened' }, 'cited, not opened by us'));
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
  if (c.outside && !c.start && !c.end) return 'outside the tree';
  const a = c.start ? String(c.start).slice(0, 4) : '?';
  const b = c.end ? String(c.end).slice(0, 4) : (c.current || c.active ? 'today' : '?');
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
  renderGlance();
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
