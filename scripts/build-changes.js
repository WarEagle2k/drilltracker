#!/usr/bin/env node
/* Compares the data with the previous refresh and writes changes.js, which the page shows
   as "Changes since <date>": new and extended work, rigs coming free, exercised options,
   rate changes and so on.

     node scripts/build-changes.js            compare with the last refresh in git history
     node scripts/build-changes.js --base REF compare with the data at a given commit
     node scripts/build-changes.js --check    fail if changes.js is out of date (CI runs this)

   The previous refresh is the newest commit on the first-parent history whose data has a
   different DATA_AS_OF. Snapshots from before rigs.js existed (one contract per rig, inside
   index.html) are compared at the rig level only: status, booked-to date, customer and rate.
   Run it after every data edit, as with stamp-assets.js. */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { loadApp } = require('./load-app');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'changes.js');
const args = process.argv.slice(2);
const check = args.includes('--check');
const baseArg = args.includes('--base') ? args[args.indexOf('--base') + 1] : null;

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const show = (ref, file) => { try { return git('show', ref + ':' + file); } catch (e) { return null; } };

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const isoFromLabel = label => {
  const m = label.match(/^(\w+) (?:(\d{1,2}), )?(\d{4})$/);
  const mo = m && MONTHS.indexOf(m[1]);
  return m && mo >= 0 ? m[3] + '-' + String(mo + 1).padStart(2, '0') + '-' + String(m[2] || 1).padStart(2, '0') : null;
};
const labelFromIso = iso => { const [y, m, d] = iso.split('-').map(Number); return MONTHS[m - 1] + ' ' + d + ', ' + y; };

/* The data at a commit, as rigs.js source, or null if it has none */
function snapshot(ref) {
  const rigs = show(ref, 'rigs.js');
  if (rigs) return { code: rigs, asOf: rigs.match(/const DATA_AS_OF = '([^']+)'/)[1], legacy: false };
  const html = show(ref, 'index.html');
  const data = html && html.match(/^const RIG_DATA = (\[[\s\S]*?^\]);/m);
  const label = html && html.match(/const DATA_AS_OF_LABEL = '([^']+)'/);
  if (!data || !label || !isoFromLabel(label[1])) return null;
  // one contract per rig; "Not Disclosed" and the like become null, as rigs.js has them
  const undisclosed = c => !c || /^(not disclosed|undisclosed|none|tbd|-)/i.test(c);
  const rigs2 = JSON.parse(data[1]).map(r => ({
    id: r.id, name: r.name, contractor: r.contractor, type: r.type, country: null, statusOverride: null,
    contracts: /available|stacked/i.test(r.status) || !r.contractStart || r.contractStart === '-' ? [] : [{
      customer: undisclosed(r.customer) ? null : r.customer, start: r.contractStart,
      end: r.contractEnd && r.contractEnd !== '-' ? r.contractEnd : null, dayRate: r.dayRate, firmness: 'firm'
    }]
  }));
  const asOf = isoFromLabel(label[1]);
  return { code: "const DATA_AS_OF = '" + asOf + "';\nconst RIG_DATA = " + JSON.stringify(rigs2) + ';', asOf: asOf, legacy: true };
}

function findBase(currentAsOf) {
  const commits = git('log', '--first-parent', '--format=%h', '--', 'rigs.js', 'index.html').trim().split('\n');
  for (const c of commits) {
    const s = snapshot(c);
    if (s && s.asOf !== currentAsOf) return c;
  }
  return null;
}

const current = { code: fs.readFileSync(path.join(ROOT, 'rigs.js'), 'utf8') };
current.asOf = current.code.match(/const DATA_AS_OF = '([^']+)'/)[1];

let base = baseArg;
if (!base && check) {
  const prev = fs.existsSync(OUT) && fs.readFileSync(OUT, 'utf8').match(/"base": "([^"]+)"/);
  base = prev ? prev[1] : null;
}
if (check && fs.existsSync(OUT) && !fs.readFileSync(OUT, 'utf8').includes('"asOf": "' + current.asOf + '"')) {
  console.error('changes.js is for an older data date. Run: node scripts/build-changes.js');
  process.exit(1);
}
if (!base) base = findBase(current.asOf);
const before = base && snapshot(base);
if (!before) { console.error('No earlier data snapshot found to compare with.'); process.exit(1); }

const A = loadApp({ rigs: before.code }), B = loadApp();
const byId = list => Object.fromEntries(list.map(r => [r.id, r]));
const oldRigs = byId(A.RIG_DATA), newRigs = byId(B.RIG_DATA);

