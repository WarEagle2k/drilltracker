/* DrillTracker Insights view. Loaded after app.js and uses its data and helpers
   (RIG_DATA, filteredRigs, AS_OF, FIRMNESS, escapeHtml, openDetail, ...).

   Every chart follows the filters, draws its colours from CSS variables (so the
   theme switch needs no re-render), has a hover/focus tooltip and a table view.
   Colours: contract firmness is ordinal (one blue ramp, darkest = firm); rig type
   is categorical (validated slots 1-3, plus a marker shape each); the heatmap is
   sequential (one ramp); highlights use the brand accent against a grey. */

const FIRM_ORDER = ['firm', 'loi', 'conditional', 'option'];
const AWARDED = ['firm', 'loi', 'conditional'];
const TYPE_ORDER = ['Drillship', 'Semisubmersible', 'Jackup'];
const TYPE_KEY = { Drillship: 'drillship', Semisubmersible: 'semisub', Jackup: 'jackup' };
const COVERAGE_MONTHS = 36;
const OPEN_END_MONTHS = 6;   // a contract with no published end is counted for this long
const HEAT_QUARTERS = 12;
const SCATTER_FROM = new Date(2022, 0, 1);

let vizTips = [];            // tooltip content for the marks of the current render
let tipSource = null;        // 'pointer' or 'focus': what opened the tooltip

/* ============================================
   CALCULATIONS (pure; tested in scripts/test-insights.js)
   ============================================ */
function monthStart(d, add) { return new Date(d.getFullYear(), d.getMonth() + (add || 0), 1); }
function quarterStart(d, add) { return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3 + 3 * (add || 0), 1); }
function quarterLabel(d) { return 'Q' + (Math.floor(d.getMonth() / 3) + 1) + ' ' + d.getFullYear(); }

/* Does contract x cover date t? An open-ended contract counts for OPEN_END_MONTHS. */
function covers(x, t) {
  if (!x.s || x.s > t) return false;
  return x.e ? x.e >= t : t < addMonths(x.s, OPEN_END_MONTHS);
}

/* The firmest contract covering t, or null */
function tierAt(rig, t) {
  let best = null;
  rig.derived.contracts.forEach(function (x) {
    if (!covers(x, t)) return;
    if (best === null || FIRM_ORDER.indexOf(x.k.firmness) < FIRM_ORDER.indexOf(best)) best = x.k.firmness;
  });
  return best;
}

/* Rigs booked each month for COVERAGE_MONTHS, by the firmest contract covering the month */
function coverageByMonth(rigs) {
  const out = [];
  for (let m = 0; m <= COVERAGE_MONTHS; m++) {
    const t = m === 0 ? AS_OF : monthStart(AS_OF, m);
    const row = { t: t, firm: 0, loi: 0, conditional: 0, option: 0, open: 0 };
    rigs.forEach(r => { const tier = tierAt(r, t); row[tier || 'open']++; });
    out.push(row);
  }
  return out;
}

/* Share of rigs with awarded (non-option) work on date t */
function bookedShare(rigs, t) {
  if (!rigs.length) return null;
  return rigs.filter(r => AWARDED.includes(tierAt(r, t))).length / rigs.length;
}

/* Rigs coming free by quarter of their booked-to date */
function rollOff(rigs) {
  const buckets = [{ label: 'Open now', short: 'Now', rigs: [], near: true }];
  for (let q = 0; q < HEAT_QUARTERS; q++) {
    const s = quarterStart(AS_OF, q);
    buckets.push({ label: quarterLabel(s), short: 'Q' + (Math.floor(s.getMonth() / 3) + 1) + '|' + String(s.getFullYear()).slice(2),
                   s: s, e: quarterStart(AS_OF, q + 1), rigs: [], near: s <= addMonths(AS_OF, NEAR_TERM_MONTHS) });
  }
  const later = { label: 'Later', short: 'Later', rigs: [], near: false };
  let undisclosed = 0;
  rigs.forEach(function (r) {
    const d = r.derived;
    if (d.available) return buckets[0].rigs.push(r);
    if (d.bookedOpen || !d.bookedTo) return undisclosed++;
    const b = buckets.find(b => b.s && d.bookedTo >= b.s && d.bookedTo < b.e);
    (b || (d.bookedTo < AS_OF ? buckets[0] : later)).rigs.push(r);
  });
  buckets.push(later);
  return { buckets: buckets, undisclosed: undisclosed };
}

/* Every disclosed rate period, as a point: start date x day rate */
function rateFixtures(rigs) {
  const pts = [];
  rigs.forEach(function (r) {
    r.derived.contracts.forEach(function (x) {
      if (x.k.dayRate == null || !x.s) return;
      pts.push({ rig: r, x: x, t: x.s, rate: x.k.dayRate, type: r.type });
    });
  });
  return pts;
}

/* Median disclosed floater rate: contracts running now vs contracts starting later */
function forwardRates(rigs) {
  const pts = rateFixtures(rigs).filter(p => p.type !== 'Jackup');
  const now = pts.filter(p => p.x.s <= AS_OF && (!p.x.e || p.x.e >= AS_OF)).map(p => p.rate);
  const fwd = pts.filter(p => p.x.s > AS_OF).map(p => p.rate);
  return { now: median(now), nowN: now.length, fwd: median(fwd), fwdN: fwd.length };
}

/* Rig-years of awarded work after the data date (open-ended contracts excluded) */
function rigYears(x) {
  if (!x.s || !x.e || !AWARDED.includes(x.k.firmness)) return 0;
  const from = x.s > AS_OF ? x.s : AS_OF;
  return Math.max(0, (x.e - from) / DAY_MS / 365.25);
}

function firmRigYears(rigs) {
  return rigs.reduce((sum, r) => sum + r.derived.contracts.reduce((s, x) => s + (x.k.firmness === 'firm' ? rigYears(x) : 0), 0), 0);
}

function customerExposure(rigs) {
  const m = {};
  rigs.forEach(function (r) {
    r.derived.contracts.forEach(function (x) {
      const y = rigYears(x);
      if (y > 0) { const c = x.k.customer || 'Undisclosed'; m[c] = (m[c] || 0) + y; }
    });
  });
  return Object.keys(m).map(k => ({ label: k, value: m[k] })).sort((a, b) => b.value - a.value);
}

