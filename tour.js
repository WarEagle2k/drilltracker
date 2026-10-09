/* DrillTracker intro tour. On a first visit (no rig deep link), a pointer glides to each part
   of the page in turn, a spotlight dims the rest, and a card says what it does. Back, Next,
   Skip and Escape work as expected; "Don't show this again" is remembered in this browser.
   The "?" button in the header replays it. Loads after app.js, whose state and helpers it uses.

   Bump TOUR_VERSION to show the tour again to everyone after a material change to the page. */
const TOUR_VERSION = 'v1';
const TOUR_KEY = 'drilltracker-tour';

/* Each step names the elements it can point at, in order of preference; the first one
   that is on screen wins (so on a phone, where the filters start folded, it points at the
   Filters button). A step with no target, or whose targets are all hidden, is centred. */
const TOUR_STEPS = [
  {
    title: 'Welcome to DrillTracker',
    body: () => 'A map and contract tracker for ' + RIG_DATA.length + ' offshore drilling rigs: who is working, ' +
      'for whom, and when each rig comes free. Here is a quick look around.'
  },
  {
    targets: ['.kpi-strip'], place: 'bottom',
    title: 'The headline numbers',
    body: () => 'Contracted share, average floater day rate, backlog, rigs coming free and booked runway, ' +
      'for whatever rigs are shown. Select any ? for what a figure means.'
  },
  {
    targets: ['#filterSidebar', '.sidebar-toggle-btn'], place: 'right',
    title: 'Search and filter',
    body: () => 'Search by rig, contractor, customer or country, or tick filters to narrow the rigs. ' +
      'The number beside each option is how many rigs it would show; every view and figure follows your choices.'
  },
  {
    targets: ['#mapContainer'], place: 'inside',
    title: 'The map',
    body: () => 'Numbered circles group nearby rigs, with a ring showing their mix; select one to glide in. ' +
      'Select a rig for its details: contracts, a timeline of what it is booked for, specs and sources.'
  },
  {
    targets: ['#mapLegend'], place: 'left',
    // a folded key would leave nothing to point at, so open it for this stop
    enter: () => { if (document.getElementById('mapLegend').classList.contains('collapsed')) { toggleLegend(); tourOpenedLegend = true; } },
    title: 'Map key',
    body: () => 'Colour the rigs by availability (open now, free within 9 months, or booked) or by contractor: ' +
      'the eight largest contractors each have a colour and the rest share a grey. The key counts the rigs shown and folds away.'
  },
  {
    targets: ['.view-toggle'], place: 'bottom',
    title: 'List and Insights',
    body: () => 'List shows the same rigs as a sortable table. Insights charts the market: who comes free when, ' +
      'day rates by start date, each contractor\'s booked runway, the biggest customers and every contract on a timeline.'
  },
  {
    targets: ['#changesBtn'], place: 'bottom',
    title: 'What changed',
    body: () => 'New contracts, extensions, rigs coming free and other changes since the previous data refresh, ' +
      'each linked to its rig.'
  },
  {
    targets: ['#exportBtn'], place: 'bottom',
    title: 'Take the data with you',
    body: () => 'Download the rigs shown, with their contracts, as a CSV file.'
  },
  {
    targets: ['#tourBtn', '#tourFooterBtn'], place: 'top', always: true,
    title: 'That\'s the tour',
    body: () => 'Replay it any time from here. Figures are compiled from public disclosures as of ' +
      DATA_AS_OF_LABEL + '; About & method, in the footer, explains the sources.'
  }
];

let tourStep = 0, tourReturnFocus = null, tourViewBefore = null, tourDetailBefore = null, tourOpenedLegend = false, tourSettle = 0;

function tourVisible(el) {
  if (!el || el.closest('[hidden]') || el.closest('[inert]')) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight;
}

function tourTarget(step) {
  return (step.targets || []).map(s => document.querySelector(s)).find(tourVisible) || null;
}

/* Steps whose targets are all hidden right now (say the Changes button, when nothing changed)
   are skipped; the welcome has no target by design, and the closing step always shows */
function tourSteps() {
  return TOUR_STEPS.filter(s => !s.targets || s.always || tourTarget(s));
}

function startTour() {
  const dialog = document.getElementById('tourDialog');
  if (!dialog || dialog.open) return;
  // the tour points at the map, so show it, closing a details pane that would cover the key;
  // both come back when the tour ends
  tourViewBefore = currentView;
  tourDetailBefore = selectedRigId;
  if (selectedRigId) closeDetail(false);
  if (currentView !== 'map') setView('map');
  tourReturnFocus = document.activeElement;
  tourStep = 0;
  document.getElementById('tourDontShow').checked = true;
  dialog.showModal();
  // the map may have just been shown; let it size itself before measuring
  requestAnimationFrame(() => requestAnimationFrame(renderTourStep));
}

function endTour() {
  const dialog = document.getElementById('tourDialog');
  if (!dialog.open) return;
  try {
    if (document.getElementById('tourDontShow').checked) localStorage.setItem(TOUR_KEY, TOUR_VERSION);
    else localStorage.removeItem(TOUR_KEY);
  } catch (e) { /* storage blocked: the tour will offer itself again next time */ }
  dialog.close();
  onTourClosed(); // every way out (Done, Skip, ×, Escape) comes through here
}

