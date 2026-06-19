
/* ══ HARVEST PANEL v8 — Harvest Table + Live Feed + Reconciliation ══ */
const DASH_VERSION = '2026-06-15-v1';
(function(){
  const saved = localStorage.getItem('dash_version');
  if(saved !== DASH_VERSION){
    Object.keys(localStorage).filter(k=>k.startsWith('spawn_')).forEach(k=>localStorage.removeItem(k));
    localStorage.setItem('dash_version', DASH_VERSION);
    if(saved) location.reload(true);
  }
})();

// Aliases — var to avoid redeclaration errors
var _SB  = "https://cviraqfhphhsonjmrtvu.supabase.co";
var _KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2aXJhcWZocGhoc29uam1ydHZ1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTY5NjYxOSwiZXhwIjoyMDkxMjcyNjE5fQ.qLPX_TW2U6W51nbOiotRdjUoofXnoWHi3oNfcIDmsek";
var _HDR = {'apikey':_KEY,'Authorization':'Bearer '+_KEY,'Content-Type':'application/json'};

const _php = v => v==null?'—':'₱'+Math.round(Number(v)).toLocaleString();
const _fmt = ts => ts ? new Date(ts).toLocaleString('en-PH',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:true}) : '—';
const _fmtT = ts => ts ? new Date(ts).toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit',hour12:true}) : '—';

let hvNewActiveTab = 'htable';


// ── INLINED FROM js/api.js ──
// ── SPAWN INTERNET — API LAYER + CACHE ───────────────────────────
// Storage bucket → edge function only. NO direct DB fallback.
// DB is reserved for: bot writes, live feed, history, reconciliation.

const EDGE_URL = `${SB_URL}/functions/v1/dashboard-summary`;
const STORAGE_CACHE_URL = 'https://cviraqfhphhsonjmrtvu.supabase.co/storage/v1/object/public/dashboard-cache/summary.json';
const CACHE_MAX_AGE_MS = 35 * 60 * 1000; // 35 min — matches 30-min cron + buffer

// TTLs
const TTL_MAIN   = 30 * 60 * 1000; // 30 min — overview stats (from storage)
const TTL_VENDOS = 24 * 60 * 60 * 1000; // 24hr — vendo list
const TTL_HARVEST = 5 * 60 * 1000;  // 5 min — harvest summary
const TTL_RECENT  = 30 * 1000;       // 30 sec — live feed

// Memory cache (cleared on page close)
const _mem = {};

// ── localStorage helpers ──────────────────────────────────────────
function lsSet(key, data) {
  try {
    localStorage.setItem('spawn_' + key, JSON.stringify({ ts: Date.now(), data }));
  } catch(e) {}
}

function lsGet(key, ttl) {
  try {
    const raw = localStorage.getItem('spawn_' + key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > ttl) return null;
    // Extra check: if data has generated_at older than 2 days, discard
    if (data && data.generated_at) {
      const age = Date.now() - new Date(data.generated_at).getTime();
      if (age > 2 * 24 * 60 * 60 * 1000) { localStorage.removeItem('spawn_' + key); return null; }
    }
    // Discard if missing all_vendos (old cache format)
    if (key === 'main' && data && !data.all_vendos) { localStorage.removeItem('spawn_main'); return null; }
    return data;
  } catch(e) { return null; }
}

function lsClear() {
  Object.keys(localStorage).filter(k => k.startsWith('spawn_')).forEach(k => localStorage.removeItem(k));
  Object.keys(_mem).forEach(k => delete _mem[k]);
  toast('Cache cleared — reloading...');
  setTimeout(() => loadDashboard(), 500);
}