/* Share of each contractor's rigs with awarded work, quarter by quarter */
function contractorRunway(rigs) {
  const quarters = [];
  for (let q = 0; q < HEAT_QUARTERS; q++) {
    const s = quarterStart(AS_OF, q);
    quarters.push({ label: quarterLabel(s), mid: new Date(s.getFullYear(), s.getMonth() + 1, 15) });
  }
  quarters[0].mid = AS_OF > quarters[0].mid ? AS_OF : quarters[0].mid;
  const byC = {};
  rigs.forEach(r => { (byC[r.contractor] = byC[r.contractor] || []).push(r); });
  const rows = Object.keys(byC).sort((a, b) => byC[b].length - byC[a].length || a.localeCompare(b)).map(function (c) {
    return { contractor: c, n: byC[c].length, cells: quarters.map(function (q) {
      const booked = byC[c].filter(r => AWARDED.includes(tierAt(r, q.mid))).length;
      return { booked: booked, share: booked / byC[c].length };
    }) };
  });
  return { quarters: quarters, rows: rows };
}

/* ============================================
   SMALL SVG HELPERS
   ============================================ */
function scale(d0, d1, r0, r1) { const k = (r1 - r0) / ((d1 - d0) || 1); return v => r0 + (v - d0) * k; }

/* integer: for counts of rigs, which have no 2.5 */
function niceStep(max, target, integer) {
  const raw = max / Math.max(1, target), p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 && !(integer && p < 10) ? 2.5 : f <= 5 ? 5 : 10) * p;
  return integer ? Math.max(1, step) : step;
}

function ticks(max, target, integer) {
  const step = niceStep(max, target, integer), out = [];
  for (let v = 0; v <= max + 1e-9; v += step) out.push(v);
  return out;
}

/* A bar with a 4px rounded data end and a square base */
function barPath(x, y, w, h, horizontal) {
  const r = Math.min(4, (horizontal ? h : w) / 2, horizontal ? w : h);
  if (h <= 0 || w <= 0) return '';
  return horizontal
    ? 'M' + x + ',' + y + 'h' + (w - r) + 'a' + r + ',' + r + ' 0 0 1 ' + r + ',' + r + 'v' + (h - 2 * r) + 'a' + r + ',' + r + ' 0 0 1 -' + r + ',' + r + 'h-' + (w - r) + 'z'
    : 'M' + x + ',' + (y + h) + 'v-' + (h - r) + 'a' + r + ',' + r + ' 0 0 1 ' + r + ',-' + r + 'h' + (w - 2 * r) + 'a' + r + ',' + r + ' 0 0 1 ' + r + ',' + r + 'v' + (h - r) + 'z';
}

function tip(content) { vizTips.push(content); return ' data-tip="' + (vizTips.length - 1) + '"'; }

function fmtK(v) { return '$' + Math.round(v / 1000) + 'k'; }
function fmtPct(v) { return Math.round(v * 100) + '%'; }
function fmtYears(v) { return v >= 10 ? Math.round(v).toString() : (Math.round(v * 10) / 10).toString(); }

/* ============================================
   TOOLTIP — one floating element; content built with textContent
   ============================================ */
function tipEl() {
  let el = document.getElementById('vizTip');
  if (!el) {
    el = document.createElement('div');
    el.id = 'vizTip';
    el.className = 'viz-tip';
    el.setAttribute('role', 'tooltip');
    el.hidden = true;
    document.body.appendChild(el);
  }
  return el;
}

/* content: { title, rows: [{ value, label, swatch? }], note? } */
function showTip(content, clientX, clientY, source) {
  const el = tipEl();
  tipSource = source || 'pointer';
  el.textContent = '';
  const h = document.createElement('div');
  h.className = 'viz-tip-title';
  h.textContent = content.title;
  el.appendChild(h);
  (content.rows || []).forEach(function (r) {
    const row = document.createElement('div');
    row.className = 'viz-tip-row';
    if (r.swatch) {
      const k = document.createElement('span');
      k.className = 'viz-tip-key';
      k.style.background = r.swatch;
      row.appendChild(k);
    }
    const v = document.createElement('strong');
    v.textContent = r.value;
    row.appendChild(v);
    const l = document.createElement('span');
    l.textContent = r.label;
    row.appendChild(l);
    el.appendChild(row);
  });
  if (content.note) {
    const n = document.createElement('div');
    n.className = 'viz-tip-note';
    n.textContent = content.note;
    el.appendChild(n);
  }
  el.hidden = false;
  const pad = 14, w = el.offsetWidth, hgt = el.offsetHeight;
  let x = clientX + pad, y = clientY + pad;
  if (x + w > window.innerWidth - 8) x = clientX - w - pad;
  if (y + hgt > window.innerHeight - 8) y = clientY - hgt - pad;
  el.style.left = Math.max(8, x) + 'px';
  el.style.top = Math.max(8, y) + 'px';
}

/* hideTip('focus') only closes a tooltip that focus opened: a tap opens one and moves focus in the same gesture */
function hideTip(source) {
  const el = document.getElementById('vizTip');
  if (!el || (source && source !== tipSource)) return;
  el.hidden = true;
  document.querySelectorAll('.viz-crosshair, .viz-focus-ring').forEach(m => m.setAttribute('visibility', 'hidden'));
}

/* A touch pointer "leaves" as the finger lifts; its tooltip stays until the next tap or a scroll */
function leaveTip(e) { if (e.pointerType !== 'touch') hideTip(); }

function wireTips(host) {
  function at(e) {
    const m = e.target.closest('[data-tip]');
    if (m) showTip(vizTips[+m.dataset.tip], e.clientX, e.clientY);
    else if (!e.target.closest('.viz-live')) hideTip();
  }
  host.addEventListener('pointermove', at);
  host.addEventListener('pointerdown', at);
  host.addEventListener('pointerleave', leaveTip);
  function atFocus(el) {
    const m = el && el.closest && el.closest('[data-tip]');
    if (!m || !host.contains(m)) return false;
    const r = m.getBoundingClientRect();
    showTip(vizTips[+m.dataset.tip], r.left + r.width / 2, r.top, 'focus');
    return true;
  }
  // a scroll strands a pointer tooltip, but a focused mark's tooltip follows its mark (Tab scrolls it into view)
  host.addEventListener('scroll', function () { if (tipSource !== 'focus' || !atFocus(document.activeElement)) hideTip(); }, { passive: true });
  document.addEventListener('pointerdown', function (e) { if (!host.contains(e.target)) hideTip(); });
  host.addEventListener('focusin', function (e) { atFocus(e.target); });
  host.addEventListener('focusout', function () { hideTip('focus'); });
}

