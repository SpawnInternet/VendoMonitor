/* 🧭 Navigation helpers (2026-11-20, Wendell): "give me link on the tab I should open to solve the problem", "multiple open tabs or windows",
   "make the time AM and PM".
   - spawnTo12h(text): 24-hour times written by the database inside messages ("Nov 19 11:17") are shown as AM/PM. Display only; the
     database text is not changed.
   - FIX: for each digital employee, the dashboard tab where its problems get fixed. The Employees tab draws a "Fix it ›" link and a
     "↗" (same tab in a new window) under every bubble.
   - Deep links: dashboard.html?panel=<tab>[&sub=<sub-tab>] opens that tab once the login is ready, so any tab can live in its own window
     while Harvest stays open in another. A "↗ New window" button in the top bar opens the tab you are on.
   Works in the browser (attaches to window) and in node (module.exports) for the tests. */
(function (root) {
  const pad = n => String(n).padStart(2, '0');

  // hh:mm (00–23 : 00–59) that is not part of an IP / seconds / ratio and is not already followed by AM/PM.
  const TIME = /(^|[^\d.:])([01]?\d|2[0-3]):([0-5]\d)(?![\d:])(?!\s?[AaPp]\.?[Mm]\b)/g;
  function to12h(text) {
    if (text == null) return '';
    return String(text).replace(TIME, (all, pre, h, m) => {
      const H = Number(h), ap = H < 12 ? 'AM' : 'PM', h12 = H % 12 === 0 ? 12 : H % 12;
      return `${pre}${h12}:${pad(m)} ${ap}`;
    });
  }

  const FIX = {
    eod_harvest:     { label: '🧺 Open Harvest',            panel: 'harvest' },
    harvest_auditor: { label: '🧺 Open Harvest',            panel: 'harvest' },
    accuracy_check:  { label: '🧺 Open Harvest',            panel: 'harvest' },
    name_matcher:    { label: '🔗 Open Vendos',             panel: 'vendos' },
    gcash_autopay:   { label: '⚠ Open GCash exceptions',    panel: 'subscribers', sub: 'exc' },
    spawn_remind:    { label: '📱 Open Spawn Text',         panel: 'spawntext' },
    job_dispatcher:  { label: '📋 Open job orders',         panel: 'spawnjobs' },
    supervisor:      { label: '🖥 Open System',             panel: 'status' },
    poller_dicayas:  { label: '🖥 Open System',             panel: 'status' },
    poller_dapitan:  { label: '🖥 Open System',             panel: 'status' },
    audit_harvest:   { label: '🧺 Open Harvest',            panel: 'harvest' }
  };

  const clean = s => String(s == null ? '' : s).replace(/[^a-z0-9_-]/gi, '');
  function panelUrl(panel, sub) {
    let u = 'dashboard.html?panel=' + clean(panel);
    if (sub) u += '&sub=' + clean(sub);
    return u;
  }

  const api = { to12h, FIX, panelUrl };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }

  // ---------------- browser only ----------------
  root.spawnTo12h = to12h;
  root.SPAWN_FIX = FIX;
  root.spawnPanelUrl = panelUrl;

  function openPanel(panel, sub) {
    const btn = document.querySelector('.nav-bar button[data-panel="' + clean(panel) + '"]') || document.querySelector('[data-panel="' + clean(panel) + '"]');
    if (typeof root.showP === 'function') root.showP(clean(panel), btn);
    if (panel === 'subscribers' && sub) {
      // the Subscribers area draws its own sub-tabs; ask it once it has rendered
      let tries = 0; const t = setInterval(() => { tries++; if (typeof root.subGoTab === 'function') { root.subGoTab(clean(sub)); clearInterval(t); } else if (tries > 40) clearInterval(t); }, 150);
    }
    if (panel === 'spawntext' && typeof root.spawnAppsShown === 'function') root.spawnAppsShown('spawntext');
  }
  function openNewWindow(panel, sub) {
    const w = root.open(panelUrl(panel, sub), '_blank');
    if (w) { try { w.opener = null; } catch (e) {} }
  }
  root.spawnOpenPanel = openPanel;
  root.spawnOpenNewWindow = openNewWindow;

  // remember which tab is showing, for the top-bar "↗ New window" button
  function trackPanel() {
    const orig = root.showP; if (typeof orig !== 'function' || orig.__navTracked) return;
    const wrapped = function (id, btn) { root.__spawnPanel = id; return orig.apply(this, arguments); };
    wrapped.__navTracked = true; root.showP = wrapped;
  }

  function addTopButton() {
    const bar = document.querySelector('.topbar'); if (!bar || document.getElementById('nav-newwin')) return;
    const b = document.createElement('button');
    b.id = 'nav-newwin'; b.type = 'button'; b.title = 'Open the tab you are on in a new window';
    b.textContent = '↗ New window';
    b.style.cssText = 'margin-left:auto;margin-right:8px;padding:4px 10px;border:1px solid rgba(255,255,255,.35);border-radius:7px;background:transparent;color:inherit;font-size:11px;font-weight:700;cursor:pointer';
    b.onclick = () => openNewWindow(root.__spawnPanel || (document.querySelector('.panel.active') || {}).id?.replace(/^panel-/, '') || 'dash');
    bar.appendChild(b);
  }

  // deep link: ?panel=x[&sub=y] — wait for the admin login (token restored from the remembered session), then open
  function deepLink() {
    const q = new URLSearchParams(location.search);
    const panel = clean(q.get('panel')); if (!panel) return;
    const sub = clean(q.get('sub'));
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      if (root.__ADMIN_GW_TOKEN && typeof root.showP === 'function') { clearInterval(t); openPanel(panel, sub); document.title = 'Vendo Monitor · ' + panel; }
      else if (tries > 100) clearInterval(t);   // ~30 s; the login screen stays up if nobody is signed in
    }, 300);
  }

  function boot() { trackPanel(); addTopButton(); deepLink(); setTimeout(trackPanel, 1500); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof window !== 'undefined' ? window : this);