// ── Cache age display ─────────────────────────────────────────────
function cacheAge() {
  const ts = _mem._ts || 0;
  if (!ts) return null;
  const sec = Math.round((Date.now() - ts) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.round(sec/60)}m ago`;
  return `${Math.round(sec/3600)}h ago`;
}

function updateCacheIndicator() {
  const el = document.getElementById('cache-age');
  if (!el) return;
  const age = cacheAge();
  el.textContent = age ? `Updated ${age}` : '';
  el.style.display = age ? '' : 'none';
}

// ── Main API load ─────────────────────────────────────────────────
let _fetching = false;
let _fetchCallbacks = [];

async function apiLoad(force = false) {
  // 1. Memory cache — instant (same session)
  if (!force && _mem._data && (Date.now() - _mem._ts < TTL_MAIN)) {
    updateCacheIndicator();
    return _mem._data;
  }

  // 2. localStorage cache — survives page reload (30 min TTL)
  if (!force) {
    const cached = lsGet('main', TTL_MAIN);
    if (cached) {
      _mem._data = cached;
      _mem._ts = Date.now();
      updateCacheIndicator();
      // Refresh from storage in background silently
      setTimeout(() => apiLoad(true), 200);
      return cached;
    }
  }

  // 3. Deduplicate concurrent fetches
  if (_fetching) return new Promise(resolve => _fetchCallbacks.push(resolve));
  _fetching = true;

  const data = await _fetchFresh();

  if (data) {
    _mem._data = data;
    _mem._ts = Date.now();
    lsSet('main', data);
    updateCacheIndicator();
    if (typeof hideConnError === 'function') hideConnError();
  }

  _fetching = false;
  _fetchCallbacks.forEach(cb => cb(data));
  _fetchCallbacks = [];
  return data;
}

// ── Fetch: Storage bucket first, edge function fallback ───────────
// NEVER hits DB directly — DB is for bot writes only
async function _fetchFresh() {
  // 1. Storage bucket — pre-built every 30 min by cron, zero DB load
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(STORAGE_CACHE_URL + '?t=' + Math.floor(Date.now()/60000), { signal: ctrl.signal });
    clearTimeout(tid);
    if (r.ok) {
      const data = await r.json();
      const age = Date.now() - new Date(data.generated_at || 0).getTime();
      if (age < CACHE_MAX_AGE_MS) {
        data._source = 'storage';
        data._age_min = Math.round(age / 60000);
        // Normalize field names
        if (!data.stats) {
          data.stats = {
            total_vendos: data.active_vendos || data.total_vendos || 0,
            total_txns: data.total_transactions || 0,
            total_sales: data.total_sales || 0,
            today_sales: data.today_sales || 0,
            today_txns: data.today_txns || 0,
            suspicious_count: data.suspicious_count || 0,
          };
        }
        if (!data.areas && data.area_cards) data.areas = data.area_cards;
        if (!data.trend && data.trend_data) data.trend = data.trend_data;
        // Sanity check — if all zeros, data is bad, try edge
        // Patch total_vendos if missing
        if (data.stats && !data.stats.total_vendos && data.active_vendos) data.stats.total_vendos = data.active_vendos;
        const s = data.stats || {};
        if (!s.total_txns && !s.total_sales && !s.total_vendos) {
          console.warn('[API] Storage has zero stats — data bad, trying edge...');
        } else {
          console.log('[API] Storage hit, age:', data._age_min + 'min');
          return data;
        }
      }
      console.log('[API] Storage stale (' + Math.round(age/60000) + 'min), trying edge...');
    }
  } catch(e) {
    console.warn('[API] Storage fetch failed:', e.message);
  }

  // 2. Edge function — has its own 5-min memory cache, reads Storage internally
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 15000);
    const r = await fetch(EDGE_URL, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
      signal: ctrl.signal
    });
    clearTimeout(tid);
    if (r.ok) {
      const data = await r.json();
      data._source = 'edge';
      console.log('[API] Edge function hit');
      return data;
    }
  } catch(e) {
    console.warn('[API] Edge function failed:', e.message);
  }

  // 3. Return stale localStorage if available (better than nothing)
  try {
    const raw = localStorage.getItem('spawn_main');
    if (raw) {
      const { data } = JSON.parse(raw);
      if (data) {
        data._source = 'stale_cache';
        console.warn('[API] Serving stale localStorage cache — DB not queried');
        return data;
      }
    }
  } catch(e) {}

  // 4. Nothing available — return null, show empty state
  console.error('[API] All sources failed — no data available');
  return null;
}

// ── Per-tab cached fetchers ───────────────────────────────────────
// Vendos list — 24hr cache
async function apiGetVendos(area, force = false) {
  const key = 'vendos_' + (area || 'all');
  if (!force) {
    const mem = _mem[key];
    if (mem && Date.now() - mem.ts < TTL_VENDOS) return mem.data;
    const ls = lsGet(key, TTL_VENDOS);
    if (ls) { _mem[key] = { ts: Date.now(), data: ls }; return ls; }
  }
  const params = area ? `area=eq.${encodeURIComponent(area)}&order=sheet_name.asc` : 'order=sheet_name.asc';
  const data = await sbAll('vendos', `${params}&select=id,sheet_name,tg_name,vlan,area,lat,lng,last_harvest_date,address,contact_number`);
  _mem[key] = { ts: Date.now(), data };
  lsSet(key, data);
  return data;
}

// Recent transactions — 30 sec cache
async function apiGetRecent(force = false) {
  const key = 'recent';
  if (!force) {
    const mem = _mem[key];
    if (mem && Date.now() - mem.ts < TTL_RECENT) return mem.data;
  }
  const today = todayPHT();
  const data = await sb('transactions', `date=eq.${today}&is_skipped=eq.false&order=created_at.desc`, 30);
  _mem[key] = { ts: Date.now(), data };
  return data;
}

// Harvest items for a specific group — 5 min cache
async function apiGetHarvestItems(groupId, force = false) {
  const key = 'hgi_' + groupId;
  if (!force) {
    const mem = _mem[key];
    if (mem && Date.now() - mem.ts < TTL_HARVEST) return mem.data;
  }
  const data = await sb('harvest_group_items',
    `group_run_id=eq.${groupId}&select=id,vendo_id,sheet_name,tg_name,vlan,area,status,coins_total,net_collectible,last_harvest_date,harvested_at&order=id.asc`,
    2000);
  _mem[key] = { ts: Date.now(), data };
  return data;
}

// ── Invalidate cache ──────────────────────────────────────────────
function apiInvalidate(key) {
  if (key) {
    delete _mem[key];
    localStorage.removeItem('spawn_' + key);
  } else {
    delete _mem._data;
    delete _mem._ts;
    localStorage.removeItem('spawn_main');
  }
}

// ── Auto-refresh every 30 min (matches cron) ──────────────────────
setInterval(async () => {
  if (document.hidden) return;
  apiInvalidate();
  const data = await apiLoad(true);
  if (data && typeof overviewRender === 'function') overviewRender(data);
  updateCacheIndicator();
}, TTL_MAIN);

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && _mem._ts && Date.now() - _mem._ts > TTL_MAIN) {
    apiLoad(true).then(data => {
      if (data && typeof overviewRender === 'function') overviewRender(data);
    });
  }
});

// ── END api.js ──

var HDR = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };

let currentYear   = "2026";
let allVendos     = [];
let filteredVendos= [];
let suspMap       = {};
let vPage_n       = 1;
let vtPage_n      = 1;
let hPage_n       = 1;
let currentVendo  = "";
let vtxnAll       = [];
let harvestAll    = [];
let hackedAll     = [];
let filteredHacked= [];
let navStack      = [];
let vendoAnalyticsChart = null;
let vendoChart    = null;
let skippedAll    = [];
let skPage_n      = 1;
let skippedVendos = [];
let skCurrentVendo= "";
let skTxnAll      = [];
let skTxPage_n    = 1;
let hkTxnAll      = [];
let hkTxPage_n    = 1;
let hkCurrentVendo= "";
let lastTxnTime   = null;
let trendChart    = null;
let areaChart     = null;
let monthlyChart  = null;
let analyticsAreaChart = null;

// ── Supabase ──────────────────────────────────────────────
let sbOffline = false;
let sbFailCount = 0;

async function sb(table, params="", limit=1000) {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/${table}?${params}&limit=${limit}`, {
      headers: {...HDR, 'Statement-Timeout': '0'},
      signal: AbortSignal.timeout(12000)
    });
    if (!r.ok) {
      const err = await r.text();
      throw new Error(`HTTP ${r.status}: ${err.slice(0,200)}`);
    }
    sbOffline = false;
    sbFailCount = 0;
    if (typeof updateCacheIndicator === 'function') updateCacheIndicator();
    return r.json();
  } catch(e) {
    sbFailCount++;
    // Banner only for true offline — dashboard uses Storage so sb() failures are non-critical
    if (!sbOffline && !navigator.onLine) {
      sbOffline = true;
      showConnError('No internet connection');
    }
    return [];
  }
}

