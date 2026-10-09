#!/usr/bin/env node
/* Accessibility check: serves the site, opens it in headless Chrome in each state that matters
   (views, both themes, the details pane, dialogs, the intro tour, phone layouts) and runs axe-core on each.
   Fails on any WCAG 2.2 A/AA or best-practice violation.

     npm install --no-save axe-core@4.13.0   once (CI does this; node_modules is ignored)
     node scripts/test-a11y.js

   Chrome comes from CHROME_PATH, or the usual install locations (GitHub's Ubuntu runner has it).
   Map clusters can overlap one another's tap area by design, so target size is checked
   everywhere except the map's marker layer. */
const fs = require('fs');
const http = require('http');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));

let AXE;
try { AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js', { paths: [ROOT] }), 'utf8'); }
catch (e) { console.error('axe-core is not installed. Run: npm install --no-save axe-core@4.13.0'); process.exit(1); }

const CHROME = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => p && fs.existsSync(p));
if (!CHROME) { console.error('Chrome not found. Set CHROME_PATH.'); process.exit(1); }

const STATES = [
  { name: 'map', hash: '#view=map' },
  { name: 'map, dark', hash: '#view=map', theme: 'dark' },
  { name: 'list', hash: '#view=list' },
  { name: 'list, dark', hash: '#view=list', theme: 'dark' },
  { name: 'insights', hash: '#view=insights' },
  { name: 'insights, dark', hash: '#view=insights', theme: 'dark' },
  { name: 'details: working', hash: '#view=list&rig=rig-018' },
  { name: 'details: working, dark', hash: '#view=map&rig=rig-002', theme: 'dark' },
  { name: 'details: unconfirmed', hash: '#view=list&rig=rig-074' },
  { name: 'details: unconfirmed, dark', hash: '#view=list&rig=rig-074', theme: 'dark' },
  { name: 'details: committed, dark', hash: '#view=list&rig=rig-047', theme: 'dark' },
  { name: 'changes dialog', hash: '#view=map', run: "document.getElementById('changesBtn').click()" },
  { name: 'changes dialog, dark', hash: '#view=map', theme: 'dark', run: "document.getElementById('changesBtn').click()" },
  { name: 'KPI definition open', hash: '#view=map', run: "document.querySelector('.kpi-help').click()" },
  { name: 'no matches', hash: '#view=list&q=zzzz' },
  { name: 'phone: map', hash: '#view=map', phone: true },
  { name: 'phone: filters open', hash: '#view=map', phone: true, run: 'toggleSidebar()' },
  { name: 'phone: map key open', hash: '#view=map', phone: true, run: 'toggleLegend()' },
  { name: 'phone: list, dark', hash: '#view=list', phone: true, theme: 'dark' },
  { name: 'tour: welcome', hash: '#view=map', tour: true },
  { name: 'tour: filters step, dark', hash: '#view=map', theme: 'dark', run: "startTour(); document.getElementById('tourNext').click(); document.getElementById('tourNext').click()" },
  { name: 'tour: map key step', hash: '#view=map', run: "startTour(); for (let i = 0; i < 4; i++) document.getElementById('tourNext').click()" },
  { name: 'phone: tour', hash: '#view=map', phone: true, tour: true }
];
const TOUR_VERSION = fs.readFileSync(path.join(ROOT, 'tour.js'), 'utf8').match(/TOUR_VERSION = '([^']+)'/)[1];
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

/* A static file server for the site */
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = http.createServer(function (req, res) {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

async function withChrome(fn) {
  const port = 9222 + Math.floor(Math.random() * 500);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'a11y-chrome-'));
  const proc = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=' + port,
    '--user-data-dir=' + dir, '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
  let target;
  // wait up to 30 s: a busy CI runner can take more than 10 s to start Chrome
  for (let i = 0; i < 300 && !target; i++) {
    await sleep(100);
    try { target = (await (await fetch('http://127.0.0.1:' + port + '/json')).json()).find(t => t.type === 'page'); } catch (e) {}
  }
  if (!target) { proc.kill(); throw new Error('Chrome did not start'); }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  let id = 0; const pending = new Map(); const errors = [];
  ws.addEventListener('message', function (e) {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  const send = (method, params) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  const evaluate = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'evaluate failed');
    return r.result.result.value;
  };
  try { return await fn(send, evaluate, errors); }
  finally { ws.close(); proc.kill(); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} }
}

async function main() {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  let failed = 0;
  await withChrome(async function (send, evaluate, errors) {
    await send('Page.enable'); await send('Runtime.enable');
    for (const st of STATES) {
      await send('Emulation.setDeviceMetricsOverride', st.phone
        ? { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }
        : { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' },
        { name: 'prefers-color-scheme', value: st.theme === 'dark' ? 'dark' : 'light' }] });
      // a fresh load each time (the query string forces it), with the theme saved first
      await send('Page.navigate', { url: base + '?a11y' });
      await sleep(300);
      await evaluate("localStorage.setItem('drilltracker-theme', '" + (st.theme || 'light') + "')");
      // the intro tour opens by itself on a first visit; only the tour states want that
      await evaluate(st.tour ? "localStorage.removeItem('drilltracker-tour')" : "localStorage.setItem('drilltracker-tour', '" + TOUR_VERSION + "')");
      errors.length = 0;
      await send('Page.navigate', { url: base + '?a11y=' + Date.now() + st.hash });
      for (let i = 0; i < 50; i++) {
        await sleep(100);
        if (await evaluate("document.readyState === 'complete' && typeof filteredRigs !== 'undefined' && document.querySelectorAll('.kpi-value').length > 0")) break;
      }
      await sleep(600);
      if (st.run) { await evaluate(st.run); await sleep(500); }
      if (st.tour) await sleep(900); // it opens 600 ms after load
      await evaluate(AXE + ';0');
      const result = JSON.parse(await evaluate(
        "(async () => [" +
        "  await axe.run(document, { runOnly: { type: 'tag', values: " + JSON.stringify(TAGS) + " }, rules: { 'target-size': { enabled: false } }, resultTypes: ['violations'] })," +
        "  await axe.run({ exclude: [['.leaflet-marker-pane']] }, { runOnly: { type: 'rule', values: ['target-size'] }, resultTypes: ['violations'] })" +
        "])().then(rs => JSON.stringify(rs.flatMap(r => r.violations).map(v => ({ id: v.id, impact: v.impact, help: v.help," +
        "  nodes: v.nodes.map(n => n.target.join(' ') + (n.failureSummary ? ' — ' + n.failureSummary.split('\\n').slice(1, 2).join('').trim() : '')) }))))"));
      const problems = result.length + errors.length;
      console.log((problems ? 'FAIL ' : 'ok   ') + st.name);
      for (const v of result) {
        console.log('       [' + v.impact + '] ' + v.id + ': ' + v.help);
        v.nodes.slice(0, 5).forEach(n => console.log('         ' + n.slice(0, 220)));
        if (v.nodes.length > 5) console.log('         … and ' + (v.nodes.length - 5) + ' more');
      }
      errors.forEach(e => console.log('       page error: ' + String(e).split('\n')[0]));
      failed += problems ? 1 : 0;
    }
  });
  server.close();
  console.log((STATES.length - failed) + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
}

main().catch(function (e) { console.error(e); server.close(); process.exit(1); });
