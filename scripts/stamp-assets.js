#!/usr/bin/env node
/* Adds a content version to every local file the page loads (styles.css?v=1a2b3c4d), so a
   new deploy never pairs a fresh index.html with a stylesheet or script the browser cached
   from the last one. GitHub Pages lets browsers reuse files for 10 minutes.

     node scripts/stamp-assets.js           rewrite the versions
     node scripts/stamp-assets.js --check   fail if any version is out of date (CI runs this)

   The icons are versioned inside styles.css first, so a new icon also changes the
   stylesheet's version. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const check = process.argv.includes('--check');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('hex').slice(0, 8);
const stale = [];

// refs look like name.ext or name.ext?v=xxxxxxxx; replace each with the current version
function stamp(file, pattern) {
  const full = path.join(ROOT, file);
  const before = fs.readFileSync(full, 'utf8');
  const after = before.replace(pattern, function (match, pre, ref, post) {
    const want = ref + '?v=' + hash(ref);
    return pre + want + post;
  });
  if (after !== before) {
    if (check) stale.push(file);
    else fs.writeFileSync(full, after);
  }
}

stamp('styles.css', /(url\()(icons\/[a-z-]+\.png)(?:\?v=[0-9a-f]+)?(\))/g);
stamp('index.html', /((?:src|href)=")([a-z-]+\.(?:js|css))(?:\?v=[0-9a-f]+)?(")/g);

if (check && stale.length) {
  console.error('Asset versions are out of date in ' + stale.join(', ') + '. Run: node scripts/stamp-assets.js');
  process.exit(1);
}
console.log(check ? 'Asset versions are current.' : 'Asset versions written.');
