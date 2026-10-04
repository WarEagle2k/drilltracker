#!/usr/bin/env node
/* Checks the rig data in rigs.js before a refresh is committed.
     node scripts/validate.js            errors fail (exit 1), warnings are listed
     node scripts/validate.js --strict   warnings fail too
   Dates are judged against DATA_AS_OF, not today's clock. */
const { loadApp } = require('./load-app');

const strict = process.argv.includes('--strict');
const app = loadApp();
const errors = [], warnings = [];
const err = (rig, msg) => errors.push((rig ? rig.id + ' ' + rig.name + ': ' : '') + msg);
const warn = (rig, msg) => warnings.push((rig ? rig.id + ' ' + rig.name + ': ' : '') + msg);

if (!app.parseIsoDate(app.DATA_AS_OF) || !/^\d{4}-\d{2}-\d{2}$/.test(app.DATA_AS_OF)) {
  console.error('ERROR  DATA_AS_OF must be a YYYY-MM-DD date: ' + app.DATA_AS_OF);
  process.exit(1);
}
const asOf = app.AS_OF;

const FIELDS = ['id', 'name', 'contractor', 'owner', 'type', 'generation', 'jackupClass', 'environment',
                'waterDepth_ft', 'hookload_tons', 'buildYear', 'region', 'country', 'lat', 'lng', 'position',
                'statusOverride', 'source', 'asOf', 'contracts', 'note'];
const REQUIRED_TEXT = ['id', 'name', 'contractor', 'type', 'region', 'position', 'note'];
const NULLABLE_TEXT = ['owner', 'generation', 'jackupClass', 'environment', 'country', 'statusOverride', 'source', 'asOf'];
const NUMBER_FIELDS = ['waterDepth_ft', 'hookload_tons', 'buildYear'];
const ENVIRONMENTS = ['Harsh', 'Ultra-Harsh'];
const OVERRIDES = ['Unconfirmed'];
const seenIds = new Set(), seenNames = new Set();
const isText = v => typeof v === 'string' && v.trim() !== '';