const rate = v => '$' + Math.round(v / 1000) + 'k/day';
const who = c => c || 'an undisclosed customer';
const firmName = f => f === 'loi' ? 'LOI' : A.FIRMNESS[f].toLowerCase();
const period = k => (k.start || '?') + ' – ' + (k.end || 'end undisclosed');
// old snapshots spelled some customers differently ("Beacon Offshore Energy"): compare the first word
const sameCustomer = (a, b) => before.legacy
  ? (a || '').toLowerCase().split(/[\s(/]/)[0] === (b || '').toLowerCase().split(/[\s(/]/)[0]
  : a === b;
// where the booked work runs to, for ordering: open now is lowest, no published end highest
const reach = d => d.available ? -Infinity : d.bookedOpen ? Infinity : d.bookedTo.getTime();
const bookedLabel = d => d.bookedOpen ? 'no published end' : d.bookedToLabel;
// "Jun 2028" after "2028" only narrows the date: not more or less work
const span = l => [B.parseFlexDate(l), B.parseFlexDate(l, true)];
const narrows = (a, b) => { const x = span(a), y = span(b); return x[0] && y[0] &&
  ((x[0] <= y[0] && y[1] <= x[1]) || (y[0] <= x[0] && x[1] <= y[1])); };
// rate steps of a few percent are escalations, not news
const rateMoved = (a, b) => a != null && b != null && Math.abs(b - a) / a >= 0.03;

function contractChanges(o, n, asOf) {
  const lines = [], warnings = [];
  const left = o.derived.contracts.slice(), FIRMER = { option: 0, conditional: 1, loi: 2, firm: 3 };
  const overlaps = (x, y) => (x.s || 0) <= (y.e || Infinity) && (y.s || 0) <= (x.e || Infinity);
  n.derived.contracts.forEach(function (y) {
    const i = left.findIndex(x => x.k.customer === y.k.customer && x.k.start === y.k.start) >= 0
      ? left.findIndex(x => x.k.customer === y.k.customer && x.k.start === y.k.start)
      : left.findIndex(x => x.k.customer === y.k.customer && overlaps(x, y));
    if (i < 0) {
      if (!y.e || y.e >= asOf) lines.push({ kind: 'more', text: 'New contract: ' + who(y.k.customer) + ', ' + period(y.k) +
        (y.k.dayRate != null ? ', ' + rate(y.k.dayRate) : '') + (y.k.firmness !== 'firm' ? ' (' + firmName(y.k.firmness) + ')' : '') });
      return;
    }
    const x = left.splice(i, 1)[0], name = who(y.k.customer);
    if ((y.e || Infinity) > (x.e || Infinity)) lines.push({ kind: 'more', text: name + ' contract extended to ' + (y.k.end || 'an undisclosed end') + ' (was ' + x.k.end + ')' });
    else if ((y.e || Infinity) < (x.e || Infinity)) lines.push({ kind: 'less', text: name + ' contract now ends ' + y.k.end + ' (was ' + (x.k.end || 'undisclosed') + ')' });
    if (FIRMER[y.k.firmness] > FIRMER[x.k.firmness]) lines.push({ kind: 'more', text: (x.k.firmness === 'option' ? 'Option exercised: ' : 'Firmed up: ') + name + ', ' + period(y.k) });
    else if (FIRMER[y.k.firmness] < FIRMER[x.k.firmness]) lines.push({ kind: 'less', text: name + ', ' + period(y.k) + ' is now ' + firmName(y.k.firmness) + ' (was ' + firmName(x.k.firmness) + ')' });
    if (y.k.dayRate != null && x.k.dayRate == null) lines.push({ kind: 'other', text: 'Day rate disclosed: ' + name + ', ' + rate(y.k.dayRate) });
    else if (rateMoved(x.k.dayRate, y.k.dayRate)) lines.push({ kind: 'other', text: name + ' day rate ' + rate(y.k.dayRate) + ' (was ' + rate(x.k.dayRate) + ')' });
  });
  left.forEach(function (x) {
    if (x.e && x.e < asOf) warnings.push(n.name + ': the ended contract ' + who(x.k.customer) + ', ' + period(x.k) + ' was deleted. Keep ended contracts: they are the rate history.');
    else lines.push({ kind: 'less', text: 'No longer listed: ' + who(x.k.customer) + ', ' + period(x.k) });
  });
  return { lines: lines, warnings: warnings };
}

const out = {}, warnings = [];
B.RIG_DATA.forEach(function (n) {
  const o = oldRigs[n.id], d = n.derived;
  if (!o) { out[n.id] = { group: 'added', lines: [{ kind: 'more', text: 'Added to the tracker' }] }; return; }
  const od = o.derived, lines = [];
  let ra = reach(od), rb = reach(d);
  if (od.bookedToLabel !== d.bookedToLabel || ra !== rb) {
    const text = 'Booked to: ' + bookedLabel(d) + ' (was ' + (od.available ? od.bookedToLabel.toLowerCase() : bookedLabel(od)) + ')';
    if (!od.available && !d.available && !od.bookedOpen && !d.bookedOpen && narrows(od.bookedToLabel, d.bookedToLabel)) {
      lines.push({ kind: 'other', text: text });
      ra = rb;
    } else lines.push({ kind: rb > ra ? 'more' : 'less', text: text });
  }
  if (before.legacy) {
    // rig level only: who it is working for, and at what rate
    if (od.shown && d.shown && !sameCustomer(od.customer, d.customer)) {
      lines.push({ kind: 'other', text: (d.current ? 'Now working for ' : 'Next customer: ') + who(d.shown.k.customer) + ' (was ' + who(od.shown.k.customer) + ')' });
    } else if (od.shown && d.shown && d.dayRate != null && od.dayRate == null) {
      lines.push({ kind: 'other', text: 'Day rate disclosed: ' + rate(d.dayRate) });
    } else if (od.shown && d.shown && rateMoved(od.dayRate, d.dayRate)) {
      lines.push({ kind: 'other', text: 'Day rate ' + rate(d.dayRate) + ' (was ' + rate(od.dayRate) + ')' });
    }
  } else {
    const c = contractChanges(o, n, B.AS_OF);
    lines.push(...c.lines);
    warnings.push(...c.warnings);
    if (o.country !== n.country && n.country) lines.push({ kind: 'other', text: 'Now in ' + n.country + (o.country ? ' (was ' + o.country + ')' : '') });
  }
  // a rig opening up or taking on work already shows in its booked-to line
  if (od.status !== d.status && od.available === d.available && !lines.some(l => /^Now working|^Next customer/.test(l.text))) {
    lines.push({ kind: 'other', text: d.status === 'Working' && od.status === 'Committed' ? 'Started work for ' + who(d.customer === 'Undisclosed' ? null : d.customer)
      : 'Now ' + d.status.toLowerCase() + ' (was ' + od.status.toLowerCase() + ')' });
  }
  if (!lines.length) return;
  // the rig's group follows its booked work: more of it, less of it, or the same
  const group = rb > ra ? 'more' : rb < ra ? 'less' : lines.some(l => l.kind === 'more') ? 'more' : lines.some(l => l.kind === 'less') ? 'less' : 'other';
  out[n.id] = { group: group, lines: lines };
});
Object.keys(oldRigs).filter(id => !newRigs[id]).forEach(function (id) {
  out[id] = { group: 'removed', name: oldRigs[id].name, lines: [{ kind: 'less', text: 'No longer tracked' }] };
});

const data = { since: before.asOf, sinceLabel: labelFromIso(before.asOf), asOf: current.asOf, base: base,
  compared: before.legacy ? 'rigs' : 'contracts', rigs: out };
const text = '/* Changes since the previous data refresh. Generated by scripts/build-changes.js; do not edit. */\n' +
  'const CHANGES = {\n' + Object.keys(data).filter(k => k !== 'rigs').map(k => '  ' + JSON.stringify(k) + ': ' + JSON.stringify(data[k]) + ',\n').join('') +
  '  "rigs": {\n' + Object.keys(out).map(id => '    ' + JSON.stringify(id) + ': ' + JSON.stringify(out[id])).join(',\n') + '\n  }\n};\n';

warnings.forEach(w => console.warn('WARN   ' + w));
if (check) {
  if (!fs.existsSync(OUT) || fs.readFileSync(OUT, 'utf8') !== text) {
    console.error('changes.js is out of date. Run: node scripts/build-changes.js');
    process.exit(1);
  }
  console.log('changes.js is current.');
} else {
  fs.writeFileSync(OUT, text);
  const n = Object.keys(out).length;
  console.log('changes.js: ' + n + ' rigs changed since ' + data.sinceLabel + ' (commit ' + base + ', compared by ' + data.compared + ').');
}