/* ============================================
   CARDS — every chart card can switch to a table of the same numbers
   ============================================ */
function card(id, title, sub, opts) {
  opts = opts || {};
  return '<section class="viz-card' + (opts.wide ? ' viz-card--wide' : '') + '" id="' + id + '">' +
    '<header class="viz-head"><div><h3 class="viz-title">' + escapeHtml(title) + '</h3>' +
      (sub ? '<p class="viz-sub">' + sub + '</p>' : '') + '</div>' +
      (opts.noTable ? '' : '<button type="button" class="viz-toggle" aria-pressed="false" data-viz-toggle="' + id + '">Table</button>') +
    '</header>' + (opts.legend || '') +
    '<div class="viz-plot"></div><div class="viz-table" hidden></div>' +
    (opts.foot ? '<p class="viz-foot">' + opts.foot + '</p>' : '') + '</section>';
}

function setTable(id, cols, rows) {
  const host = document.querySelector('#' + id + ' .viz-table');
  if (!host) return;
  const t = document.createElement('table');
  t.className = 'viz-data-table';
  const hr = t.createTHead().insertRow();
  cols.forEach(c => { const th = document.createElement('th'); th.scope = 'col'; th.textContent = c; hr.appendChild(th); });
  const body = t.createTBody();
  rows.forEach(r => { const tr = body.insertRow(); r.forEach(v => { tr.insertCell().textContent = v; }); });
  host.textContent = '';
  host.appendChild(t);
}

function plotOf(id) { return document.querySelector('#' + id + ' .viz-plot'); }
function widthOf(id) { return Math.max(260, Math.floor(plotOf(id).clientWidth)); }

function legend(items) {
  return '<ul class="viz-legend">' + items.map(i =>
    '<li><span class="viz-swatch ' + (i.cls || '') + '"' + (i.color ? ' style="background:' + i.color + '"' : '') + ' aria-hidden="true"></span>' + escapeHtml(i.label) + '</li>').join('') + '</ul>';
}

/* ============================================
   HEADLINE TILES
   ============================================ */
function headline(rigs) {
  const yearOut = addMonths(AS_OF, 12);
  const share = bookedShare(rigs, yearOut);
  const near = rigs.filter(r => r.derived.nearTerm).length;
  const fr = forwardRates(rigs);
  const ry = firmRigYears(rigs);
  const delta = fr.now && fr.fwd ? (fr.fwd - fr.now) / fr.now : null;
  return '<div class="viz-tiles">' +
    '<div class="viz-hero"><div class="viz-tile-label">Booked a year out</div>' +
      '<div class="viz-hero-value">' + (share == null ? '—' : fmtPct(share)) + '</div>' +
      '<div class="viz-tile-sub">of ' + plural(rigs.length, 'rig') + ' have awarded work on ' + monthLabel(yearOut) + '</div>' +
      '<div class="viz-meter" aria-hidden="true"><span style="width:' + (share == null ? 0 : share * 100) + '%"></span></div></div>' +
    '<div class="viz-tile"><div class="viz-tile-label">Open within 9 months</div>' +
      '<div class="viz-tile-value">' + near + '</div>' +
      '<div class="viz-tile-sub">' + (rigs.length ? fmtPct(near / rigs.length) + ' of rigs shown, open now or rolling off by ' + monthLabel(addMonths(AS_OF, NEAR_TERM_MONTHS)) : '') + '</div></div>' +
    '<div class="viz-tile"><div class="viz-tile-label">Firm work remaining</div>' +
      '<div class="viz-tile-value">' + fmtYears(ry) + ' <span class="viz-unit">rig-years</span></div>' +
      '<div class="viz-tile-sub">after ' + DATA_AS_OF_LABEL + ', contracts with a published end</div></div>' +
    '<div class="viz-tile"><div class="viz-tile-label">Forward floater rate</div>' +
      '<div class="viz-tile-value">' + (fr.fwd ? fmtK(fr.fwd) : '—') +
        (delta != null ? ' <span class="viz-delta">' + (delta >= 0 ? '▲ ' : '▼ ') + Math.abs(Math.round(delta * 100)) + '%</span>' : '') + '</div>' +
      '<div class="viz-tile-sub">' + (fr.fwd ? 'median of ' + plural(fr.fwdN, 'disclosed rate') + ' starting later, vs ' + fmtK(fr.now) + ' running now (' + fr.nowN + ')' : 'no disclosed future floater rates in this selection') + '</div></div>' +
  '</div>';
}

/* ============================================
   1. CONTRACT COVERAGE — stacked by firmness, month by month
   ============================================ */