function onTourClosed() {
  clearTimeout(tourSettle);
  if (tourOpenedLegend && !document.getElementById('mapLegend').classList.contains('collapsed')) toggleLegend();
  tourOpenedLegend = false;
  if (tourViewBefore && tourViewBefore !== currentView) setView(tourViewBefore);
  if (tourDetailBefore && RIG_BY_ID[tourDetailBefore] && filteredRigs.some(r => r.id === tourDetailBefore)) {
    openDetail(RIG_BY_ID[tourDetailBefore]);
  } else if (tourReturnFocus && document.contains(tourReturnFocus)) {
    tourReturnFocus.focus();
  }
  tourViewBefore = tourDetailBefore = tourReturnFocus = null;
}

function renderTourStep() {
  const dialog = document.getElementById('tourDialog');
  if (!dialog.open) return;
  const steps = tourSteps();
  tourStep = Math.max(0, Math.min(tourStep, steps.length - 1));
  const step = steps[tourStep];
  const last = tourStep === steps.length - 1;

  document.getElementById('tourTitle').textContent = step.title;
  document.getElementById('tourBody').textContent = step.body();
  document.getElementById('tourProgress').textContent = 'Step ' + (tourStep + 1) + ' of ' + steps.length;
  document.getElementById('tourDots').innerHTML = steps.map((s, i) =>
    '<span class="tour-dot' + (i === tourStep ? ' tour-dot--on' : '') + '"></span>').join('');
  document.getElementById('tourBack').hidden = tourStep === 0;
  const next = document.getElementById('tourNext');
  next.textContent = last ? 'Done' : tourStep === 0 ? 'Show me' : 'Next';
  document.getElementById('tourSkip').hidden = last;
  if (step.enter) step.enter();
  placeTour(step);
  next.focus();
  // measure again once anything the step opened has finished moving
  clearTimeout(tourSettle);
  tourSettle = setTimeout(function () { if (document.getElementById('tourDialog').open) placeTour(step); }, 350);
}

/* Spotlight the target, park the pointer on its edge and set the card beside it,
   all clamped to the screen so a cramped layout can't push the card out of view */
function placeTour(step) {
  const target = tourTarget(step);
  const spot = document.getElementById('tourSpot');
  const pointer = document.getElementById('tourPointer');
  const card = document.getElementById('tourCard');
  const vw = innerWidth, vh = innerHeight, pad = 12;
  const cw = card.offsetWidth, ch = card.offsetHeight;
  const r = target && target.getBoundingClientRect();
  spot.classList.toggle('tour-spot--none', !r);
  pointer.toggleAttribute('hidden', !r); // an SVG element has no .hidden property
  let left, top, px, py;
  if (!r) {
    left = (vw - cw) / 2; top = (vh - ch) / 2;
  } else {
    const ring = 6;
    Object.assign(spot.style, {
      left: (r.left - ring) + 'px', top: (r.top - ring) + 'px',
      width: (r.width + ring * 2) + 'px', height: (r.height + ring * 2) + 'px'
    });
    const place = step.place;
    const below = place === 'bottom' || (place === 'top' && r.top < ch + pad * 3);
    if (below) { left = r.left; top = r.bottom + pad + 10; }
    else if (place === 'top') { left = r.left; top = r.top - ch - pad - 10; }
    else if (place === 'right') { left = r.right + pad + 10; top = r.top + 16; }
    else if (place === 'left') { left = r.left - cw - pad - 10; top = r.top; }
    else { left = r.left + (r.width - cw) / 2; top = r.top + (r.height - ch) / 2; } // inside
    // the pointer's tip rests on the target, at the side nearest the card
    if (below) { px = Math.min(r.left + r.width / 2, r.left + 60); py = r.bottom - 4; }
    else if (place === 'top') { px = r.left + Math.min(r.width / 2, 40); py = r.top + 4; }
    else if (place === 'right') { px = r.right - 6; py = r.top + 28; }
    else if (place === 'left') { px = r.left + 10; py = r.top + 20; }
    else { px = r.left + r.width * 0.42; py = r.top + r.height * 0.3; }
  }
  left = Math.max(pad, Math.min(left, vw - cw - pad));
  top = Math.max(pad, Math.min(top, vh - ch - pad));
  card.style.left = left + 'px';
  card.style.top = top + 'px';
  const to = r && 'translate(' + Math.round(px) + 'px, ' + Math.round(py) + 'px)';
  if (r && to !== pointer.style.transform) {
    pointer.style.transform = to;
    // restart the tap ripple at each new stop
    pointer.classList.remove('tour-pointer--tap');
    void pointer.offsetWidth;
    pointer.classList.add('tour-pointer--tap');
  }
}

function wireTour() {
  const dialog = document.getElementById('tourDialog');
  if (!dialog) return;
  document.getElementById('tourNext').addEventListener('click', function () {
    if (tourStep >= tourSteps().length - 1) endTour();
    else { tourStep++; renderTourStep(); }
  });
  document.getElementById('tourBack').addEventListener('click', function () { tourStep--; renderTourStep(); });
  document.getElementById('tourSkip').addEventListener('click', endTour);
  document.getElementById('tourClose').addEventListener('click', endTour);
  document.getElementById('tourBtn').addEventListener('click', startTour);
  document.getElementById('tourFooterBtn').addEventListener('click', startTour);
  // Escape: save the choice, then close as usual
  dialog.addEventListener('cancel', function (e) { e.preventDefault(); endTour(); });
  let rt;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () { if (dialog.open) placeTour(tourSteps()[tourStep]); }, 100);
  });

  // first visit only, and not when the link opens a particular rig
  let seen = true;
  try { seen = localStorage.getItem(TOUR_KEY) === TOUR_VERSION; } catch (e) { /* storage blocked: don't nag */ }
  if (!seen && !new URLSearchParams(location.hash.slice(1)).get('rig')) setTimeout(startTour, 600);
}

document.addEventListener('DOMContentLoaded', wireTour);