async function sbAll(table, params="") {
  let all=[], offset=0;
  while(true) {
    try {
      const r = await fetch(`${SB_URL}/rest/v1/${table}?${params}&limit=1000&offset=${offset}`, {
        headers: HDR,
        signal: AbortSignal.timeout(10000)
      });
      if (!r.ok) { const err = await r.text(); throw new Error(`HTTP ${r.status}: ${err.slice(0,200)}`); }
      const rows = await r.json();
      sbOffline = false;
      if (!rows?.length) break;
      all.push(...rows);
      if (rows.length < 1000) break;
      offset += 1000;
    } catch(e) {
      if (!sbOffline) { sbOffline = true; showConnError(e.message); }
      break;
    }
  }
  return all;
}

function hideConnError() {
  const el = document.getElementById("conn-error-banner");
  if (el) el.remove();
  sbOffline = false;
  sbFailCount = 0;
}

// Only call this when GENUINELY offline or Supabase is truly down
// Never call on slow first load — use sbFailCount guard
function showConnError(msg) {
  let el = document.getElementById("conn-error-banner");
  if (!el) {
    el = document.createElement("div");
    el.id = "conn-error-banner";
    el.style.cssText = "position:fixed;top:52px;left:0;right:0;background:#dc2626;color:white;padding:8px 16px;font-size:12px;font-weight:600;z-index:999;display:flex;justify-content:space-between;align-items:center;";
    document.body.appendChild(el);
  }
  el.innerHTML = `⚠️ Cannot reach Supabase — check your internet connection or Supabase status. <span style="opacity:.7;font-weight:400">${msg}</span>
    <button onclick="document.getElementById('conn-error-banner').remove();sbOffline=false;loadDashboard();" style="padding:3px 10px;background:white;color:#dc2626;border:none;border-radius:4px;cursor:pointer;font-weight:700;margin-left:12px;">Retry</button>`;
}

