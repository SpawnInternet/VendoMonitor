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
        if (!data.stats && data.active_vendos !== undefined) {
          data.stats = {
            total_vendos: data.active_vendos || 0,
            total_txns: data.total_transactions || 0,
            total_sales: data.total_sales || 0,
            today_sales: data.today_sales || 0,
            today_txns: data.today_txns || 0,
            suspicious_count: data.suspicious_count || 0,
          };
        }
        if (!data.areas && data.area_cards) data.areas = data.area_cards;
        if (!data.trend && data.trend_data) data.trend = data.trend_data;
        console.log('[API] Storage hit, age:', data._age_min + 'min');
        return data;
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