app.RIG_DATA.forEach(function (rig) {
  const keys = Object.keys(rig).filter(k => k !== 'derived');
  FIELDS.forEach(f => { if (!(f in rig)) err(rig, 'missing field "' + f + '"'); });
  keys.forEach(k => { if (!FIELDS.includes(k)) err(rig, 'unknown field "' + k + '"'); });

  REQUIRED_TEXT.forEach(f => { if (!isText(rig[f])) err(rig, '"' + f + '" must be non-empty text'); });
  NULLABLE_TEXT.forEach(f => { if (rig[f] !== null && !isText(rig[f])) err(rig, '"' + f + '" must be null or non-empty text (no "None", "-" or "")'); });
  NUMBER_FIELDS.forEach(f => { if (typeof rig[f] !== 'number' || !(rig[f] > 0)) err(rig, '"' + f + '" must be a positive number'); });

  if (!/^rig-\d{3}$/.test(rig.id)) err(rig, 'id should look like rig-001');
  if (seenIds.has(rig.id)) err(rig, 'duplicate id');
  if (seenNames.has(rig.name)) err(rig, 'duplicate name');
  seenIds.add(rig.id); seenNames.add(rig.name);

  if (typeof rig.lat !== 'number' || Math.abs(rig.lat) > 90) err(rig, 'lat out of range');
  if (typeof rig.lng !== 'number' || Math.abs(rig.lng) > 180) err(rig, 'lng out of range');

  // known values; commas would break the comma-separated filter lists in the URL
  if (!(rig.contractor in app.CONTRACTOR_COLORS)) err(rig, 'contractor "' + rig.contractor + '" has no colour in CONTRACTOR_COLORS (app.js)');
  if (!(rig.type in app.TYPE_SIZES)) err(rig, 'unknown rig type "' + rig.type + '"');
  if (!app.REGIONS.includes(rig.region)) err(rig, 'unknown region "' + rig.region + '"; regions are ' + app.REGIONS.join(', '));
  if (!(rig.position in app.POSITIONS)) err(rig, 'unknown position "' + rig.position + '"');
  if (rig.environment !== null && !ENVIRONMENTS.includes(rig.environment)) err(rig, 'unknown environment "' + rig.environment + '"');
  if (rig.statusOverride !== null && !OVERRIDES.includes(rig.statusOverride)) err(rig, 'statusOverride may only be ' + OVERRIDES.join(', '));
  [rig.contractor, rig.country].forEach(v => { if (v && v.includes(',')) err(rig, 'filter value "' + v + '" contains a comma'); });

  // class: floaters carry a generation, jackups a class
  if (rig.type === 'Jackup' && rig.generation) err(rig, 'jackups use jackupClass, not generation');
  if (rig.type !== 'Jackup' && rig.jackupClass) err(rig, 'floaters use generation, not jackupClass');
  if (rig.type !== 'Jackup' && !rig.generation) warn(rig, 'floater has no generation');

  // sources
  if (rig.asOf !== null && !/^\d{4}-\d{2}(-\d{2})?$/.test(rig.asOf)) err(rig, 'asOf must be YYYY-MM or YYYY-MM-DD');
  const srcDate = app.parseIsoDate(rig.asOf);
  if (srcDate && srcDate > asOf) err(rig, 'source date ' + rig.asOf + ' is after DATA_AS_OF');
  if (rig.asOf && !rig.source) err(rig, 'asOf is set but source is not');

  // contracts
  if (!Array.isArray(rig.contracts)) { err(rig, 'contracts must be an array'); return; }
  rig.contracts.forEach(function (k, i) {
    const at = 'contract ' + (i + 1) + ': ';
    ['customer', 'start', 'end', 'dayRate', 'firmness'].forEach(f => { if (!(f in k)) err(rig, at + 'missing "' + f + '"'); });
    Object.keys(k).forEach(f => { if (!['customer', 'start', 'end', 'dayRate', 'firmness', 'note'].includes(f)) err(rig, at + 'unknown field "' + f + '"'); });
    if (k.customer !== null && !isText(k.customer)) err(rig, at + 'customer must be null (undisclosed) or text');
    if (k.customer && /^(undisclosed|none|-)$/i.test(k.customer)) err(rig, at + 'use null for an undisclosed customer, not "' + k.customer + '"');
    if (!(k.firmness in app.FIRMNESS)) err(rig, at + 'unknown firmness "' + k.firmness + '"');
    if (k.dayRate !== null && !(typeof k.dayRate === 'number' && k.dayRate > 0)) err(rig, at + 'dayRate must be null or a positive number');
    if (k.note !== undefined && !isText(k.note)) err(rig, at + 'note must be text if present');
    const s = app.parseFlexDate(k.start), e = k.end === null ? null : app.parseFlexDate(k.end, true);
    if (!s) err(rig, at + 'start "' + k.start + '" is not a date the app can read');
    if (k.end !== null && !e) err(rig, at + 'end "' + k.end + '" is not a date the app can read');
    if (s && e && e <= s) err(rig, at + 'ends (' + k.end + ') before it starts (' + k.start + ')');
  });

  const d = rig.derived;
  if (rig.statusOverride === null && d.status === 'Available' && rig.contracts.some(k => app.parseFlexDate(k.end, true) >= asOf)) {
    warn(rig, 'has future contracts but derives as Available');
  }
  if (d.current && d.current.k.end === null) warn(rig, 'current contract has no end date, so it is left out of the backlog and near-term count');
});

// A contractor colour nobody uses is leftover from an earlier refresh
Object.keys(app.CONTRACTOR_COLORS).forEach(function (c) {
  if (!app.RIG_DATA.some(r => r.contractor === c)) warn(null, 'CONTRACTOR_COLORS has "' + c + '" but no rig uses it');
});

warnings.forEach(w => console.log('WARN   ' + w));
errors.forEach(e => console.log('ERROR  ' + e));
console.log(app.RIG_DATA.length + ' rigs checked as of ' + app.DATA_AS_OF_LABEL + ': ' +
  errors.length + ' error' + (errors.length === 1 ? '' : 's') + ', ' +
  warnings.length + ' warning' + (warnings.length === 1 ? '' : 's'));
process.exit(errors.length || (strict && warnings.length) ? 1 : 0);
