/* Loads the app's inline script from index.html into a sandbox, so Node can
   check the real data and run the real functions (no copies to drift).
   Pass { now: <ms> } to pin the clock the app sees. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const EXPORTS = ['RIG_DATA', 'CONTRACTOR_COLORS', 'STATUS_COLORS', 'TYPE_SIZES', 'CONTRACTED', 'MARKETABLE_IDLE',
                 'NEAR_TERM_MONTHS', 'DATA_AS_OF_LABEL', 'parseFlexDate', 'contractInfo', 'fmtMonths', 'monthsUntil', 'isNearTerm'];

function loadApp(opts) {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const appScript = inline.find(code => code.includes('const RIG_DATA'));
  if (!appScript) throw new Error('Could not find the app script (const RIG_DATA) in index.html');

  const noop = function () {};
  const context = vm.createContext({
    window: { matchMedia: () => ({ matches: false }), addEventListener: noop },
    document: { addEventListener: noop, getElementById: () => null, querySelector: () => null },
    performance: { now: () => 0 },
    console: console
  });
  if (opts && opts.now != null) {
    vm.runInContext(
      'const RealDate = Date; const FIXED_NOW = ' + Number(opts.now) + ';' +
      'Date = class extends RealDate {' +
      '  constructor(...a) { if (a.length === 0) super(FIXED_NOW); else super(...a); }' +
      '  static now() { return FIXED_NOW; }' +
      '};', context);
  }
  vm.runInContext(appScript, context, { filename: 'index.html (inline script)' });
  const app = vm.runInContext('({' + EXPORTS.join(',') + '})', context);
  app.html = html;
  return app;
}

module.exports = { loadApp };
