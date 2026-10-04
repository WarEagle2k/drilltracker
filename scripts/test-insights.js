#!/usr/bin/env node
/* Tests for the Insights calculations in insights.js, on synthetic rigs and the real data.
     node scripts/test-insights.js */
const assert = require('assert');
const { loadApp } = require('./load-app');

const app = loadApp({ asOf: '2026-10-04' });
const R = app.RIG_DATA;
let passed = 0, failed = 0;
function check(label, actual, expected) {
  try { assert.deepStrictEqual(actual, expected); passed++; }
  catch (e) { failed++; console.log('FAIL  ' + label + '\n      expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual)); }
}
const k = (customer, start, end, dayRate, firmness) => ({ customer, start, end, dayRate, firmness: firmness || 'firm' });
const rig = (type, contracts) => {
  const r = { id: 'x', name: 'x', type, contractor: 'C', contracts, statusOverride: null, asOf: null };
  r.derived = app.deriveRig(r);
  return r;
};

// tierAt: the firmest contract covering the date wins
const t = new Date(2027, 2, 1);
check('firm beats option on the same date', app.tierAt(rig('Drillship', [k('A', 'Jan 2027', 'Dec 2027', null, 'option'), k('A', 'Jan 2027', 'Jun 2027')]), t), 'firm');
check('nothing covering gives null', app.tierAt(rig('Drillship', [k('A', 'Jan 2028', 'Dec 2028')]), t), null);
check('an open-ended contract counts for six months', app.tierAt(rig('Drillship', [k('A', 'Jan 2027', null)]), t), 'firm');
check('...and not after', app.tierAt(rig('Drillship', [k('A', 'Jan 2027', null)]), new Date(2027, 8, 1)), null);

// real data: every count adds up to the rigs shown
const cov = app.coverageByMonth(R);
check('coverage has 37 months', cov.length, 37);
check('every month accounts for every rig', cov.every(m => m.firm + m.loi + m.conditional + m.option + m.open === R.length), true);
const ro = app.rollOff(R);
check('roll-off buckets plus undisclosed account for every rig', ro.buckets.reduce((s, b) => s + b.rigs.length, 0) + ro.undisclosed, R.length);
check('"open now" holds the available and unconfirmed rigs', ro.buckets[0].rigs.length, R.filter(r => r.derived.available).length);
const rw = app.contractorRunway(R);
check('runway rows cover every rig', rw.rows.reduce((s, r) => s + r.n, 0), R.length);
check('runway shares are between 0 and 1', rw.rows.every(r => r.cells.every(c => c.share >= 0 && c.share <= 1)), true);
const share = app.bookedShare(R, new Date(2027, 9, 4));
check('booked share is a fraction', share > 0 && share < 1, true);
check('firm rig-years are positive', app.firmRigYears(R) > 0, true);
check('customer exposure is sorted, largest first', app.customerExposure(R).every((c, i, a) => !i || a[i - 1].value >= c.value), true);
const fr = app.forwardRates(R);
check('forward floater rates use disclosed rates only', fr.nowN > 0 && fr.fwdN > 0 && fr.now > 100000 && fr.fwd > 100000, true);

console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
