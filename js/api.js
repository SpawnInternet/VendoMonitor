// ── SPAWN INTERNET — API LAYER + CACHE ───────────────────────────
// Memory cache: fast, session-only
// localStorage cache: persistent across page reloads

const EDGE_URL = `${SB_URL}/functions/v1/dashboard-summary`;

// TTLs
const TTL_MAIN     = 5  * 60 * 1000;  // 5 min  — stats, trend, areas
const TTL_VENDOS   = 24 * 60 * 60 * 1000; // 24hr — vendo list
const TTL_HARVEST  = 5  * 60 * 1000;  // 5 min  — harvest summary
const TTL_RECENT   = 30 * 1000;        // 30 sec — live feed

// Memory cache (cleared on page close)
const _mem = {};

// ── localStorage helpers ──────────────────────────────────────────
function lsSet(key, data) {
  try {
    localStorage.setItem('spawn_' + key, JSON.stringify({ ts: Date.now(), data }));
  } catch(e) { /* storage full — ignore */ }
}

function lsGet(key, ttl) {
  try {
    const raw = localStorage.getItem('spawn_' + key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > ttl) return null; // expired
    return data;
  } catch(e) { return null; }
}

function lsClear() {
  Object.keys(localStorage)
    .filter(k => k.startsWith('spawn_'))
    .forEach(k => localStorage.removeItem(k));
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
  // 1. Memory cache — fastest (same session)
  if (!force && _mem._data && (Date.now() - _mem._ts < TTL_MAIN)) {
    updateCacheIndicator();
    return _mem._data;
  }

  // 2. localStorage cache — survives page reload
  if (!force) {
    const cached = lsGet('main', TTL_MAIN);
    if (cached) {
      _mem._data = cached;
      _mem._ts = Date.now();
      updateCacheIndicator();
      // Refresh in background silently
      setTimeout(() => apiLoad(true), 100);
      return cached;
    }
  }

  // 3. Deduplicate concurrent fetches
  if (_fetching) {
    return new Promise(resolve => _fetchCallbacks.push(resolve));
  }
  _fetching = true;

  const data = await _fetchFresh();

  if (data) {
    _mem._data = data;
    _mem._ts = Date.now();
    lsSet('main', data);
    updateCacheIndicator();
    hideConnError();
  }

  _fetching = false;
  _fetchCallbacks.forEach(cb => cb(data));
  _fetchCallbacks = [];
  return data;
}

// ── Fetch from Edge Function (with direct DB fallback) ────────────
async function _fetchFresh() {
  // Try Edge Function first
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
      return data;
    }
  } catch(e) {
    console.warn('Edge Function failed, using direct DB:', e.message);
    if (typeof hideConnError === 'function') hideConnError();
  }

  // Fallback: direct DB queries
  return await _fetchDirect();
}

// ── Direct DB fallback ────────────────────────────────────────────
async function _fetchDirect() {
  try {
    const today = todayPHT();
    const overdueDate = new Date();
    overdueDate.setDate(overdueDate.getDate() - 30);
    const overdueStr = overdueDate.toISOString().slice(0, 10);

    const [totals, areas, trend, recent, suspicious, harvests, overdue] = await Promise.all([
      sb('summary_totals', 'order=updated_at.desc', 1),
      sb('summary_by_area', 'order=total_sales.desc'),
      sb('trend_7day_mat', 'order=date.asc', 7).catch(() => sb('trend_7day', 'order=date.asc', 7)),
      sb('transactions', `date=eq.${today}&is_skipped=eq.false&order=created_at.desc`, 30),
      sb('hacked_summary_mat', 'order=txn_count.desc', 50),
      sb('harvest_groups', 'order=started_at.desc', 20),
      sb('vendos', `last_harvest_date=lt.${overdueStr}&select=id,sheet_name,tg_name,area,vlan,last_harvest_date&order=last_harvest_date.asc.nullsfirst`, 100),
    ]);

    // Harvest group items
    let harvestItems = [];
    const groupIds = harvests.map(h => h.id).filter(Boolean);
    if (groupIds.length) {
      harvestItems = await sb('harvest_group_items',
        `group_run_id=in.(${groupIds.join(',')})&select=group_run_id,status,net_collectible`, 2000);
    }

    const harvestSummary = harvests.map(hg => {
      const items = harvestItems.filter(i => i.group_run_id === hg.id);
      const done = items.filter(i => i.status === 'harvested').length;
      const skipped = items.filter(i => i.status === 'skipped').length;
      const net = items.reduce((s, i) => s + (parseFloat(i.net_collectible) || 0), 0);
      return { ...hg, items_total: items.length, items_done: done, items_skipped: skipped, net_total: net };
    });

    const areaData = areas || [];
    const totRow = totals[0] || {};

    return {
      stats: {
        total_vendos: totRow.total_vendos || 0,
        total_txns: totRow.txn_count || 0,
        total_sales: totRow.total_sales || 0,
        today_sales: areaData.reduce((s, a) => s + parseFloat(a.today_sales || 0), 0),
        today_txns: areaData.reduce((s, a) => s + parseInt(a.today_txns || 0), 0),
        suspicious_count: suspicious.reduce((s, h) => s + parseInt(h.txn_count || 0), 0),
      },
      trend, areas: areaData, recent, suspicious,
      harvest_summary: harvestSummary,
      overdue_vendos: overdue,
      _source: 'direct',
      _ts: Date.now(),
    };
  } catch(e) {
    console.error('Direct DB fallback failed:', e);
    return null;
  }
}

// ── Per-tab cached fetchers ───────────────────────────────────────
// Vendos list — 24hr cache (rarely changes)
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
  const data = await sb('transactions',
    `date=eq.${today}&is_skipped=eq.false&order=created_at.desc`, 30);
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

// ── Invalidate specific cache keys ───────────────────────────────
function apiInvalidate(key) {
  if (key) {
    delete _mem[key];
    localStorage.removeItem('spawn_' + key);
  } else {
    // Invalidate main data only (not vendos — those are slow to refetch)
    delete _mem._data;
    delete _mem._ts;
    localStorage.removeItem('spawn_main');
  }
}

// ── Auto-refresh every 5 minutes ─────────────────────────────────
setInterval(async () => {
  // Only refresh if tab is visible
  if (document.hidden) return;
  apiInvalidate();
  const data = await apiLoad(true);
  if (data && typeof overviewRender === 'function') {
    overviewRender(data);
  }
  updateCacheIndicator();
}, TTL_MAIN);

// Stop refreshing when tab hidden, resume when visible
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && _mem._ts && Date.now() - _mem._ts > TTL_MAIN) {
    apiLoad(true).then(data => {
      if (data && typeof overviewRender === 'function') overviewRender(data);
    });
  }
});
