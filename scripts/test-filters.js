#!/usr/bin/env node
/* Tests for the faceted filter logic in app.js, run against the real data.
     node scripts/test-filters.js */
const assert = require('assert');
const { loadApp } = require('./load-app');

const app = loadApp({ asOf: '2026-10-04' });
const R = app.RIG_DATA;
const match = (sel, search) => R.filter(r => app.rigMatches(r, sel, search || ''));
const count = (key, value) => R.filter(r => app.FILTER_GROUPS.find(g => g.key === key).get(r) === value).length;

let passed = 0, failed = 0;
function check(label, actual, expected) {
  try { assert.deepStrictEqual(actual, expected); passed++; }
  catch (e) { failed++; console.log('FAIL  ' + label + '\n      expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual)); }
}

check('no selections shows every rig', match({}).length, R.length);
check('an empty list is no filter', match({ type: [] }).length, R.length);
check('one value narrows to it', match({ type: ['Jackup'] }).length, count('type', 'Jackup'));
check('values in a group combine with OR', match({ type: ['Jackup', 'Drillship'] }).length, count('type', 'Jackup') + count('type', 'Drillship'));
check('groups combine with AND', match({ type: ['Drillship'], country: ['Brazil'] }).every(r => r.type === 'Drillship' && r.country === 'Brazil'), true);
check('search applies with filters', match({ country: ['Brazil'] }, 'petrobras').every(r => r.country === 'Brazil'), true);
check('search matches contract customers', match({}, 'talos').map(r => r.name).join(), 'West Vela');

// facet counts: each option counts rigs under the OTHER groups' selections
const sel = { type: ['Jackup'] };
const f = app.facetCounts(R, sel, '');
check('a group ignores its own selection, so other options stay available', f.type.Drillship, count('type', 'Drillship'));
check('other groups count within the selection', f.country.Brazil || 0, match({ type: ['Jackup'], country: ['Brazil'] }).length);
check('every option count equals what ticking it would show',
  Object.keys(f.region).every(v => f.region[v] === match({ type: ['Jackup'], region: [v] }).length), true);
check('no reachable option leads to zero rigs', app.FILTER_GROUPS.every(g =>
  Object.keys(f[g.key]).every(v => match(Object.assign({}, sel, { [g.key]: (sel[g.key] || []).concat(v) })).length > 0)), true);

console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