function drawCoverage(id, rigs) {
  const data = coverageByMonth(rigs);
  const W = widthOf(id), H = 250, M = { l: 36, r: 16, t: 24, b: 26 };
  const x = scale(0, COVERAGE_MONTHS, M.l, W - M.r);
  const n = rigs.length;
  const yMax = Math.max(1, n);
  const y = scale(0, yMax, H - M.b, M.t);
  const cum = data.map(d => { let c = 0; return FIRM_ORDER.map(f => (c += d[f])); });

  let bands = '', edges = '';
  FIRM_ORDER.forEach(function (f, k) {
    const top = cum.map((c, i) => x(i) + ',' + y(c[k]));
    const bottom = cum.map((c, i) => x(i) + ',' + y(k ? c[k - 1] : 0)).reverse();
    bands += '<path class="viz-band viz-fill--' + f + '" d="M' + top.join('L') + 'L' + bottom.join('L') + 'Z"/>';
    edges += '<path class="viz-band-edge" d="M' + top.join('L') + '"/>';
  });

  // nice ticks below the total, then the total itself: the gap under that line is the rigs not booked
  const yt = ticks(yMax, 4, true).filter(v => y(v) - y(yMax) > 20).map(v =>
    '<line class="viz-grid" x1="' + M.l + '" x2="' + (W - M.r) + '" y1="' + y(v) + '" y2="' + y(v) + '"/>' +
    '<text class="viz-axis" x="' + (M.l - 6) + '" y="' + (y(v) + 3.5) + '" text-anchor="end">' + v + '</text>').join('') +
    '<line class="viz-total" x1="' + M.l + '" x2="' + (W - M.r) + '" y1="' + y(yMax) + '" y2="' + y(yMax) + '"/>' +
    '<text class="viz-axis viz-axis--strong" x="' + (M.l - 6) + '" y="' + (y(yMax) + 3.5) + '" text-anchor="end">' + n + '</text>';
  let xt = '';
  for (let i = 0; i <= COVERAGE_MONTHS; i++) {
    const t = data[i].t;
    if ((t.getMonth() === 0 && x(i) - x(0) > 40) || i === 0) xt += '<text class="viz-axis" x="' + x(i) + '" y="' + (H - 8) + '" text-anchor="' + (i === 0 ? 'start' : 'middle') + '">' +
      (i === 0 ? 'Now' : t.getFullYear()) + '</text>';
  }
  const yr = 12, share = n ? AWARDED.reduce((s, f) => s + data[yr][f], 0) / n : 0;
  const mark = '<line class="viz-ref" x1="' + x(yr) + '" x2="' + x(yr) + '" y1="' + (M.t - 6) + '" y2="' + (H - M.b) + '"/>' +
    '<text class="viz-annot" x="' + (x(yr) + 6) + '" y="' + (M.t - 10) + '">' + 'A year out (' + monthLabel(data[yr].t) + '): ' + fmtPct(share) + ' booked</text>';

  plotOf(id).innerHTML = '<svg class="viz-svg viz-live" width="' + W + '" height="' + H + '" tabindex="0" role="img" aria-label="' +
    escapeHtml('Rigs booked by month for the next three years. ' + monthLabel(data[yr].t) + ': ' + fmtPct(share) + ' have awarded work. Use the left and right arrow keys to read each month.') + '">' +
    yt + bands + edges + mark + xt +
    '<line class="viz-crosshair" x1="0" x2="0" y1="' + M.t + '" y2="' + (H - M.b) + '" visibility="hidden"/>' +
    '<rect class="viz-hit" x="' + M.l + '" y="' + M.t + '" width="' + (W - M.l - M.r) + '" height="' + (H - M.t - M.b) + '"/></svg>';

  const svg = plotOf(id).querySelector('svg'), cross = svg.querySelector('.viz-crosshair');
  let idx = 12;
  function read(i, cx, cy, source) {
    idx = Math.max(0, Math.min(COVERAGE_MONTHS, i));
    cross.setAttribute('x1', x(idx)); cross.setAttribute('x2', x(idx)); cross.setAttribute('visibility', 'visible');
    const d = data[idx];
    showTip({ title: idx === 0 ? 'Now (' + DATA_AS_OF_LABEL + ')' : monthLabel(d.t),
      rows: FIRM_ORDER.map(f => ({ value: String(d[f]), label: FIRMNESS[f], swatch: 'var(--firm-' + f + ')' }))
        .concat([{ value: String(d.open), label: 'Not booked' }]),
      note: fmtPct(AWARDED.reduce((s, f) => s + d[f], 0) / Math.max(1, n)) + ' of rigs have awarded work' }, cx, cy, source);
  }
  function readPointer(e) {
    const r = svg.getBoundingClientRect();
    read(Math.round((e.clientX - r.left - M.l) / ((W - M.l - M.r) / COVERAGE_MONTHS)), e.clientX, e.clientY);
  }
  svg.addEventListener('pointermove', readPointer);
  svg.addEventListener('pointerdown', readPointer);
  svg.addEventListener('pointerleave', function (e) { if (e.pointerType !== 'touch') { cross.setAttribute('visibility', 'hidden'); hideTip(); } });
  svg.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const i = e.key === 'Home' ? 0 : e.key === 'End' ? COVERAGE_MONTHS : idx + (e.key === 'ArrowRight' ? 1 : -1);
    const r = svg.getBoundingClientRect();
    read(i, r.left + x(Math.max(0, Math.min(COVERAGE_MONTHS, i))), r.top + M.t, 'focus');
  });
  // a tap focuses the chart too; only keyboard focus needs the tooltip placed for it
  svg.addEventListener('focus', function () { if (!svg.matches(':focus-visible')) return; const r = svg.getBoundingClientRect(); read(idx, r.left + x(idx), r.top + M.t, 'focus'); });
  svg.addEventListener('blur', function () { if (tipSource === 'focus') { cross.setAttribute('visibility', 'hidden'); hideTip('focus'); } });

  setTable(id, ['Month', 'Firm', 'LOI', 'Conditional', 'Option', 'Not booked', 'Awarded share'],
    data.map(d => [monthLabel(d.t), d.firm, d.loi, d.conditional, d.option, d.open, fmtPct(AWARDED.reduce((s, f) => s + d[f], 0) / Math.max(1, n))]));
}

/* ============================================
   2. ROLL-OFF CALENDAR — emphasis: the next nine months in the accent
   ============================================ */
function drawRollOff(id, rigs) {
  const ro = rollOff(rigs), b = ro.buckets;
  const W = widthOf(id), H = 230, M = { l: 8, r: 8, t: 20, b: 34 };
  const band = (W - M.l - M.r) / b.length, bw = Math.min(24, band * 0.62);
  const max = Math.max(4, ...b.map(k => k.rigs.length));
  const y = scale(0, max, H - M.b, M.t);
  let marks = '';
  b.forEach(function (k, i) {
    const cx = M.l + band * i + band / 2, n = k.rigs.length;
    const names = k.rigs.map(r => r.name).sort();
    const content = { title: k.label + (k.near ? ' · within 9 months' : ''),
      rows: [{ value: String(n), label: n === 1 ? 'rig' : 'rigs' }],
      note: names.length ? names.slice(0, 10).join(', ') + (names.length > 10 ? ' and ' + (names.length - 10) + ' more' : '') : 'None' };
    marks += '<g class="viz-mark" tabindex="0"' + tip(content) + ' aria-label="' + escapeHtml(k.label + ': ' + plural(n, 'rig')) + '">' +
      '<rect class="viz-hit" x="' + (cx - band / 2) + '" y="' + M.t + '" width="' + band + '" height="' + (H - M.t - M.b) + '"/>' +
      (n ? '<path class="' + (k.near ? 'viz-fill--accent' : 'viz-fill--deemph') + '" d="' + barPath(cx - bw / 2, y(n), bw, (H - M.b) - y(n)) + '"/>' : '') +
      '<text class="viz-value" x="' + cx + '" y="' + (y(n) - 5) + '" text-anchor="middle">' + (n || '') + '</text>' +
      (band < 34 && i % 2 && i !== b.length - 1 ? '' : k.short.split('|').map((s, j) => '<text class="viz-axis" x="' + cx + '" y="' + (H - M.b + 13 + j * 11) + '" text-anchor="middle">' + escapeHtml(s) + '</text>').join('')) +
      '</g>';
  });
  plotOf(id).innerHTML = '<svg class="viz-svg" width="' + W + '" height="' + H + '" role="group" aria-label="Rigs coming free by quarter">' +
    '<line class="viz-baseline" x1="' + M.l + '" x2="' + (W - M.r) + '" y1="' + (H - M.b) + '" y2="' + (H - M.b) + '"/>' + marks + '</svg>';
  document.querySelector('#' + id + ' .viz-foot').textContent = ro.undisclosed
    ? plural(ro.undisclosed, 'rig') + ' with no published end ' + (ro.undisclosed === 1 ? 'is' : 'are') + ' not shown.' : '';
  setTable(id, ['When', 'Rigs', 'Names'], b.map(k => [k.label, k.rigs.length, k.rigs.map(r => r.name).sort().join(', ')]));
}

