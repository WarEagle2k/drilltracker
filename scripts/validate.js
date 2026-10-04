#!/usr/bin/env node
/* Checks the rig data in index.html before a refresh is committed.
     node scripts/validate.js            errors fail (exit 1), warnings are listed
     node scripts/validate.js --strict   warnings fail too
   Dates are judged against the app's "data as of" date, not today's clock. */
const { loadApp } = require('./load-app');

const strict = process.argv.includes('--strict');
let app = loadApp();
const asOf = new Date(app.DATA_AS_OF_LABEL);
if (isNaN(asOf)) {
  console.error('ERROR  DATA_AS_OF_LABEL is not a date: ' + app.DATA_AS_OF_LABEL);
  process.exit(1);
}
app = loadApp({ now: asOf.getTime() });

const errors = [], warnings = [];
const err = (rig, msg) => errors.push((rig ? rig.id + ' ' + rig.name + ': ' : '') + msg);
const warn = (rig, msg) => warnings.push((rig ? rig.id + ' ' + rig.name + ': ' : '') + msg);

const TEXT_FIELDS = ['id', 'name', 'contractor', 'type', 'generation', 'region', 'customer', 'status',
                     'contractStart', 'contractEnd', 'backlogNote'];
const NUMBER_FIELDS = ['waterDepth_ft', 'hookload_tons', 'buildYear'];
const seenIds = new Set(), seenNames = new Set();

app.RIG_DATA.forEach(function (rig) {
  TEXT_FIELDS.forEach(function (f) {
    if (typeof rig[f] !== 'string' || !rig[f].trim()) err(rig, 'missing or empty "' + f + '"');
  });
  NUMBER_FIELDS.forEach(function (f) {
    if (typeof rig[f] !== 'number' || !(rig[f] > 0)) err(rig, '"' + f + '" must be a positive number');
  });
  if (!/^rig-\d{3}$/.test(rig.id)) err(rig, 'id should look like rig-001');
  if (seenIds.has(rig.id)) err(rig, 'duplicate id');
  if (seenNames.has(rig.name)) err(rig, 'duplicate name');
  seenIds.add(rig.id); seenNames.add(rig.name);

  if (typeof rig.lat !== 'number' || Math.abs(rig.lat) > 90) err(rig, 'lat out of range');
  if (typeof rig.lng !== 'number' || Math.abs(rig.lng) > 180) err(rig, 'lng out of range');
  if (rig.dayRate !== null && !(typeof rig.dayRate === 'number' && rig.dayRate > 0)) err(rig, 'dayRate must be null or a positive number');

  if (!(rig.contractor in app.CONTRACTOR_COLORS)) err(rig, 'contractor "' + rig.contractor + '" has no colour in CONTRACTOR_COLORS');
  if (!(rig.status in app.STATUS_COLORS)) err(rig, 'unknown status "' + rig.status + '"');
  if (!(rig.type in app.TYPE_SIZES)) err(rig, 'unknown rig type "' + rig.type + '"');

  const hasStart = rig.contractStart !== '-', hasEnd = rig.contractEnd !== '-';
  const start = hasStart ? app.parseFlexDate(rig.contractStart) : null;
  const end = hasEnd ? app.parseFlexDate(rig.contractEnd, true) : null;
  if (hasStart && !start) err(rig, 'contractStart "' + rig.contractStart + '" is not a date the app can read');
  if (hasEnd && !end) err(rig, 'contractEnd "' + rig.contractEnd + '" is not a date the app can read');
  if (start && end && end <= start) err(rig, 'contract ends (' + rig.contractEnd + ') before it starts (' + rig.contractStart + ')');

  if (app.CONTRACTED.includes(rig.status)) {
    if (rig.customer === 'None') err(rig, 'status is ' + rig.status + ' but customer is "None"');
    if (!hasStart) err(rig, 'status is ' + rig.status + ' but there is no contract start');
    if (!hasEnd) warn(rig, 'no contract end date, so it is left out of the timeline, backlog and near-term count');
    if (end && end < asOf) warn(rig, 'contract ended ' + rig.contractEnd + ' but status is still ' + rig.status);
    if (rig.status === 'Operating' && start && start > asOf) warn(rig, 'status is Operating but the contract starts ' + rig.contractStart);
  } else {
    if (rig.customer !== 'None') err(rig, 'status is ' + rig.status + ' but customer is "' + rig.customer + '"');
    if (hasStart || hasEnd) err(rig, 'status is ' + rig.status + ' but contract dates are set');
    if (rig.dayRate !== null) err(rig, 'status is ' + rig.status + ' but a day rate is set');
  }
});

// The footer repeats the as-of date; keep it in step with DATA_AS_OF_LABEL
if (!app.html.includes('Data as of ' + app.DATA_AS_OF_LABEL)) {
  err(null, 'footer "Data as of …" does not match DATA_AS_OF_LABEL (' + app.DATA_AS_OF_LABEL + ')');
}

warnings.forEach(w => console.log('WARN   ' + w));
errors.forEach(e => console.log('ERROR  ' + e));
console.log(app.RIG_DATA.length + ' rigs checked as of ' + app.DATA_AS_OF_LABEL + ': ' +
  errors.length + ' error' + (errors.length === 1 ? '' : 's') + ', ' +
  warnings.length + ' warning' + (warnings.length === 1 ? '' : 's'));
process.exit(errors.length || (strict && warnings.length) ? 1 : 0);
