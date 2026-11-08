#!/usr/bin/env node
/* Checks history-data.js (the driller family tree): ids unique and resolvable, dates valid and
   in order, every event sourced, every present-day driller in rigs.js, no company left floating.

     node scripts/validate-history.js           fail on errors
     node scripts/validate-history.js --strict  also fail on warnings */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const strict = process.argv.includes('--strict');
const window = {};
new Function('window', fs.readFileSync(path.join(ROOT, 'history-data.js'), 'utf8'))(window);
const H = window.HISTORY;
const rigsText = fs.readFileSync(path.join(ROOT, 'rigs.js'), 'utf8');
const RIGS = new Function(rigsText.replace(/^const /mg, 'var ') + '\nreturn RIG_DATA;')();
const contractors = new Set(RIGS.map(r => r.contractor));

const errors = [], warnings = [];
const err = m => errors.push(m), warn = m => warnings.push(m);
const DATE = /^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/;
const TYPES = ['founded', 'merger', 'acquisition', 'spin-off', 'rename', 'restructuring', 'jv', 'fleet', 'listing', 'divestment'];
const KINDS = ['primary', 'press', 'reference'];
const num = s => { const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(s || ''); return m ? +m[1] + (m[2] ? (+m[2] - 1) / 12 : 0) + (m[3] ? (+m[3] - 1) / 365 : 0) : null; };

if (!H || !Array.isArray(H.companies) || !Array.isArray(H.events)) { console.error('history-data.js must set window.HISTORY = { asOf, companies, events }'); process.exit(1); }
if (!DATE.test(H.asOf || '')) err('asOf must be a YYYY-MM-DD date');

const co = {};
for (const c of H.companies) {
  if (!c.id || !/^[a-z0-9-]+$/.test(c.id)) err('company id must be kebab-case: ' + JSON.stringify(c.id));
  if (co[c.id]) err('duplicate company id ' + c.id);
  co[c.id] = c;
  if (!c.name) err(c.id + ': no name');
  if (c.start && !DATE.test(c.start)) err(c.id + ': bad start ' + c.start);
  if (c.end && !DATE.test(c.end)) err(c.id + ': bad end ' + c.end);
  if (!c.start) warn(c.id + ': founding date unknown');
  if (c.start && c.end && num(c.end) < num(c.start)) err(c.id + ': ends before it starts');
  if (c.current && c.end) err(c.id + ': current but has an end date');
  if (c.outside && c.trackerName) err(c.id + ': outside companies are not tracker drillers');
  if (!c.current && !c.end && !c.outside) warn(c.id + ': not current and no end date');
  if (c.trackerName && !contractors.has(c.trackerName)) err(c.id + ': trackerName "' + c.trackerName + '" is not a contractor in rigs.js');
}
for (const c of H.companies) if (c.successor && !co[c.successor]) err(c.id + ': successor ' + c.successor + ' not found');
for (const name of contractors) {
  if (!H.companies.some(c => c.current && c.trackerName === name)) warn('no present-day company has trackerName "' + name + '"');
}

const evIds = new Set();
const touched = new Set();
for (const e of H.events) {
  const tag = e.id || JSON.stringify(e.title);
  if (!e.id) err('event without id: ' + tag);
  if (evIds.has(e.id)) err('duplicate event id ' + e.id);
  evIds.add(e.id);
  if (!TYPES.includes(e.type)) err(tag + ': unknown type ' + e.type);
  if (!DATE.test(e.date || '')) err(tag + ': bad date ' + e.date);
  if (e.announced && !DATE.test(e.announced)) err(tag + ': bad announced date ' + e.announced);
  if (!e.title) err(tag + ': no title');
  if (!Array.isArray(e.from) || !Array.isArray(e.to)) { err(tag + ': from and to must be arrays'); continue; }
  for (const id of e.from.concat(e.to)) { if (!co[id]) err(tag + ': company ' + id + ' not found'); else touched.add(id); }
  if (['merger', 'acquisition', 'rename', 'spin-off'].includes(e.type) && (!e.from.length || !e.to.length)) err(tag + ': ' + e.type + ' needs both from and to');
  if (e.type === 'fleet' && !e.to.length) err(tag + ': fleet deal needs a buyer in to (the seller may be a shipyard outside the tree)');
  if (e.type === 'divestment' && !e.from.length) err(tag + ': divestment needs a seller in from');
  if (e.pending && num(e.date) < num(H.asOf)) warn(tag + ': pending but dated before asOf');
  if (!e.pending && num(e.date) > num(H.asOf)) err(tag + ': dated after asOf but not pending');
  if (!Array.isArray(e.sources) || !e.sources.length) err(tag + ': no source');
  else for (const s of e.sources) {
    if (!KINDS.includes(s.kind)) err(tag + ': source kind must be one of ' + KINDS.join(', '));
    if (s.url && !/^https?:\/\//.test(s.url)) err(tag + ': source url must be http(s)');
    if (!s.title && !s.publisher) err(tag + ': source without title or publisher');
  }
  if (e.sources && e.sources.length && !e.sources.some(s => s.kind === 'primary')) warn(tag + ': no primary source');
  // a company should not take part in an event outside its lifetime (a year's slack for loose dates)
  for (const id of e.from) { const c = co[id]; if (c && c.start && num(e.date) < num(c.start) - 1) warn(tag + ': ' + id + ' takes part before it was founded'); }
}
for (const c of H.companies) if (!touched.has(c.id)) warn(c.id + ': in no event');

for (const w of warnings) console.log('WARN   ' + w);
for (const e of errors) console.log('ERROR  ' + e);
const primary = H.events.filter(e => (e.sources || []).some(s => s.kind === 'primary')).length;
console.log(H.companies.length + ' companies, ' + H.events.length + ' events (' + primary + ' with a primary source): ' +
  errors.length + ' errors, ' + warnings.length + ' warnings');
process.exit(errors.length || (strict && warnings.length) ? 1 : 0);