/* ============================================
   3. DAY RATES BY START DATE — scatter, colour + shape by rig type
   ============================================ */
function shapePath(type, cx, cy) {
  if (type === 'Semisubmersible') return '<rect x="' + (cx - 4.5) + '" y="' + (cy - 4.5) + '" width="9" height="9" rx="1.5"';
  if (type === 'Jackup') return '<path d="M' + cx + ',' + (cy - 5.5) + 'L' + (cx + 5.5) + ',' + (cy + 4.5) + 'L' + (cx - 5.5) + ',' + (cy + 4.5) + 'Z"';
  return '<circle cx="' + cx + '" cy="' + cy + '" r="5"';
}

function drawRates(id, rigs) {
  const all = rateFixtures(rigs);
  const pts = all.filter(p => p.t >= SCATTER_FROM);
  const W = widthOf(id), H = 250, M = { l: 44, r: 14, t: 16, b: 26 };
  if (!pts.length) { plotOf(id).innerHTML = '<p class="viz-empty">No disclosed day rates in this selection.</p>'; setTable(id, ['Rig'], []); return; }
  const t1 = new Date(Math.max(addMonths(AS_OF, 12).getTime(), ...pts.map(p => p.t.getTime())));
  const x = scale(SCATTER_FROM.getTime(), quarterStart(t1, 1).getTime(), M.l, W - M.r);
  const yMax = Math.ceil(Math.max(...pts.map(p => p.rate)) / 100000) * 100000 + 100000; // headroom for the label
  const y = scale(0, yMax, H - M.b, M.t);
  const grid = ticks(yMax, 5).map(v => '<line class="viz-grid" x1="' + M.l + '" x2="' + (W - M.r) + '" y1="' + y(v) + '" y2="' + y(v) + '"/>' +
    '<text class="viz-axis" x="' + (M.l - 6) + '" y="' + (y(v) + 3.5) + '" text-anchor="end">' + (v ? '$' + v / 1000 + 'k' : '0') + '</text>').join('');
  let xt = '';
  for (let yr = SCATTER_FROM.getFullYear(); yr <= t1.getFullYear() + 1; yr++) {
    const px = x(new Date(yr, 0, 1).getTime());
    if (px <= W - M.r - 10) xt += '<text class="viz-axis" x="' + px + '" y="' + (H - 8) + '" text-anchor="middle">' + yr + '</text>';
  }
  const now = '<line class="viz-ref" x1="' + x(AS_OF.getTime()) + '" x2="' + x(AS_OF.getTime()) + '" y1="' + (M.t + 12) + '" y2="' + (H - M.b) + '"/>' +
    '<text class="viz-annot viz-annot--muted" x="' + (x(AS_OF.getTime()) - 5) + '" y="' + (H - M.b - 6) + '" text-anchor="end">Now</text>';
  const placed = pts.map(p => Object.assign({}, p, { px: x(p.t.getTime()), py: y(p.rate) }));
  // later points on top; the highest rate gets a direct label
  const dots = placed.slice().sort((a, b) => a.t - b.t).map(p =>
    shapePath(p.type, p.px, p.py) + ' class="viz-dot viz-fill--' + TYPE_KEY[p.type] + '"/>').join('');
  const firm = placed.filter(p => p.x.k.firmness === 'firm');
  const top = (firm.length ? firm : placed).reduce((a, b) => (b.rate > a.rate ? b : a));
  // label above the cloud, joined to its point by a leader line
  const ly = M.t + 6;
  const lbl = '<line class="viz-ref" x1="' + top.px + '" x2="' + top.px + '" y1="' + (ly + 4) + '" y2="' + (top.py - 7) + '"/>' +
    '<text class="viz-annot viz-top-label" x="' + Math.min(top.px + 4, W - M.r) + '" y="' + ly + '" text-anchor="end">' +
    escapeHtml(W < 480 ? 'Top firm: ' + top.rig.name + ' · ' + fmtK(top.rate)
      : 'Highest firm rate: ' + top.rig.name + ' · ' + fmtK(top.rate) + ' from ' + top.x.k.start) + '</text>';
  plotOf(id).innerHTML = '<svg class="viz-svg viz-live" width="' + W + '" height="' + H + '" role="img" aria-label="' +
    escapeHtml('Disclosed day rates by contract start date, ' + pts.length + ' rate periods. Full list in the table view.') + '">' +
    grid + now + dots + lbl + xt + '<circle class="viz-focus-ring" r="9" visibility="hidden"/>' +
    '<rect class="viz-hit" x="' + M.l + '" y="' + M.t + '" width="' + (W - M.l - M.r) + '" height="' + (H - M.t - M.b) + '"/></svg>';

  // the label hangs left of its point; if that runs past the axis, it hangs right instead
  const svg = plotOf(id).querySelector('svg'), ring = svg.querySelector('.viz-focus-ring');
  const topLabel = svg.querySelector('.viz-top-label');
  if (topLabel.getBBox().x < M.l + 4) {
    topLabel.setAttribute('text-anchor', 'start');
    topLabel.setAttribute('x', Math.max(M.l + 4, Math.min(top.px - 4, W - M.r - topLabel.getBBox().width)));
  }
  // nearest-point hover: the pointer only has to be closest, not dead-centre
  function readPoint(e) {
    const r = svg.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    let best = null, bd = 28 * 28;
    placed.forEach(p => { const d = (p.px - mx) * (p.px - mx) + (p.py - my) * (p.py - my); if (d < bd) { bd = d; best = p; } });
    if (!best) { ring.setAttribute('visibility', 'hidden'); hideTip(); return; }
    ring.setAttribute('cx', best.px); ring.setAttribute('cy', best.py); ring.setAttribute('visibility', 'visible');
    showTip({ title: best.rig.name, rows: [{ value: fmtRate(best.rate) + '/day', label: best.type, swatch: 'var(--type-' + TYPE_KEY[best.type] + ')' }],
      note: (best.x.k.customer || 'Undisclosed customer') + ' · ' + best.x.k.start + ' – ' + (best.x.k.end || 'undisclosed') +
        (best.x.k.firmness !== 'firm' ? ' · ' + FIRMNESS[best.x.k.firmness] : '') }, e.clientX, e.clientY);
  }
  svg.addEventListener('pointermove', readPoint);
  svg.addEventListener('pointerdown', readPoint);
  svg.addEventListener('pointerleave', function (e) { if (e.pointerType !== 'touch') { ring.setAttribute('visibility', 'hidden'); hideTip(); } });
  const older = all.length - pts.length;
  document.querySelector('#' + id + ' .viz-foot').textContent = older ? plural(older, 'rate period') + ' starting before 2022 not shown; they are in the table.' : '';
  setTable(id, ['Rig', 'Type', 'Customer', 'Start', 'End', 'Day rate', 'Terms'],
    all.slice().sort((a, b) => b.t - a.t).map(p => [p.rig.name, p.type, p.x.k.customer || 'Undisclosed', p.x.k.start, p.x.k.end || 'undisclosed', fmtRate(p.rate), FIRMNESS[p.x.k.firmness]]));
}