async function testConnection() {
  // Condition 1: Browser says offline — show immediately
  if (!navigator.onLine) {
    showConnError('No internet connection');
    return;
  }
  // If data loaded fine — no need to test
  if (sbFailCount === 0 && !sbOffline) return;

  // Ping Supabase with a tiny query
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(`${SB_URL}/rest/v1/summary_totals?select=id&limit=1`, {
      headers: HDR, signal: ctrl.signal
    });
    clearTimeout(tid);
    if (r.ok) {
      // Supabase is back — hide banner and reload
      hideConnError();
      if (sbOffline) loadDashboard();
    } else if (r.status >= 500) {
      // Condition 3: Supabase server error
      showConnError('Supabase server error — retrying');
    }
    // 4xx — auth/config issue, don't spam banner
  } catch(e) {
    if (!navigator.onLine) {
      // Condition 1: went offline during test
      showConnError('No internet connection');
    } else if (e.name === 'AbortError' || e.name === 'TimeoutError') {
      // Condition 2: Supabase not responding
      showConnError('Cannot connect to Supabase — server not responding');
    }
  }
}

// ── Helpers ───────────────────────────────────────────────
const fmt = n => "₱" + Math.round(Number(n||0)).toLocaleString();
const esc = s => (s||"").replace(/'/g,"\\'").replace(/"/g,"&quot;");
function yf(y) {
  if (!y || y==="all") return "";
  if (y==="2025-2026") return "date=gte.2025-01-01";
  return `date=gte.${y}-01-01&date=lte.${y}-12-31`;
}

