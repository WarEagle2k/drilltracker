#!/usr/bin/env node
/* Tests for the app's date parsing, contract maths and the fields derived from
   each rig's contracts. They run against the real functions in app.js; dates
   are computed as of DATA_AS_OF, so the test pins that to October 4, 2026
   (the data itself is checked by validate.js).
     node scripts/test-dates.js */
const assert = require('assert');
const { loadApp } = require('./load-app');

const app = loadApp({ asOf: '2026-10-04' });
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

// parseIsoDate
check('parseIsoDate day', ymd(app.parseIsoDate('2026-08-05')), '2026-08-05');
check('parseIsoDate month', ymd(app.parseIsoDate('2026-08')), '2026-08-01');
check('parseIsoDate rejects text', app.parseIsoDate('Aug 2026'), null);
check('parseIsoDate null', app.parseIsoDate(null), null);

// fmtMonths
[[0.5, '<1 mo'], [1, '1 mo'], [23.4, '23 mo'], [24, '2 yr'], [30, '2.5 yr']].forEach(function (c) {
  check('fmtMonths(' + c[0] + ')', app.fmtMonths(c[0]), c[1]);
});

// contractInfo, as of Oct 4, 2026
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

check('no end date is not datable', app.contractInfo('Q1 2027', null).has, false);
check('no dates is not datable', app.contractInfo(null, null).has, false);
check('end before start is not datable', app.contractInfo('Jan 2027', 'Jan 2026').has, false);

// deriveRig: status, booked-to, near-term and backlog from a contracts list
const k = (customer, start, end, dayRate, firmness) => ({ customer, start, end, dayRate, firmness: firmness || 'firm' });
const rig = (contracts, statusOverride) => app.deriveRig({ contracts: contracts, statusOverride: statusOverride || null, asOf: '2026-09' });

let d = rig([]);
check('no contracts: Available', d.status, 'Available');
check('no contracts: open now', d.bookedToLabel, 'Open now');
check('no contracts: near-term', d.nearTerm, true);
check('no contracts: no customer', d.customer, null);

d = rig([k('Shell', 'Jan 2025', 'Dec 2028', 400000)]);
check('running: Working', d.status, 'Working');
check('running: booked to its end', d.bookedToLabel, 'Dec 2028');
check('running: not near-term', d.nearTerm, false);
check('running: backlog counts days after the data date', Math.round(d.backlog / 400000), 819);

d = rig([k('Shell', 'Jan 2025', 'Mar 2027', 400000), k('Equinor', 'Jul 2027', 'Jul 2030', 450000)]);
check('a 3-month gap is continuous: booked to the follow-on', d.bookedToLabel, 'Jul 2030');
check('follow-on counts in backlog', d.backlog > 400000 * 177 + 450000 * 1000, true);

d = rig([k('OMV Petrom', 'Mar 2025', 'Feb 2027', 498000), k('Vår Energi', 'Jul 2027', 'Jul 2030', 467000)]);
check('a ~4-month mobilization between contracts is continuous', d.bookedToLabel, 'Jul 2030');

d = rig([k('Shell', 'Jan 2025', 'Dec 2026', 400000), k('bp', 'Jun 2028', 'May 2030', 600000)]);
check('a long gap breaks the chain', d.bookedToLabel, 'Dec 2026');
check('long gap: near-term', d.nearTerm, true);

d = rig([k('Petrobras', 'Jun 2024', 'Dec 2026', 435000), k('Petrobras', 'Jan 2027', 'Jun 2028', 440000)]);
check('rate step: current rate is the first step', d.dayRate, 435000);
check('rate step: booked to the last step', d.bookedToLabel, 'Jun 2028');

d = rig([k('Eni', 'Q4 2026', '2028', null)]);
check('start quarter not over yet: Committed', d.status, 'Committed');
check('committed: chain starts at the commitment', d.bookedToLabel, '2028');

d = rig([k('Murphy', 'Jun 2026', 'Sep 2026', 361000), k('Murphy', 'Oct 2026', 'Nov 2026', 361000, 'option')]);
check('option continuing a contract: Working', d.status, 'Working');
check('option continuing a contract: firmness shown', d.firmness, 'option');
check('options do not book the rig', d.bookedToLabel, 'Open now');
check('options add no backlog', d.backlog, 0);

d = rig([k(null, 'Dec 2026', 'Dec 2027', 405000)]);
check('future only: Committed', d.status, 'Committed');
check('undisclosed customer label', d.customer, 'Undisclosed');

d = rig([k(null, 'Aug 2026', null, null)]);
check('no end date: undisclosed', d.bookedToLabel, 'Undisclosed');
check('no end date: not near-term', d.nearTerm, false);

d = rig([k('Eni', 'May 2025', 'Sep 2026', null)], 'Unconfirmed');
check('override wins', d.status, 'Unconfirmed');
check('unconfirmed: booked-to says so', d.bookedToLabel, 'Not confirmed');
check('unconfirmed: near-term', d.nearTerm, true);

d = rig([k('Equinor', 'Jan 2026', 'Mar 2027', 495000), k('Equinor', 'Q1 2028', 'Q1 2030', 399000, 'conditional')]);
check('conditional awards book the rig', d.bookedToLabel, 'Mar 2027');
check('conditional awards add no backlog', Math.round(d.backlog / 495000), 178);

console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