/* ============================================
   4. CONTRACTOR RUNWAY — heatmap, share of each contractor's rigs booked
   ============================================ */
function drawRunway(id, rigs) {
  const rw = contractorRunway(rigs);
  const W = widthOf(id), narrow = W < 560, LW = narrow ? 116 : 168, CH = 24, GAP = 2, TOP = 22;
  const cw = (W - LW) / rw.quarters.length;
  const H = TOP + rw.rows.length * (CH + GAP);
  // label every quarter, every other one or one a year: whichever leaves room for the text
  const labelW = narrow ? 40 : 52, every = [1, 2, 4].find(k => cw * k >= labelW) || 4;
  let head = '';
  rw.quarters.forEach(function (q, i) {
    if (i % every) return;
    head += '<text class="viz-axis" x="' + (LW + cw * i + cw / 2) + '" y="14" text-anchor="middle">' + (narrow ? q.label.replace(' 20', " '") : q.label) + '</text>';
  });
  let body = '';
  rw.rows.forEach(function (row, j) {
    const yy = TOP + j * (CH + GAP);
    body += '<circle cx="6" cy="' + (yy + CH / 2) + '" r="4" style="fill:' + getContractorColor(row.contractor) + '"/>' +
      '<text class="viz-label" x="16" y="' + (yy + CH / 2 + 4) + '"><title>' + escapeHtml(row.contractor + ', ' + plural(row.n, 'rig')) + '</title>' +
        '<tspan class="viz-label-name">' + escapeHtml(row.contractor) + '</tspan> <tspan class="viz-label-n">' + row.n + '</tspan></text>';
    row.cells.forEach(function (c, i) {
      const bin = c.booked === 0 ? 0 : Math.max(1, Math.ceil(c.share * 5));
      body += '<rect class="viz-cell viz-seq-' + bin + '" x="' + (LW + cw * i + GAP / 2) + '" y="' + yy + '" width="' + (cw - GAP) + '" height="' + CH + '" rx="2"' +
        tip({ title: row.contractor + ' · ' + rw.quarters[i].label, rows: [{ value: fmtPct(c.share), label: 'of its rigs booked' }],
              note: c.booked + ' of ' + plural(row.n, 'rig') + ' with awarded work' }) + '/>';
    });
  });
  plotOf(id).innerHTML = '<svg class="viz-svg" width="' + W + '" height="' + H + '" role="img" aria-label="' +
    escapeHtml('Share of each contractor\'s rigs with awarded work, by quarter. Values are in the table view.') + '">' + head + body + '</svg>';
  // shorten any name that would run into the first column; the full name is in its title
  plotOf(id).querySelectorAll('.viz-label').forEach(function (t) {
    const name = t.querySelector('.viz-label-name'), full = name.textContent;
    for (let k = full.length - 1; k > 3 && t.getComputedTextLength() > LW - 22; k--) name.textContent = full.slice(0, k).trim() + '…';
  });
  setTable(id, ['Contractor', 'Rigs'].concat(rw.quarters.map(q => q.label)),
    rw.rows.map(r => [r.contractor, r.n].concat(r.cells.map(c => fmtPct(c.share)))));
}

/* ============================================
   5. CUSTOMER EXPOSURE — rig-years of awarded work, one series
   ============================================ */
