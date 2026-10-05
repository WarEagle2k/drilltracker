/* Loads rigs.js, app.js and insights.js into a sandbox, as the page does, so Node can check
   the real data and run the real functions (no copies to drift).
   Pass { asOf: 'YYYY-MM-DD' } to replace DATA_AS_OF, so tests do not depend on the data date,
   or { rigs: '<source>' } to load other data in place of rigs.js (an earlier snapshot). */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const EXPORTS = ['RIG_DATA', 'DATA_AS_OF', 'DATA_AS_OF_LABEL', 'AS_OF', 'CONTRACTOR_COLORS', 'STATUSES', 'FIRMNESS',
                 'REGIONS', 'POSITIONS', 'TYPE_SIZES', 'NEAR_TERM_MONTHS', 'parseFlexDate', 'parseIsoDate',
                 'contractInfo', 'fmtMonths', 'deriveRig', 'isNearTerm', 'classLabel', 'FILTER_GROUPS', 'rigMatches', 'facetCounts',
                 'tierAt', 'coverageByMonth', 'bookedShare', 'rollOff', 'forwardRates', 'firmRigYears', 'customerExposure', 'contractorRunway'];

function loadApp(opts) {
  const noop = function () {};
  const context = vm.createContext({
    window: { matchMedia: () => ({ matches: false }), addEventListener: noop },
    document: { addEventListener: noop, getElementById: () => null, querySelector: () => null },
    location: { hash: '', pathname: '/', search: '' },
    performance: { now: () => 0 },
    console: console
  });
  ['rigs.js', 'app.js', 'insights.js'].forEach(function (file) {
    let code = file === 'rigs.js' && opts && opts.rigs ? opts.rigs : fs.readFileSync(path.join(ROOT, file), 'utf8');
    if (file === 'rigs.js' && opts && opts.asOf) {
      code = code.replace(/const DATA_AS_OF = '[^']*';/, "const DATA_AS_OF = '" + opts.asOf + "';");
    }
    vm.runInContext(code, context, { filename: file });
  });
  return vm.runInContext('({' + EXPORTS.join(',') + '})', context);
}

module.exports = { loadApp };
