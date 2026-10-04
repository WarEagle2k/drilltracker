#!/usr/bin/env node
/* Tests for the app's date parsing and contract maths, run against the real
   functions in index.html with the clock pinned to October 4, 2026.
     node scripts/test-dates.js */
const assert = require('assert');
const { loadApp } = require('./load-app');

const app = loadApp({ now: new Date(2026, 9, 4).getTime() });
const ymd = d => d == null ? null :
  d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

let passed = 0, failed = 0;
function check(label, actual, expected) {
  try { assert.deepStrictEqual(actual, expected); passed++; }
  catch (e) { failed++; console.log('FAIL  ' + label + '\n      expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual)); }
}

// parseFlexDate: [input, as a start date, as an end date]
[
  ['Jul 2026',       '2026-07-01', '2026-07-31'],
  ['Feb 2028',       '2028-02-01', '2028-02-29'],
  ['September 2026', '2026-09-01', '2026-09-30'],
  ['Q2 2027',        '2027-04-01', '2027-06-30'],
  ['Q4 2026',        '2026-10-01', '2026-12-31'],
  ['Early 2027',     '2027-01-01', '2027-04-30'],
  ['Mid-2027',       '2027-06-01', '2027-07-31'],
  ['Late 2027',      '2027-10-01', '2027-12-31'],
  ['End 2027',       '2027-10-01', '2027-12-31'],
  ['2028',           '2028-01-01', '2028-12-31'],
  ['-',              null,         null],
  ['',               null,         null],
  [null,             null,         null],
  ['TBD',            null,         null]
].forEach(function (c) {
  check('parseFlexDate(' + JSON.stringify(c[0]) + ') as start', ymd(app.parseFlexDate(c[0])), c[1]);
  check('parseFlexDate(' + JSON.stringify(c[0]) + ') as end', ymd(app.parseFlexDate(c[0], true)), c[2]);
});

// fmtMonths
[[0.5, '<1 mo'], [1, '1 mo'], [23.4, '23 mo'], [24, '2 yr'], [30, '2.5 yr']].forEach(function (c) {
  check('fmtMonths(' + c[0] + ')', app.fmtMonths(c[0]), c[1]);
});

// contractInfo, with today = Oct 4, 2026
const running = app.contractInfo('Apr 2023', 'Apr 2028');
check('running contract is datable', running.has, true);
check('running contract: time left', running.remaining, '19 mo left');
check('running contract: progress is partway', running.pct > 0 && running.pct < 100, true);

const future = app.contractInfo('Dec 2026', 'Dec 2027');
check('future contract: starts in', future.remaining, 'Starts in 2 mo');
check('future contract: no progress yet', future.pct, 0);

const lapsed = app.contractInfo('May 2025', 'Sep 2026');
check('lapsed contract: ended', lapsed.remaining, 'Ended');
check('lapsed contract: full bar', lapsed.pct, 100);

check('no end date is not datable', app.contractInfo('Q1 2027', '-').has, false);
check('no dates is not datable', app.contractInfo('-', '-').has, false);
check('end before start is not datable', app.contractInfo('Jan 2027', 'Jan 2026').has, false);

// isNearTerm: idle now, or the contract ends within NEAR_TERM_MONTHS (9)
check('available rig is near-term', app.isNearTerm({ status: 'Available', contractEnd: '-' }), true);
check('ends Jun 2027 is near-term', app.isNearTerm({ status: 'Firm', contractEnd: 'Jun 2027' }), true);
check('ends Aug 2027 is not near-term', app.isNearTerm({ status: 'Firm', contractEnd: 'Aug 2027' }), false);
check('lapsed contract is near-term', app.isNearTerm({ status: 'Operating', contractEnd: 'Sep 2026' }), true);
check('committed with no end date is not near-term', app.isNearTerm({ status: 'Committed', contractEnd: '-' }), false);

console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