function drawCustomers(id, rigs) {
  const all = customerExposure(rigs), unknown = all.find(c => c.label === 'Undisclosed');
  const list = all.filter(c => c !== unknown).slice(0, 10).concat(unknown ? [unknown] : []);
  const W = widthOf(id), LW = 128, RH = 26, H = Math.max(40, list.length * RH + 4), VW = 64;
  if (!list.length) { plotOf(id).innerHTML = '<p class="viz-empty">No awarded work with a published end in this selection.</p>'; setTable(id, ['Customer'], []); return; }
  const x = scale(0, Math.max(...list.map(c => c.value)), LW, W - VW);
  const marks = list.map(function (c, i) {
    const yy = i * RH + 4, w = Math.max(2, x(c.value) - LW);
    return '<g class="viz-mark" tabindex="0"' + tip({ title: c.label, rows: [{ value: fmtYears(c.value), label: 'rig-years of awarded work' }],
        note: 'after ' + DATA_AS_OF_LABEL }) + ' aria-label="' + escapeHtml(c.label + ': ' + fmtYears(c.value) + ' rig-years') + '">' +
      '<rect class="viz-hit" x="0" y="' + (yy - 4) + '" width="' + W + '" height="' + RH + '"/>' +
      '<text class="viz-label" x="' + (LW - 8) + '" y="' + (yy + 13) + '" text-anchor="end">' + escapeHtml(c.label) + '</text>' +
      '<path class="' + (c.label === 'Undisclosed' ? 'viz-fill--deemph' : 'viz-fill--accent') + '" d="' + barPath(LW, yy + 2, w, 16, true) + '"/>' +
      '<text class="viz-value" x="' + (LW + w + 6) + '" y="' + (yy + 14) + '">' + fmtYears(c.value) + '</text></g>';
  }).join('');
  plotOf(id).innerHTML = '<svg class="viz-svg" width="' + W + '" height="' + H + '" role="group" aria-label="Rig-years of awarded work by customer">' + marks + '</svg>';
  setTable(id, ['Customer', 'Rig-years'], all.map(c => [c.label, fmtYears(c.value)]));
}

/* ============================================
   6. FLEET MIX — three ranked lists, one hue
   ============================================ */
function countBy(rigs, getter) {
  const m = {};
  rigs.forEach(r => { const k = getter(r); m[k] = (m[k] || 0) + 1; });
  return Object.keys(m).map(k => ({ label: k, value: m[k] })).sort((a, b) => b.value - a.value);
}

function mixList(title, entries, groupId) {
  const max = Math.max(1, ...entries.map(e => e.value));
  const on = getCheckedValues(groupId);
  return '<div class="viz-mix"><h4 class="viz-mix-title">' + escapeHtml(title) + '</h4>' + entries.map(e =>
    '<button type="button" class="viz-mix-row" data-mix-group="' + groupId + '" data-mix-value="' + escapeHtml(e.label) + '" aria-pressed="' + on.includes(e.label) + '"' +
      ' aria-label="' + escapeHtml(e.label + ', ' + plural(e.value, 'rig') + (on.includes(e.label) ? '. Remove this filter' : '. Show only these')) + '">' +
    '<span class="viz-mix-label">' + escapeHtml(e.label) + '</span>' +
    '<span class="viz-mix-track"><span class="viz-mix-fill" style="width:' + (e.value / max * 100) + '%"></span></span>' +
    '<span class="viz-mix-value">' + e.value + '</span></button>').join('') + '</div>';
}

/* Toggle the matching sidebar checkbox, then put focus back on the same row in the new render */
function toggleMixFilter(groupId, value) {
  const cb = [...document.getElementById(groupId).querySelectorAll('input')].find(c => c.value === value);
  if (!cb) return;
  cb.checked = !cb.checked;
  applyFilters();
  const again = [...document.querySelectorAll('.viz-mix-row')].find(b => b.dataset.mixGroup === groupId && b.dataset.mixValue === value);
  if (again) again.focus();
}

function drawMix(id, rigs) {
  const st = countBy(rigs, r => r.derived.status), ty = countBy(rigs, r => r.type), rg = countBy(rigs, r => r.region);
  plotOf(id).innerHTML = '<div class="viz-mix-grid">' + mixList('Status', st, 'statusFilters') + mixList('Type', ty, 'typeFilters') + mixList('Region', rg, 'regionFilters') + '</div>';
  setTable(id, ['Group', 'Value', 'Rigs'], [].concat(
    st.map(e => ['Status', e.label, e.value]), ty.map(e => ['Type', e.label, e.value]), rg.map(e => ['Region', e.label, e.value])));
}

/* ============================================
   7. CONTRACT TIMELINE — one row per rig, one bar per contract
   ============================================ */
function drawTimeline(id, rigs) {
  const rows = rigs.map(r => ({ r: r, segs: r.derived.contracts.filter(x => x.s) }))
    .filter(x => x.segs.length)
    .sort((a, b) => (SORT_KEYS.bookedTo(a.r) || Infinity) - (SORT_KEYS.bookedTo(b.r) || Infinity) || a.r.name.localeCompare(b.r.name));
  const host = plotOf(id);
  if (!rows.length) { host.innerHTML = '<p class="viz-empty">No datable contracts in this selection.</p>'; setTable(id, ['Rig'], []); return; }
  const minT = new Date(AS_OF.getFullYear() - 1, 0, 1).getTime();
  const ends = rows.flatMap(x => x.segs.filter(s => s.k.firmness !== 'option').map(s => s.e ? s.e.getTime() : 0));
  const maxT = Math.max(addMonths(AS_OF, 12).getTime(), ...ends);
  const pos = t => Math.max(0, Math.min(100, ((t - minT) / (maxT - minT)) * 100));
  const tickHtml = [], axisHtml = [];
  for (let y = new Date(minT).getFullYear(); y <= new Date(maxT).getFullYear(); y++) {
    const t = new Date(y, 0, 1).getTime();
    if (t >= minT && t <= maxT) {
      tickHtml.push('<div class="gantt-tick" style="left:' + pos(t) + '%"></div>');
      axisHtml.push('<span class="gantt-year" style="left:' + pos(t) + '%">' + y + '</span>');
    }
  }
  host.innerHTML = '<div class="gantt" id="ganttChart"><div class="gantt-axis" aria-hidden="true"><div class="gantt-axis-track">' + axisHtml.join('') +
    '<span class="gantt-now-label" style="left:' + pos(AS_OF) + '%">Now</span></div></div>' +
    '<div class="gantt-body"><div class="gantt-grid">' + tickHtml.join('') +
    '<div class="gantt-now" style="left:' + pos(AS_OF) + '%"></div></div>' + rows.map(function (x) {
      const d = x.r.derived;
      const bars = x.segs.map(function (s) {
        const left = pos(s.s), right = s.e ? pos(s.e) : 100;
        return right <= 0 ? '' : '<div class="gantt-bar gantt-bar--' + escapeHtml(s.k.firmness) + (s.e ? '' : ' gantt-bar--open') +
          '" style="left:' + left + '%;width:' + Math.max(0.6, right - left) + '%"></div>';
      }).join('');
      const label = x.r.name + ' — ' + d.status + ', booked to ' + d.bookedToLabel;
      return '<div class="gantt-row" role="button" tabindex="0"' + tip({ title: x.r.name, rows: x.segs.map(s => ({
          value: (s.k.customer || 'Undisclosed'), label: s.k.start + ' – ' + (s.k.end || 'undisclosed') + (s.k.dayRate ? ' · ' + fmtK(s.k.dayRate) : ''),
          swatch: 'var(--firm-' + s.k.firmness + ')' })), note: d.status + ' · booked to ' + d.bookedToLabel + ' · click for details' }) +
        ' aria-label="' + escapeHtml(label + '. Show details.') + '" data-rig-id="' + escapeHtml(x.r.id) + '">' +
        '<div class="gantt-name">' + escapeHtml(x.r.name) + '</div><div class="gantt-track">' + bars + '</div></div>';
    }).join('') + '</div></div>';
  const g = host.querySelector('#ganttChart');
  // drop a year label the Now marker would sit on
  const nowBox = g.querySelector('.gantt-now-label').getBoundingClientRect();
  g.querySelectorAll('.gantt-year').forEach(function (yl) {
    const r = yl.getBoundingClientRect();
    if (r.right > nowBox.left - 2 && r.left < nowBox.right + 2) yl.style.visibility = 'hidden';
  });
  g.addEventListener('click', e => { const row = e.target.closest('.gantt-row'); if (row) { hideTip(); openDetail(RIG_BY_ID[row.dataset.rigId], row); } });
  g.addEventListener('keydown', e => {
    const row = e.target.closest('.gantt-row');
    if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); hideTip(); openDetail(RIG_BY_ID[row.dataset.rigId], row); }
  });
  setTable(id, ['Rig', 'Customer', 'Start', 'End', 'Day rate', 'Terms'], rows.flatMap(x => x.segs.map(s =>
    [x.r.name, s.k.customer || 'Undisclosed', s.k.start, s.k.end || 'undisclosed', s.k.dayRate ? fmtRate(s.k.dayRate) : '—', FIRMNESS[s.k.firmness]])));
}