// ── Clock + Date ──────────────────────────────────────────
const _DAYS=['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
const _MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
function _tickClock(){
  const n=new Date();
  const h=n.getHours(),m=n.getMinutes(),s=n.getSeconds();
  const ap=h>=12?'PM':'AM';
  const hh=((h%12)||12).toString().padStart(2,'0');
  const el=document.getElementById('dt-clk');
  if(el)el.textContent=`${hh}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')} ${ap}`;
  const dd=document.getElementById('dt-day');
  if(dd)dd.textContent=_DAYS[n.getDay()];
  const dt=document.getElementById('dt-date');
  if(dt)dt.textContent=`${_MONTHS[n.getMonth()]} ${n.getDate()}, ${n.getFullYear()}`;
  // Also update top-status time
  const ts=document.getElementById('top-status');
}
_tickClock();
setInterval(_tickClock,1000);

// Browser online/offline events — most reliable signal
window.addEventListener('offline', () => {
  showConnError('No internet connection');
});
window.addEventListener('online', () => {
  hideConnError();
  // Reload data when connection restored
  setTimeout(() => loadDashboard(), 1000);
});

// ── Navigation ────────────────────────────────────────────
/* ── GLOBAL NAV HISTORY ── */
var _navHistory = [];
var _navLabels  = {
  dash:'Dashboard', vendos:'Vendos', harvest:'Harvest',
  suspicious:'Suspicious', skipped:'Skipped', joborders:'Job Orders',
  analytics:'Analytics', notsus:'Not Sus', status:'System'
};
function gNavBack() {
  if (_navHistory.length < 2) return;
  _navHistory.pop(); // remove current
  const prev = _navHistory.pop(); // get previous
  // Find the nav button for prev panel
  const navBtn = document.querySelector(`.nav-bar button[data-panel="${prev}"]`);
  showP(prev, navBtn);
}
function ahSourceBadge(routeCode) {
  if (!routeCode) return '';
  return '<span style="background:#e0f2fe;color:#0369a1;font-size:9px;font-weight:700;padding:1px 5px;border-radius:4px;margin-left:4px">' + routeCode + '</span>';
}
function cyclesLoad() { /* reserved */ }

function gUpdateBackBtn(id) {
  const btn   = document.getElementById('g-back-btn');
  const label = document.getElementById('g-back-label');
  if (!btn) return;
  if (_navHistory.length >= 2) {
    const prev = _navHistory[_navHistory.length - 2];
    if (label) label.textContent = '← ' + (_navLabels[prev] || prev);
    btn.classList.add('vis');
  } else {
    btn.classList.remove('vis');
  }
}

function showP(id, btn) {
  // Hide all fixed overlays when switching panels
  ['hv-tab-audited','hv-overlay-recon','hv-overlay-records','hvt-settings','hvt-gps'].forEach(function(oid){
    var oel=document.getElementById(oid); if(oel) oel.style.display='none';
  });
  _navHistory = [];
  document.querySelectorAll(".panel").forEach(p=>p.classList.remove("active"));
  document.querySelectorAll(".nav-bar button").forEach(b=>b.classList.remove("active"));
  const panel = document.getElementById("panel-"+id);
  if(!panel) { console.error("Panel not found: panel-"+id); return; }
  panel.classList.add("active");
  if(btn) btn.classList.add("active");
  // Track navigation history
  if (_navHistory[_navHistory.length-1] !== id) _navHistory.push(id);
  if (_navHistory.length > 10) _navHistory.shift();
  gUpdateBackBtn(id);
  hideBread();
  if(id==="harvest")   loadHarvests();
  if(id==="analytics") loadAnalytics();
  if(id==="vendos")     loadVendos();
  if(id==="skipped")    loadSkipped();
  if(id==="notsus")     loadNotSuspicious();
  if(id==="status")     loadSystemStatus();
  if(id==="suspicious") loadSuspicious();
  if(id==="joborders")  { colLoad(); }
}

function showBread(text, backFn) {
  navStack.push(backFn);
  document.getElementById("breadbar").classList.add("show");
  document.getElementById("breadcrumb").textContent = text;
  document.getElementById("float-back").style.display = "block";
}
function hideBread() {
  navStack = [];
  document.getElementById("breadbar").classList.remove("show");
  document.getElementById("float-back").style.display = "none";
}
function goBack() {
  if (navStack.length) {
    navStack.pop()();
    if (!navStack.length) hideBread();
  }
}

function changeYear(y) {
  currentYear = y;
  // Show year indicator
  const sel = document.getElementById('year-select');
  if(sel) sel.style.fontWeight = '800';
  // Bypass cache for year-filtered data
  const trend  = sb('trend_7day_mat','order=date.asc',7);
  const areas  = sb('summary_by_area','order=total_sales.desc');
  Promise.all([trend, areas]).then(([t, a]) => {
    // Re-render with year note — full year filtering requires materialized view changes
    // For now show toast that year filter affects new DB queries only
    if(y !== '2026') {
      document.getElementById('dash-stats').insertAdjacentHTML('afterbegin',
        '<div style="background:#fef9c3;border:1px solid #fde047;border-radius:8px;padding:8px 12px;margin-bottom:8px;font-size:12px;font-weight:700;color:#854d0e">⚠️ Year filter ('+y+'): Dashboard stats are from materialized views — contact admin to refresh for historical years.</div>'
      );
    }
  });
  loadDashboard();
}

// ══════════════════════════════════════════════════════════
// GLOBAL SEARCH
// ══════════════════════════════════════════════════════════
function showSearchDrop() {
  if (allVendos.length) document.getElementById("search-drop").style.display = "block";
}
function hideSearchDrop() { document.getElementById("search-drop").style.display = "none"; }

function globalSearch(q) {
  const drop = document.getElementById("search-drop");
  if (!q || q.length < 2) { drop.style.display = "none"; return; }
  const ql = q.toLowerCase();

  // Primary: match TG name from allVendos (transaction-based)
  let results = allVendos.filter(v => v.vendo.toLowerCase().includes(ql)).slice(0, 10);

  // Secondary: if fewer than 5 results, also search sheet_name in allVendos registry
  // and cross-reference to allVendos by tg_name
  if (results.length < 5 && allVendos && allVendos.length) {
    const sheetMatches = allVendos.filter(v =>
      v.sheet_name && v.sheet_name.toLowerCase().includes(ql) && v.tg_name
    );
    for (const sm of sheetMatches) {
      const already = results.find(r => r.vendo === sm.tg_name);
      if (!already) {
        const fromAll = allVendos.find(r => r.vendo === sm.tg_name);
        if (fromAll) results.push(fromAll);
        else results.push({ vendo: sm.tg_name, area: sm.area || '—', sales: 0, txn_count: 0, _sheetLabel: sm.sheet_name });
      }
      if (results.length >= 10) break;
    }
  }

  if (!results.length) { drop.style.display = "none"; return; }
  drop.style.display = "block";
  drop.innerHTML =
    `<div style="padding:8px 14px;background:#f0f4ff;border-bottom:1px solid var(--bd);font-size:11px;color:#1565c0;font-weight:600;">
      ${results.length} vendos found — click to view transactions
    </div>` +
    results.map(v => {
      // Find sheet_name label if available
      const reg = allVendos ? allVendos.find(x => x.tg_name === v.vendo) : null;
      const sheetLabel = reg && reg.sheet_name ? `<span style="color:#7c3aed;font-size:10px;margin-left:6px;">📋 ${reg.sheet_name}</span>` : '';
      return `
    <div onclick="openVendoFromSearch('${esc(v.vendo)}','${v.area}')"
      style="padding:11px 14px;border-bottom:1px solid var(--bd);cursor:pointer;display:flex;justify-content:space-between;align-items:center;transition:background .12s;"
      onmouseover="this.style.background='#f0f4ff'" onmouseout="this.style.background=''">
      <div>
        <div style="font-weight:600;font-size:13px;color:#1a1d2e">${v.vendo}${sheetLabel}</div>
        <div style="font-size:11px;color:var(--mu);margin-top:2px">📍 ${v.area} · ${parseInt(v.txn_count||v.txns||0).toLocaleString()} txns</div>
      </div>
      <div style="text-align:right;flex-shrink:0;margin-left:8px;">
        <div style="font-weight:700;color:#1565c0;font-size:13px">${fmt(v.sales)}</div>
        <div style="font-size:10px;color:#9FE1CB;font-weight:600;">→ View txns</div>
      </div>
    </div>`;
    }).join("");
}

async function openVendoFromSearch(vendo, area) {
  document.getElementById("search-drop").style.display = "none";
  document.getElementById("global-search").value = "";
  // Switch to vendos panel manually — avoid showP() which calls loadVendos() and resets state
  document.querySelectorAll(".panel").forEach(p=>p.classList.remove("active"));
  document.querySelectorAll(".nav-bar button").forEach(b=>b.classList.remove("active"));
  document.getElementById("panel-vendos").classList.add("active");
  document.querySelector(".nav-bar button:nth-child(2)").classList.add("active");
  hideBread();
  // Load vendo list only if empty
  if (!allVendos.length) {
    const v = await sb("summary_by_vendo","order=sales.desc&select=vendo,sheet_name,area,sales,txn_count,today_sales,last_date",2000);
    allVendos = v;
  }
  await openVendoDetail(vendo, area);
}

// ══════════════════════════════════════════════════════════





function fmtPeso(n) {
  if (n === null || n === undefined || isNaN(n)) return "₱0";
  return "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtNum(n) { if (!n) return "0"; return Number(n).toLocaleString("en-PH"); }
function fmtDateShort(d) { if (!d) return "—"; return new Date(d + "T12:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric" }); }
function fmtTime(ts) { if (!ts) return "—"; return new Date(ts).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" }); }