/* ============================================
   RENDER
   ============================================ */
function renderInsights() {
  const host = document.getElementById('insightsScroll');
  const rigs = filteredRigs;
  hideTip();
  vizTips = [];
  if (!rigs.length) {
    host.innerHTML = '<div class="insights-empty">No rigs match your filters. <button type="button" class="link-btn" data-action="reset-filters">Clear search and filters</button></div>';
    return;
  }
  const firmLegend = legend(FIRM_ORDER.map(f => ({ label: FIRMNESS[f], cls: 'viz-fill--' + f })).concat([{ label: 'Not booked', cls: 'viz-swatch--empty' }]));
  const typeLegend = legend(TYPE_ORDER.map(t => ({ label: t, cls: 'viz-shape viz-shape--' + TYPE_KEY[t] })));
  // each step labelled with the range it covers: none booked, then fifths
  const scaleLegend = '<div class="viz-scale" aria-hidden="true"><span class="viz-scale-title">Rigs booked</span>' +
    ['None', '1–20%', '21–40%', '41–60%', '61–80%', '81–100%'].map((t, i) =>
      '<span class="viz-scale-step' + (i ? '' : ' viz-scale-step--empty') + '"><i class="viz-seq-' + i + '"></i>' + t + '</span>').join('') + '</div>';
  const timelineLegend = legend(FIRM_ORDER.map(f => ({ label: FIRMNESS[f], cls: 'gantt-bar--' + f }))
    .concat([{ label: 'End undisclosed', cls: 'gantt-bar--firm gantt-bar--open' }]));

  host.innerHTML =
    '<div class="insights-summary">Showing <strong>' + rigs.length + '</strong> of ' + RIG_DATA.length + ' rigs · as of ' + DATA_AS_OF_LABEL +
      (rigs.length < RIG_DATA.length ? ' · every chart follows the filters' : '') + '</div>' +
    headline(rigs) +
    card('vizCoverage', 'How much of the fleet is booked', 'Rigs under contract each month for three years, by how firm the contract is', {
      wide: true, legend: firmLegend, foot: 'Contracts with no published end are counted for ' + OPEN_END_MONTHS + ' months.' }) +
    '<div class="viz-grid-2">' +
      card('vizRollOff', 'When rigs come free', 'Rigs by the quarter their booked work ends · <span class="viz-key viz-fill--accent"></span> within ' + NEAR_TERM_MONTHS + ' months', { foot: ' ' }) +
      card('vizRates', 'Day rates by start date', 'Each disclosed rate period', { legend: typeLegend, foot: ' ' }) +
    '</div>' +
    card('vizRunway', 'Contractor runway', 'Share of each contractor\'s rigs with awarded work, by quarter (options excluded)', { wide: true, legend: scaleLegend }) +
    '<div class="viz-grid-2">' +
      card('vizCustomers', 'Who the work is for', 'Rig-years of awarded work after ' + DATA_AS_OF_LABEL + ', top 10 customers') +
      card('vizMix', 'Fleet mix', 'Rigs shown by status, type and region · select a row to filter by it') +
    '</div>' +
    card('vizTimeline', 'Contract timeline', plural(rigs.filter(r => r.derived.contracts.some(x => x.s)).length, 'rig') +
      ' · sorted by booked-to date · select a row for details', { wide: true, legend: timelineLegend });

  drawCoverage('vizCoverage', rigs);
  drawRollOff('vizRollOff', rigs);
  drawRates('vizRates', rigs);
  drawRunway('vizRunway', rigs);
  drawCustomers('vizCustomers', rigs);
  drawMix('vizMix', rigs);
  drawTimeline('vizTimeline', rigs);

  if (!host.dataset.wired) {
    host.dataset.wired = '1';
    wireTips(host);
    host.addEventListener('click', function (e) {
      const mix = e.target.closest('.viz-mix-row');
      if (mix) return toggleMixFilter(mix.dataset.mixGroup, mix.dataset.mixValue);
      const b = e.target.closest('[data-viz-toggle]');
      if (!b) return;
      const c = document.getElementById(b.dataset.vizToggle), on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.textContent = on ? 'Chart' : 'Table';
      c.querySelector('.viz-plot').hidden = on;
      const legendEl = c.querySelector('.viz-legend, .viz-scale');
      if (legendEl) legendEl.hidden = on;
      c.querySelector('.viz-table').hidden = !on;
    });
  }
}
